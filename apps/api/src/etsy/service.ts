import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { EtsyConfig } from '../config/config.js';
import { AppDatabase } from '../app-foundation/adapters/postgres.js';
import type { VerifiedIdentity } from '../app-foundation/adapters/auth-verifier.js';
import { AppError } from '../app-foundation/application/errors.js';
import { permits } from '../app-foundation/application/policy.js';
import { pageLimit, record, uuid } from '../app-foundation/application/validation.js';
import { EtsyCredentials, EtsyFailure } from './credentials.js';
import type { Envelope } from './credentials.js';
import { etsyId, EtsyProvider } from './provider.js';
import type { EtsyMetadata, EtsyTokens } from './provider.js';

interface Connection {
  id: string; workspace_id: string; app_ref: string; intended_shop_id: string; etsy_user_id: string | null; shop_id: string | null;
  state: string; link_epoch: number; revision: number; next_version: number; active_version: number | null;
  verified_at: Date | null; last_read_at: Date | null; last_outcome: string | null;
}
interface Invitation {
  id: string; workspace_id: string; connection_id: string; creator_user_id: string; creator_revision: number;
  app_ref: string; config_fingerprint: string; expected_shop_id: string; expected_user_id: string | null; epoch: number;
  state: string; expires_at: Date; created_at: Date; attempt_id: string | null; expired: boolean;
}
interface Attempt {
  id: string; workspace_id: string; connection_id: string; invitation_id: string; state: string;
  verifier: Envelope | null; epoch: number; candidate_version: number | null; expired: boolean; deadline_valid: boolean;
}
interface Credential { version: number; envelope: Envelope; expires_at: Date; refresh_expires_at: Date }

export class EtsyService {
  private readonly crypto: EtsyCredentials;
  private readonly fingerprint: string;
  constructor(private readonly workspaceId: string, private readonly config: EtsyConfig,
    private readonly database: AppDatabase, private readonly provider: EtsyProvider) {
    this.crypto = new EtsyCredentials(config);
    this.fingerprint = createHash('sha256').update(JSON.stringify([config.clientId, config.callbackUrl, config.returnOrigin,
      config.invitationOrigin, 'shops_r'])).digest('hex');
  }

  private async owner(client: PoolClient, actor: string, identity?: VerifiedIdentity): Promise<number> {
    const workspace = await client.query('SELECT id FROM app_private.workspaces WHERE id=$1 FOR UPDATE', [this.workspaceId]);
    if (!workspace.rowCount) throw new AppError('forbidden');
    if (identity) {
      const session = await client.query<{ active: boolean }>('SELECT app_private.has_current_session($1::uuid,$2::uuid) AS active', [identity.sessionId, actor]);
      if (!session.rows[0]?.active) throw new AppError('unauthenticated');
    }
    const member = (await client.query<{ role_code: string; status: string; revision: number }>(
      'SELECT role_code,status,revision FROM app_private.memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE', [this.workspaceId, actor])).rows[0];
    if (!member || !permits(member.role_code, member.status, 'etsy.connection.manage')) throw new AppError('forbidden');
    return member.revision;
  }

  private async connection(client: PoolClient): Promise<Connection | undefined> {
    const row = (await client.query<Connection>('SELECT * FROM app_private.etsy_connections WHERE workspace_id=$1 FOR UPDATE', [this.workspaceId])).rows[0];
    if (row && row.app_ref !== this.config.clientId) throw new EtsyFailure('configuration_unavailable');
    return row;
  }

  private async view(client: PoolClient, row: Connection | undefined) {
    let state = row?.state ?? 'unconnected', outcome = row?.last_outcome ?? null, attemptPhase: string | null = null;
    if (row) {
      const attempt = (await client.query<{ state: string; expired: boolean; uncertain: boolean }>(`SELECT state,
        expires_at<=clock_timestamp() AS expired, state='exchanging' AND deadline<=clock_timestamp() AS uncertain
        FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND epoch=$2 ORDER BY created_at DESC LIMIT 1`,
      [this.workspaceId, row.link_epoch])).rows[0];
      if (attempt) {
        attemptPhase = attempt.state;
        if (attempt.uncertain) { state = 'reconnect_required'; outcome = 'outcome_unknown'; attemptPhase = 'exchange_unknown'; }
        else if (attempt.expired && ['pending', 'verification_pending'].includes(attempt.state)) {
          state = 'reconnect_required'; outcome = 'expired'; attemptPhase = 'expired';
        }
      }
      const refresh = (await client.query<{ state: string; expired: boolean }>(`SELECT state,deadline<=clock_timestamp() AS expired
        FROM app_private.etsy_refresh_attempts WHERE workspace_id=$1 AND epoch=$2 AND credential_version=$3
        AND state<>'committed' ORDER BY created_at DESC LIMIT 1`, [this.workspaceId, row.link_epoch, row.active_version])).rows[0];
      if (refresh) {
        attemptPhase = refresh.expired || refresh.state === 'unknown' ? 'refresh_unknown' : 'refresh_submitted';
        if (attemptPhase === 'refresh_unknown') { state = 'refresh_unknown'; outcome = 'outcome_unknown'; }
      }
    }
    return { connectionId: row?.id ?? null, state, revision: row?.revision ?? 0,
      shopId: row?.shop_id ?? null, etsyUserId: row?.etsy_user_id ?? null,
      verifiedAt: row?.verified_at?.toISOString() ?? null, observedAt: row?.last_read_at?.toISOString() ?? null,
      outcome, attemptPhase };
  }

  private expected(value: unknown): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > 2147483646) throw new AppError('invalid_request');
    return Number(value);
  }

  private async audit(client: PoolClient, actor: string, action: string, target: string, requestId: string, outcome = 'accepted'): Promise<void> {
    await client.query(`INSERT INTO app_private.audit_events(id,workspace_id,actor_user_id,action,target_id,outcome,request_id)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), this.workspaceId, actor, action, target, outcome, requestId]);
  }

  private async receipt(client: PoolClient, actor: string, id: string, kind: string, fingerprint: string): Promise<Record<string, unknown> | undefined> {
    const prior = (await client.query<{ kind: string; fingerprint: string; result: Record<string, unknown> }>(
      'SELECT kind,fingerprint,result FROM app_private.etsy_operation_receipts WHERE workspace_id=$1 AND actor_user_id=$2 AND id=$3', [this.workspaceId, actor, id])).rows[0];
    if (prior && (prior.kind !== kind || prior.fingerprint !== fingerprint)) throw new EtsyFailure('connection_changed');
    return prior?.result;
  }

  private async saveReceipt(client: PoolClient, actor: string, id: string, kind: string, fingerprint: string, result: unknown): Promise<void> {
    await client.query('INSERT INTO app_private.etsy_operation_receipts(workspace_id,actor_user_id,id,kind,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6)',
      [this.workspaceId, actor, id, kind, fingerprint, result]);
  }

  status(identity: VerifiedIdentity, signal: AbortSignal) {
    return this.database.transaction(signal, async client => {
      await this.owner(client, identity.userId, identity);
      return this.view(client, await this.connection(client));
    });
  }

  invitations(identity: VerifiedIdentity, query: unknown, signal: AbortSignal) {
    const input = record(query, ['limit', 'cursor'], []), limit = pageLimit(input.limit ?? '25');
    const cursor = input.cursor === undefined ? null : uuid(input.cursor);
    return this.database.transaction(signal, async client => {
      await this.owner(client, identity.userId, identity);
      if (cursor && !(await client.query('SELECT id FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND id=$2', [this.workspaceId, cursor])).rowCount) throw new AppError('invalid_request');
      const rows = (await client.query<Invitation>(`SELECT id,workspace_id,connection_id,expected_shop_id,state,created_at,expires_at,
        expires_at<=clock_timestamp() AS expired FROM app_private.etsy_connection_invitations
        WHERE workspace_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`, [this.workspaceId, cursor, limit + 1])).rows;
      const more = rows.length > limit;
      if (more) rows.pop();
      return { items: rows.map(row => ({ id: row.id, shopId: row.expected_shop_id,
        state: row.expired && ['pending', 'in_progress'].includes(row.state) ? 'expired' : row.state,
        createdAt: row.created_at.toISOString(), expiresAt: row.expires_at.toISOString() })),
      nextCursor: more ? rows.at(-1)!.id : null, connection: await this.view(client, await this.connection(client)) };
    });
  }

  private async retire(client: PoolClient, state: 'cancelled' | 'expired'): Promise<void> {
    const predicate = state === 'expired' ? ' AND expires_at<=clock_timestamp()' : '';
    await client.query(`UPDATE app_private.etsy_connection_invitations SET state=$2,token_hash=NULL
      WHERE workspace_id=$1 AND state IN ('pending','in_progress')${predicate}`, [this.workspaceId, state]);
    await client.query(`UPDATE app_private.etsy_authorization_attempts SET state=$2,verifier=NULL,state_hash=NULL
      WHERE workspace_id=$1 AND state IN ('pending','exchanging','verification_pending') AND invitation_id IN
      (SELECT id FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND state=$2)`, [this.workspaceId, state]);
  }

  async createInvitation(identity: VerifiedIdentity, body: unknown, signal: AbortSignal) {
    const input = record(body, ['expectedShopId', 'expectedRevision', 'idempotencyKey']);
    if (typeof input.expectedShopId !== 'string') throw new AppError('invalid_request');
    const shop = etsyId(input.expectedShopId), expected = this.expected(input.expectedRevision), id = uuid(input.idempotencyKey);
    const fingerprint = createHash('sha256').update(JSON.stringify([shop, expected])).digest('hex');
    const token = randomBytes(32).toString('base64url'), invitationId = randomUUID();
    try {
      return await this.database.transaction(signal, async client => {
        const creatorRevision = await this.owner(client, identity.userId, identity);
        const prior = await this.receipt(client, identity.userId, id, 'create', fingerprint);
        if (prior) return prior;
        let connection = await this.connection(client);
        if ((connection?.revision ?? 0) !== expected) throw new EtsyFailure('connection_changed');
        if (connection && connection.intended_shop_id !== shop) throw new EtsyFailure('connection_changed');
        await this.retire(client, 'expired');
        if ((await client.query("SELECT id FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND state IN ('pending','in_progress')", [this.workspaceId])).rowCount) throw new EtsyFailure('connection_busy');
        if (!connection) {
          connection = (await client.query<Connection>(`INSERT INTO app_private.etsy_connections(id,workspace_id,app_ref,intended_shop_id,state)
            VALUES($1,$2,$3,$4,'unconnected') RETURNING *`, [randomUUID(), this.workspaceId, this.config.clientId, shop])).rows[0]!;
        }
        const epoch = connection.link_epoch + 1, revision = connection.revision + 1;
        await client.query("UPDATE app_private.etsy_connections SET link_epoch=$2,revision=$3,state='verification_pending',active_version=NULL,last_outcome=NULL WHERE workspace_id=$1", [this.workspaceId, epoch, revision]);
        await client.query('DELETE FROM app_private.etsy_credentials WHERE workspace_id=$1', [this.workspaceId]);
        const offer = (await client.query<{ expires_at: Date }>(`INSERT INTO app_private.etsy_connection_invitations
          (id,workspace_id,connection_id,creator_user_id,creator_revision,app_ref,config_fingerprint,expected_shop_id,expected_user_id,purpose,epoch,token_hash,state,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',clock_timestamp()+make_interval(secs=>$13)) RETURNING expires_at`,
        [invitationId, this.workspaceId, connection.id, identity.userId, creatorRevision, this.config.clientId, this.fingerprint, shop,
          connection.etsy_user_id, connection.etsy_user_id ? 'reconnect' : 'connect', epoch, createHash('sha256').update(token).digest('hex'), this.config.invitationTtlSeconds])).rows[0]!;
        const result = { invitationId, revision, expiresAt: offer.expires_at.toISOString() };
        await this.saveReceipt(client, identity.userId, id, 'create', fingerprint, result);
        await this.audit(client, identity.userId, 'etsy.invitation.create', invitationId, id);
        return { ...result, shareUrl: `${this.config.invitationOrigin}/integrations/etsy/invite#${token}` };
      });
    } catch (error) {
      if (error instanceof AppError && error.code !== 'dependency_unavailable') throw error;
      const prior = await this.database.transaction(signal, async client => {
        await this.owner(client, identity.userId, identity);
        return this.receipt(client, identity.userId, id, 'create', fingerprint);
      });
      if (prior) return prior;
      throw new EtsyFailure('outcome_unknown');
    }
  }

  async manage(identity: VerifiedIdentity, kind: 'cancel' | 'disconnect', invitationId: string | null, body: unknown, signal: AbortSignal) {
    const input = record(body, ['expectedRevision', 'idempotencyKey']);
    const expected = this.expected(input.expectedRevision), id = uuid(input.idempotencyKey);
    if (invitationId !== null) uuid(invitationId);
    const fingerprint = createHash('sha256').update(JSON.stringify([expected, invitationId])).digest('hex');
    return this.database.transaction(signal, async client => {
      await this.owner(client, identity.userId, identity);
      const prior = await this.receipt(client, identity.userId, id, kind, fingerprint);
      if (prior) return prior;
      const connection = await this.connection(client);
      if (!connection || connection.revision !== expected) throw new EtsyFailure('connection_changed');
      if (kind === 'cancel') {
        const offer = (await client.query<Invitation>('SELECT * FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND id=$2', [this.workspaceId, invitationId])).rows[0];
        if (!offer) throw new AppError('not_found');
        if (!['pending', 'in_progress'].includes(offer.state) || offer.epoch !== connection.link_epoch) throw new EtsyFailure('connection_changed');
      }
      await this.retire(client, 'cancelled');
      await client.query('DELETE FROM app_private.etsy_credentials WHERE workspace_id=$1', [this.workspaceId]);
      await client.query("UPDATE app_private.etsy_refresh_attempts SET state='unknown' WHERE workspace_id=$1 AND state IN ('reserved','submitted')", [this.workspaceId]);
      await client.query(`UPDATE app_private.etsy_connections SET state=$2,link_epoch=link_epoch+1,revision=revision+1,active_version=NULL,last_outcome=$3 WHERE workspace_id=$1`,
        [this.workspaceId, kind === 'disconnect' ? 'disconnected' : 'reconnect_required', kind === 'disconnect' ? 'local_disconnected' : 'cancelled']);
      const result = { revision: expected + 1, localDisconnected: kind === 'disconnect', providerRevocation: 'not_confirmed' };
      await this.saveReceipt(client, identity.userId, id, kind, fingerprint, result);
      await this.audit(client, identity.userId, kind === 'disconnect' ? 'etsy.disconnect' : 'etsy.invitation.cancel', invitationId ?? connection.id, id);
      return result;
    });
  }

  private async bound(client: PoolClient, invitationId: string): Promise<{ invitation: Invitation; connection: Connection }> {
    const invitation = (await client.query<Invitation>('SELECT *,expires_at<=clock_timestamp() AS expired FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND id=$2', [this.workspaceId, invitationId])).rows[0];
    if (!invitation) throw new AppError('invalid_request');
    const currentRevision = await this.owner(client, invitation.creator_user_id);
    const connection = await this.connection(client);
    if (!connection || invitation.creator_revision !== currentRevision || invitation.expired
      || invitation.config_fingerprint !== this.fingerprint || invitation.app_ref !== this.config.clientId
      || invitation.epoch !== connection.link_epoch || invitation.expected_shop_id !== connection.intended_shop_id
      || !['pending', 'in_progress'].includes(invitation.state)) throw new EtsyFailure('connection_changed');
    return { invitation, connection };
  }

  async start(secret: string, signal: AbortSignal): Promise<string> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new AppError('invalid_request');
    const tokenHash = createHash('sha256').update(secret).digest('hex');
    const authorization = this.provider.authorization(), attemptId = randomUUID();
    const verifier = this.crypto.seal(authorization.verifier, `${this.workspaceId}/${attemptId}/verifier`);
    return this.database.transaction(signal, async client => {
      const indexed = (await client.query<{ id: string }>('SELECT id FROM app_private.etsy_connection_invitations WHERE token_hash=$1 AND workspace_id=$2', [tokenHash, this.workspaceId])).rows[0];
      if (!indexed) throw new AppError('invalid_request');
      const { invitation, connection } = await this.bound(client, indexed.id);
      if (invitation.state !== 'pending') throw new EtsyFailure('connection_busy');
      await client.query(`INSERT INTO app_private.etsy_authorization_attempts(id,workspace_id,connection_id,invitation_id,state_hash,verifier,state,epoch,created_at,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,'pending',$7,transaction_timestamp(),transaction_timestamp()+interval '300 seconds')`,
      [attemptId, this.workspaceId, connection.id, invitation.id, createHash('sha256').update(authorization.state).digest('hex'), verifier, connection.link_epoch]);
      await client.query("UPDATE app_private.etsy_connection_invitations SET state='in_progress',claimed_at=clock_timestamp(),attempt_id=$3 WHERE workspace_id=$1 AND id=$2", [this.workspaceId, invitation.id, attemptId]);
      await this.audit(client, invitation.creator_user_id, 'etsy.attempt.start', attemptId, attemptId);
      return authorization.url;
    });
  }

  private async cooldown(client: PoolClient): Promise<void> {
    const row = (await client.query<{ seconds: number }>(`SELECT ceil(extract(epoch FROM retry_not_before-clock_timestamp()))::integer AS seconds
      FROM app_private.etsy_cooldowns WHERE app_ref=$1 AND retry_not_before>clock_timestamp()`, [this.config.clientId])).rows[0];
    if (row) throw new EtsyFailure('upstream_rate_limited', row.seconds);
  }

  private async failure(connection: Connection, actor: string, error: unknown, mutation: boolean, signal: AbortSignal): Promise<void> {
    const code = error instanceof EtsyFailure ? error.code : 'outcome_unknown';
    await this.database.transaction(signal, async client => {
      await this.owner(client, actor);
      const current = await this.connection(client);
      if (!current || current.link_epoch !== connection.link_epoch
        || (connection.active_version !== null && current.active_version !== connection.active_version)) return;
      if (error instanceof EtsyFailure && error.retryAfterSeconds !== undefined) {
        await client.query(`INSERT INTO app_private.etsy_cooldowns(app_ref,retry_not_before) VALUES($1,clock_timestamp()+make_interval(secs=>$2))
          ON CONFLICT(app_ref) DO UPDATE SET retry_not_before=greatest(etsy_cooldowns.retry_not_before,excluded.retry_not_before)`, [this.config.clientId, error.retryAfterSeconds]);
      }
      if (mutation || code === 'reconnect_required') {
        await client.query("UPDATE app_private.etsy_connections SET state=$2,active_version=NULL,last_outcome=$3,revision=revision+1 WHERE workspace_id=$1",
          [this.workspaceId, mutation ? 'refresh_unknown' : 'reconnect_required', code]);
        await client.query('DELETE FROM app_private.etsy_credentials WHERE workspace_id=$1', [this.workspaceId]);
        await client.query("UPDATE app_private.etsy_refresh_attempts SET state='unknown' WHERE workspace_id=$1 AND state IN ('reserved','submitted')", [this.workspaceId]);
        await client.query("UPDATE app_private.etsy_authorization_attempts SET state=$2,verifier=NULL,state_hash=NULL WHERE workspace_id=$1 AND state IN ('exchanging','verification_pending')",
          [this.workspaceId, mutation ? 'exchange_unknown' : 'failed']);
        await client.query("UPDATE app_private.etsy_connection_invitations SET state=$2,token_hash=NULL WHERE workspace_id=$1 AND state='in_progress'",
          [this.workspaceId, mutation ? 'outcome_unknown' : 'failed']);
      }
    }).catch(() => { /* Durable submitted states remain nonusable if the database is unavailable. */ });
  }

  async callback(state: string, code: string | null, signal: AbortSignal): Promise<void> {
    const stateHash = createHash('sha256').update(state).digest('hex');
    const claimed = await this.database.transaction(signal, async client => {
      const attempt = (await client.query<Attempt>(`SELECT *,expires_at<=clock_timestamp() AS expired FROM app_private.etsy_authorization_attempts
        WHERE workspace_id=$1 AND state_hash=$2`, [this.workspaceId, stateHash])).rows[0];
      if (!attempt || attempt.expired || attempt.state !== 'pending') throw new AppError('invalid_request');
      const bound = await this.bound(client, attempt.invitation_id);
      if (attempt.epoch !== bound.connection.link_epoch) throw new EtsyFailure('connection_changed');
      if (code !== null) await this.cooldown(client);
      const changed = await client.query(`UPDATE app_private.etsy_authorization_attempts SET state=$3,submission_id=$4,
        submitted_at=clock_timestamp(),deadline=clock_timestamp()+interval '15 seconds',verifier=CASE WHEN $3='denied' THEN NULL ELSE verifier END
        WHERE workspace_id=$1 AND id=$2 AND state='pending' RETURNING id`, [this.workspaceId, attempt.id, code === null ? 'denied' : 'exchanging', randomUUID()]);
      if (!changed.rowCount) throw new AppError('invalid_request');
      if (code === null) {
        await client.query("UPDATE app_private.etsy_connection_invitations SET state='declined',token_hash=NULL WHERE workspace_id=$1 AND id=$2", [this.workspaceId, attempt.invitation_id]);
        await client.query("UPDATE app_private.etsy_connections SET state='reconnect_required',revision=revision+1,last_outcome='declined' WHERE workspace_id=$1", [this.workspaceId]);
        await this.audit(client, bound.invitation.creator_user_id, 'etsy.callback', attempt.id, attempt.id, 'failed');
      }
      return { ...bound, attempt };
    });
    if (code === null) return;
    const { attempt, invitation, connection } = claimed;
    let candidatePersisted = false;
    try {
      if (!attempt.verifier) throw new EtsyFailure('configuration_unavailable');
      const verifier = this.crypto.open(attempt.verifier, `${this.workspaceId}/${attempt.id}/verifier`);
      const tokens = await this.provider.exchange(code, verifier, signal);
      const version = connection.next_version;
      const envelope = this.crypto.seal(JSON.stringify(tokens), `${this.workspaceId}/${connection.id}/${version}/credential`);
      try {
        await this.database.transaction(signal, async client => {
          await this.bound(client, invitation.id);
          const eligible = (await client.query<Attempt>(`SELECT *,deadline>clock_timestamp() AS deadline_valid,expires_at<=clock_timestamp() AS expired
            FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND id=$2`, [this.workspaceId, attempt.id])).rows[0];
          if (!eligible || eligible.state !== 'exchanging' || !eligible.deadline_valid || eligible.expired) throw new EtsyFailure('connection_changed');
          await client.query(`INSERT INTO app_private.etsy_credentials(workspace_id,connection_id,version,state,envelope,expires_at,refresh_expires_at)
            VALUES($1,$2,$3,'candidate',$4,$5,clock_timestamp()+interval '90 days')`, [this.workspaceId, connection.id, version, envelope, new Date(tokens.expiresAt)]);
          await client.query('UPDATE app_private.etsy_connections SET next_version=$2 WHERE workspace_id=$1', [this.workspaceId, version + 1]);
          await client.query("UPDATE app_private.etsy_authorization_attempts SET state='verification_pending',candidate_version=$3,verifier=NULL WHERE workspace_id=$1 AND id=$2", [this.workspaceId, attempt.id, version]);
        });
      } catch (error) {
        const committed = await this.database.transaction(signal, async client => {
          await this.bound(client, invitation.id);
          return (await client.query("SELECT id FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND id=$2 AND state='verification_pending' AND candidate_version=$3", [this.workspaceId, attempt.id, version])).rowCount === 1;
        });
        if (!committed) throw error;
      }
      candidatePersisted = true;
      await this.verifyCandidate(invitation.id, attempt.id, connection, version, tokens, signal);
    } catch (error) {
      await this.failure(connection, invitation.creator_user_id, error, !candidatePersisted, signal);
      throw error;
    }
  }

  private async verifyCandidate(invitationId: string, attemptId: string, connection: Connection, version: number, tokens: EtsyTokens, signal: AbortSignal, identity?: VerifiedIdentity) {
    const metadata = await this.provider.metadata(tokens, connection.intended_shop_id, connection.etsy_user_id, signal);
    try {
      return await this.database.transaction(signal, async client => {
      if (identity) await this.owner(client, identity.userId, identity);
      const { invitation, connection: current } = await this.bound(client, invitationId);
      const attempt = (await client.query<Attempt>('SELECT *,expires_at<=clock_timestamp() AS expired FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND id=$2', [this.workspaceId, attemptId])).rows[0];
      if (!attempt || attempt.state !== 'verification_pending' || attempt.expired || attempt.candidate_version !== version || current.link_epoch !== connection.link_epoch
        || tokens.expiresAt <= Date.now()) throw new EtsyFailure('connection_changed');
      const foreign = await client.query('SELECT id FROM app_private.etsy_connections WHERE app_ref=$1 AND shop_id=$2 AND workspace_id<>$3', [this.config.clientId, metadata.shopId, this.workspaceId]);
      if (foreign.rowCount) throw new EtsyFailure('connection_changed');
      await client.query("UPDATE app_private.etsy_credentials SET state='active' WHERE workspace_id=$1 AND connection_id=$2 AND version=$3", [this.workspaceId, connection.id, version]);
      await client.query('DELETE FROM app_private.etsy_credentials WHERE workspace_id=$1 AND version<>$2', [this.workspaceId, version]);
      await client.query(`UPDATE app_private.etsy_connections SET state='active',etsy_user_id=$2,shop_id=$3,active_version=$4,
        verified_at=clock_timestamp(),last_read_at=clock_timestamp(),revision=revision+1,last_outcome=NULL WHERE workspace_id=$1`, [this.workspaceId, metadata.etsyUserId, metadata.shopId, version]);
      await client.query("UPDATE app_private.etsy_authorization_attempts SET state='completed',state_hash=NULL,verifier=NULL WHERE workspace_id=$1 AND id=$2", [this.workspaceId, attemptId]);
      await client.query("UPDATE app_private.etsy_connection_invitations SET state='connected',token_hash=NULL WHERE workspace_id=$1 AND id=$2", [this.workspaceId, invitationId]);
      await this.audit(client, invitation.creator_user_id, 'etsy.callback', attemptId, attemptId);
      const activated = (await this.connection(client))!;
      return { ...metadata, connectionId: activated.id, revision: activated.revision, observedAt: activated.last_read_at!.toISOString() };
      });
    } catch (error) {
      // Only an exact completed attempt/current credential proves a lost commit acknowledgement.
      const reconciled = await this.database.transaction(signal, async client => {
        const offer = (await client.query<Invitation>('SELECT * FROM app_private.etsy_connection_invitations WHERE workspace_id=$1 AND id=$2', [this.workspaceId, invitationId])).rows[0];
        if (!offer) return undefined;
        const actorRevision = await this.owner(client, offer.creator_user_id);
        if (identity) await this.owner(client, identity.userId, identity);
        const current = await this.connection(client);
        if (!current || actorRevision !== offer.creator_revision || current.state !== 'active' || current.link_epoch !== connection.link_epoch
          || current.active_version !== version || offer.state !== 'connected') return undefined;
        const receipt = await client.query("SELECT id FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND id=$2 AND state='completed' AND candidate_version=$3",
          [this.workspaceId, attemptId, version]);
        return receipt.rowCount ? { ...metadata, connectionId: current.id, revision: current.revision, observedAt: current.last_read_at!.toISOString() } : undefined;
      });
      if (reconciled) return reconciled;
      throw error;
    }
  }

  async read(identity: VerifiedIdentity, body: unknown, signal: AbortSignal) {
    const input = record(body, ['expectedRevision']), expected = this.expected(input.expectedRevision);
    const captured = await this.database.transaction(signal, async client => {
      await this.owner(client, identity.userId, identity);
      const connection = await this.connection(client);
      if (!connection || connection.revision !== expected) throw new EtsyFailure('connection_changed');
      await this.cooldown(client);
      let candidate: Attempt | undefined;
      if (connection.state === 'verification_pending') {
        candidate = (await client.query<Attempt>("SELECT *,expires_at<=clock_timestamp() AS expired FROM app_private.etsy_authorization_attempts WHERE workspace_id=$1 AND state='verification_pending'", [this.workspaceId])).rows[0];
        if (!candidate || candidate.expired || candidate.epoch !== connection.link_epoch) throw new EtsyFailure('reconnect_required');
        await this.bound(client, candidate.invitation_id);
      } else if (connection.state !== 'active' || connection.active_version === null) throw new EtsyFailure('reconnect_required');
      const version = candidate?.candidate_version ?? connection.active_version;
      const credential = (await client.query<Credential>("SELECT version,envelope,expires_at,refresh_expires_at FROM app_private.etsy_credentials WHERE workspace_id=$1 AND connection_id=$2 AND version=$3 AND state=$4",
        [this.workspaceId, connection.id, version, candidate ? 'candidate' : 'active'])).rows[0];
      if (!credential || (candidate && credential.expires_at.getTime() <= Date.now())) throw new EtsyFailure('reconnect_required');
      const pending = (await client.query<{ expired: boolean; state: string }>("SELECT state,deadline<=clock_timestamp() AS expired FROM app_private.etsy_refresh_attempts WHERE workspace_id=$1 AND connection_id=$2 AND credential_version=$3 AND state<>'committed'", [this.workspaceId, connection.id, credential.version])).rows[0];
      if (pending) throw new EtsyFailure(pending.expired || pending.state === 'unknown' ? 'outcome_unknown' : 'connection_busy');
      return { connection, credential, candidate };
    });
    let { connection, credential } = captured;
    let tokens: EtsyTokens;
    try { tokens = JSON.parse(this.crypto.open(credential.envelope, `${this.workspaceId}/${connection.id}/${credential.version}/credential`)) as EtsyTokens; }
    catch { throw new EtsyFailure('configuration_unavailable'); }
    if (captured.candidate) {
      try {
        return await this.verifyCandidate(captured.candidate.invitation_id, captured.candidate.id, connection, credential.version, tokens, signal, identity);
      } catch (error) {
        await this.failure(connection, identity.userId, error, false, signal);
        throw error;
      }
    }
    if (credential.expires_at.getTime() <= Date.now() + 30000) {
      const refreshed = await this.refresh(identity, connection, credential, tokens, signal);
      tokens = refreshed.tokens; connection = refreshed.connection; credential = refreshed.credential;
    }
    try {
      const metadata = await this.provider.metadata(tokens, connection.intended_shop_id, connection.etsy_user_id, signal);
      return await this.database.transaction(signal, async client => {
        await this.owner(client, identity.userId, identity);
        const current = await this.connection(client);
        if (!current || current.state !== 'active' || current.link_epoch !== connection.link_epoch || current.active_version !== credential.version) throw new EtsyFailure('connection_changed');
        if ((await client.query("SELECT id FROM app_private.etsy_refresh_attempts WHERE workspace_id=$1 AND credential_version=$2 AND state<>'committed'", [this.workspaceId, credential.version])).rowCount) throw new EtsyFailure('connection_busy');
        const updated = (await client.query<{ last_read_at: Date }>('UPDATE app_private.etsy_connections SET last_read_at=clock_timestamp() WHERE workspace_id=$1 RETURNING last_read_at', [this.workspaceId])).rows[0]!;
        await this.audit(client, identity.userId, 'etsy.sync', current.id, randomUUID());
        return { ...metadata, connectionId: current.id, revision: current.revision, observedAt: updated.last_read_at.toISOString() };
      });
    } catch (error) {
      await this.failure(connection, identity.userId, error, false, signal);
      throw error;
    }
  }

  private async refresh(identity: VerifiedIdentity, connection: Connection, credential: Credential, tokens: EtsyTokens, signal: AbortSignal) {
    const attemptId = randomUUID();
    await this.database.transaction(signal, async client => {
      await this.owner(client, identity.userId, identity);
      const current = await this.connection(client);
      if (!current || current.state !== 'active' || current.link_epoch !== connection.link_epoch || current.active_version !== credential.version) throw new EtsyFailure('connection_changed');
      if (credential.refresh_expires_at.getTime() <= Date.now()) throw new EtsyFailure('reconnect_required');
      const inserted = await client.query(`INSERT INTO app_private.etsy_refresh_attempts(id,workspace_id,connection_id,epoch,credential_version,state,deadline)
        VALUES($1,$2,$3,$4,$5,'submitted',clock_timestamp()+interval '15 seconds') ON CONFLICT(workspace_id,connection_id,credential_version) DO NOTHING RETURNING id`,
      [attemptId, this.workspaceId, connection.id, connection.link_epoch, credential.version]);
      if (!inserted.rowCount) throw new EtsyFailure('connection_busy');
    });
    try {
      const refreshed = await this.provider.refresh(tokens.refreshToken, signal);
      if (refreshed.accessToken.split('.')[0] !== connection.etsy_user_id) throw new EtsyFailure('reconnect_required');
      const version = connection.next_version;
      const envelope = this.crypto.seal(JSON.stringify(refreshed), `${this.workspaceId}/${connection.id}/${version}/credential`);
      try {
        await this.database.transaction(signal, async client => {
          await this.owner(client, identity.userId, identity);
          const current = await this.connection(client);
          const attempt = await client.query("SELECT id FROM app_private.etsy_refresh_attempts WHERE workspace_id=$1 AND id=$2 AND state='submitted' AND deadline>clock_timestamp()", [this.workspaceId, attemptId]);
          if (!current || current.state !== 'active' || current.link_epoch !== connection.link_epoch || current.active_version !== credential.version || !attempt.rowCount) throw new EtsyFailure('connection_changed');
          await client.query(`INSERT INTO app_private.etsy_credentials(workspace_id,connection_id,version,state,envelope,expires_at,refresh_expires_at)
            VALUES($1,$2,$3,'active',$4,$5,$6)`, [this.workspaceId, connection.id, version, envelope, new Date(refreshed.expiresAt), credential.refresh_expires_at]);
          await client.query('UPDATE app_private.etsy_connections SET active_version=$2,next_version=$3,revision=revision+1 WHERE workspace_id=$1', [this.workspaceId, version, version + 1]);
          await client.query('DELETE FROM app_private.etsy_credentials WHERE workspace_id=$1 AND version<>$2', [this.workspaceId, version]);
          await client.query("UPDATE app_private.etsy_refresh_attempts SET state='committed',result_version=$3 WHERE workspace_id=$1 AND id=$2", [this.workspaceId, attemptId, version]);
          await this.audit(client, identity.userId, 'etsy.refresh', connection.id, attemptId);
        });
      } catch (error) {
        const committed = await this.database.transaction(signal, async client => {
          await this.owner(client, identity.userId, identity);
          const current = await this.connection(client);
          return current?.state === 'active' && current.link_epoch === connection.link_epoch && current.active_version === version
            && (await client.query("SELECT id FROM app_private.etsy_refresh_attempts WHERE workspace_id=$1 AND id=$2 AND state='committed' AND result_version=$3", [this.workspaceId, attemptId, version])).rowCount === 1;
        });
        if (!committed) throw error;
      }
      return { tokens: refreshed, connection: { ...connection, active_version: version, revision: connection.revision + 1, next_version: version + 1 },
        credential: { ...credential, version, envelope, expires_at: new Date(refreshed.expiresAt) } };
    } catch (error) {
      await this.failure(connection, identity.userId, error, true, signal);
      throw error;
    }
  }
}

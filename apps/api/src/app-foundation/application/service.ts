import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { AppFoundationConfig } from '../../config/config.js';
import type { components } from '../../generated/api.js';
import { AppDatabase } from '../adapters/postgres.js';
import { AuthAdmin } from '../adapters/auth-admin.js';
import type { DeliveryOutcome } from '../adapters/auth-admin.js';
import type { VerifiedIdentity } from '../adapters/auth-verifier.js';
import { AppError } from './errors.js';
import { capabilitiesFor, permits } from './policy.js';
import type { Capability, MembershipStatus, Role } from './policy.js';
import { displayName, email, pageLimit, record, revision, uuid } from './validation.js';

interface MemberRow { user_id: string; role_code: Role; status: MembershipStatus; revision: number; display_name: string }
interface WorkspaceRow { id: string; display_name: string; revision: number }
interface ProfileRow { user_id: string; display_name: string; revision: number }
interface InvitationRow {
  id: string; workspace_id: string; recipient_email: string; inviter_user_id: string;
  status: 'pending' | 'accepted' | 'revoked'; delivery_state: 'pending' | DeliveryOutcome;
  revision: number; request_fingerprint: string; expires_at: Date; accepted_by_user_id: string | null;
  expired: boolean;
}
interface AuditChange {
  action: components['schemas']['AppAuditEvent']['action']; targetId: string; outcome?: 'accepted' | DeliveryOutcome;
  beforeRevision?: number; afterRevision?: number; beforeRole?: Role; afterRole?: Role;
  beforeStatus?: MembershipStatus; afterStatus?: MembershipStatus;
}

const memberView = (row: MemberRow): components['schemas']['AppMember'] => ({ userId: row.user_id, displayName: row.display_name,
  role: row.role_code, status: row.status, revision: row.revision });
const workspaceView = (row: WorkspaceRow): components['schemas']['AppWorkspace'] => ({ id: row.id, displayName: row.display_name, revision: row.revision });
const profileView = (row: ProfileRow): components['schemas']['AppProfile'] => ({ userId: row.user_id, displayName: row.display_name, revision: row.revision });
const invitationView = (row: InvitationRow): components['schemas']['AppInvitation'] => ({ id: row.id, email: row.recipient_email, role: 'member',
  status: row.status === 'pending' && row.expired ? 'expired' as const : row.status,
  delivery: row.delivery_state, revision: row.revision, expiresAt: row.expires_at.toISOString() });

export function bootstrapIdentity(workspace: string, input: { userId: string; profileName: string; workspaceName: string; approvalId: string }) {
  const workspaceId = uuid(workspace), userId = uuid(input.userId), profileName = displayName(input.profileName);
  const workspaceName = displayName(input.workspaceName), approvalId = uuid(input.approvalId);
  const fingerprint = createHash('sha256').update(JSON.stringify({ workspaceId, userId, profileName, workspaceName })).digest('hex');
  return { workspaceId, userId, profileName, workspaceName, approvalId, fingerprint };
}
export function bootstrapAuditMatches(row: Record<string, unknown> | undefined,
  expected: { workspaceId: string; userId: string; approvalId: string }): boolean {
  return Boolean(row && row.workspace_id === expected.workspaceId && row.action === 'workspace.bootstrap'
    && row.actor_user_id === expected.userId && row.request_id === expected.approvalId && row.target_id === expected.workspaceId
    && row.outcome === 'accepted' && row.before_revision === null && row.after_revision === 1
    && row.before_role === null && row.after_role === 'owner' && row.before_status === null && row.after_status === 'active');
}

export class AppService {
  constructor(private readonly config: AppFoundationConfig, private readonly database: AppDatabase,
    private readonly auth: AuthAdmin) {}

  private async session(client: PoolClient, identity: VerifiedIdentity): Promise<void> {
    const result = await client.query<{ active: boolean }>('SELECT app_private.has_current_session($1::uuid, $2::uuid) AS active',
      [identity.sessionId, identity.userId]);
    if (result.rows[0]?.active !== true) throw new AppError('unauthenticated');
  }

  private async workspace(client: PoolClient, write: boolean): Promise<WorkspaceRow> {
    const result = await client.query<WorkspaceRow>(
      `SELECT id, display_name, revision FROM app_private.workspaces WHERE id = $1${write ? ' FOR UPDATE' : ''}`, [this.config.workspaceId]);
    if (!result.rows[0]) throw new AppError('forbidden');
    return result.rows[0];
  }

  private async member(client: PoolClient, userId: string): Promise<MemberRow | undefined> {
    return (await client.query<MemberRow>(`SELECT m.user_id, m.role_code, m.status, m.revision, p.display_name
      FROM app_private.memberships m JOIN app_private.profiles p ON p.user_id = m.user_id
      WHERE m.workspace_id = $1 AND m.user_id = $2`, [this.config.workspaceId, userId])).rows[0];
  }

  private async admit(client: PoolClient, identity: VerifiedIdentity, capability: Capability, write = false) {
    await this.session(client, identity);
    const workspace = await this.workspace(client, write);
    const member = await this.member(client, identity.userId);
    if (!member || !permits(member.role_code, member.status, capability)) throw new AppError('forbidden');
    return { workspace, member };
  }

  private async audit(client: PoolClient, actor: string, requestId: string, change: AuditChange): Promise<void> {
    await client.query(`INSERT INTO app_private.audit_events
      (id, workspace_id, actor_user_id, action, target_id, outcome, request_id, before_revision, after_revision,
       before_role, after_role, before_status, after_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [randomUUID(), this.config.workspaceId, actor, change.action, change.targetId, change.outcome ?? 'accepted', requestId,
      change.beforeRevision ?? null, change.afterRevision ?? null, change.beforeRole ?? null, change.afterRole ?? null,
      change.beforeStatus ?? null, change.afterStatus ?? null]);
  }

  me(identity: VerifiedIdentity, signal: AbortSignal) {
    return this.database.transaction(signal, async client => {
      const admission = await this.admit(client, identity, 'profile.read.self');
      const profile = (await client.query<ProfileRow>('SELECT user_id, display_name, revision FROM app_private.profiles WHERE user_id = $1', [identity.userId])).rows[0];
      if (!profile) throw new AppError('dependency_unavailable');
      return { profile: profileView(profile), email: identity.email, workspace: workspaceView(admission.workspace),
        membership: memberView(admission.member), capabilities: capabilitiesFor(admission.member.role_code, admission.member.status) };
    });
  }

  updateProfile(identity: VerifiedIdentity, body: unknown, requestId: string, signal: AbortSignal) {
    const input = record(body, ['displayName', 'revision']);
    const name = displayName(input.displayName), expected = revision(input.revision);
    return this.database.transaction(signal, async client => {
      await this.admit(client, identity, 'profile.update.self', true);
      const updated = await client.query<ProfileRow>(`UPDATE app_private.profiles SET display_name = $1, revision = revision + 1,
        updated_at = now() WHERE user_id = $2 AND revision = $3 RETURNING user_id, display_name, revision`, [name, identity.userId, expected]);
      if (!updated.rows[0]) throw new AppError('revision_conflict');
      await this.audit(client, identity.userId, requestId, { action: 'profile.update', targetId: identity.userId,
        beforeRevision: expected, afterRevision: updated.rows[0].revision });
      return { profile: profileView(updated.rows[0]) };
    });
  }

  readWorkspace(identity: VerifiedIdentity, signal: AbortSignal) {
    return this.database.transaction(signal, async client => ({ workspace: workspaceView((await this.admit(client, identity, 'workspace.read')).workspace) }));
  }

  updateWorkspace(identity: VerifiedIdentity, body: unknown, requestId: string, signal: AbortSignal) {
    const input = record(body, ['displayName', 'revision']);
    const name = displayName(input.displayName), expected = revision(input.revision);
    return this.database.transaction(signal, async client => {
      const { workspace } = await this.admit(client, identity, 'workspace.update', true);
      if (workspace.revision !== expected) throw new AppError('revision_conflict');
      const updated = await client.query<WorkspaceRow>(`UPDATE app_private.workspaces SET display_name = $1, revision = revision + 1,
        updated_at = now() WHERE id = $2 AND revision = $3 RETURNING id, display_name, revision`, [name, this.config.workspaceId, expected]);
      if (!updated.rows[0]) throw new AppError('revision_conflict');
      await this.audit(client, identity.userId, requestId, { action: 'workspace.update', targetId: this.config.workspaceId,
        beforeRevision: expected, afterRevision: updated.rows[0].revision });
      return { workspace: workspaceView(updated.rows[0]) };
    });
  }

  team(identity: VerifiedIdentity, query: unknown, signal: AbortSignal) {
    const input = record(query, ['limit', 'cursor'], []);
    const limit = pageLimit(input.limit), cursor = input.cursor === undefined ? null : uuid(input.cursor);
    return this.database.transaction(signal, async client => {
      await this.admit(client, identity, 'team.read');
      if (cursor && !(await this.member(client, cursor))) throw new AppError('invalid_request');
      const result = await client.query<MemberRow>(`SELECT m.user_id, m.role_code, m.status, m.revision, p.display_name
        FROM app_private.memberships m JOIN app_private.profiles p ON p.user_id = m.user_id
        WHERE m.workspace_id = $1 AND ($2::uuid IS NULL OR m.user_id > $2) ORDER BY m.user_id LIMIT $3`,
      [this.config.workspaceId, cursor, limit + 1]);
      const hasNext = result.rows.length > limit;
      if (hasNext) result.rows.pop();
      return { items: result.rows.map(memberView), nextCursor: hasNext ? result.rows.at(-1)!.user_id : null };
    });
  }

  updateMember(identity: VerifiedIdentity, memberId: string, body: unknown, requestId: string, signal: AbortSignal) {
    const targetId = uuid(memberId), input = record(body, ['role', 'status', 'revision'], ['revision']);
    const expected = revision(input.revision);
    if (input.role === undefined && input.status === undefined) throw new AppError('invalid_request');
    if (input.role !== undefined && input.role !== 'owner' && input.role !== 'member') throw new AppError('invalid_request');
    if (input.status !== undefined && input.status !== 'active' && input.status !== 'disabled') throw new AppError('invalid_request');
    return this.database.transaction(signal, async client => {
      const { member: actor } = await this.admit(client, identity,
        input.role !== undefined ? 'team.role.assign' : 'team.membership.manage', true);
      if (input.status !== undefined && !permits(actor.role_code, actor.status, 'team.membership.manage')) throw new AppError('forbidden');
      const target = await this.member(client, targetId);
      if (!target) throw new AppError('not_found');
      if (target.revision !== expected) throw new AppError('revision_conflict');
      const role = (input.role ?? target.role_code) as Role, status = (input.status ?? target.status) as MembershipStatus;
      if (target.status !== 'active' && role === 'owner' && target.role_code !== 'owner') throw new AppError('invalid_request');
      if (target.role_code === 'owner' && target.status === 'active' && (role !== 'owner' || status !== 'active')) {
        const owners = await client.query('SELECT user_id FROM app_private.memberships WHERE workspace_id = $1 AND role_code = $2 AND status = $3 AND user_id <> $4 LIMIT 1',
          [this.config.workspaceId, 'owner', 'active', targetId]);
        if (!owners.rowCount) throw new AppError('last_owner');
      }
      const updated = await client.query<{ revision: number }>(`UPDATE app_private.memberships SET role_code = $1, status = $2,
        revision = revision + 1, updated_at = now(), disabled_at = CASE WHEN $2 = 'disabled' THEN now() ELSE NULL END
        WHERE workspace_id = $3 AND user_id = $4 AND revision = $5 RETURNING revision`, [role, status, this.config.workspaceId, targetId, expected]);
      if (!updated.rows[0]) throw new AppError('revision_conflict');
      await this.audit(client, identity.userId, requestId, { action: 'membership.update', targetId, beforeRevision: expected,
        afterRevision: updated.rows[0].revision, beforeRole: target.role_code, afterRole: role, beforeStatus: target.status, afterStatus: status });
      return { member: memberView({ ...target, role_code: role, status, revision: updated.rows[0].revision }) };
    });
  }

  auditPage(identity: VerifiedIdentity, query: unknown, signal: AbortSignal) {
    const input = record(query, ['limit', 'cursor'], []);
    const limit = pageLimit(input.limit), cursor = input.cursor === undefined ? null : uuid(input.cursor);
    return this.database.transaction(signal, async client => {
      await this.admit(client, identity, 'audit.read');
      let before: string | null = null;
      if (cursor) {
        const found = await client.query<{ occurred_at: string }>('SELECT occurred_at::text AS occurred_at FROM app_private.audit_events WHERE workspace_id = $1 AND id = $2', [this.config.workspaceId, cursor]);
        if (!found.rows[0]) throw new AppError('invalid_request');
        before = found.rows[0].occurred_at;
      }
      const result = await client.query<{ id: string; actor_user_id: string; action: string; target_id: string; outcome: string;
        request_id: string; occurred_at: Date; before_revision: number | null; after_revision: number | null;
        before_role: Role | null; after_role: Role | null; before_status: MembershipStatus | null; after_status: MembershipStatus | null }>(
        `SELECT id, actor_user_id, action, target_id, outcome, request_id, occurred_at, before_revision, after_revision,
         before_role, after_role, before_status, after_status FROM app_private.audit_events
         WHERE workspace_id = $1 AND ($2::timestamptz IS NULL OR (occurred_at,id) < ($2,$3::uuid)) ORDER BY occurred_at DESC,id DESC LIMIT $4`,
        [this.config.workspaceId, before, cursor, limit + 1]);
      const hasNext = result.rows.length > limit;
      if (hasNext) result.rows.pop();
      return { items: result.rows.map(row => ({ id: row.id, actorUserId: row.actor_user_id, action: row.action,
        targetId: row.target_id, outcome: row.outcome, requestId: row.request_id, occurredAt: row.occurred_at.toISOString(),
        beforeRevision: row.before_revision, afterRevision: row.after_revision, beforeRole: row.before_role,
        afterRole: row.after_role, beforeStatus: row.before_status, afterStatus: row.after_status })),
      nextCursor: hasNext ? result.rows.at(-1)!.id : null };
    });
  }

  private async invitation(client: PoolClient, id: string): Promise<InvitationRow> {
    const result = await client.query<InvitationRow>(`SELECT *, expires_at <= clock_timestamp() AS expired FROM app_private.invitations
      WHERE workspace_id = $1 AND id = $2`, [this.config.workspaceId, id]);
    if (!result.rows[0]) throw new AppError('not_found');
    return result.rows[0];
  }

  invitations(identity: VerifiedIdentity, query: unknown, signal: AbortSignal) {
    const input = record(query, ['limit', 'cursor'], []);
    const limit = pageLimit(input.limit), cursor = input.cursor === undefined ? null : uuid(input.cursor);
    return this.database.transaction(signal, async client => {
      await this.admit(client, identity, 'team.invite.manage');
      if (cursor) await this.invitation(client, cursor);
      const result = await client.query<InvitationRow>(`SELECT *, expires_at <= clock_timestamp() AS expired FROM app_private.invitations
        WHERE workspace_id = $1 AND ($2::uuid IS NULL OR id > $2) ORDER BY id LIMIT $3`, [this.config.workspaceId, cursor, limit + 1]);
      const hasNext = result.rows.length > limit;
      if (hasNext) result.rows.pop();
      return { items: result.rows.map(invitationView), nextCursor: hasNext ? result.rows.at(-1)!.id : null };
    });
  }

  async createInvitation(identity: VerifiedIdentity, body: unknown, requestId: string, signal: AbortSignal, priorId?: string) {
    const input = record(body, priorId ? ['idempotencyKey', 'revision'] : ['email', 'idempotencyKey']);
    const key = uuid(input.idempotencyKey), prior = priorId === undefined ? undefined : uuid(priorId);
    const recipient = prior ? undefined : email(input.email), expected = prior ? revision(input.revision) : undefined;
    const reserved = await this.database.transaction(signal, async client => {
      const { member } = await this.admit(client, identity, prior ? 'team.invite.manage' : 'team.invite', true);
      const old = prior ? await this.invitation(client, prior) : undefined;
      const address = old?.recipient_email ?? recipient!;
      const fingerprint = createHash('sha256').update(JSON.stringify({ action: prior ? 'reinvite' : 'create', email: address,
        prior: prior ?? null, revision: expected ?? null })).digest('hex');
      const replay = await client.query<InvitationRow>(`SELECT *, expires_at <= clock_timestamp() AS expired FROM app_private.invitations
        WHERE workspace_id = $1 AND inviter_user_id = $2 AND idempotency_key = $3`, [this.config.workspaceId, identity.userId, key]);
      if (replay.rows[0]) {
        if (replay.rows[0].request_fingerprint !== fingerprint) throw new AppError('invitation_conflict');
        return { invitation: replay.rows[0], send: false };
      }
      if (!this.auth.deliveryEnabled) throw new AppError('delivery_unavailable');
      if (old && (old.revision !== expected || old.status === 'accepted' || old.delivery_state === 'pending' || old.delivery_state === 'unknown')) {
        throw new AppError('invitation_conflict');
      }
      // Even a revoked unknown intent fences a new key for this recipient until
      // explicit operator reconciliation; otherwise create would bypass reinvite.
      const uncertain = await client.query(`SELECT id FROM app_private.invitations WHERE workspace_id = $1 AND recipient_email = $2
        AND delivery_state IN ('pending','unknown') LIMIT 1`, [this.config.workspaceId, address]);
      if (uncertain.rowCount) throw new AppError('invitation_conflict');
      const pending = await client.query<InvitationRow>(`SELECT *, expires_at <= clock_timestamp() AS expired FROM app_private.invitations
        WHERE workspace_id = $1 AND recipient_email = $2 AND status = 'pending'`, [this.config.workspaceId, address]);
      if (pending.rows[0] && pending.rows[0].id !== old?.id) throw new AppError('invitation_conflict');
      const id = randomUUID();
      if (old) {
        await client.query(`UPDATE app_private.invitations SET status = 'revoked', revoked_at = COALESCE(revoked_at,now()),
          revision = revision + 1, superseded_by_id = $1 WHERE workspace_id = $2 AND id = $3`, [id, this.config.workspaceId, old.id]);
        await this.audit(client, identity.userId, requestId, { action: 'invitation.revoke', targetId: old.id,
          beforeRevision: old.revision, afterRevision: old.revision + 1 });
      }
      await client.query(`INSERT INTO app_private.invitations (id,workspace_id,recipient_email,inviter_user_id,inviter_membership_revision,idempotency_key,request_fingerprint)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, this.config.workspaceId, address, identity.userId, member.revision, key, fingerprint]);
      await this.audit(client, identity.userId, requestId, { action: 'invitation.create', targetId: id, afterRevision: 1 });
      return { invitation: await this.invitation(client, id), send: true };
    });
    if (!reserved.send) return { invitation: invitationView(reserved.invitation) };
    const outcome = await this.auth.sendInvitation(reserved.invitation.recipient_email, reserved.invitation.id, signal);
    // A crash or failure here leaves durable pending intent, which is fenced just
    // like unknown delivery. Never resend or assert rollback of provider effects.
    return this.database.transaction(signal, async client => {
      await this.session(client, identity);
      await this.workspace(client, true);
      const current = await this.invitation(client, reserved.invitation.id);
      await client.query('UPDATE app_private.invitations SET delivery_state = $1, revision = revision + 1 WHERE workspace_id = $2 AND id = $3',
        [outcome, this.config.workspaceId, current.id]);
      await this.audit(client, identity.userId, requestId, { action: 'invitation.delivery', targetId: current.id, outcome,
        beforeRevision: current.revision, afterRevision: current.revision + 1 });
      return { invitation: invitationView(await this.invitation(client, current.id)) };
    });
  }

  revokeInvitation(identity: VerifiedIdentity, invitationId: string, body: unknown, requestId: string, signal: AbortSignal) {
    const id = uuid(invitationId), input = record(body, ['revision']), expected = revision(input.revision);
    return this.database.transaction(signal, async client => {
      await this.admit(client, identity, 'team.invite.manage', true);
      const offer = await this.invitation(client, id);
      if (offer.revision !== expected) throw new AppError('revision_conflict');
      if (offer.status !== 'pending') throw new AppError('invitation_conflict');
      await client.query("UPDATE app_private.invitations SET status = 'revoked', revoked_at = now(), revision = revision + 1 WHERE workspace_id = $1 AND id = $2",
        [this.config.workspaceId, id]);
      await this.audit(client, identity.userId, requestId, { action: 'invitation.revoke', targetId: id,
        beforeRevision: expected, afterRevision: expected + 1 });
      return { invitation: invitationView(await this.invitation(client, id)) };
    });
  }

  acceptInvitation(identity: VerifiedIdentity, invitationId: string, body: unknown, requestId: string, signal: AbortSignal) {
    const id = uuid(invitationId), input = record(body, ['displayName']), name = displayName(input.displayName);
    return this.database.transaction(signal, async client => {
      await this.session(client, identity);
      await this.workspace(client, true);
      const offer = await this.invitation(client, id);
      if (offer.recipient_email !== identity.email) throw new AppError('not_found');
      const existing = await this.member(client, identity.userId);
      if (offer.status === 'accepted' && offer.accepted_by_user_id === identity.userId && existing?.status === 'active') {
        return { member: memberView(existing) };
      }
      if (offer.status !== 'pending' || offer.expired || existing) throw new AppError('invitation_conflict');
      const inviter = await this.member(client, offer.inviter_user_id);
      if (!inviter || !permits(inviter.role_code, inviter.status, 'team.invite')) throw new AppError('invitation_conflict');
      await client.query('INSERT INTO app_private.profiles (user_id,display_name) VALUES ($1,$2) ON CONFLICT (user_id) DO NOTHING', [identity.userId, name]);
      await client.query("INSERT INTO app_private.memberships (workspace_id,user_id,role_code,status) VALUES ($1,$2,'member','active')", [this.config.workspaceId, identity.userId]);
      await client.query("UPDATE app_private.invitations SET status = 'accepted', accepted_at = now(), accepted_by_user_id = $1, revision = revision + 1 WHERE workspace_id = $2 AND id = $3",
        [identity.userId, this.config.workspaceId, id]);
      await this.audit(client, identity.userId, requestId, { action: 'invitation.accept', targetId: id,
        beforeRevision: offer.revision, afterRevision: offer.revision + 1, afterRole: 'member', afterStatus: 'active' });
      return { member: memberView((await this.member(client, identity.userId))!) };
    });
  }

  async bootstrap(input: { userId: string; profileName: string; workspaceName: string; approvalId: string }, signal: AbortSignal) {
    const expected = bootstrapIdentity(this.config.workspaceId, input);
    const { userId, profileName, workspaceName, approvalId, fingerprint } = expected;
    await this.auth.verifiedUser(userId, signal);
    return this.database.transaction(signal, async client => {
      await client.query('SELECT pg_advisory_xact_lock(5005, 1)');
      const existing = await client.query<WorkspaceRow & { bootstrap_request_id: string; bootstrap_fingerprint: string }>(
        'SELECT id,display_name,revision,bootstrap_request_id,bootstrap_fingerprint FROM app_private.workspaces FOR UPDATE');
      if (existing.rows[0]) {
        const owner = await this.member(client, userId);
        const bootstrap = await client.query('SELECT * FROM app_private.audit_events WHERE workspace_id = $1 AND action = $2 LIMIT 2',
          [this.config.workspaceId, 'workspace.bootstrap']);
        if (existing.rows[0].id !== this.config.workspaceId || owner?.role_code !== 'owner' || owner.status !== 'active'
          || existing.rows[0].bootstrap_request_id !== approvalId || existing.rows[0].bootstrap_fingerprint !== fingerprint
          || bootstrap.rowCount !== 1 || !bootstrapAuditMatches(bootstrap.rows[0], expected)) {
          throw new AppError('bootstrap_conflict');
        }
        return { workspace: workspaceView(existing.rows[0]), member: memberView(owner) };
      }
      await client.query('INSERT INTO app_private.profiles (user_id,display_name) VALUES ($1,$2)', [userId, profileName]);
      await client.query('INSERT INTO app_private.workspaces (id,display_name,bootstrap_request_id,bootstrap_fingerprint) VALUES ($1,$2,$3,$4)',
        [this.config.workspaceId, workspaceName, approvalId, fingerprint]);
      await client.query("INSERT INTO app_private.memberships (workspace_id,user_id,role_code,status) VALUES ($1,$2,'owner','active')", [this.config.workspaceId, userId]);
      await this.audit(client, userId, approvalId, { action: 'workspace.bootstrap', targetId: this.config.workspaceId,
        afterRevision: 1, afterRole: 'owner', afterStatus: 'active' });
      return { workspace: workspaceView((await this.workspace(client, false))), member: memberView((await this.member(client, userId))!) };
    });
  }

  async reconcileInvitation(input: { userId: string; invitationId: string; outcome: 'confirmed' | 'failed'; approvalId: string }, signal: AbortSignal) {
    const userId = uuid(input.userId), id = uuid(input.invitationId), approvalId = uuid(input.approvalId);
    if (input.outcome !== 'confirmed' && input.outcome !== 'failed') throw new AppError('invalid_request');
    await this.auth.verifiedUser(userId, signal);
    return this.database.transaction(signal, async client => {
      await this.workspace(client, true);
      const actor = await this.member(client, userId);
      if (!actor || !permits(actor.role_code, actor.status, 'team.invite.manage')) throw new AppError('forbidden');
      const offer = await this.invitation(client, id);
      if (offer.delivery_state !== 'pending' && offer.delivery_state !== 'unknown') throw new AppError('invitation_conflict');
      if (offer.delivery_state === 'pending') {
        const settled = await client.query(`SELECT id FROM app_private.invitations WHERE workspace_id = $1 AND id = $2
          AND created_at + interval '10 seconds' <= clock_timestamp()`, [this.config.workspaceId, id]);
        if (!settled.rowCount) throw new AppError('invitation_conflict');
      }
      await client.query('UPDATE app_private.invitations SET delivery_state = $1, revision = revision + 1 WHERE workspace_id = $2 AND id = $3',
        [input.outcome, this.config.workspaceId, id]);
      await this.audit(client, userId, approvalId, { action: 'invitation.reconcile', targetId: id, outcome: input.outcome,
        beforeRevision: offer.revision, afterRevision: offer.revision + 1 });
      return { invitation: invitationView(await this.invitation(client, id)) };
    });
  }
}

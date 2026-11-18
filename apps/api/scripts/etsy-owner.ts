import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHiddenPassword } from './hidden-input.mjs';
import { privateDirectory } from './private-files.mjs';
import { readEvidence, writeReleaseEvidence } from './release-journal.js';
import { responseBytes } from './ci-tools.js';
import { setupObject } from './etsy-setup.js';
import { bounded } from './bounded.js';
import type { components } from '../src/generated/api.js';
import { sha256 } from './artifact.js';
import { validateEtsyReleasePacket, verifyEtsyArtifact, verifyEtsyOwnerExecution } from './etsy-release.js';
import type { EtsyReleasePacket } from './etsy-release.js';

type Schemas = components['schemas'];
export interface EtsyOwnerSettings { authUrl: string; authApiKey: string; technicalKey: string; invitationOrigin: string; clientId: string }
export class EtsyOwnerError extends Error {
  constructor(readonly outcome: 'refused' | 'unknown' | 'denied' = 'refused') {
    super(`Etsy Owner operation ${outcome}; no automatic login, refresh or retry.`);
  }
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function refuse(): never { throw new EtsyOwnerError(); }
function mutation(value: unknown, keys: string[]): Record<string, unknown> {
  const input = setupObject(value);
  if (Object.keys(input).sort().join(',') !== [...keys].sort().join(',')
    || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 0
    || ('idempotencyKey' in input && (typeof input.idempotencyKey !== 'string' || !uuid.test(input.idempotencyKey)))) refuse();
  return input;
}
export interface EtsyOwnerApproval { readonly approved: true }
interface OwnerApprovalState {
  path: string; digest: string; artifactRoot: string; packet: EtsyReleasePacket;
  authUrl: string; authApiKeySha256: string;
}
const approvals = new WeakMap<EtsyOwnerApproval, OwnerApprovalState>();
function approvalState(approval: EtsyOwnerApproval): OwnerApprovalState {
  const state = approvals.get(approval);
  if (!state || Date.now() < state.packet.window.start || Date.now() >= state.packet.window.end) refuse();
  return state;
}
export function loadEtsyOwnerApproval(path: string, digest: string, artifactRoot: string): EtsyOwnerApproval {
  try {
    // digest is pinned by the independently approved generated launcher, never
    // calculated from settings or accepted from the same untrusted JSON.
    const evidence = readEvidence(path), value = setupObject(evidence.value);
    if (!/^[a-f0-9]{64}$/.test(digest) || evidence.identity.sha256 !== digest
      || Object.keys(value).sort().join(',') !== 'authApiKeySha256,authUrl,packet,packetDigest,version'
      || value.version !== 1 || typeof value.packetDigest !== 'string'
      || typeof value.authApiKeySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.authApiKeySha256)) refuse();
    const packet = validateEtsyReleasePacket(value.packet, value.packetDigest);
    if (!/^supabase:[a-z]{20}$/.test(packet.target)
      || value.authUrl !== `https://${packet.target.slice(9)}.supabase.co/auth/v1`) refuse();
    verifyEtsyArtifact(packet, artifactRoot);
    const approval: EtsyOwnerApproval = Object.freeze({ approved: true });
    approvals.set(approval, { path, digest, artifactRoot, packet,
      authUrl: value.authUrl as string, authApiKeySha256: value.authApiKeySha256 });
    return approval;
  } catch { return refuse(); }
}
function recheckApproval(approval: EtsyOwnerApproval): void {
  try {
    const state = approvalState(approval);
    if (readEvidence(state.path).identity.sha256 !== state.digest) refuse();
    verifyEtsyArtifact(state.packet, state.artifactRoot);
  } catch { refuse(); }
}
export function ownerSettings(value: unknown, approval: EtsyOwnerApproval): EtsyOwnerSettings {
  try {
    const input = setupObject(value);
    const trusted = approvalState(approval);
    if (Object.keys(input).sort().join(',') !== 'authApiKey,authUrl,clientId,invitationOrigin,technicalKey'
      || Object.values(input).some(item => typeof item !== 'string')) refuse();
    const settings = input as unknown as EtsyOwnerSettings;
    if (settings.authUrl !== trusted.authUrl || sha256(settings.authApiKey) !== trusted.authApiKeySha256
      || !/^[a-f0-9]{64}$/.test(settings.technicalKey) || !/^[A-Za-z0-9_-]{1,256}$/.test(settings.clientId)) refuse();
    const origin = new URL(settings.invitationOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== settings.invitationOrigin || origin.username || origin.password) refuse();
    return { ...settings };
  } catch { return refuse(); }
}
export class EtsyOwnerClient {
  readonly #settings: EtsyOwnerSettings;
  #access = '';
  #admitted = false;
  #busy = false;
  #uncertain = false;
  constructor(settings: EtsyOwnerSettings, private readonly approval: EtsyOwnerApproval, private readonly transport: typeof fetch = fetch) {
    recheckApproval(approval);
    this.#settings = ownerSettings(settings, approval);
  }
  async #exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.#busy) refuse();
    this.#busy = true;
    try { return await work(); }
    catch (error) { throw error instanceof EtsyOwnerError ? error : new EtsyOwnerError(this.#uncertain ? 'unknown' : 'refused'); }
    finally { this.#busy = false; }
  }
  async #request(url: string, init: RequestInit, maximum = 65536): Promise<{ response: Response; value: unknown }> {
    const signal = AbortSignal.timeout(8000);
    try {
      const response = await bounded(this.transport(url, { ...init, redirect: 'manual', signal }), signal);
      const bytes = response.body ? await bounded(responseBytes(response, maximum), signal) : Buffer.alloc(0);
      const value = bytes.length ? JSON.parse(bytes.toString('utf8')) as unknown : null;
      return { response, value };
    } catch { throw new EtsyOwnerError('unknown'); }
  }
  #headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.#settings.technicalKey}`, 'X-App-Access-Token': this.#access,
      'Content-Type': 'application/json' };
  }
  async login(email: string, password: string): Promise<void> {
    return this.#exclusive(async () => {
      recheckApproval(this.approval);
      if (this.#access || this.#uncertain || !/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 320 || !password || password.length > 4096) refuse();
      // Password is sent once to the fixed existing provider password endpoint.
      this.#uncertain = true;
      const result = await this.#request(`${this.#settings.authUrl}/token?grant_type=password`, { method: 'POST',
        headers: { apikey: this.#settings.authApiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      if (result.response.status !== 200) throw new EtsyOwnerError('denied');
      const value = setupObject(result.value);
      if (typeof value.access_token !== 'string' || !/^[A-Za-z0-9_.-]{16,16384}$/.test(value.access_token)
        || String(value.token_type).toLowerCase() !== 'bearer') refuse();
      this.#access = value.access_token; // Deliberately discard refresh token; never decode claims as authority.
      const admitted = await this.#request('https://api.lovora.us/v1/app/me', { headers: this.#headers() });
      const me = setupObject(admitted.value), membership = setupObject(me.membership);
      if (admitted.response.status !== 200 || membership.role !== 'owner' || membership.status !== 'active'
        || !Array.isArray(me.capabilities) || !['etsy.connection.read', 'etsy.connection.manage'].every(capability => (me.capabilities as unknown[]).includes(capability))) {
        throw new EtsyOwnerError('denied');
      }
      this.#admitted = true; this.#uncertain = false;
    });
  }
  async #app(path: string, body?: object): Promise<Record<string, unknown>> {
    if (!this.#admitted || this.#uncertain) refuse();
    // Unknown writes require an explicit new session and inspection, never replay in this client.
    if (body) this.#uncertain = true;
    const result = await this.#request(`https://api.lovora.us/v1/app/integrations/etsy${path}`,
      { method: body ? 'POST' : 'GET', headers: this.#headers(), ...(body ? { body: JSON.stringify(body) } : {}) });
    if (result.response.status !== 200) throw new EtsyOwnerError(result.response.status >= 500 ? 'unknown' : 'denied');
    const value = setupObject(result.value);
    this.#uncertain = false;
    return value;
  }
  status(): Promise<Record<string, unknown>> { return this.#exclusive(() => this.#app('')); }
  list(limit: number, cursor?: string): Promise<Record<string, unknown>> {
    return this.#exclusive(() => {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (cursor !== undefined && !uuid.test(cursor))) refuse();
      return this.#app(`/invitations?limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`);
    });
  }
  create(input: Schemas['EtsyCreateInvitation'], output: string, intent: 'connect' | 'reconnect'): Promise<Record<string, unknown>> {
    return this.#exclusive(async () => {
      mutation(input, ['expectedRevision', 'expectedShopId', 'idempotencyKey']);
      if (!['connect', 'reconnect'].includes(intent) || !/^[1-9]\d{0,18}$/.test(input.expectedShopId)
        || BigInt(input.expectedShopId) > 9223372036854775807n) refuse();
      privateDirectory(dirname(resolve(output)), false);
      const result = await this.#app('/invitations', input);
      if (result.shareUrl !== undefined) {
        const url = new URL(String(result.shareUrl));
        if (url.origin !== this.#settings.invitationOrigin || url.pathname !== '/integrations/etsy/invite'
          || url.search || !/^#[A-Za-z0-9_-]{43}$/.test(url.hash) || url.username || url.password) refuse();
        try { writeReleaseEvidence(resolve(output), { shareUrl: url.href }); }
        catch { this.#uncertain = true; throw new EtsyOwnerError('unknown'); }
      }
      const { shareUrl: _, ...receipt } = result;
      return receipt;
    });
  }
  cancel(id: string, input: Schemas['EtsyMutation']): Promise<Record<string, unknown>> {
    return this.#exclusive(() => {
      if (!uuid.test(id)) refuse(); mutation(input, ['expectedRevision', 'idempotencyKey']);
      return this.#app(`/invitations/${id}/cancel`, input);
    });
  }
  read(expectedRevision: number): Promise<Record<string, unknown>> {
    return this.#exclusive(() => { mutation({ expectedRevision }, ['expectedRevision']); return this.#app('/read', { expectedRevision }); });
  }
  disconnect(input: Schemas['EtsyMutation']): Promise<Record<string, unknown>> {
    return this.#exclusive(() => { mutation(input, ['expectedRevision', 'idempotencyKey']); return this.#app('/disconnect', input); });
  }
  start(shareUrl: string, output: string): Promise<void> {
    return this.#exclusive(async () => {
      if (!this.#admitted || this.#uncertain) refuse();
      const url = new URL(shareUrl);
      if (url.origin !== this.#settings.invitationOrigin || url.pathname !== '/integrations/etsy/invite' || url.search
        || url.username || url.password || !/^#[A-Za-z0-9_-]{43}$/.test(url.hash)) refuse();
      privateDirectory(dirname(resolve(output)), false);
      this.#uncertain = true;
      const result = await this.#request(`${this.#settings.invitationOrigin}/integrations/etsy/invite/start`, {
        method: 'POST', headers: { Origin: this.#settings.invitationOrigin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: url.hash.slice(1) }),
      });
      if (result.response.status !== 303) throw new EtsyOwnerError('denied');
      const consent = new URL(result.response.headers.get('location') ?? '');
      if (consent.origin !== 'https://www.etsy.com' || consent.pathname !== '/oauth/connect' || consent.hash
        || consent.username || consent.password || consent.searchParams.get('client_id') !== this.#settings.clientId
        || consent.searchParams.get('redirect_uri') !== 'https://api.lovora.us/integrations/etsy/callback'
        || consent.searchParams.get('scope') !== 'shops_r' || consent.searchParams.get('response_type') !== 'code'
        || consent.searchParams.get('code_challenge_method') !== 'S256'
        || !/^[A-Za-z0-9_-]{43}$/.test(consent.searchParams.get('state') ?? '')
        || !/^[A-Za-z0-9_-]{43}$/.test(consent.searchParams.get('code_challenge') ?? '')
        || [...consent.searchParams.keys()].sort().join(',') !== 'client_id,code_challenge,code_challenge_method,redirect_uri,response_type,scope,state') refuse();
      writeReleaseEvidence(resolve(output), { consentUrl: consent.href });
      this.#uncertain = false;
    });
  }
  logout(): Promise<'confirmed' | 'unknown'> {
    return this.#exclusive(async () => {
      const access = this.#access; this.#access = ''; this.#admitted = false; this.#uncertain = true;
      if (!access) return 'unknown';
      try {
        const result = await this.#request(`${this.#settings.authUrl}/logout?scope=local`, { method: 'POST',
          headers: { apikey: this.#settings.authApiKey, Authorization: `Bearer ${access}` } });
        return result.response.status === 204 ? 'confirmed' : 'unknown';
      } catch { return 'unknown'; }
    });
  }
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 3 || !process.stdin.isTTY || !process.stdout.isTTY) refuse();
  const approval = loadEtsyOwnerApproval(args[0]!, args[1]!, args[2]!);
  const trusted = approvalState(approval);
  verifyEtsyOwnerExecution(trusted.packet, trusted.artifactRoot);
  const hidden = (prompt: string) => readHiddenPassword(process.stdin, process.stdout, prompt, { maxBytes: 65536, maxCharacters: 65536 });
  const client = new EtsyOwnerClient(ownerSettings(JSON.parse(await hidden('New approved Owner client settings JSON (hidden): ')), approval), approval);
  await client.login(await hidden('Owner email (hidden): '), await hidden('Owner password (hidden): '));
  for (;;) {
    const operation = await hidden('Explicit operation: status/list/create/reconnect/cancel/start/read/disconnect/logout (hidden): ');
    if (operation === 'logout') { console.info(`ETSY_OWNER_LOGOUT_${await client.logout()}`); return; }
    let result: unknown;
    if (operation === 'status') result = await client.status();
    else if (operation === 'list') { const input = setupObject(JSON.parse(await hidden('Explicit limit and optional cursor JSON (hidden): '))); result = await client.list(Number(input.limit), input.cursor as string | undefined); }
    else if (operation === 'create' || operation === 'reconnect') {
      if (operation === 'reconnect' && await hidden('Reconnect fences/removes existing local credentials before consent. Type RECONNECT (hidden): ') !== 'RECONNECT') refuse();
      result = await client.create(JSON.parse(await hidden('expectedShopId/expectedRevision/idempotencyKey JSON (hidden): ')),
        await hidden('Fresh private share-file absolute path (hidden): '), operation === 'create' ? 'connect' : 'reconnect');
    } else if (operation === 'cancel') result = await client.cancel(await hidden('Invitation ID (hidden): '), JSON.parse(await hidden('expectedRevision/idempotencyKey JSON (hidden): ')));
    else if (operation === 'read') result = await client.read(Number(await hidden('Expected revision (hidden): ')));
    else if (operation === 'disconnect') result = await client.disconnect(JSON.parse(await hidden('expectedRevision/idempotencyKey JSON (hidden): ')));
    else if (operation === 'start') {
      const share = setupObject(readEvidence(resolve(await hidden('New private share-file absolute path (hidden): '))).value);
      await client.start(String(share.shareUrl), await hidden('Fresh private consent-file absolute path (hidden): '));
      console.info('ETSY_CONSENT_SAVED_PRIVATELY; open only through an approved private manual channel.'); continue;
    } else refuse();
    const output = resolve(await hidden('Fresh private result-file absolute path (hidden): '));
    privateDirectory(dirname(output), false); writeReleaseEvidence(output, result);
    console.info('ETSY_OWNER_RESULT_SAVED_PRIVATELY');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('ETSY_OWNER_STOP: result or session may be unknown; no automatic retry or revocation claim.'); process.exitCode = 1; });
}

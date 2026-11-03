import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, open, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';

interface ProviderUser { id: string; email: string; created_at: string; user_metadata: Record<string, unknown> }
type AdminRequest = <T>(path: string, body?: object, method?: string) => Promise<{ status: number; body: T }>;
interface CreatedIdentity { id: string; email: string; allowedEmails: Set<string> }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export class OwnedFixtureLifecycle {
  readonly caseId = randomUUID();
  readonly metadata: Record<string, string>;
  private readonly began = Date.now();
  private readonly identities = new Map<string, CreatedIdentity>();
  private readonly intents = new Set<string>();
  private sequence = 0;
  private readonly emailPrefix: string;

  private constructor(private readonly nonce: string, private readonly database: string, private readonly client: Client,
    private readonly admin: AdminRequest, readonly reportDirectory: string) {
    this.metadata = { fixture_run_nonce: nonce, fixture_case_id: this.caseId };
    this.emailPrefix = `f005-${nonce.slice(0, 12)}-${this.caseId.replaceAll('-', '').slice(0, 12)}-`;
  }
  static async create(nonce: string, database: string, client: Client, admin: AdminRequest) {
    assert.match(nonce, /^[a-f0-9]{32}$/); assert.match(database, /^f005_[a-f0-9]{32}$/);
    const root = fileURLToPath(new URL('../../../../.openai/reports/', import.meta.url));
    await mkdir(root, { recursive: true, mode: 0o700 });
    assert.equal(await realpath(root), root.replace(/\/$/, ''));
    const directory = await mkdtemp(join(root, 'esty005-identities-'));
    const lifecycle = new OwnedFixtureLifecycle(nonce, database, client, admin, directory);
    await lifecycle.guard();
    await lifecycle.receipt({ action: 'execution', nonce, database, caseId: lifecycle.caseId });
    return lifecycle;
  }
  address(label: string): string {
    assert.match(label, /^[a-z][a-z0-9-]{0,30}$/);
    return `${this.emailPrefix}${label}@example.test`;
  }
  private ownsEmail(email: string) {
    return email.startsWith(this.emailPrefix) && /^[a-z0-9-]+@example\.test$/.test(email);
  }
  private async receipt(value: object) {
    const file = await open(join(this.reportDirectory, `${String(++this.sequence).padStart(3, '0')}.json`), 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); } finally { await file.close(); }
    const directory = await open(this.reportDirectory, 'r');
    try { await directory.sync(); } finally { await directory.close(); }
  }
  async guard() {
    const actual = await this.client.query('SELECT nonce,current_database() AS database,current_user AS user_name FROM public.f005_fixture_marker');
    assert.deepEqual(actual.rows, [{ nonce: this.nonce, database: this.database, user_name: 'f005_fixture_admin' }]);
  }
  async intent(email: string) {
    assert.ok(this.ownsEmail(email), 'Only this run/case reserved synthetic address is allowed.');
    if ([...this.identities.values()].some(value => value.allowedEmails.has(email)) || this.intents.has(email)) return;
    assert.ok(this.intents.size < 32, 'Bound the provider identity count.');
    await this.receipt({ action: 'identity_create_intent', nonce: this.nonce, caseId: this.caseId, email });
    this.intents.add(email);
  }
  private validates(user: ProviderUser, email: string) {
    return uuid.test(user.id) && user.email === email && this.ownsEmail(email)
      && Number.isFinite(Date.parse(user.created_at)) && Date.parse(user.created_at) >= this.began - 1000
      && user.user_metadata?.fixture_run_nonce === this.nonce && user.user_metadata?.fixture_case_id === this.caseId;
  }
  async register(email: string, id: string) {
    assert.ok(this.intents.has(email) && uuid.test(id), 'A recorded creation intent and exact UUID are required.');
    const result = await this.admin<ProviderUser>(`/admin/users/${id}`);
    assert.equal(result.status, 200);
    assert.ok(this.validates(result.body, email), 'Provider creation identity/metadata must match this run.');
    assert.ok(!this.identities.has(id));
    await this.receipt({ action: 'identity_registered', nonce: this.nonce, caseId: this.caseId, id, email, createdAt: result.body.created_at });
    this.identities.set(id, { id, email, allowedEmails: new Set([email]) });
  }
  async registerInvitation(email: string) {
    if ([...this.identities.values()].some(value => value.allowedEmails.has(email))) return;
    assert.ok(this.intents.has(email) && this.ownsEmail(email));
    const list = await this.admin<{ users: ProviderUser[] }>('/admin/users?page=1&per_page=1000');
    assert.equal(list.status, 200);
    const matches = list.body.users.filter(user => user.email === email);
    assert.equal(matches.length, 1);
    const user = matches[0]!;
    assert.ok(uuid.test(user.id) && Date.parse(user.created_at) >= this.began - 1000, 'Never adopt an earlier identity.');
    const tagged = await this.admin(`/admin/users/${user.id}`, { user_metadata: { ...user.user_metadata, ...this.metadata } }, 'PUT');
    assert.equal(tagged.status, 200);
    await this.register(email, user.id);
  }
  async rememberEmail(id: string, email: string) {
    const registered = this.identities.get(id);
    assert.ok(registered && this.ownsEmail(email));
    const actual = await this.admin<ProviderUser>(`/admin/users/${id}`);
    assert.equal(actual.status, 200); assert.ok(this.validates(actual.body, email));
    await this.receipt({ action: 'identity_email_change', nonce: this.nonce, caseId: this.caseId, id, email });
    registered.allowedEmails.add(email);
  }
  async cleanup(workspaceId: string) {
    assert.match(workspaceId, uuid);
    const failures: Array<{ action: string; id?: string; outcome: string }> = [];
    try {
      await this.guard();
      await this.client.query("BEGIN; SET LOCAL lock_timeout = '500ms'; SET LOCAL statement_timeout = '1000ms'");
      await this.client.query('DELETE FROM app_private.audit_events WHERE workspace_id=$1', [workspaceId]);
      await this.client.query('DELETE FROM app_private.invitations WHERE workspace_id=$1', [workspaceId]);
      await this.client.query('DELETE FROM app_private.memberships WHERE workspace_id=$1', [workspaceId]);
      await this.client.query('DELETE FROM app_private.workspaces WHERE id=$1', [workspaceId]);
      await this.client.query('DELETE FROM app_private.profiles WHERE user_id=ANY($1::uuid[])', [[...this.identities.keys()]]);
      await this.client.query('COMMIT');
      await this.receipt({ action: 'app_cleanup', nonce: this.nonce, caseId: this.caseId, workspaceId, outcome: 'committed' });
    } catch {
      await this.client.query('ROLLBACK').catch(() => {});
      failures.push({ action: 'app_cleanup', outcome: 'unconfirmed' });
    }
    const appCleanupConfirmed = failures.length === 0;
    for (const registered of this.identities.values()) {
      if (!appCleanupConfirmed) {
        failures.push({ action: 'identity_cleanup', id: registered.id, outcome: 'preserved_after_app_cleanup_failure' });
        continue;
      }
      try {
        const actual = await this.admin<ProviderUser>(`/admin/users/${registered.id}`);
        if (actual.status === 404) {
          await this.receipt({ action: 'identity_cleanup', id: registered.id, outcome: 'absence_confirmed' });
          continue;
        }
        if (actual.status !== 200 || actual.body.id !== registered.id || !registered.allowedEmails.has(actual.body.email)
          || !this.validates(actual.body, actual.body.email)) throw new Error('Unproven cleanup identity.');
        await this.receipt({ action: 'identity_delete_intent', nonce: this.nonce, caseId: this.caseId, id: registered.id, email: actual.body.email });
        const result = await this.admin(`/admin/users/${registered.id}`, undefined, 'DELETE');
        if (result.status !== 200 && result.status !== 204) throw new Error('Provider deletion unconfirmed.');
        await this.receipt({ action: 'identity_cleanup', id: registered.id, outcome: 'deletion_confirmed' });
      } catch { failures.push({ action: 'identity_cleanup', id: registered.id, outcome: 'unknown_or_identity_refused' }); }
    }
    for (const email of this.intents) {
      if (![...this.identities.values()].some(value => value.email === email)) failures.push({ action: 'unregistered_create_intent', outcome: 'unknown_not_deleted' });
    }
    await this.receipt({ action: 'cleanup_summary', nonce: this.nonce, caseId: this.caseId,
      outcome: failures.length ? 'incomplete' : 'confirmed', registeredIdentities: this.identities.size, failures });
    assert.equal(failures.length, 0, `Owned cleanup incomplete; retained sanitized receipts: ${this.reportDirectory}`);
  }
}

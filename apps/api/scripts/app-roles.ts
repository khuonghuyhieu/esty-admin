import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { ConfigurationError, parseMigrationConfig } from '../src/config/config.js';
import type { AppFoundationConfig } from '../src/config/config.js';
import { responseBytes } from './ci-tools.js';

const roles = ['app_runtime', 'app_operator'] as const;
type Role = typeof roles[number];
export interface AppRoleInputs {
  authority: ClientConfig;
  runtime: ClientConfig;
  operator: ClientConfig;
  approvalId: string;
  target: string;
}
export type RoleOutcome = 'not_started' | 'committed' | 'rolled_back' | 'unknown';
export class AppRoleError extends Error {
  constructor(readonly databaseOutcome: RoleOutcome) {
    super('Application role state or effective privileges are unconfirmed.');
    this.name = 'AppRoleError';
  }
}
export function parseAppRoleInputs(env: NodeJS.ProcessEnv): AppRoleInputs {
  const hosted = env.MIGRATION_TARGET === 'supabase';
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env.APP_ROLES_APPROVAL_ID ?? '')
    || env.APP_ROLES_CONFIRM_TARGET !== (hosted ? `supabase:${env.SUPABASE_PROJECT_REF}` : 'local')) {
    throw new ConfigurationError('APP_ROLES_APPROVAL_ID/APP_ROLES_CONFIRM_TARGET', 'explicitly bind the separate role approval and target.');
  }
  if (hosted) for (const [key, value] of Object.entries(approvedTarget)) {
    if (key.startsWith('SUPABASE_') && env[key] !== value) throw new ConfigurationError(key, 'use the reviewed migration authority and target.');
  }
  const authority = parseMigrationConfig(env);
  const roleConfig = (role: Role, field: string): ClientConfig => {
    const config = parseMigrationConfig({ ...env, DATABASE_URL: env[field], MIGRATION_DATABASE_URL: env[field],
      SUPABASE_DATABASE_USER: `${role}.${env.SUPABASE_PROJECT_REF}` });
    if (config.user !== (hosted ? `${role}.${env.SUPABASE_PROJECT_REF}` : role)
      || config.host !== authority.host || config.port !== authority.port || config.database !== authority.database) {
      throw new ConfigurationError(field, 'use the fixed independent application role on the same approved database.');
    }
    return config;
  };
  const runtime = roleConfig('app_runtime', 'APP_ROLES_RUNTIME_DATABASE_URL');
  const operator = roleConfig('app_operator', 'APP_ROLES_OPERATOR_DATABASE_URL');
  if (roles.some(role => authority.user === role || authority.user?.startsWith(`${role}.`))
    || authority.password === runtime.password || authority.password === operator.password || runtime.password === operator.password) {
    throw new ConfigurationError('APP_ROLES credentials', 'keep migration, runtime and operator identities/passwords separate.');
  }
  return { authority, runtime, operator, approvalId: env.APP_ROLES_APPROVAL_ID!,
    target: hosted ? `supabase:${env.SUPABASE_PROJECT_REF}` : 'local' };
}
const tables = ['profiles', 'workspaces', 'memberships', 'invitations', 'audit_events'] as const;
const updates: Record<Role, Record<string, readonly string[]>> = {
  app_runtime: { profiles: ['display_name', 'revision', 'updated_at'], workspaces: ['display_name', 'revision', 'updated_at'],
    memberships: ['role_code', 'status', 'revision', 'updated_at', 'disabled_at'],
    invitations: ['status', 'delivery_state', 'revision', 'accepted_at', 'accepted_by_user_id', 'revoked_at', 'superseded_by_id'] },
  app_operator: { workspaces: ['display_name'], invitations: ['delivery_state', 'revision'] },
};
function permitted(role: Role, schema: string, table: string, privilege: string, column?: string): boolean {
  if (schema === 'public' && table === 'foundation_migrations') return role === 'app_runtime' && privilege === 'SELECT';
  if (schema !== 'app_private' || !tables.includes(table as typeof tables[number])) return false;
  if (privilege === 'SELECT') return true;
  if (privilege === 'INSERT') return role === 'app_runtime' ? table !== 'workspaces' : table !== 'invitations';
  return privilege === 'UPDATE' && column !== undefined && (updates[role][table]?.includes(column) ?? false);
}
function refuse(): never { throw new Error('Role preflight differs.'); }
async function roleFlags(client: Client): Promise<number> {
  const result = await client.query(`SELECT rolname, rolcanlogin, rolinherit, rolsuper, rolcreatedb, rolcreaterole,
    rolreplication, rolbypassrls, rolvaliduntil IS NULL AS unlimited_validity
    FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`, [roles]);
  if (result.rows.length !== 0 && result.rows.length !== 2) refuse();
  for (const row of result.rows) {
    if (!row.rolcanlogin || row.rolinherit || row.rolsuper || row.rolcreatedb || row.rolcreaterole
      || row.rolreplication || row.rolbypassrls || !row.unlimited_validity) refuse();
  }
  if ((await client.query(`SELECT 1 FROM pg_auth_members WHERE member IN
    (SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[]))
    OR (roleid IN (SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[]))
      AND member <> (SELECT oid FROM pg_roles WHERE rolname=current_user)) LIMIT 1`, [roles])).rowCount) refuse();
  if ((await client.query(`SELECT 1 FROM pg_db_role_setting WHERE setrole IN
    (SELECT oid FROM pg_roles WHERE rolname = ANY($1::text[])) LIMIT 1`, [roles])).rowCount) refuse();
  return result.rows.length;
}
async function effectivePrivileges(client: Client, target: boolean): Promise<void> {
  if (await roleFlags(client) !== 2) refuse();
  const authority = (await client.query<{ name: string }>('SELECT current_user::text AS name')).rows[0]!.name;
  if (roles.includes(authority as Role)) refuse();
  for (const role of roles) {
    const schemas = await client.query(`SELECT nspname, pg_get_userbyid(nspowner) AS owner,
      has_schema_privilege($1, oid, 'CREATE') AS can_create, has_schema_privilege($1, oid, 'USAGE') AS can_use
      FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'`, [role]);
    if (schemas.rows.some(row => row.owner === role || row.can_create
      || (row.nspname === 'app_private' && row.can_use !== target))
      || schemas.rows.some(row => row.nspname === 'app_private') !== target) refuse();
    const database = await client.query(`SELECT has_database_privilege($1, current_database(), 'CREATE') AS can_create,
      pg_get_userbyid(datdba) = $1 AS is_owner FROM pg_database WHERE datname = current_database()`, [role]);
    if (database.rows[0]?.can_create || database.rows[0]?.is_owner) refuse();
    if ((await client.query(`SELECT 1 FROM pg_class WHERE relowner=(SELECT oid FROM pg_roles WHERE rolname=$1)
      UNION ALL SELECT 1 FROM pg_database WHERE datdba=(SELECT oid FROM pg_roles WHERE rolname=$1)
      UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^pg_' AND CASE WHEN c.relkind='S'
        THEN has_sequence_privilege($1,c.oid,'USAGE,SELECT,UPDATE') ELSE false END
      LIMIT 1`, [role])).rowCount) refuse();
    const relations = await client.query(`SELECT n.nspname AS schema, c.relname AS name,
      pg_get_userbyid(c.relowner) AS owner, p.privilege
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p(privilege)
      WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_table_privilege($1,c.oid,p.privilege) LIMIT 1001`, [role]);
    if (relations.rows.length > 1000 || relations.rows.some(row => row.owner === role
      || !target || !permitted(role, row.schema, row.name, row.privilege))) refuse();
    const columns = await client.query(`SELECT n.nspname AS schema,c.relname AS name,a.attname AS column,p.privilege
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) p(privilege)
      WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND has_column_privilege($1,c.oid,a.attnum,p.privilege) LIMIT 1001`, [role]);
    if (columns.rows.length > 1000 || columns.rows.some(row => !target
      || !permitted(role, row.schema, row.name, row.privilege, row.column))) refuse();
    if (target) {
      for (const table of tables) {
        if (!relations.rows.some(row => row.schema === 'app_private' && row.name === table && row.privilege === 'SELECT')) refuse();
        for (const column of updates[role][table] ?? []) {
          if (!columns.rows.some(row => row.schema === 'app_private' && row.name === table && row.column === column && row.privilege === 'UPDATE')) refuse();
        }
        if (permitted(role, 'app_private', table, 'INSERT')
          && !relations.rows.some(row => row.schema === 'app_private' && row.name === table && row.privilege === 'INSERT')) refuse();
      }
      if (role === 'app_runtime' && !relations.rows.some(row => row.schema === 'public' && row.name === 'foundation_migrations' && row.privilege === 'SELECT')) refuse();
    }
    const functions = await client.query(`SELECT n.nspname AS schema,p.proname AS name,p.prosecdef,
      pg_get_userbyid(p.proowner) AS owner,has_function_privilege($1,p.oid,'EXECUTE') AS can_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
      AND (p.prosecdef OR n.nspname='app_private' OR p.proowner=(SELECT oid FROM pg_roles WHERE rolname=$1))`, [role]);
    for (const row of functions.rows) {
      const expected = target && row.schema === 'app_private' && (['lock_membership_workspace', 'require_active_owner'].includes(row.name)
        || (role === 'app_runtime' && row.name === 'has_current_session'));
      if (row.owner === role || row.can_execute !== expected) refuse();
    }
  }
  if (!target) return;
  const isolation = await client.query(`SELECT EXISTS (
    SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    WHERE n.nspname='app_private' AND (a.grantee NOT IN (n.nspowner,to_regrole('app_runtime')::oid,to_regrole('app_operator')::oid)
      OR (a.is_grantable AND a.grantee<>n.nspowner))
    UNION ALL
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE n.nspname='app_private' AND (a.grantee NOT IN (c.relowner,to_regrole('app_runtime')::oid,to_regrole('app_operator')::oid)
      OR (a.is_grantable AND a.grantee<>c.relowner))
    UNION ALL
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE n.nspname='app_private' AND (a.grantee NOT IN (p.proowner,to_regrole('app_runtime')::oid,to_regrole('app_operator')::oid)
      OR (a.is_grantable AND a.grantee<>p.proowner))
    UNION ALL
    SELECT 1 FROM pg_attribute col JOIN pg_class c ON c.oid=col.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(col.attacl) a
    WHERE n.nspname='app_private' AND (a.grantee NOT IN (c.relowner,to_regrole('app_runtime')::oid,to_regrole('app_operator')::oid)
      OR (a.is_grantable AND a.grantee<>c.relowner))
    ) AS exposed`);
  if (isolation.rows[0]?.exposed) refuse();
  const definer = await client.query(`SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
    pg_get_function_identity_arguments(p.oid) AS arguments
    FROM pg_proc p WHERE p.oid=to_regprocedure('app_private.has_current_session(uuid,uuid)')`);
  const fn = definer.rows[0];
  if (!fn || !fn.prosecdef || fn.owner !== authority || JSON.stringify(fn.proconfig) !== '["search_path=pg_catalog"]'
    || fn.arguments !== 'session_uuid uuid, user_uuid uuid') refuse();
  // This database setting can prove exposure, not provider non-exposure.
  // Hosted activation additionally requires the bounded PostgREST profile check.
  const exposedSchemas = await client.query(`SELECT coalesce(current_setting('pgrst.db_schemas',true),'') AS schemas`);
  if (String(exposedSchemas.rows[0]?.schemas).split(',').some(schema => schema.trim() === 'app_private')) refuse();
}
async function credentials(inputs: AppRoleInputs, target: boolean, signal: AbortSignal): Promise<void> {
  for (const role of roles) {
    signal.throwIfAborted();
    const client = new Client(role === 'app_runtime' ? inputs.runtime : inputs.operator);
    client.on('error', () => {});
    const abort = () => { void client.end().catch(() => {}); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await client.connect(); signal.throwIfAborted();
      if ((await client.query('SELECT current_user::text AS name')).rows[0]?.name !== role) refuse();
      if (target && role === 'app_runtime') {
        const result = await client.query(`SELECT app_private.has_current_session(
          '00000000-0000-4000-8000-000000000000'::uuid,'00000000-0000-4000-8000-000000000000'::uuid) AS present`);
        if (result.rows[0]?.present !== false) refuse();
      }
    } finally { signal.removeEventListener('abort', abort); await client.end().catch(() => {}); }
  }
}
export async function inspectAppRoles(inputs: AppRoleInputs, target: boolean, signal: AbortSignal): Promise<void> {
  return inspectRoleState(inputs, target ? 'target' : 'old', signal);
}
export async function inspectAppRolePrerequisites(inputs: AppRoleInputs, signal: AbortSignal): Promise<void> {
  return inspectRoleState(inputs, 'initial', signal);
}
async function inspectRoleState(inputs: AppRoleInputs, mode: 'initial' | 'old' | 'target', signal: AbortSignal): Promise<void> {
  const client = new Client(inputs.authority);
  client.on('error', () => {});
  const abort = () => { void client.end().catch(() => {}); };
  signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true });
  try {
    await client.connect(); signal.throwIfAborted();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const present = await roleFlags(client);
    if (mode === 'initial') {
      const authority = await client.query(`SELECT (rolsuper OR rolcreaterole) AS can_create_roles,
        has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema
        FROM pg_roles WHERE rolname=current_user`);
      const columns = await client.query(`SELECT attname,format_type(atttypid,atttypmod) AS type
        FROM pg_attribute WHERE attrelid=to_regclass('auth.sessions') AND attname=ANY($1::text[])
        AND attnum>0 AND NOT attisdropped ORDER BY attname`, [['id', 'not_after', 'user_id']]);
      if (!authority.rows[0]?.can_create_roles || !authority.rows[0]?.can_create_schema
        || JSON.stringify(columns.rows) !== JSON.stringify([
          { attname: 'id', type: 'uuid' }, { attname: 'not_after', type: 'timestamp with time zone' }, { attname: 'user_id', type: 'uuid' },
        ])) refuse();
    }
    if (mode !== 'initial' || present !== 0) await effectivePrivileges(client, mode === 'target');
    await client.query('COMMIT');
    if (present !== 0) await credentials(inputs, mode === 'target', signal);
  } catch { throw new AppRoleError('not_started'); }
  finally { signal.removeEventListener('abort', abort); await client.end().catch(() => {}); }
}
export async function provisionAppRoles(inputs: AppRoleInputs, signal: AbortSignal): Promise<{ databaseOutcome: RoleOutcome; created: 0 | 2 }> {
  const client = new Client(inputs.authority);
  client.on('error', () => {});
  let outcome: RoleOutcome = 'not_started', begun = false, commitSent = false;
  const abort = () => { void client.end().catch(() => {}); };
  signal.throwIfAborted(); signal.addEventListener('abort', abort, { once: true });
  try {
    await client.connect(); signal.throwIfAborted();
    await client.query('BEGIN'); begun = true;
    await client.query("SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='1000ms'; SET LOCAL standard_conforming_strings=on");
    await client.query('SELECT pg_advisory_xact_lock(5001,97)');
    const present = await roleFlags(client);
    if (present === 0) for (const role of roles) {
      const password = (role === 'app_runtime' ? inputs.runtime : inputs.operator).password;
      if (typeof password !== 'string' || !password || /[\u0000-\u001f\u007f]/.test(password)) refuse();
      await client.query(`CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password.replace(/'/g, "''")}'`);
    }
    await effectivePrivileges(client, false);
    signal.throwIfAborted(); commitSent = true;
    await client.query('COMMIT'); outcome = 'committed';
    await credentials(inputs, false, signal);
    return { databaseOutcome: outcome, created: present === 0 ? 2 : 0 };
  } catch {
    if (outcome !== 'committed' && begun) {
      if (commitSent) outcome = 'unknown';
      else try { await client.query('ROLLBACK'); outcome = 'rolled_back'; } catch { outcome = 'unknown'; }
    }
    throw new AppRoleError(outcome);
  } finally { signal.removeEventListener('abort', abort); await client.end().catch(() => {}); }
}

export async function inspectPrivateSchemaExposure(config: Pick<AppFoundationConfig, 'authUrl' | 'apiKey'>,
  signal: AbortSignal, transport: typeof fetch = fetch): Promise<void> {
  if (config.authUrl !== `https://${approvedTarget.SUPABASE_PROJECT_REF}.supabase.co/auth/v1`) throw new AppRoleError('not_started');
  try {
    const response = await transport(new URL('/rest/v1/profiles?select=user_id&limit=0', config.authUrl), {
      method: 'GET', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
      headers: { apikey: config.apiKey, 'Accept-Profile': 'app_private', Accept: 'application/json' },
    });
    if (response.status !== 406) { await response.body?.cancel(); refuse(); }
    const result: unknown = JSON.parse((await responseBytes(response, 16384)).toString('utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)
      || !('code' in result) || result.code !== 'PGRST106') refuse();
  } catch { throw new AppRoleError('not_started'); }
}

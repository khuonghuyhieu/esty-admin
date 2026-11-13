import { Client } from 'pg';
import type { ClientConfig } from 'pg';
import approvedTarget from '../config/hosted-target.example.json' with { type: 'json' };
import { activationSchema, assertActivationManifest, exactHistory } from '../src/config/schema-transition.js';

export type DiagnosticStage = 'guard' | 'configuration' | 'connect' | 'transaction' | 'identity' | 'history'
  | 'privileges' | 'auth_sessions' | 'rollback' | 'close' | 'complete';
export type DiagnosticCategory = 'passed' | 'refused' | 'timeout' | 'aborted' | 'tls_error'
  | 'authentication_error' | 'connection_error' | 'database_error' | 'unexpected_error';
export interface RoleDiagnosticResult { stage: DiagnosticStage; category: DiagnosticCategory; sqlstate: string | null }
const sqlstates = new Set(['28000', '28P01', '42501', '42P01', '42703', '57014', '55P03', '53300', '53400',
  '57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '08007', '08P01', '25006']);
const tlsCodes = new Set(['CERT_HAS_EXPIRED', 'CERT_NOT_YET_VALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID', 'SELF_SIGNED_CERT_IN_CHAIN', 'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_GET_ISSUER_CERT', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'CERT_UNTRUSTED']);
class Stop extends Error {
  constructor(readonly category: 'timeout' | 'aborted' | 'refused') { super('Role diagnostic stopped.'); }
}
export function classify(stage: DiagnosticStage, error: unknown): RoleDiagnosticResult {
  try { if (error instanceof Stop) return { stage, category: error.category, sqlstate: null }; } catch {}
  // Never stringify errors or invoke a server/JS object's getters or toString.
  let code: unknown;
  try { code = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code')?.value : undefined; } catch {}
  const safe = typeof code === 'string' && sqlstates.has(code) ? code : null;
  const category = safe === '28P01' || safe === '28000' ? 'authentication_error'
    : code === 'ETIMEDOUT' ? 'timeout'
    : typeof code === 'string' && tlsCodes.has(code) ? 'tls_error'
    : code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'connection_error'
    : safe ? 'database_error' : 'unexpected_error';
  return { stage, category, sqlstate: safe };
}
export function bounded<T>(operation: () => Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (milliseconds <= 0) { reject(new Stop('timeout')); return; }
    let settled = false;
    const finish = (error: unknown, value?: T) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (error !== undefined) reject(error); else resolve(value as T);
    };
    const abort = () => finish(new Stop('aborted'));
    const timer = setTimeout(() => finish(new Stop('timeout')), Math.max(0, milliseconds));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    // Install deadline/cancellation before starting pg; consume even a late rejection.
    Promise.resolve().then(() => {
      if (settled) throw new Stop('aborted');
      return operation();
    }).then(value => finish(undefined, value), error => finish(error ?? new Stop('refused')));
  });
}
function requireTrue(value: unknown): void { if (value !== true) throw new Stop('refused'); }

/** No journal, provider, activation worker, migration runner or alternate-role connection. */
export async function diagnoseRoleAuthority(authority: ClientConfig, signal: AbortSignal): Promise<RoleDiagnosticResult> {
  let stage: DiagnosticStage = 'configuration', client: Client | undefined, connected = false;
  let result: RoleDiagnosticResult = { stage, category: 'refused', sqlstate: null };
  const deadline = performance.now() + 30000;
  const query = (text: string) => bounded(() => client!.query(text), Math.min(12000, deadline - performance.now()), signal);
  try {
    if (signal.aborted) throw new Stop('aborted');
    assertActivationManifest();
    const ssl = authority.ssl;
    if (authority.host !== approvedTarget.SUPABASE_SESSION_HOST || authority.port !== 5432
      || authority.user !== approvedTarget.SUPABASE_DATABASE_USER || authority.database !== approvedTarget.SUPABASE_DATABASE_NAME
      || typeof authority.password !== 'string' || !authority.password || !ssl || typeof ssl !== 'object'
      || ssl.rejectUnauthorized !== true || ssl.servername !== approvedTarget.SUPABASE_SESSION_HOST
      || (ssl.ca !== undefined && typeof ssl.ca !== 'string')) throw new Stop('refused');
    client = new Client({ host: approvedTarget.SUPABASE_SESSION_HOST, port: 5432,
      user: approvedTarget.SUPABASE_DATABASE_USER, database: approvedTarget.SUPABASE_DATABASE_NAME, password: authority.password,
      ssl: { rejectUnauthorized: true, servername: approvedTarget.SUPABASE_SESSION_HOST, ...(ssl.ca === undefined ? {} : { ca: ssl.ca }) },
      application_name: 'esty-role-readonly-diagnostic', options: '-c search_path=pg_catalog -c default_transaction_read_only=on',
      connectionTimeoutMillis: 1000, statement_timeout: 10000, query_timeout: 12000, lock_timeout: 5000 });
    client.on('error', () => {});
    stage = 'connect';
    await bounded(() => client!.connect(), 1000, signal); connected = true;
    stage = 'transaction'; await query('BEGIN READ ONLY');
    stage = 'identity';
    const identity = await query("SELECT current_user = 'postgres' AS user_matches, current_database() = 'postgres' AS database_matches, current_setting('transaction_read_only') = 'on' AS read_only");
    if (identity.rows.length !== 1) throw new Stop('refused');
    requireTrue(identity.rows[0].user_matches); requireTrue(identity.rows[0].database_matches); requireTrue(identity.rows[0].read_only);
    stage = 'history';
    const history = await query('SELECT name FROM public.foundation_migrations ORDER BY id LIMIT 2');
    if (!exactHistory(history.rows, activationSchema.oldNames)) throw new Stop('refused');
    stage = 'privileges';
    const privileges = await query("SELECT (rolsuper OR rolcreaterole) AS can_create_roles, has_database_privilege(current_user,current_database(),'CREATE') AS can_create_schema FROM pg_catalog.pg_roles WHERE rolname = current_user");
    if (privileges.rows.length !== 1) throw new Stop('refused');
    requireTrue(privileges.rows[0].can_create_roles); requireTrue(privileges.rows[0].can_create_schema);
    stage = 'auth_sessions';
    const columns = await query("SELECT count(*) = 3 AND bool_and((attname = 'id' AND atttypid = 'uuid'::regtype) OR (attname = 'user_id' AND atttypid = 'uuid'::regtype) OR (attname = 'not_after' AND atttypid = 'timestamptz'::regtype)) AS columns_match FROM pg_catalog.pg_attribute WHERE attrelid = to_regclass('auth.sessions') AND attname IN ('id','user_id','not_after') AND attnum > 0 AND NOT attisdropped");
    if (columns.rows.length !== 1) throw new Stop('refused');
    requireTrue(columns.rows[0].columns_match);
    result = { stage: 'complete', category: 'passed', sqlstate: null };
  } catch (error) { result = classify(stage, error); }
  finally {
    if (client) {
      // Cleanup has its own small deadline even after the caller aborted. Disconnect
      // also rolls back any transaction whose BEGIN/query acknowledgement was lost.
      if (connected) {
        try { await bounded(() => client!.query('ROLLBACK'), 1000); }
        catch (error) { if (result.category === 'passed') result = classify('rollback', error); }
      }
      try { await bounded(() => client!.end(), 1000); }
      catch (error) {
        try { client.connection.stream.destroy(); } catch {}
        if (result.category === 'passed') result = classify('close', error);
      }
    }
  }
  if (signal.aborted && result.category === 'passed') result = { stage: 'close', category: 'aborted', sqlstate: null };
  return result;
}

const privilegePredicates = ['private_schema_present', 'public_schema_create', 'public_database_create',
  'public_sequence_access', 'public_table_access', 'public_column_access', 'public_function_execute',
  'future_table_grant', 'future_sequence_grant', 'future_function_grant', 'future_schema_grant'] as const;
const privilegeScopes = ['app_private', 'public', 'foundation', 'other_schema', 'database', 'global'] as const;
export interface PrivilegeObservation {
  predicate: typeof privilegePredicates[number]; scope: typeof privilegeScopes[number];
  schemaUsage: boolean | null; kind: 'guard-conflict' | 'future-default-only';
}
export interface RolePrivilegeBaseline extends RoleDiagnosticResult {
  basis: 'current-public-baseline'; historicalPredicate: 'unresolved'; observations: PrivilegeObservation[];
}
// PUBLIC applies even to NOINHERIT roles. No transient role, SET ROLE, object
// invocation or application-table data is needed to inspect this baseline.
const publicPrivilegeQuery = `WITH namespaces AS (
  SELECT n.oid,n.nspname,n.nspacl,n.nspowner,
    CASE n.nspname WHEN 'app_private' THEN 'app_private' WHEN 'public' THEN 'public'
      WHEN 'foundation' THEN 'foundation' ELSE 'other_schema' END AS scope,
    EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='USAGE') AS schema_usage
  FROM pg_namespace n WHERE n.nspname !~ '^pg_'
), table_grants AS (
  SELECT c.oid,c.relowner,c.relacl,n.scope,n.schema_usage
  FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname<>'information_schema'
), observations AS (
  SELECT 'private_schema_present' AS predicate,scope,schema_usage FROM namespaces WHERE nspname='app_private'
  UNION ALL
  SELECT 'public_schema_create',scope,schema_usage FROM namespaces n WHERE nspname<>'information_schema'
    AND EXISTS(SELECT 1 FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      WHERE a.grantee=0 AND a.privilege_type='CREATE')
  UNION ALL
  SELECT 'public_database_create','database',NULL::boolean FROM pg_database d WHERE datname=current_database()
    AND EXISTS(SELECT 1 FROM aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
      WHERE a.grantee=0 AND a.privilege_type='CREATE')
  UNION ALL
  SELECT 'public_sequence_access',n.scope,n.schema_usage FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
    WHERE c.relkind='S' AND EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('S',c.relowner))) a
      WHERE a.grantee=0 AND a.privilege_type IN ('USAGE','SELECT','UPDATE'))
  UNION ALL
  SELECT 'public_table_access',t.scope,t.schema_usage FROM table_grants t
    WHERE EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
      WHERE a.grantee=0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
  UNION ALL
  SELECT 'public_column_access',t.scope,t.schema_usage FROM table_grants t
    JOIN pg_attribute col ON col.attrelid=t.oid AND col.attnum>0 AND NOT col.attisdropped
    WHERE EXISTS(SELECT 1 FROM aclexplode(col.attacl) a
      WHERE a.grantee=0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
      OR EXISTS(SELECT 1 FROM aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
        WHERE a.grantee=0 AND a.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
  UNION ALL
  SELECT 'public_function_execute',n.scope,n.schema_usage FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace
    WHERE n.nspname<>'information_schema' AND (p.prosecdef OR n.nspname='app_private')
      AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
  UNION ALL
  SELECT CASE d.defaclobjtype WHEN 'r' THEN 'future_table_grant' WHEN 'S' THEN 'future_sequence_grant'
      WHEN 'f' THEN 'future_function_grant' WHEN 'n' THEN 'future_schema_grant' END,
    coalesce(n.scope,'global'),n.schema_usage
    FROM pg_default_acl d LEFT JOIN namespaces n ON n.oid=d.defaclnamespace
    WHERE d.defaclrole=(SELECT oid FROM pg_roles WHERE rolname=current_user)
      AND d.defaclobjtype IN ('r','S','f','n') AND (d.defaclnamespace=0 OR n.oid IS NOT NULL)
      AND EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee=0)
) SELECT DISTINCT predicate,scope,schema_usage FROM observations ORDER BY predicate,scope,schema_usage LIMIT 65`;

export async function inspectRolePrivilegeBaseline(authority: ClientConfig, outerSignal: AbortSignal): Promise<RolePrivilegeBaseline> {
  const signal = AbortSignal.any([outerSignal, AbortSignal.timeout(30000)]);
  const config = { ...authority, options: '-c search_path=pg_catalog -c default_transaction_read_only=on',
    connectionTimeoutMillis: 1000, statement_timeout: 10000, query_timeout: 12000, lock_timeout: 1000 };
  const client = new Client(config), deadline = performance.now() + 30000;
  const query = (text: string) => bounded(() => client.query(text), Math.max(0, deadline - performance.now()), signal);
  const abort = () => { void client.end().catch(() => {}); };
  client.on('error', () => {}); signal.addEventListener('abort', abort, { once: true });
  let stage: DiagnosticStage = 'configuration', connected = false;
  let diagnostic: RoleDiagnosticResult = { stage, category: 'refused', sqlstate: null };
  let observations: PrivilegeObservation[] = [];
  try {
    signal.throwIfAborted(); assertActivationManifest();
    stage = 'connect'; await bounded(() => client.connect(), 1000, signal); connected = true;
    stage = 'transaction'; await query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    stage = 'identity';
    const identity = await query("SELECT current_user::text AS name,current_database() AS database,current_setting('transaction_read_only') AS read_only");
    requireTrue(identity.rows.length === 1 && identity.rows[0].name === authority.user?.split('.')[0]
      && identity.rows[0].database === authority.database && identity.rows[0].read_only === 'on');
    stage = 'history';
    requireTrue(exactHistory((await query('SELECT name FROM public.foundation_migrations ORDER BY id LIMIT 2')).rows, activationSchema.oldNames));
    stage = 'privileges';
    const absence = await query("SELECT to_regrole('app_runtime') IS NULL AND to_regrole('app_operator') IS NULL AS roles_absent");
    requireTrue(absence.rows.length === 1 && absence.rows[0].roles_absent === true);
    const result = await query(publicPrivilegeQuery);
    requireTrue(result.rows.length <= 64);
    const unique = new Set<string>();
    for (const row of result.rows) {
      requireTrue(Object.keys(row).sort().join(',') === 'predicate,schema_usage,scope'
        && privilegePredicates.includes(row.predicate) && privilegeScopes.includes(row.scope)
        && (row.schema_usage === null || typeof row.schema_usage === 'boolean'));
      const key = `${row.predicate}/${row.scope}/${row.schema_usage}`;
      requireTrue(!unique.has(key)); unique.add(key);
      observations.push({ predicate: row.predicate, scope: row.scope, schemaUsage: row.schema_usage,
        kind: row.predicate.startsWith('future_') ? 'future-default-only' : 'guard-conflict' });
    }
    diagnostic = { stage: 'complete', category: 'passed', sqlstate: null };
  } catch (error) { diagnostic = classify(stage, error); }
  finally {
    if (connected) {
      try { await bounded(() => client.query('ROLLBACK'), 1000); }
      catch (error) { if (diagnostic.category === 'passed') diagnostic = classify('rollback', error); }
    }
    signal.removeEventListener('abort', abort);
    try { await bounded(() => client.end(), 1000); }
    catch (error) {
      try { client.connection.stream.destroy(); } catch {}
      if (diagnostic.category === 'passed') diagnostic = classify('close', error);
    }
    config.password = undefined;
  }
  if (signal.aborted && diagnostic.category === 'passed') diagnostic = { stage: 'close', category: outerSignal.aborted ? 'aborted' : 'timeout', sqlstate: null };
  if (diagnostic.category !== 'passed') observations = [];
  return { ...diagnostic, basis: 'current-public-baseline', historicalPredicate: 'unresolved', observations };
}

import { mkdir, mkdtemp, open, realpath, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Never retain raw provider logs, environment values or command stderr.
export function classifyFailure(text) {
  const reasons = new Set(), codes = new Set(), fields = new Set();
  const patterns = [
    ['json_array_type_mismatch', /json: cannot unmarshal array into Go value of type/],
    ['json_object_type_mismatch', /json: cannot unmarshal object into Go value of type/],
    ['json_string_type_mismatch', /json: cannot unmarshal string into Go value of type/],
    ['json_truncated', /unexpected end of JSON input/],
    ['json_invalid_character', /invalid character .+ (?:looking for|after|in)/],
    ['database_authentication_failed', /password authentication failed/i],
    ['database_permission_denied', /permission denied for/i],
    ['database_object_owner_required', /must be owner of/i],
    ['database_relation_missing', /relation .+ does not exist/i],
    ['database_role_missing', /role .+ does not exist/i],
    ['database_schema_missing', /schema .+ does not exist/i],
    ['database_migration_failed', /(?:migration|migrating).*(?:fail|error)|(?:fail|error).*migration/i],
    ['connection_refused', /connection refused/i],
    ['connection_resolution_failed', /no such host|name resolution/i],
    ['database_connection_policy_denied', /no pg_hba.conf entry/i],
    ['configuration_required_field_missing', /required key .+ missing value|must (?:not )?be (?:empty|set)|missing required/i],
    ['jwt_key_configuration_invalid', /(?:invalid|failed|error|unable).*(?:JWK|JWT|signing key)|(?:JWK|JWT|signing key).*(?:invalid|failed|error)/i],
    ['jwk_keyset_shape_invalid', /(?:JWK|key set|keyset).*(?:unmarshal|decode|parse)|(?:unmarshal|decode|parse).*(?:JWK|key set|keyset)/i],
  ];
  for (const [reason, pattern] of patterns) if (pattern.test(text)) reasons.add(reason);
  for (const match of text.matchAll(/SQLSTATE ([A-Z0-9]{5})/g)) codes.add(match[1]);
  for (const field of ['GOTRUE_JWT_KEYS', 'JWT_KEYS', 'GOTRUE_JWT_SECRET', 'JWT_SECRET', 'API_EXTERNAL_URL', 'GOTRUE_SITE_URL',
    'GOTRUE_DB_DATABASE_URL', 'GOTRUE_DB_NAMESPACE', 'GOTRUE_SMTP_HOST', 'GOTRUE_SMTP_PORT']) {
    if (text.includes(field)) fields.add(field);
  }
  return { reasons: [...reasons], sqlStates: [...codes], configurationFields: [...fields], classified: reasons.size > 0 };
}

const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) ? value : null;
const exitCode = value => Number.isSafeInteger(value) ? value : null;
export async function saveOwnedFailure({ directory, stage, error, ownership, docker }) {
  const state = await ownership(directory);
  const ids = docker(directory, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${state.project}`]).split('\n').filter(Boolean);
  const containers = [];
  for (const id of ids) {
    if (!/^[a-f0-9]{12,64}$/.test(id)) throw new Error('Unexpected owned container identifier.');
    const labels = JSON.parse(docker(directory, ['inspect', '--format', '{{json .Config.Labels}}', id]));
    if (labels['esty005.run'] !== state.nonce || labels['com.docker.compose.project'] !== state.project
      || !['db', 'mail', 'auth'].includes(labels['com.docker.compose.service'])) throw new Error('Diagnostic ownership mismatch.');
    const actual = JSON.parse(docker(directory, ['inspect', '--format', '{{json .State}}', id]));
    const record = { id, service: labels['com.docker.compose.service'],
      status: ['created', 'running', 'paused', 'restarting', 'removing', 'exited', 'dead'].includes(actual.Status) ? actual.Status : 'unknown',
      exitCode: exitCode(actual.ExitCode), startedAt: timestamp(actual.StartedAt), finishedAt: timestamp(actual.FinishedAt),
      failure: classifyFailure(String(actual.Error ?? '')),
      health: ['starting', 'healthy', 'unhealthy'].includes(actual.Health?.Status) ? actual.Health.Status : 'unavailable',
      healthChecks: (actual.Health?.Log ?? []).slice(-5).map(entry => ({ exitCode: exitCode(entry.ExitCode), end: timestamp(entry.End), failure: classifyFailure(String(entry.Output ?? '')) })),
    };
    const until = new Date().toISOString(), since = new Date(Date.now() - 120000).toISOString();
    const events = docker(directory, ['events', '--since', since, '--until', until, '--filter', `container=${id}`, '--format', '{{json .}}']);
    record.events = events.split('\n').filter(Boolean).flatMap(line => {
      const event = JSON.parse(line);
      return ['create', 'start', 'die', 'stop', 'kill', 'health_status: healthy', 'health_status: unhealthy'].includes(event.Action)
        ? [{ action: event.Action, time: Number.isSafeInteger(event.time) ? event.time : null }] : [];
    });
    if (record.service === 'auth') record.logs = classifyFailure(docker(directory, ['logs', '--tail', '80', '--timestamps', id], true));
    containers.push(record);
  }
  const root = fileURLToPath(new URL('../../../.openai/reports/', import.meta.url));
  await mkdir(root, { recursive: true, mode: 0o700 });
  if ((await lstat(root)).isSymbolicLink() || (await realpath(root)) !== root.replace(/\/$/, '')) throw new Error('Diagnostic root must be canonical.');
  const reportDirectory = await mkdtemp(join(root, 'esty005-startup-'));
  const path = join(reportDirectory, 'failure.json');
  const report = await open(path, 'wx', 0o600);
  try {
    await report.writeFile(JSON.stringify({ version: 1, project: state.project, runId: state.nonce, stage,
      commandExitCode: exitCode(error?.status), commandFailure: classifyFailure(String(error?.stderr ?? '')), containers }, null, 2) + '\n');
    await report.sync();
  } finally { await report.close(); }
  for (const directory of [reportDirectory, root]) {
    const handle = await open(directory, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
  return path;
}

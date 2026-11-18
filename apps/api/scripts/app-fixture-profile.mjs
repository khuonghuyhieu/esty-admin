const normal = Object.freeze({ name: '006', project: 'esty005-auth-fixture', prefix: 'esty005-auth-',
  databasePort: 55440, authPort: 55441, mailPort: 55442, apiPort: 55443, webPort: 55444,
  purpose: '006-login-session', timebox: false });
const activation = Object.freeze({ name: 'activation001', project: 'esty001-activation-auth', prefix: 'esty001-activation-',
  databasePort: 55540, authPort: 55541, mailPort: 55542, apiPort: 55543, webPort: 55544,
  purpose: '001-production-activation', timebox: false });
const timeboxedActivation = Object.freeze({ ...activation, timebox: true });

export function fixtureProfile(env = process.env) {
  const name = env.APP_SESSION_E2E_PROFILE ?? '006';
  const timebox = env.F001_AUTH_TIMEBOX;
  if (name === '011') {
    const nonce = env.F011_RUN_NONCE;
    if (!/^[a-f0-9]{32}$/.test(nonce ?? '') || (timebox !== undefined && timebox !== 'false')) {
      throw new Error('Explicit011 nonce and non-timeboxed profile required.');
    }
    const selected = { name, project: `esty011-${nonce}`, prefix: 'esty011-',
      purpose: '011', timebox: false, webPort: 55644, databasePort: 0, authPort: 0, mailPort: 0, apiPort: 0 };
    const reserved = new Set([54322, 55432, 55433, 55440, 55441, 55442, 55443, 55444,
      55540, 55541, 55542, 55543, 55544, selected.webPort]);
    for (const [key, field] of [['F005_DB_PORT', 'databasePort'], ['F005_AUTH_PORT', 'authPort'],
      ['F005_MAIL_PORT', 'mailPort'], ['F005_API_PORT', 'apiPort']]) {
      const value = env[key];
      if (!/^[1-9]\d{3,4}$/.test(value ?? '') || Number(value) <= 1024 || Number(value) > 65535
        || reserved.has(Number(value))) throw new Error('Distinct non-reserved011 loopback ports required.');
      selected[field] = Number(value);
      reserved.add(Number(value));
    }
    if (env.F005_WEB_PORT !== undefined && env.F005_WEB_PORT !== String(selected.webPort)) {
      throw new Error('The separately owned011 FE port cannot be overridden.');
    }
    return Object.freeze(selected);
  }
  if (!['006', 'activation001'].includes(name) || (timebox !== undefined && timebox !== 'true' && timebox !== 'false')
    || (timebox === 'true' && name !== 'activation001')) throw new Error('Unknown or incompatible owned fixture profile.');
  const selected = name === '006' ? normal : timebox === 'true' ? timeboxedActivation : activation;
  for (const [key, port] of [['F005_DB_PORT', selected.databasePort], ['F005_AUTH_PORT', selected.authPort],
    ['F005_MAIL_PORT', selected.mailPort], ['F005_API_PORT', selected.apiPort], ['F005_WEB_PORT', selected.webPort]]) {
    if (env[key] !== undefined && env[key] !== String(port)) throw new Error('Arbitrary fixture port overrides are refused.');
  }
  return selected;
}

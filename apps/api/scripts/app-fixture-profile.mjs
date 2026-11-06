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
  if (!['006', 'activation001'].includes(name) || (timebox !== undefined && timebox !== 'true' && timebox !== 'false')
    || (timebox === 'true' && name !== 'activation001')) throw new Error('Unknown or incompatible owned fixture profile.');
  const selected = name === '006' ? normal : timebox === 'true' ? timeboxedActivation : activation;
  for (const [key, port] of [['F005_DB_PORT', selected.databasePort], ['F005_AUTH_PORT', selected.authPort],
    ['F005_MAIL_PORT', selected.mailPort], ['F005_API_PORT', selected.apiPort], ['F005_WEB_PORT', selected.webPort]]) {
    if (env[key] !== undefined && env[key] !== String(port)) throw new Error('Arbitrary fixture port overrides are refused.');
  }
  return selected;
}

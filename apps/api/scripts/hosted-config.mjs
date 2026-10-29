import target from '../config/hosted-target.example.json' with { type: 'json' };

export const hostedTarget = Object.freeze(target);
export function hostedConfiguration(password, suppliedTarget = hostedTarget) {
  if (typeof password !== 'string' || !password || /[\p{Cc}\p{Cs}]/u.test(password)) throw new Error('Password must be nonempty valid Unicode without control characters.');
  if (JSON.stringify(Object.keys(suppliedTarget).sort()) !== JSON.stringify(Object.keys(hostedTarget).sort())
    || Object.keys(hostedTarget).some(key => suppliedTarget[key] !== hostedTarget[key])) throw new Error('Use the exact approved Session target.');
  const tuple = Object.fromEntries(Object.entries(hostedTarget).filter(([key]) => key.startsWith('SUPABASE_')));
  const url = `postgresql://${encodeURIComponent(tuple.SUPABASE_DATABASE_USER)}:${encodeURIComponent(password)}@${tuple.SUPABASE_SESSION_HOST}:5432/${encodeURIComponent(tuple.SUPABASE_DATABASE_NAME)}`;
  const parsed = new URL(url);
  if (decodeURIComponent(parsed.password) !== password || decodeURIComponent(parsed.username) !== tuple.SUPABASE_DATABASE_USER
    || parsed.hostname !== tuple.SUPABASE_SESSION_HOST || parsed.port !== '5432'
    || decodeURIComponent(parsed.pathname.slice(1)) !== tuple.SUPABASE_DATABASE_NAME || parsed.search || parsed.hash) throw new Error('Credential encoding failed its round-trip check.');
  return { runtime: { ...tuple, DATABASE_URL: url }, operator: { ...tuple, MIGRATION_DATABASE_URL: url } };
}

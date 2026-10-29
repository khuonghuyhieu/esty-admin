import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
import { parseConfig } from '../src/config/config.js';
import { migrationStatus, runMigrations } from '../scripts/migrations.js';
import { expectedMigrations } from '../src/generated/migrations.js';
import { get, startApi, silentPeer } from './helpers.js';

test('Supabase-local approved history, migration rerun and real HTTP client-bound recovery', { timeout: 25000 }, async () => {
  const url = process.env.SUPABASE_LOCAL_TEST_URL;
  assert.equal(url, 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'Use only the explicitly approved synthetic Supabase-local URL.');
  const database = parseConfig({ DATABASE_URL: url }).database;
  const client = new Client(database);
  await client.connect();
  try {
    const identity = await client.query('SELECT current_database() AS db, current_user AS role, version() AS version');
    assert.equal(identity.rows[0].db, 'postgres');
    assert.equal(identity.rows[0].role, 'postgres');
    assert.match(identity.rows[0].version, /PostgreSQL 17\./);
    const before = await migrationStatus(database);
    assert.equal(before.ordered, true);
    assert.deepEqual(before.unexpected, []);
    const initial = await runMigrations(database, { target: 'supabase-local' });
    assert.equal(initial.result, 'success', JSON.stringify(initial));
    assert.equal(initial.attempted.length, before.pending.length);
    assert.equal((await runMigrations(database, { target: 'supabase-local' })).attempted.length, 0);
    assert.deepEqual((await migrationStatus(database)).applied, expectedMigrations);
    const healthy = await startApi(url!);
    try {
      assert.equal((await get(healthy.origin, '/health/live')).status, 200);
      assert.equal((await get(healthy.origin, '/health/ready')).status, 200);
    } finally { await healthy.app.close(); }
    const peer = await silentPeer();
    const bad = await startApi(`postgresql://synthetic:synthetic@127.0.0.1:${peer.port}/synthetic`);
    try {
      assert.equal((await get(bad.origin, '/health/live')).status, 200);
      const began = performance.now();
      assert.equal((await get(bad.origin, '/health/ready')).status, 503);
      assert.ok(performance.now() - began < 4000);
    } finally { await bad.app.close(); await peer.close(); }
    const recovered = await startApi(url!);
    try { assert.equal((await get(recovered.origin, '/health/ready')).status, 200); }
    finally { await recovered.app.close(); }
    console.info(JSON.stringify({ target: 'supabase-local', applied: initial.attempted.length, rerun: 0, history: expectedMigrations, http: 'live200 ready200 client-failure503 recovered200' }));
  } finally { await client.end(); }
});

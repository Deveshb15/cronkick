import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate, type Db } from '../src/db.ts';
import { ConfigError, dbUrl } from '../src/config.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());

test('migrate is idempotent', async () => {
  expect(await migrate(db)).toEqual([]);
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
  expect(rows[0].n).toBe(8); // 7 tables + schema_migrations
});

test('slot key is unique', async () => {
  await seed(db);
  const insert = () => db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at)
     VALUES (1, 10, 100, '2026-11-10T00:00Z', '2026-11-10T00:00Z', '2026-11-10T00:05Z', '2026-11-10T00:00Z')`);
  await insert();
  await expect(insert()).rejects.toThrow(/duplicate key/);
});

test('missing DATABASE_URL is a named config error', () => {
  const saved = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    expect(() => dbUrl()).toThrow(ConfigError);
  } finally {
    process.env.DATABASE_URL = saved;
  }
});

test('two servers migrating at once both succeed', async () => {
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const results = await Promise.all([migrate(db), migrate(db)]);
  expect(results.flat()).toEqual(['001_init.sql', '002_notify.sql', '003_run_times_and_dismiss.sql']);
});

test('a GitHub-style PKCS#1 App key can sign the App JWT', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { pkcs8 } = await import('../src/config.ts');
  const { App } = await import('@octokit/app');
  const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
  expect(pem).toContain('BEGIN RSA PRIVATE KEY');
  const app = new App({ appId: 1, privateKey: pkcs8(pem) });
  const { token } = (await app.octokit.auth({ type: 'app' })) as { token: string };
  expect(token.split('.')).toHaveLength(3);
});

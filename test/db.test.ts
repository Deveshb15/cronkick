import { afterAll, beforeAll, expect, test } from 'vitest';
import { migrate, type Db } from '../src/db.js';
import { ConfigError, dbUrl } from '../src/config.js';
import { freshDb, seed } from './helpers.js';

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

import { afterAll, beforeAll, expect, test } from 'vitest';
import type pg from 'pg';
import type { Db } from '../src/db.ts';
import { freshDb, seed } from './helpers.ts';

// The live dashboard relies on these triggers: which writes notify, and with which installation id.
let db: Db;
let listener: pg.PoolClient;
const heard: string[] = [];
beforeAll(async () => {
  db = await freshDb();
  await seed(db, { installationId: 7, repoId: 70, workflowId: 700 });
  listener = await db.connect();
  listener.on('notification', (n) => heard.push(n.payload ?? ''));
  await listener.query('LISTEN cronkick_changes');
});
afterAll(async () => { listener.release(); await db.end(); });

async function notified(sql: string): Promise<string[]> {
  heard.length = 0;
  await db.query(sql);
  await listener.query('SELECT 1'); // notifications arrive before this round trip completes
  return [...heard];
}

const SLOT = `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at)
              VALUES (7, 70, 700, now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 hour', now() + interval '1 hour')`;

test('schedule, workflow and plan changes notify with the installation id', async () => {
  expect(await notified(`INSERT INTO schedules (workflow_id, cron) VALUES (700, '0 * * * *')`)).toEqual(['7']);
  expect(await notified(`UPDATE workflows SET name = 'renamed' WHERE id = 700`)).toEqual(['7']);
  expect(await notified(`UPDATE installations SET plan = 'free' WHERE id = 7`)).toEqual(['7']);
});

test('a new future slot is quiet; its outcome notifies once per transaction', async () => {
  expect(await notified(SLOT)).toEqual([]);
  expect(await notified(`UPDATE slots SET state = 'accepted', first_attempt_at = now()`)).toEqual(['7']);
  expect(await notified(`UPDATE slots SET updated_at = now()`)).toEqual([]);
});

import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { overview, workflowHistory, workflowStatus } from '../web/lib/data.ts';
import { decodeSession, encodeSession } from '../web/lib/session.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

async function slot(dueMinAgo: number, state: string, firstAttemptSec: number | null, workflowId = 100, inst = 1, repo = 10) {
  const due = ago(dueMinAgo);
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, first_attempt_at)
     VALUES ($1, $2, $3, $4, $4, $4, $4, $5, $6)`,
    [inst, repo, workflowId, due, state, firstAttemptSec === null ? null : new Date(due.getTime() + firstAttemptSec * 1000)],
  );
}

test('workflow status rules', () => {
  const s = (status: 'active' | 'paused_limit') => ({ cron: '0 * * * *', tz: 'UTC', status });
  expect(workflowStatus({ schedules: [s('active')], flags: [], suggested_diff: null })).toBe('active');
  expect(workflowStatus({ schedules: [s('paused_limit')], flags: [], suggested_diff: null })).toBe('limited');
  expect(workflowStatus({ schedules: [s('active')], flags: [{ message: 'x' }], suggested_diff: null })).toBe('needs_fix');
  expect(workflowStatus({ schedules: [], flags: [{ message: 'bad marker' }], suggested_diff: null })).toBe('needs_fix');
  expect(workflowStatus({ schedules: [], flags: [], suggested_diff: '# cronkick: "0 3 * * *"' })).toBe('ready');
  expect(workflowStatus({ schedules: [], flags: [], suggested_diff: null })).toBe('none');
});

test('overview: on-time counts only fired slots within 30 s; problems counted; skipped excluded', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(5, 'accepted', 2);
  await slot(10, 'fired', 45);       // late
  await slot(15, 'expired', null);
  await slot(20, 'skipped', null);
  await slot(60 * 25, 'accepted', 1); // older than 24 h
  const { repos, totals } = await overview(db, 1, NOW);
  expect(repos[0].workflows[0]).toMatchObject({ status: 'active', due24h: 3, onTime24h: 1, problems24h: 1, lastState: 'accepted' });
  expect(totals).toMatchObject({ activeSchedules: 1, due24h: 3, onTime24h: 1, problems24h: 1 });
});

test('overview: a repo with no workflows still shows up', async () => {
  await seed(db);
  await db.query(`INSERT INTO repos (id, installation_id, full_name, default_branch) VALUES (11, 1, 'acme/empty', 'main')`);
  const { repos } = await overview(db, 1, NOW);
  expect(repos.map((r) => [r.full_name, r.workflows.length])).toEqual([['acme/app', 1], ['acme/empty', 0]]);
});

test('workflow history: another installation’s workflow returns null', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  expect(await workflowHistory(db, 2, 100, NOW)).toBeNull();
  expect(await workflowHistory(db, 1, 100, NOW)).not.toBeNull();
});

test('workflow history: Free shows the last 20; counts match the window', async () => {
  await seed(db, { plan: 'free' });
  for (let i = 1; i <= 25; i++) await slot(i, 'fired', 1);
  const h = (await workflowHistory(db, 1, 100, NOW))!;
  expect(h.slots).toHaveLength(20);
  expect(h.counts).toEqual({ fired: 20 });
});

test('session: round-trips, rejects tampering and expiry', () => {
  process.env.SESSION_SECRET = 'test-secret';
  const raw = encodeSession({ login: 'octo', installs: [1, 2] }, 1_000);
  expect(decodeSession(raw, 2_000)).toMatchObject({ login: 'octo', installs: [1, 2] });
  const [body, mac] = raw.split('.');
  const forged = Buffer.from(JSON.stringify({ login: 'octo', installs: [1, 2, 3], iat: 1_000, exp: 9e15 })).toString('base64url');
  expect(decodeSession(`${forged}.${mac}`, 2_000)).toBeNull();
  expect(decodeSession(`${body}.x`, 2_000)).toBeNull();
  expect(decodeSession(raw, 1_000 + 61 * 60_000)).toBeNull();
  expect(decodeSession(undefined)).toBeNull();
});

test('ticks: on time vs late vs missed vs idle', async () => {
  const { toTick, recentTicks } = await import('../web/lib/data.ts');
  expect(toTick('accepted', 2_000)).toBe('ontime');
  expect(toTick('fired', 45_000)).toBe('late');
  expect(toTick('expired', null)).toBe('missed');
  expect(toTick('unknown', 1_000)).toBe('missed');
  expect(toTick('skipped', null)).toBe('idle');
  await seed(db);
  await slot(3, 'accepted', 1);
  await slot(2, 'fired', 90);
  await slot(1, 'expired', null);
  const ticks = (await recentTicks(db, 1, NOW, 5)).get(100);
  expect(ticks).toEqual(['idle', 'idle', 'ontime', 'late', 'missed']);
});

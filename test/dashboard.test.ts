import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { accountHealth, activity, overview, recentSlots, toTick, workflowHistory, workflowStatus } from '../web/lib/data.ts';
import { decodeSession, encodeSession } from '../web/lib/session.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

async function slot(dueMinAgo: number, state: string, firstAttemptSec: number | null, workflowId = 100, inst = 1, repo = 10, conclusion: string | null = null) {
  const due = ago(dueMinAgo);
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, first_attempt_at, conclusion)
     VALUES ($1, $2, $3, $4, $4, $4, $4, $5, $6, $7)`,
    [inst, repo, workflowId, due, state, firstAttemptSec === null ? null : new Date(due.getTime() + firstAttemptSec * 1000), conclusion],
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

test('overview: 24 h counts cover due slots only, with late/unconfirmed/gave-up split and verdict', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(5, 'accepted', 2, 100, 1, 10, 'success');
  await slot(10, 'fired', 45);        // late
  await slot(15, 'expired', null);    // gave up
  await slot(20, 'skipped', null);    // not a run
  await slot(25, 'unknown', 1);       // unconfirmed
  await slot(60 * 25, 'accepted', 1); // older than 24 h
  await slot(-10, 'pending', null);   // upcoming: not a run yet
  const { repos, totals } = await overview(db, 1, NOW);
  expect(repos[0].workflows[0].c24).toEqual({ due: 4, onTime: 1, late: 1, unconfirmed: 1, gaveUp: 1, passed: 1, failed: 0 });
  expect(totals.c24.due).toBe(4);
  expect(totals.verdict).toBe('missed');
  expect(totals.nextKick).toMatchObject({ workflowId: 100, workflow: 'nightly', repo: 'acme/app', alsoDue: 0 });
  expect(totals.nextKick!.due).toBe(new Date(NOW.getTime() + 10 * 60_000).toISOString());
});

test('overview: verdicts, median delay and job results', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'no_runs', medianDelayMs: null, nextKick: null });
  await slot(5, 'accepted', 0.05, 100, 1, 10, 'success');
  await slot(10, 'accepted', 0.06, 100, 1, 10, 'success');
  await slot(15, 'fired', 0.04, 100, 1, 10, 'failure');
  await slot(20, 'fired', 0.08);
  const t = (await overview(db, 1, NOW)).totals;
  expect(t.verdict).toBe('on_time');
  expect(t.medianDelayMs).toBeCloseTo(55, 0);
  expect(t.maxDelayMs).toBeCloseTo(80, 0);
  expect([t.c24.passed, t.c24.failed]).toEqual([2, 1]);
  await slot(25, 'fired', 45);
  expect((await overview(db, 1, NOW)).totals.verdict).toBe('late');
});

test('overview: nothing scheduled, needs-fix wins, and two workflows due together', async () => {
  await seed(db);
  expect((await overview(db, 1, NOW)).totals.verdict).toBe('nothing_scheduled');
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES (101, 10, '.github/workflows/b.yml', 'b')`);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 * * * *'), (101, '0 * * * *')`);
  await slot(-10, 'pending', null, 100);
  await slot(-10, 'pending', null, 101);
  expect((await overview(db, 1, NOW)).totals.nextKick).toMatchObject({ alsoDue: 1 });
  await db.query(`UPDATE workflows SET flags = '[{"message":"x"}]' WHERE id = 101`);
  expect((await overview(db, 1, NOW)).totals.verdict).toBe('needs_fix');
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

test('workflow history: Free shows the last 7 days; counts match the window', async () => {
  await seed(db, { plan: 'free' });
  for (const days of [1, 3, 6, 8, 30]) await slot(days * 24 * 60, 'fired', 1);
  const h = (await workflowHistory(db, 1, 100, NOW))!;
  expect(h.slots).toHaveLength(3);
  expect(h.counts).toEqual({ fired: 3 });
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

test('slots: tick colours, details, oldest first, no padding', async () => {
  expect(toTick('accepted', 2_000)).toBe('ontime');
  expect(toTick('fired', 45_000)).toBe('late');
  expect(toTick('expired', null)).toBe('missed');
  expect(toTick('unknown', 1_000)).toBe('missed');
  expect(toTick('skipped', null)).toBe('idle');
  await seed(db);
  await slot(3, 'accepted', 1);
  await slot(2, 'fired', 90);
  await slot(1, 'expired', null);
  await slot(-1, 'pending', null);
  const list = (await recentSlots(db, 1, NOW, 5)).get(100)!;
  expect(list.map((x) => x.tick)).toEqual(['ontime', 'late', 'missed']);
  expect(list[0]).toMatchObject({ workflowId: 100, state: 'accepted', delayMs: 1000, due: ago(3).toISOString() });
});

test('activity: newest first, only slots Cronkick acted on, scoped to the installation', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await slot(30, 'accepted', 1);
  await slot(15, 'unknown', 1);
  await slot(5, 'skipped', null);
  await slot(-5, 'pending', null);
  await slot(10, 'accepted', 1, 200, 2, 20);
  const a = await activity(db, 1, NOW);
  expect(a.map((x) => x.state)).toEqual(['unknown', 'accepted']);
  expect(a[0]).toMatchObject({ workflow: 'nightly', repo: 'acme/app' });
});

test('account health: a missed run marks only its own account', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 * * * *'), (200, '0 * * * *')`);
  await slot(10, 'accepted', 1);
  await slot(10, 'expired', null, 200, 2, 20);
  const h = await accountHealth(db, [1, 2, 3], NOW);
  expect(h.get(1)).toEqual({ schedules: 1, health: 'on_time' });
  expect(h.get(2)).toEqual({ schedules: 1, health: 'missed' });
  expect(h.get(3)).toEqual({ schedules: 0, health: 'no_runs' });
});

test('workflow history: filters and 24 h health', async () => {
  await seed(db);
  await slot(5, 'accepted', 1, 100, 1, 10, 'success');
  await slot(10, 'fired', 50);
  await slot(15, 'expired', null);
  await slot(20, 'accepted', 2, 100, 1, 10, 'failure');
  const states = async (f?: 'late' | 'missed' | 'failed') => (await workflowHistory(db, 1, 100, NOW, f))!.slots.map((x) => x.state);
  expect(await states()).toEqual(['accepted', 'fired', 'expired', 'accepted']);
  expect(await states('late')).toEqual(['fired']);
  expect(await states('missed')).toEqual(['expired']);
  expect(await states('failed')).toEqual(['accepted']);
  const h = (await workflowHistory(db, 1, 100, NOW, 'late'))!;
  expect(h.health).toBe('missed');
  expect(h.counts).toEqual({ accepted: 2, fired: 1, expired: 1 }); // counts ignore the filter
});

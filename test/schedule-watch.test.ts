import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { matchRuns } from '../src/probe/stats.ts';
import { recordScheduledRun, scheduleEvidence, watchSchedules } from '../src/schedule-watch.ts';
import { handleEvent } from '../src/webhooks.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { await db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const NOW = new Date('2026-11-10T12:30:00Z');
const H = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOURLY = '  # cronkick: "0 * * * *"';
/** Workflow 100 still on GitHub's schedule (a move-it candidate). */
const candidate = async (diff = HOURLY) => {
  await seed(db);
  await db.query('UPDATE workflows SET suggested_diff = $1 WHERE id = 100', [diff]);
};
const run = (id: number, created: Date, event = 'schedule') => ({ id, workflow_id: 100, event, created_at: created.toISOString() });
const count = async () => (await db.query('SELECT count(*)::int AS n FROM schedule_runs')).rows[0].n;
const watchRow = async () => (await db.query('SELECT * FROM schedule_watch WHERE workflow_id = 100')).rows[0];

test('matchRuns: each run takes the latest free due time at or before it; the rest never ran', () => {
  const at = (h: string) => new Date(`2026-11-10T${h}Z`);
  expect(matchRuns([at('00:00:00'), at('01:00:00'), at('02:00:00')], [at('02:10:00'), at('00:05:00')])).toEqual([300, null, 600]);
  // Two runs in one interval: the second goes to the earlier free due time, never overstating lateness.
  expect(matchRuns([at('00:00:00'), at('01:00:00')], [at('01:01:00'), at('01:02:00')])).toEqual([3720, 60]);
});

test('webhook: a scheduled run of a candidate is kept once; requested then completed is one row', async () => {
  await candidate();
  expect(await recordScheduledRun(db, run(1, ago(10 * 60_000)), NOW)).toBe(true);
  expect(await recordScheduledRun(db, run(1, ago(10 * 60_000)), NOW)).toBe(true);
  expect(await count()).toBe(1);
  expect(await watchRow()).toMatchObject({ since: NOW, last_complete_at: null });
});

test('webhook: runs of workflows that are not candidates are ignored', async () => {
  await seed(db); // no suggested_diff
  expect(await recordScheduledRun(db, run(1, ago(60_000)), NOW)).toBe(false);
  await db.query('UPDATE workflows SET suggested_diff = $1, dismissed_at = now() WHERE id = 100', [HOURLY]);
  expect(await recordScheduledRun(db, run(2, ago(60_000)), NOW)).toBe(false); // kept on GitHub by the user
  await db.query('UPDATE workflows SET dismissed_at = NULL WHERE id = 100');
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 * * * *')`);
  expect(await recordScheduledRun(db, run(3, ago(60_000)), NOW)).toBe(false); // already on Cronkick
  expect(await recordScheduledRun(db, { ...run(4, ago(60_000)), workflow_id: 999 }, NOW)).toBe(false); // unknown
  expect(await count()).toBe(0);
});

test('webhook routing: schedule runs are recorded, dispatch runs still link to their slot', async () => {
  await candidate();
  const { deps } = fakeDeps(db, NOW);
  await handleEvent(deps, 'workflow_run', { workflow_run: { ...run(7, ago(60_000)), html_url: 'u', status: 'requested', conclusion: null } });
  expect(await count()).toBe(1);
  await handleEvent(deps, 'workflow_run', { workflow_run: { ...run(8, ago(60_000), 'workflow_dispatch'), html_url: 'u', status: 'requested', conclusion: null } });
  expect(await count()).toBe(1);
});

test('hourly read: fills in runs the webhook missed and confirms up to now', async () => {
  await candidate();
  const { deps, gh } = fakeDeps(db, NOW);
  gh.scheduled.set(100, [{ id: 2, createdAt: ago(5 * 60_000) }, { id: 1, createdAt: ago(25 * 60_000) }]);
  await watchSchedules(deps, NOW);
  expect(await count()).toBe(2);
  expect(await watchRow()).toMatchObject({ last_complete_at: NOW, last_error: null });
});

test('hourly read: a failure or a capped read records the error and does not move the confirmed point', async () => {
  await candidate();
  const { deps, gh } = fakeDeps(db, NOW);
  gh.scheduled.set(100, []);
  await watchSchedules(deps, ago(H));
  gh.scheduled.set(100, new Error('GitHub returned 502'));
  await watchSchedules(deps, NOW);
  expect(await watchRow()).toMatchObject({ last_complete_at: ago(H), last_error: 'check failed: GitHub returned 502', last_error_at: NOW });
  // 288 runs a day fit in 3 pages; 400 since the last check don't, so it isn't confirmed.
  gh.scheduled.set(100, Array.from({ length: 400 }, (_, i) => ({ id: 10 + i, createdAt: ago(i * 1000) })));
  await watchSchedules(deps, NOW);
  expect(await watchRow()).toMatchObject({ last_complete_at: ago(H), last_error: 'incomplete: more than 300 runs since the last check' });
});

test('watch list follows the candidates: moved or dismissed workflows lose their rows; old rows are pruned', async () => {
  await candidate();
  const { deps, gh } = fakeDeps(db, NOW);
  gh.scheduled.set(100, [{ id: 1, createdAt: ago(60_000) }]);
  await watchSchedules(deps, NOW);
  await db.query(`INSERT INTO schedule_runs (run_id, workflow_id, created_at) VALUES (99, 100, $1)`, [ago(49 * H)]);
  await watchSchedules(deps, NOW);
  expect(await count()).toBe(1); // the 49 h old row is gone
  await db.query('UPDATE workflows SET dismissed_at = now() WHERE id = 100');
  await watchSchedules(deps, NOW);
  expect(await watchRow()).toBeUndefined();
  expect(await count()).toBe(0);
});

test('changing the crons starts measuring over; a suspended account is not read', async () => {
  await candidate();
  const { deps, gh } = fakeDeps(db, NOW);
  gh.scheduled.set(100, [{ id: 1, createdAt: ago(60_000) }]);
  await watchSchedules(deps, ago(2 * H));
  await db.query('UPDATE workflows SET suggested_diff = $1 WHERE id = 100', ['  # cronkick: "30 * * * *"']);
  await watchSchedules(deps, NOW);
  expect(await watchRow()).toMatchObject({ since: NOW, crons: JSON.stringify([{ cron: '30 * * * *', tz: 'UTC' }]) });
  await db.query('UPDATE installations SET suspended = true');
  gh.scheduledReads.length = 0;
  await watchSchedules(deps, NOW);
  expect(gh.scheduledReads).toEqual([]);
});

/** A watch confirmed now, measuring since `since`, with runs created at the given times. */
const watched = async (since: Date, created: Date[], diff = HOURLY, last: Date | null = NOW) => {
  await candidate(diff);
  await db.query('INSERT INTO schedule_watch (workflow_id, crons, since, last_complete_at) VALUES (100, $1, $2, $3)', ['x', since, last]);
  for (const [i, c] of created.entries()) await db.query('INSERT INTO schedule_runs (run_id, workflow_id, created_at) VALUES ($1, 100, $2)', [i + 1, c]);
};

test('evidence: the last 24 h up to the confirmed point less an hour; runs counted against due times', async () => {
  // Hourly, due 13:00 yesterday to 11:00 today (until = 11:30): 23 due times. Three ran, 8 min late.
  const at = (h: string) => new Date(`2026-11-10T${h}Z`);
  await watched(ago(30 * H), [at('02:08:00'), at('05:08:00'), at('09:08:00')]);
  expect((await scheduleEvidence(db, 1, NOW)).get(100)).toEqual({
    measuring: false, ran: 3, due: 23, p50Sec: 480, from: ago(24 * H).toISOString(), until: ago(H).toISOString(), fullDay: true,
  });
});

test('evidence: due times after the last confirmed read are not counted as skipped', async () => {
  await watched(ago(30 * H), [], HOURLY, ago(10 * H)); // reads stopped 10 h ago
  const e = (await scheduleEvidence(db, 1, NOW)).get(100);
  expect(e).toMatchObject({ measuring: false, due: 13, ran: 0, until: ago(11 * H).toISOString() });
});

test('evidence: too little data is still measuring; never confirmed is measuring', async () => {
  await watched(ago(2 * H), []); // window since-to-until is one hour: one due time
  expect((await scheduleEvidence(db, 1, NOW)).get(100)).toEqual({ measuring: true, since: ago(2 * H).toISOString() });
  await db.query('UPDATE schedule_watch SET last_complete_at = NULL');
  expect((await scheduleEvidence(db, 1, NOW)).get(100)).toEqual({ measuring: true, since: ago(2 * H).toISOString() });
});

test('evidence: a daily schedule shows its one due time once a full day is covered', async () => {
  await watched(ago(30 * H), [], '  # cronkick: "0 3 * * *"');
  expect((await scheduleEvidence(db, 1, NOW)).get(100)).toMatchObject({ measuring: false, ran: 0, due: 1, fullDay: true });
});

test('evidence: due times follow the cron time zone (06:00 London is 05:00 UTC in summer time)', async () => {
  const now = new Date('2026-10-24T12:00:00Z');
  await candidate('  # cronkick: "0 6 * * *" tz=Europe/London');
  await db.query('INSERT INTO schedule_watch (workflow_id, crons, since, last_complete_at) VALUES (100, $1, $2, $3)', ['x', new Date('2026-10-22T00:00:00Z'), now]);
  await db.query('INSERT INTO schedule_runs (run_id, workflow_id, created_at) VALUES (1, 100, $1)', [new Date('2026-10-24T05:05:00Z')]);
  expect((await scheduleEvidence(db, 1, now)).get(100)).toMatchObject({ ran: 1, due: 1, p50Sec: 300 });
});

test('evidence: another account never sees this one', async () => {
  await watched(ago(30 * H), []);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  expect((await scheduleEvidence(db, 2, NOW)).size).toBe(0);
});

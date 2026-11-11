import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { accountHealth, activity, dailyCells, dayBounds, knownZone, exceptions, nextRuns, overview, rangeStats, recentSlots, setDismissed, toTick, workflowHistory, workflowStatus } from '../web/lib/data.ts';
import { VERDICT } from '../web/lib/format.ts';
import { decodeSession, encodeSession } from '../web/lib/session.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const NOW = new Date('2026-11-10T12:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

/**
 * A slot due `dueMinAgo` minutes before NOW. `firstAttemptSec` is when Cronkick first tried; `firedSec` is when GitHub
 * accepted it (scoring uses this). By default a sent slot's firedSec equals its first try; pass it to set it apart.
 */
async function slot(dueMinAgo: number, state: string, firstAttemptSec: number | null, workflowId = 100, inst = 1, repo = 10, conclusion: string | null = null,
  { firedSec = state === 'fired' || state === 'accepted' ? firstAttemptSec : null, attempts = firstAttemptSec === null ? 0 : 1, status = null as number | null }:
    { firedSec?: number | null; attempts?: number; status?: number | null } = {}) {
  const due = ago(dueMinAgo);
  const at = (sec: number | null) => (sec === null ? null : new Date(due.getTime() + sec * 1000));
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, first_attempt_at, fired_at, attempts, response_status, conclusion)
     VALUES ($1, $2, $3, $4, $4, $4, $4, $5, $6, $7, $8, $9, $10)`,
    [inst, repo, workflowId, due, state, at(firstAttemptSec), at(firedSec), attempts, status, conclusion],
  );
}
const secAgo = (sec: number) => sec / 60; // dueMinAgo for a slot due `sec` seconds ago
const none = { due: 0, onTime: 0, late: 0, waiting: 0, overdue: 0, retrying: 0, unconfirmed: 0, refused: 0, gaveUp: 0, passed: 0, failed: 0 };
/** R1: every due slot is in exactly one bucket. */
const partitions = (c: typeof none) => c.due === c.onTime + c.late + c.waiting + c.overdue + c.unconfirmed + c.refused + c.gaveUp;

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
  expect(repos[0].workflows[0].c24).toEqual({ ...none, due: 4, onTime: 1, late: 1, unconfirmed: 1, gaveUp: 1, passed: 1 });
  expect(totals.c24.due).toBe(4);
  expect(totals.verdict).toBe('missed');
  expect(totals.nextKick).toMatchObject({ workflowId: 100, workflow: 'nightly', repo: 'acme/app', alsoDue: 0 });
  expect(totals.nextKick!.due).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString()); // from the cron, not the slot table
});

test('overview: verdicts, median delay and job results', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'no_runs', medianDelayMs: null, nextKick: { due: ago(-5).toISOString() } });
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

test('overview and history: a coverage gap in range is shown, but never sets the verdict', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron, created_at) VALUES (100, '*/5 * * * *', $1)`, [ago(60 * 48)]);
  await slot(5, 'accepted', 1);
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 30), ago(60 * 26)]); // ended 26 h ago
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'on_time', gaps: [] });
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 5), ago(60 * 2)]);
  const gap = { start: ago(60 * 5).toISOString(), end: ago(60 * 2).toISOString() };
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'on_time', gaps: [gap] });
  expect((await workflowHistory(db, 1, 100, NOW))!.gaps).toHaveLength(2); // Pro shows 90 days
});

test('coverage gaps: one that began before the account was created starts at its creation', async () => {
  await seed(db);
  await db.query('UPDATE installations SET created_at = $1 WHERE id = 1', [ago(60 * 28)]);
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 30), ago(60 * 26)]);
  expect((await workflowHistory(db, 1, 100, NOW))!.gaps).toEqual([{ start: ago(60 * 28).toISOString(), end: ago(60 * 26).toISOString() }]);
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
  expect(h.filterCounts).toMatchObject({ all: 3, late: 0 });
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
  expect(toTick('unknown', 1_000)).toBe('unconfirmed');
  expect(toTick('skipped', null)).toBe('idle');
  await seed(db);
  await slot(3, 'accepted', 1);
  await slot(2, 'fired', 90);
  await slot(1, 'expired', null);
  await slot(-1, 'pending', null);
  const list = (await recentSlots(db, 1, NOW, 5)).get(100)!;
  expect(list.map((x) => x.tick)).toEqual(['ontime', 'late', 'missed']);
  expect(list[0]).toMatchObject({ workflowId: 100, state: 'accepted', display: 'accepted', sendDelayMs: 1000, due: ago(3).toISOString() });
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
  expect(h.get(3)).toEqual({ schedules: 0, health: 'nothing_scheduled' });
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
  expect(h.filterCounts).toEqual({ all: 4, late: 1, missed: 1, unconfirmed: 0, failed: 1 }); // counts ignore the filter
  expect(h.medianDelayMs).toBe(2000); // sent at +1 s, +50 s, +2 s over the same 24 h as the other facts
});

test('keep it on GitHub: hides only within the installation, and can be undone', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  expect(await setDismissed(db, 2, 100, true)).toBe(false); // someone else's workflow
  expect((await overview(db, 1, NOW)).repos[0].workflows[0].dismissed).toBe(false);
  expect(await setDismissed(db, 1, 100, true)).toBe(true);
  expect((await overview(db, 1, NOW)).repos[0].workflows[0].dismissed).toBe(true);
  await setDismissed(db, 1, 100, false);
  expect((await overview(db, 1, NOW)).repos[0].workflows[0].dismissed).toBe(false);
});

test('R1: one pending slot 5 min overdue makes the account behind, and due partitions exactly', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(15, 'accepted', 1);
  await slot(10, 'accepted', 2);
  await slot(5, 'pending', null);
  const { totals } = await overview(db, 1, NOW);
  expect(totals.c24).toEqual({ ...none, due: 3, onTime: 2, overdue: 1 });
  expect(partitions(totals.c24)).toBe(true);
  expect(totals.verdict).toBe('behind');
});

test('waiting vs overdue: 60 s from due, for pending and dispatching alike; retries are flagged', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '* * * * *')`);
  await slot(secAgo(20), 'pending', null);
  let t = (await overview(db, 1, NOW)).totals;
  expect(t.c24).toMatchObject({ due: 1, waiting: 1, overdue: 0 });
  expect(t.verdict).toBe('in_progress');
  expect(partitions(t.c24)).toBe(true);

  await db.query('DELETE FROM slots');
  await slot(secAgo(20), 'dispatching', 0);
  await slot(secAgo(90), 'dispatching', 0); // first try still in flight: not sent yet, not a GitHub error
  await slot(3, 'pending', 0, 100, 1, 10, null, { status: 503 }); // retry backoff after a GitHub 5xx
  const strip = (await recentSlots(db, 1, NOW)).get(100)!;
  expect(strip.map((x) => [x.display, x.tick, x.retrying])).toEqual([['overdue', 'overdue', true], ['overdue', 'overdue', false], ['waiting', 'waiting', false]]);
  t = (await overview(db, 1, NOW)).totals;
  expect(t.c24).toMatchObject({ due: 3, waiting: 1, overdue: 2, retrying: 1 });
  expect(partitions(t.c24)).toBe(true);
  expect(t.verdict).toBe('behind');
});

test('R3: on time is scored from the send; unconfirmed shows when it was tried, not a send', async () => {
  await seed(db);
  await slot(10, 'accepted', 0, 100, 1, 10, null, { firedSec: 240 }); // claimed on time, GitHub accepted 4 min later
  await slot(5, 'unknown', 1);
  const c = (await overview(db, 1, NOW)).repos[0].workflows[0].c24;
  expect(c).toMatchObject({ onTime: 0, late: 1, unconfirmed: 1 });
  const rows = (await workflowHistory(db, 1, 100, NOW))!.slots;
  expect(rows[1]).toMatchObject({ state: 'accepted', tick: 'late', sendDelayMs: 240_000, triedDelayMs: 0 });
  expect(rows[0]).toMatchObject({ state: 'unknown', tick: 'unconfirmed', sendDelayMs: null, triedDelayMs: 1000 });
  expect((await workflowHistory(db, 1, 100, NOW, 'late'))!.slots.map((x) => x.state)).toEqual(['accepted']);
});

test('R4: unconfirmed is its own verdict, not missed; refused is missed', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(15, 'accepted', 1);
  await slot(10, 'unknown', 1);
  expect((await overview(db, 1, NOW)).totals.verdict).toBe('unconfirmed');
  expect((await workflowHistory(db, 1, 100, NOW, 'missed'))!.slots).toEqual([]);
  expect((await workflowHistory(db, 1, 100, NOW, 'unconfirmed'))!.slots.map((x) => x.state)).toEqual(['unknown']);
  await slot(5, 'rejected', 1);
  const t = (await overview(db, 1, NOW)).totals;
  expect(t.verdict).toBe('missed');
  expect(t.c24).toMatchObject({ refused: 1, unconfirmed: 1 });
  expect(toTick('rejected', null)).toBe('missed');
  expect(toTick('unknown', null)).toBe('unconfirmed');
});

test('R8: misses survive a workflow being flagged or its repo deselected; switcher agrees with the overview', async () => {
  await seed(db);
  await db.query(`INSERT INTO repos (id, installation_id, full_name, default_branch) VALUES (11, 1, 'acme/other', 'main')`);
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES (101, 10, '.github/workflows/b.yml', 'b'), (102, 11, '.github/workflows/c.yml', 'c')`);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *'), (101, '*/5 * * * *'), (102, '*/5 * * * *')`);
  await slot(20, 'accepted', 1);
  await slot(15, 'expired', null, 101);
  await slot(10, 'expired', null, 102, 1, 11);
  await db.query(`UPDATE workflows SET flags = '[{"message":"x"}]' WHERE id = 101`);
  await db.query(`UPDATE repos SET active = false WHERE id = 11`);
  const { totals } = await overview(db, 1, NOW);
  expect(totals.c24).toMatchObject({ due: 3, onTime: 1, gaveUp: 2 });
  expect(totals.verdict).toBe('needs_fix');
  expect((await accountHealth(db, [1], NOW)).get(1)).toEqual({ schedules: totals.activeSchedules, health: totals.verdict });
  await db.query(`UPDATE workflows SET flags = '[]' WHERE id = 101`);
  const again = (await overview(db, 1, NOW)).totals;
  expect(again.verdict).toBe('missed');
  expect((await accountHealth(db, [1], NOW)).get(1)).toEqual({ schedules: again.activeSchedules, health: 'missed' });
});

test('recent slots and activity include an overdue row; a waiting one stays out of the feed', async () => {
  await seed(db);
  await slot(5, 'pending', null);
  await slot(secAgo(20), 'pending', null);
  expect((await recentSlots(db, 1, NOW)).get(100)!.map((x) => x.display)).toEqual(['overdue', 'waiting']);
  const a = await activity(db, 1, NOW);
  expect(a.map((x) => [x.display, x.tick])).toEqual([['overdue', 'overdue']]);
});

test('first run: only until a slot comes due; an overdue first slot is the incident view', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  expect((await overview(db, 1, NOW)).totals.anyDue).toBe(false);
  await slot(-5, 'pending', null);
  expect((await overview(db, 1, NOW)).totals.anyDue).toBe(false);
  await slot(5, 'pending', null);
  const t = (await overview(db, 1, NOW)).totals;
  expect(t).toMatchObject({ anyDue: true, verdict: 'behind' });
  expect(await activity(db, 1, NOW)).toHaveLength(1);
});

test('R5: a daily-only schedule 13 h before due is configured, with its next due from the cron', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 1 * * *')`); // NOW is 12:00 UTC: next is 01:00 tomorrow
  const { repos, totals } = await overview(db, 1, NOW);
  expect(repos[0].workflows[0]).toMatchObject({ status: 'active', nextDue: '2026-11-11T01:00:00.000Z' });
  expect(totals).toMatchObject({ anyDue: false, nextKick: { workflowId: 100, due: '2026-11-11T01:00:00.000Z' } });
  expect((await workflowHistory(db, 1, 100, NOW))!.next).toBe('2026-11-11T01:00:00.000Z');
});

test('R5: no next due for a suspended installation, an inactive repo, or a paused schedule', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 1 * * *')`);
  await db.query('UPDATE installations SET suspended = true WHERE id = 1');
  expect((await overview(db, 1, NOW)).repos[0].workflows[0].nextDue).toBeNull();
  expect((await workflowHistory(db, 1, 100, NOW))!.next).toBeNull();
  await db.query('UPDATE installations SET suspended = false WHERE id = 1');
  await db.query('UPDATE repos SET active = false WHERE id = 10');
  expect((await workflowHistory(db, 1, 100, NOW))!.next).toBeNull();
  await db.query('UPDATE repos SET active = true WHERE id = 10');
  await db.query(`UPDATE schedules SET status = 'paused_limit'`);
  expect((await workflowHistory(db, 1, 100, NOW))!.next).toBeNull();
});

test('R6: zero active repositories leaves nothing to show but the choose-repositories state', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 1 * * *')`);
  await db.query('UPDATE repos SET active = false');
  const { repos, totals } = await overview(db, 1, NOW);
  expect(repos).toEqual([]);
  expect(totals).toMatchObject({ anyDue: false, nextKick: null, verdict: 'nothing_scheduled' });
});

test('history pages back with a before cursor, within the plan window', async () => {
  await seed(db); // Pro: 90 days
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, first_attempt_at, fired_at)
     SELECT 1, 10, 100, d, d, d, d, 'fired', d, d FROM generate_series($1::timestamptz - interval '5 minutes', $1::timestamptz - interval '3000 minutes', interval '-5 minutes') d`,
    [NOW],
  );
  const first = (await workflowHistory(db, 1, 100, NOW))!;
  expect(first.slots).toHaveLength(50);
  expect(first).toMatchObject({ hasOlder: true, hasNewer: false });
  const older = (await workflowHistory(db, 1, 100, NOW, undefined, new Date(first.slots[49].due)))!;
  expect(older.slots).toHaveLength(50);
  expect(older).toMatchObject({ hasOlder: true, hasNewer: true });
  expect(older.slots[0].due).toBe(ago(255).toISOString()); // no gap, no repeat
  // Newer from page 2 is page 1 again, newest first, with nothing newer.
  const back = (await workflowHistory(db, 1, 100, NOW, undefined, undefined, new Date(older.slots[0].due)))!;
  expect(back.slots.map((x) => x.due)).toEqual(first.slots.map((x) => x.due));
  expect(back).toMatchObject({ hasOlder: true, hasNewer: false });
  // The last page: 600 rows, so page 12 holds the oldest 50 and nothing is older.
  let page = first;
  for (let i = 0; i < 11; i++) page = (await workflowHistory(db, 1, 100, NOW, undefined, new Date(page.slots[page.slots.length - 1].due)))!;
  expect(page.slots).toHaveLength(50);
  expect(page.hasOlder).toBe(false);
  expect(page.slots[49].due).toBe(ago(3000).toISOString());
  // Direction flags come from what exists, not from the cursor: a `before` above the newest run has nothing newer,
  // and an `after` past the newest run is an empty page that knows nothing is on either side of it.
  expect(await workflowHistory(db, 1, 100, NOW, undefined, new Date(NOW.getTime() - 1000))).toMatchObject({ hasNewer: false, hasOlder: true, newerEdge: null });
  const empty = (await workflowHistory(db, 1, 100, NOW, undefined, undefined, new Date(Date.parse(first.slots[0].due) + 1)))!;
  expect(empty).toMatchObject({ slots: [], hasNewer: false, hasOlder: false });
  expect(older.newerEdge).toBe(first.slots[49].due); // the run just above page 2
  // A future `after` has nothing newer; a malformed one is ignored.
  expect((await workflowHistory(db, 1, 100, NOW, undefined, undefined, new Date(NOW.getTime() + 60_000)))!.slots[0].due).toBe(ago(5).toISOString());
  expect((await workflowHistory(db, 1, 100, NOW, undefined, undefined, new Date('nonsense')))!.slots[0].due).toBe(ago(5).toISOString());
  const past = (await workflowHistory(db, 1, 100, NOW, undefined, ago(91 * 24 * 60)))!; // before the 90-day window
  expect(past.slots).toEqual([]);
  expect(past.hasOlder).toBe(false);
  const bad = (await workflowHistory(db, 1, 100, NOW, undefined, new Date('nonsense')))!; // ignored, so the newest page
  expect(bad.slots[0].due).toBe(ago(5).toISOString());
  expect(bad.hasOlder).toBe(true);
});

test('verdict: the last workflow flagged after a miss is needs-fix, and its last repo deselected stays missed', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(10, 'expired', null);
  await db.query(`UPDATE workflows SET flags = '[{"message":"x"}]'`);
  let t = (await overview(db, 1, NOW)).totals;
  expect(t).toMatchObject({ activeSchedules: 0, verdict: 'needs_fix' });
  expect((await accountHealth(db, [1], NOW)).get(1)).toEqual({ schedules: 0, health: 'needs_fix' });
  await db.query(`UPDATE workflows SET flags = '[]'`);
  await db.query('UPDATE repos SET active = false');
  t = (await overview(db, 1, NOW)).totals;
  expect(t).toMatchObject({ activeSchedules: 0, verdict: 'missed' });
  expect((await accountHealth(db, [1], NOW)).get(1)).toEqual({ schedules: 0, health: 'missed' });
});

test('headline: on time with no live schedules left (marker removed) does not say "All 0 schedules"', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(10, 'fired', 2);
  await slot(5, 'fired', 1);
  await db.query('DELETE FROM schedules');
  const t = (await overview(db, 1, NOW)).totals;
  expect(t).toMatchObject({ activeSchedules: 0, verdict: 'on_time' });
  expect(VERDICT[t.verdict](t.c24)).toBe('No dispatch issues in the last 24 h');
  expect(VERDICT.behind({ ...t.c24, overdue: 1 })).toBe('1 overdue run');
  expect(VERDICT.behind({ ...t.c24, overdue: 3 })).toBe('3 overdue runs');
  expect(VERDICT.missed({ ...t.c24, refused: 1, gaveUp: 0 })).toBe('1 run refused by GitHub');
  expect(VERDICT.missed({ ...t.c24, refused: 1, gaveUp: 1 })).toBe('2 runs not sent');
});

test('workflow page: a removed marker reads as not scheduled, a plan-limit pause as limited', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron, status) VALUES (100, '0 * * * *', 'paused_limit')`);
  expect((await workflowHistory(db, 1, 100, NOW))!.status).toBe('limited');
  await slot(10, 'fired', 1);
  await db.query('DELETE FROM schedules'); // what sync does when the # cronkick line goes
  expect((await workflowHistory(db, 1, 100, NOW))!.status).toBe('none');
});

test('first run: a recorded outage takes the normal overview, so its notice is on screen', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 1 * * *')`); // nothing due in the last 24 h
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ anyDue: false, firstRun: true });
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 5), ago(60 * 2)]);
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ anyDue: false, firstRun: false, verdict: 'no_runs' });
  await db.query(`UPDATE workflows SET flags = '[{"message":"x"}]'`);
  expect((await overview(db, 1, NOW)).totals.firstRun).toBe(false);
});

test('workflow health: a needed fix outranks on-time counts; a coverage gap never becomes health anywhere', async () => {
  await seed(db);
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES (101, 10, '.github/workflows/daily.yml', 'daily')`);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *'), (101, '0 3 * * *')`);
  await slot(5, 'accepted', 1);
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 5), ago(60 * 2)]);
  const health = async () => Object.fromEntries((await overview(db, 1, NOW)).repos[0].workflows.map((w) => [w.name, w.health]));
  expect(await health()).toEqual({ daily: 'no_runs', nightly: 'on_time' });
  expect((await workflowHistory(db, 1, 100, NOW))!).toMatchObject({ health: 'on_time', gaps: [expect.anything()] });
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'on_time', gaps: [expect.anything()] });
  expect((await accountHealth(db, [1], NOW)).get(1)!.health).toBe('on_time');
  await db.query(`UPDATE workflows SET flags = '[{"message":"x"}]' WHERE id = 100`);
  expect((await workflowHistory(db, 1, 100, NOW))!.health).toBe('needs_fix');
  expect(await health()).toEqual({ daily: 'no_runs', nightly: 'needs_fix' });
});

test('needs attention: every exception of the last 24 h, most serious first, before the limit', async () => {
  await seed(db);
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  for (let m = 1; m <= 40; m++) await slot(m * 5, 'accepted', 1); // 40 quiet successes, newest first
  await slot(20 * 60, 'fired', 45);                                // late, 20 h ago, behind all of them
  await slot(23 * 60, 'unknown', 1);
  await slot(22 * 60, 'accepted', 1, 100, 1, 10, 'failure');
  await slot(30 * 60, 'expired', null);                            // older than 24 h: out
  await slot(secAgo(90), 'pending', null);                         // overdue now
  await slot(secAgo(20), 'pending', null);                         // still sending: not an exception
  await slot(10, 'rejected', 1, 200, 2, 20);                       // another account's
  const e = await exceptions(db, 1, NOW);
  expect(e.items.map((x) => x.reason)).toEqual(['overdue', 'unconfirmed', 'failed', 'late']);
  expect(e.more).toBe(0);
  const capped = await exceptions(db, 1, NOW, 2);
  expect(capped.items.map((x) => x.reason)).toEqual(['overdue', 'unconfirmed']);
  expect(capped.more).toBe(2);
});

test('gaps that ended before an installation existed are not its outage', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *')`);
  await slot(5, 'accepted', 1);
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, [ago(60 * 5), ago(60 * 2)]);
  await db.query('UPDATE installations SET created_at = $1', [ago(60)]);
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'on_time', gaps: [] });
  expect((await accountHealth(db, [1], NOW)).get(1)!.health).toBe('on_time');
  expect((await workflowHistory(db, 1, 100, NOW))!).toMatchObject({ health: 'on_time', gaps: [] });
  await db.query('UPDATE installations SET created_at = $1', [ago(60 * 3)]); // existed before it ended: shown, still not a verdict
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'on_time', gaps: [expect.anything()] });
});

test('history cursor: future cursors are ignored; one older than retention, however extreme, is empty without a query', async () => {
  await seed(db);
  await slot(5, 'fired', 1);
  const newest = async (before: Date) => (await workflowHistory(db, 1, 100, NOW, undefined, before))!;
  expect(await newest(new Date('-100000-01-01T00:00:00Z'))).toMatchObject({ slots: [], hasOlder: false });
  expect((await newest(new Date('+100000-01-01T00:00:00Z'))).slots).toHaveLength(1);
  expect((await newest(ago(-60))).slots).toHaveLength(1); // future
  const old = await newest(new Date('1000-01-01T00:00:00Z'));
  expect(old).toMatchObject({ slots: [], hasOlder: false });
});

test('a weekly schedule on its off days is quiet, not "waiting for the first run"', async () => {
  await seed(db);
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '0 9 * * 1')`);
  await slot(3 * 24 * 60, 'accepted', 1); // ran three days ago, nothing due in the last 24 h
  const t = (await overview(db, 1, NOW)).totals;
  expect(t).toMatchObject({ verdict: 'quiet', firstRun: false });
  expect(VERDICT[t.verdict](t.c24)).toBe('Nothing was due in the last 24 h');
  expect((await accountHealth(db, [1], NOW)).get(1)!.health).toBe('quiet');
  await db.query('DELETE FROM slots'); // never ran: the first-run page, and its verdict says so
  expect((await overview(db, 1, NOW)).totals).toMatchObject({ verdict: 'no_runs', firstRun: true });
  expect((await accountHealth(db, [1], NOW)).get(1)!.health).toBe('no_runs');
});

test('recent strips stop at the plan history window; one workflow can be asked for alone', async () => {
  await seed(db, { plan: 'free' });
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES (101, 10, '.github/workflows/b.yml', 'b')`);
  for (const d of [1, 3, 6, 8, 20]) await slot(d * 24 * 60, 'fired', 1);
  await slot(60, 'fired', 1, 101);
  expect((await recentSlots(db, 1, NOW, 96)).get(100)).toHaveLength(3); // Free: 7 days
  await db.query(`UPDATE installations SET plan = 'pro'`);
  expect((await recentSlots(db, 1, NOW, 96)).get(100)).toHaveLength(5);
  const one = await recentSlots(db, 1, NOW, 96, 101);
  expect([...one.keys()]).toEqual([101]);
});

test('next runs: five in order, across a DST change without a repeat, none when nothing is active', () => {
  const at = new Date('2026-11-10T14:07:00Z');
  expect(nextRuns([{ cron: '*/15 * * * *', tz: 'UTC', status: 'active' }], at).map((t) => t.slice(11, 16))).toEqual(['14:15', '14:30', '14:45', '15:00', '15:15']);
  const berlin = nextRuns([{ cron: '30 2 * * *', tz: 'Europe/Berlin', status: 'active' }], new Date('2026-10-24T12:00:00Z'), 3);
  expect(new Set(berlin).size).toBe(3);
  expect(berlin.map((t) => t.slice(0, 10))).toEqual(['2026-10-25', '2026-10-26', '2026-10-27']);
  expect(nextRuns([{ cron: '*/15 * * * *', tz: 'UTC', status: 'paused_limit' }], at)).toEqual([]);
});

test('daily cells: viewer-zone days, worst dispatch state, GitHub failures apart, gaps add no runs, nothing before tracking', async () => {
  await seed(db); // Pro; NOW = 2026-11-10 12:00 UTC
  const at = (iso: string) => (NOW.getTime() - Date.parse(iso)) / 60_000;
  await slot(at('2026-11-09T23:30:00Z'), 'fired', 1);          // Nov 9 in UTC, Nov 10 in Kolkata (05:00)
  await slot(at('2026-11-09T10:00:00Z'), 'fired', 40);         // late, Nov 9
  await slot(at('2026-11-09T11:00:00Z'), 'accepted', 1, 100, 1, 10, 'failure'); // on time, GitHub run failed
  await slot(at('2026-11-08T10:00:00Z'), 'fired', 1);          // first record: Nov 8
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at) VALUES ($1, $2)`, ['2026-11-07T10:00:00Z', '2026-11-07T11:00:00Z']);
  const utc = (await dailyCells(db, 1, [100], NOW, 'UTC', 7)).get(100)!;
  expect(utc.map((d) => d.day)).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
  const day = (d: string) => utc.find((x) => x.day === d)!;
  expect(day('2026-11-09')).toMatchObject({ state: 'late', c: { due: 3, onTime: 2, late: 1, failed: 1 } });
  expect(day('2026-11-08')).toMatchObject({ state: 'ontime', c: { due: 1 } });
  expect(day('2026-11-07')).toMatchObject({ state: 'none', gap: true, c: { due: 0 } }); // before the first record; the gap adds nothing
  expect(day('2026-11-10')).toMatchObject({ today: true, state: 'empty' });
  const kolkata = (await dailyCells(db, 1, [100], NOW, 'Asia/Kolkata', 7)).get(100)!;
  expect(kolkata.find((x) => x.day === '2026-11-10')!.c.due).toBe(1); // the 23:30 UTC run is the 10th there
  expect(kolkata.find((x) => x.day === '2026-11-09')!.c.due).toBe(2);
});

test('range stats: counts, delay percentiles with their sample, half-second bins with 30 s on time and later apart', async () => {
  await seed(db);
  const delays = [0, 0.499, 0.5, 29.999, 30, 30.001, 90];
  for (const [i, sec] of delays.entries()) await slot(10 + i, 'fired', sec);
  await slot(100, 'expired', null);
  const r = await rangeStats(db, 100, NOW, ago(24 * 60));
  expect(r.n).toBe(7);
  expect(r.bins[0]).toBe(2);   // 0 and 499 ms
  expect(r.bins[1]).toBe(1);   // 500 ms
  expect(r.bins[59]).toBe(2);  // 29 999 and exactly 30 000 ms
  expect(r.bins.reduce((a, b) => a + b, 0)).toBe(5);
  expect(r).toMatchObject({ over: 2, max: 90_000, c: { due: 8, onTime: 5, late: 2, gaveUp: 1 } });
  expect(r.p50).toBe(29_999);
  // GitHub's part, apart from dispatch: sent runs with no reported result, and neutral/skipped results, are named as such.
  expect(r).toMatchObject({ unreported: 7, other: 0 });
  await slot(200, 'accepted', 1, 100, 1, 10, 'neutral');
  await slot(210, 'accepted', 1, 100, 1, 10, 'skipped');
  expect(await rangeStats(db, 100, NOW, ago(24 * 60))).toMatchObject({ other: 2, unreported: 7, c: { passed: 0, failed: 0, gaveUp: 1 } });
});

test('history for one day: only that day, counts and paging inside it, an empty day is empty', async () => {
  await seed(db);
  for (const h of [1, 5, 20, 26, 30]) await slot(h * 60, 'fired', 1); // NOW 12:00 UTC Nov 10: Nov 10 11:00, 07:00; Nov 9 16:00, 10:00, 06:00
  const nov9 = (await dayBounds(db, '2026-11-09', 'UTC'))!;
  const h = (await workflowHistory(db, 1, 100, NOW, undefined, undefined, undefined, nov9))!;
  expect(h.slots.map((x) => x.due.slice(0, 13))).toEqual(['2026-11-09T16', '2026-11-09T10', '2026-11-09T06']);
  expect(h).toMatchObject({ hasNewer: false, hasOlder: false, filterCounts: { all: 3 } });
  const empty = (await workflowHistory(db, 1, 100, NOW, undefined, undefined, undefined, (await dayBounds(db, '2026-11-01', 'UTC'))!))!;
  expect(empty.slots).toEqual([]);
  // In Kolkata, Nov 10 starts at 18:30 UTC on the 9th.
  expect((await dayBounds(db, '2026-11-10', 'Asia/Kolkata'))!.from.toISOString()).toBe('2026-11-09T18:30:00.000Z');
  for (const bad of ['2026-02-30', '2026-11-9', 'today', undefined]) expect(await dayBounds(db, bad, 'UTC')).toBeNull();
});

test('a zone the browser knows but Postgres does not falls back to UTC instead of failing the page', async () => {
  expect(await knownZone(db, 'Asia/Kolkata')).toBe('Asia/Kolkata');
  expect(await knownZone(db, 'US/Pacific-New')).toBe('UTC');
});

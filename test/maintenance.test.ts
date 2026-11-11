import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { claim, dispatchTick, drain } from '../src/dispatcher.ts';
import { materialize, planAhead, refreshSlots, settle } from '../src/maintenance.ts';
import { sendGapAlerts } from '../src/alerts.ts';
import { nextDue } from '../src/slots.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); await seed(db); });
afterAll(() => db.end());

const at = (hhmmss: string) => new Date(`2026-11-10T${hhmmss}Z`);
const NOW = at('15:30:00');

const schedule = (cron: string, workflowId = 100) =>
  db.query(`INSERT INTO schedules (workflow_id, cron, created_at) VALUES ($1, $2, $3)`, [workflowId, cron, at('00:00:00')]);
const setWatermark = (t: Date | null) => db.query('UPDATE planner SET planned_until = $1', [t]);
const watermark = async () => (await db.query('SELECT planned_until FROM planner')).rows[0].planned_until as Date | null;
const gaps = async () => (await db.query('SELECT started_at, ended_at FROM coverage_gaps ORDER BY id')).rows;

test('recovery after a long outage: one gap from the last planning pass, the restart minute is planned and claimable', async () => {
  await schedule('0 * * * *');
  await schedule('30 29 15 * * *'); // due 15:29:30, inside the restart minute
  await setWatermark(at('10:30:00')); // the last pass ran at 08:30 and planned 2 h ahead
  await planAhead(db, NOW);
  expect(await gaps()).toEqual([{ started_at: at('08:30:00'), ended_at: at('15:29:00') }]);
  expect(await watermark()).toEqual(at('17:29:00')); // what was actually planned: (15:29, 17:29]
  const { rows } = await db.query(`SELECT due_at, state FROM slots ORDER BY due_at LIMIT 1`);
  expect(rows[0]).toEqual({ due_at: at('15:29:30'), state: 'pending' }); // nothing invented inside the gap
  expect((await claim(fakeDeps(db, NOW).deps)).map((s) => s.workflow_id)).toEqual([100]);
});

test('DST fall-back: separate planning passes before and inside the repeated hour send a daily 02:30 once', async () => {
  await db.query(`INSERT INTO schedules (workflow_id, cron, tz) VALUES (100, '30 2 * * *', 'Europe/Berlin')`);
  const t = (hhmm: string) => new Date(`2026-10-25T${hhmm}:00Z`);
  const f = fakeDeps(db, t('00:00'));
  // Berlin goes from 03:00 CEST back to 02:00 CET at 01:00 UTC: 02:30 local is 00:30 and again 01:30 UTC.
  for (const now of ['00:00', '00:30', '01:00', '01:30', '01:31']) {
    f.clock.now = t(now);
    await planAhead(db, f.clock.now);
    await dispatchTick(f.deps);
    await drain(f.deps);
  }
  expect(f.gh.dispatches).toHaveLength(1);
  const sched = [{ cron: '30 2 * * *', tz: 'Europe/Berlin' }];
  expect(nextDue(sched, new Date('2026-10-25T00:59:00Z'))).toEqual(nextDue(sched, t('01:00')));
});

test('first deploy (no watermark): no gap, watermark set', async () => {
  await planAhead(db, NOW);
  expect(await gaps()).toEqual([]);
  expect(await watermark()).toEqual(at('17:30:00'));
});

test('watermark only 30 s behind: no gap, and planning resumes where it stopped', async () => {
  await schedule('45 29 15 * * *');
  await setWatermark(at('15:29:30'));
  await planAhead(db, NOW);
  expect(await gaps()).toEqual([]);
  expect((await db.query(`SELECT due_at FROM slots`)).rows).toEqual([{ due_at: at('15:29:45') }]);
});

test('recovery exactly at a due minute keeps that slot', async () => {
  await schedule('0 * * * *');
  await setWatermark(at('10:00:00'));
  await planAhead(db, at('15:00:00'));
  expect(await gaps()).toEqual([{ started_at: at('08:00:00'), ended_at: at('14:59:00') }]);
  const { rows } = await db.query(`SELECT state FROM slots WHERE due_at = $1`, [at('15:00:00')]);
  expect(rows).toEqual([{ state: 'pending' }]);
});

test('refreshSlots never touches the watermark; the next main tick still records the gap', async () => {
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await schedule('0 * * * *');
  await schedule('0 * * * *', 200);
  await setWatermark(at('10:30:00'));
  await materialize(db, at('08:30:00')); // the last pass before the stop planned both installations
  await refreshSlots(db, 1, NOW);
  expect(await watermark()).toEqual(at('10:30:00'));
  await planAhead(db, NOW);
  expect(await gaps()).toHaveLength(1);
});

test('a refresh during a planning pass still drops the slot that pass added for a schedule just removed', async () => {
  // A planning pass that read the schedule before it was removed, and hasn't committed its new slot yet.
  const pass = await db.connect();
  await pass.query('BEGIN');
  await pass.query('SELECT 1 FROM planner FOR UPDATE');
  const due = new Date(NOW.getTime() + 2 * 3_600_000);
  await pass.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at) VALUES (1, 10, 100, $1, $1, $2, $1)`,
    [due, new Date(due.getTime() + 300_000)],
  );
  const refresh = refreshSlots(db, 1, NOW); // the marker is gone: no schedules for workflow 100
  await new Promise((r) => setTimeout(r, 200));
  await pass.query('COMMIT');
  pass.release();
  await refresh;
  expect((await db.query('SELECT count(*)::int AS n FROM slots')).rows[0].n).toBe(0);
});

test('two main ticks at once record one gap', async () => {
  await schedule('0 * * * *');
  await setWatermark(at('10:30:00'));
  await Promise.all([planAhead(db, NOW), planAhead(db, NOW)]);
  expect(await gaps()).toHaveLength(1);
});

test('a database failure while planning leaves the watermark and gaps as they were, for the next tick to retry', async () => {
  await schedule('0 * * * *');
  await setWatermark(at('10:30:00'));
  await db.query('ALTER TABLE slots ADD CONSTRAINT refuse_inserts CHECK (false) NOT VALID');
  await expect(planAhead(db, NOW)).rejects.toThrow();
  expect(await watermark()).toEqual(at('10:30:00'));
  expect(await gaps()).toEqual([]);
});

test('one bad cron is skipped; the other workflows are planned and the watermark advances', async () => {
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES (101, 10, '.github/workflows/b.yml', 'b')`);
  await schedule('not a cron', 101);
  await schedule('0 * * * *');
  await setWatermark(at('15:29:30'));
  await planAhead(db, NOW);
  expect((await db.query(`SELECT DISTINCT workflow_id FROM slots`)).rows).toEqual([{ workflow_id: 100 }]);
  expect(await watermark()).toEqual(at('17:29:30'));
});

test('settle: a never-tried expiry says Cronkick did not send it; a retried one keeps GitHub’s note', async () => {
  const insert = (attempts: number, note: string | null) => db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, attempts, response_status, response_note)
     VALUES (1, 10, 100, $1, $1, $2, $1, $3, $4, $5)`,
    [new Date(NOW.getTime() - (10 + attempts) * 60_000), new Date(NOW.getTime() - 300_000), attempts, note && 503, note],
  );
  await insert(0, null);
  await insert(1, 'Service unavailable');
  await settle(db, NOW);
  const { rows } = await db.query(`SELECT attempts, state, response_note FROM slots ORDER BY attempts`);
  expect(rows).toEqual([
    { attempts: 0, state: 'expired', response_note: "Cronkick didn't send it before its deadline" },
    { attempts: 1, state: 'expired', response_note: 'Service unavailable' },
  ]);
});

test('gap alerts: one email per Pro account with live schedules; deduped; a failed send is retried', async () => {
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await seed(db, { installationId: 3, repoId: 30, workflowId: 300, plan: 'free' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  for (const w of [100, 200, 300]) await schedule('0 * * * *', w);
  const gap = () => db.query(`INSERT INTO coverage_gaps (started_at, ended_at, detected_at) VALUES ($1, $2, $2)`, [at('10:30:00'), at('15:29:00')]);
  await gap();
  const f = fakeDeps(db, NOW);
  expect(await sendGapAlerts(f.deps)).toBe(2);
  expect(await sendGapAlerts(f.deps)).toBe(0);
  expect(f.sent[0].text).toMatch(/scheduler was down from 2026-11-10T10:30:00.000Z to 2026-11-10T15:29:00.000Z \(UTC\)/);
  await gap();
  f.setFailMail(true);
  expect(await sendGapAlerts(f.deps)).toBe(0);
  f.setFailMail(false);
  expect(await sendGapAlerts(f.deps)).toBe(2);
});

test('gap alerts skip an account created after the gap ended', async () => {
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev', created_at = $1`, [at('15:29:30')]);
  await schedule('0 * * * *');
  await db.query(`INSERT INTO coverage_gaps (started_at, ended_at, detected_at) VALUES ($1, $2, $2)`, [at('10:30:00'), at('15:29:00')]);
  expect(await sendGapAlerts(fakeDeps(db, NOW).deps)).toBe(0);
});

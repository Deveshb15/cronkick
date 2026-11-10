import { afterAll, beforeEach, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { claim, dispatchTick as queue, drain } from '../src/dispatcher.ts';
import { materialize, settle } from '../src/maintenance.ts';
import { DispatchTimeout, realGitHub } from '../src/github.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

let db: Db;
const dispatchTick = async (d: Parameters<typeof queue>[0]) => { const n = await queue(d); await drain(d); return n; };
beforeEach(async () => { db?.end(); db = await freshDb(); await seed(db); });
afterAll(() => db.end());

const T0 = new Date('2026-11-10T00:00:00Z');
const plus = (ms: number) => new Date(T0.getTime() + ms);

async function addSlot(dueMs = 0, deadlineMs = 300_000) {
  await db.query(
    `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at) VALUES (1, 10, 100, $1, $1, $2, $1)`,
    [plus(dueMs), plus(dueMs + deadlineMs)],
  );
}
const slot = async () => (await db.query('SELECT * FROM slots ORDER BY id LIMIT 1')).rows[0];

test('two dispatchers over 50 due slots fire each exactly once', async () => {
  for (let i = 0; i < 50; i++) await addSlot(-i * 1000);
  const a = fakeDeps(db, T0);
  const b = fakeDeps(db, T0);
  a.gh.delayMs = b.gh.delayMs = 5;
  await Promise.all([dispatchTick(a.deps), dispatchTick(b.deps), dispatchTick(a.deps), dispatchTick(b.deps)]);
  expect(a.gh.dispatches.length + b.gh.dispatches.length).toBe(50);
  const { rows } = await db.query(`SELECT state, count(*)::int AS n FROM slots GROUP BY state`);
  expect(rows).toEqual([{ state: 'fired', n: 50 }]);
});

test('503 then 204: one slot, two attempts, fired', async () => {
  await addSlot();
  const f = fakeDeps(db, T0);
  f.gh.responses = [{ status: 503 }, { status: 204 }];
  await dispatchTick(f.deps);
  expect((await slot()).state).toBe('pending');
  f.clock.now = plus(3000); // backoff is 2 s after attempt 1
  await dispatchTick(f.deps);
  expect(await slot()).toMatchObject({ state: 'fired', attempts: 2, response_status: 204 });
  expect(f.gh.dispatches).toHaveLength(2);
});

test('200 with a run id is accepted and linked', async () => {
  await addSlot();
  const f = fakeDeps(db, T0);
  f.gh.responses = [{ status: 200, runId: 555, runUrl: 'https://github.com/acme/app/actions/runs/555' }];
  await dispatchTick(f.deps);
  expect(await slot()).toMatchObject({ state: 'accepted', run_id: 555, matched_by: 'run_id' });
});

test('503 until the deadline: expired, never fired late', async () => {
  await addSlot(0, 10_000);
  const f = fakeDeps(db, T0);
  f.gh.responses = Array(20).fill({ status: 503 });
  for (let t = 0; t <= 20_000; t += 1000) {
    f.clock.now = plus(t);
    await dispatchTick(f.deps);
    await settle(db, f.clock.now);
  }
  const s = await slot();
  expect(s.state).toBe('expired');
  expect(f.gh.dispatches.length).toBeLessThan(5);
  expect(f.gh.dispatches.length).toBeGreaterThan(1);
});

test('timeout: unknown, and no second call', async () => {
  await addSlot();
  const f = fakeDeps(db, T0);
  f.gh.responses = [new DispatchTimeout('No response from GitHub within 10 s')];
  await dispatchTick(f.deps);
  f.clock.now = plus(5000);
  await dispatchTick(f.deps);
  expect(await slot()).toMatchObject({ state: 'unknown' });
  expect(f.gh.dispatches).toHaveLength(1);
});

test('crash mid-dispatch: lost lease becomes unknown, never re-fired', async () => {
  await addSlot();
  const f = fakeDeps(db, T0);
  await claim(f.deps); // claimed, then the process "dies" before calling GitHub
  f.clock.now = plus(61_000);
  await settle(db, f.clock.now);
  await dispatchTick(f.deps);
  expect((await slot()).state).toBe('unknown');
  expect(f.gh.dispatches).toHaveLength(0);
});

test('422 (no workflow_dispatch trigger): unknown with the response stored', async () => {
  await addSlot();
  const f = fakeDeps(db, T0);
  f.gh.responses = [{ status: 422, note: "Workflow does not have 'workflow_dispatch' trigger" }];
  await dispatchTick(f.deps);
  expect(await slot()).toMatchObject({ state: 'unknown', response_status: 422, response_note: expect.stringMatching(/workflow_dispatch/) });
});

test('slots of a removed installation are not claimed', async () => {
  await addSlot();
  await db.query('UPDATE installations SET removed = true');
  const f = fakeDeps(db, T0);
  expect(await dispatchTick(f.deps)).toBe(0);
});

test('materialize twice makes no duplicate slots', async () => {
  await db.query(`INSERT INTO schedules (workflow_id, cron) VALUES (100, '*/5 * * * *'), (100, '*/10 * * * *')`);
  expect(await materialize(db, T0)).toBe(24); // 2 h of */5; */10 collides
  expect(await materialize(db, T0)).toBe(0);
});

test('slots not yet due are not claimed', async () => {
  await addSlot(5000);
  const f = fakeDeps(db, T0);
  expect(await dispatchTick(f.deps)).toBe(0);
});

test('a slot queued behind slow calls is handed back, not fired on an expiring lease', async () => {
  await addSlot(-1000);
  await addSlot(0);
  const f = fakeDeps(db, T0);
  const orig = f.gh.dispatch.bind(f.gh);
  // The first call "takes" 50 s, leaving the second slot 10 s of its 60 s lease.
  f.gh.dispatch = async (...a) => { const r = await orig(...a); f.clock.now = plus(50_000); return r; };
  await dispatchTick(f.deps);
  expect(f.gh.dispatches).toHaveLength(1);
  const { rows } = await db.query(`SELECT state, attempts FROM slots ORDER BY due_at`);
  expect(rows).toEqual([{ state: 'fired', attempts: 1 }, { state: 'pending', attempts: 0 }]);
  await dispatchTick(f.deps); // picked up again on the next tick
  expect(f.gh.dispatches).toHaveLength(2);
});

test('a slow installation does not delay another installation', async () => {
  await seed(db, { installationId: 2, repoId: 20, workflowId: 200 });
  await addSlot();
  await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at) VALUES (2, 20, 200, $1, $1, $2, $1)`, [T0, plus(300_000)]);
  const f = fakeDeps(db, T0);
  const order: number[] = [];
  f.gh.dispatch = async (inst) => { if (inst === 1) await new Promise((r) => setTimeout(r, 200)); order.push(inst); return { status: 204 }; };
  await queue(f.deps);
  await new Promise((r) => setTimeout(r, 50));
  expect(order).toEqual([2]); // installation 2 already fired while 1 is still waiting on GitHub
  await drain(f.deps);
  expect(order).toEqual([2, 1]);
});

test('real client: an error without an HTTP response is a timeout; a real 503 is a status', async () => {
  const kit = (err: any) => realGitHub({ getInstallationOctokit: async () => ({ request: async () => { throw err; } }) } as any);
  // Octokit reports a dropped connection as status 500 with no response attached.
  await expect(kit({ status: 500, message: 'socket hang up' }).dispatch(1, 'a/b', 1, 'main')).rejects.toBeInstanceOf(DispatchTimeout);
  await expect(kit({ status: 503, message: 'busy', response: { headers: {}, data: { message: 'busy' } } }).dispatch(1, 'a/b', 1, 'main'))
    .resolves.toMatchObject({ status: 503 });
  const ok = realGitHub({ getInstallationOctokit: async () => ({ request: async () => ({ status: 200, data: { workflow_run_id: 7, html_url: 'u' } }) }) } as any);
  await expect(ok.dispatch(1, 'a/b', 1, 'main')).resolves.toEqual({ status: 200, runId: 7, runUrl: 'u' });
});

test('history older than 91 days is pruned', async () => {
  await addSlot(-92 * 86_400_000);
  await addSlot(-1000);
  await settle(db, T0);
  expect((await db.query('SELECT count(*)::int AS n FROM slots')).rows[0].n).toBe(1);
});

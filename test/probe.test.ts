import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import { CAP_ERROR, collectProbes, probePairs, probeReport } from '../src/probe/collector.ts';
import { probeSample } from '../web/lib/format.ts';
import { assignRuns, lateness } from '../src/probe/stats.ts';
import { freshDb } from './helpers.ts';

test('p50 and p95 by nearest rank', () => {
  const s = lateness([60, 120, 180, 600, 2400], 5);
  expect(s).toMatchObject({ p50Sec: 180, p95Sec: 2400, missingShare: 0 });
});

test('12 expected, 9 ran: 25% missing with denominator 12', () => {
  expect(lateness(Array(9).fill(30), 12)).toMatchObject({ expected: 12, ran: 9, missingShare: 0.25 });
});

test('no data: nulls, not zeros', () => {
  expect(lateness([], 0)).toEqual({ expected: 0, ran: 0, missingShare: 0, p50Sec: null, p95Sec: null });
});

test('runs are assigned to the latest free slot, never overstating lateness', () => {
  const at = (s: string) => new Date(`2026-11-10T${s}Z`);
  const a = assignRuns('*/5 * * * *', [{ id: 1, createdAt: at('00:07:00') }, { id: 2, createdAt: at('00:08:00') }]);
  expect(a.map((x) => [x.id, x.dueAt.toISOString().slice(11, 19)])).toEqual([[1, '00:05:00'], [2, '00:00:00']]);
});

test('a run exactly at due maps to that slot', () => {
  const [a] = assignRuns('0 * * * *', [{ id: 1, createdAt: new Date('2026-11-10T03:00:00Z') }]);
  expect(a.dueAt.toISOString()).toBe('2026-11-10T03:00:00.000Z');
});

describe('collector health and report', () => {
  let db: Db;
  beforeEach(async () => { await db?.end(); db = await freshDb(); });
  afterAll(() => db.end());

  const at = (s: string) => new Date(`2026-11-10T${s}Z`);
  const HOURLY = '.github/workflows/hourly.yml';
  const run = (id: number, created: string, path = HOURLY, extra: object = {}) => ({ id, path, event: 'schedule', created_at: at(created).toISOString(), repository: { private: true }, ...extra });
  const filler = (n: number, created: string, from = 1000) => Array.from({ length: n }, (_, i) => run(from + i, created, 'other.yml'));
  /** Run-list pages in order; a number is an HTTP error status. `workflows` answers the workflow-list call. */
  const github = (pages: (unknown[] | number)[], workflows: { path: string; state: string }[] | number = []) => {
    const calls: string[] = [];
    const signals: unknown[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      if (url.includes('/actions/workflows')) {
        return typeof workflows === 'number' ? new Response('', { status: workflows }) : new Response(JSON.stringify({ workflows }));
      }
      calls.push(url);
      signals.push(init?.signal);
      const p = pages.shift() ?? [];
      return typeof p === 'number' ? new Response('', { status: p }) : new Response(JSON.stringify({ workflow_runs: p }));
    }) as unknown as typeof fetch;
    return { fn, calls, signals };
  };
  const health = async () => (await db.query('SELECT * FROM probe_health')).rows;

  test('a full check advances last complete success', async () => {
    const g = github([[run(1, '09:01:00'), run(2, '08:01:00')]]);
    await collectProbes(db, ['acme/p'], 't', g.fn, at('10:00:00'));
    expect(await health()).toEqual([expect.objectContaining({ repo: 'acme/p', private: true, last_success_at: at('10:00:00'), last_error: null })]);
    expect(g.signals[0]).toBeInstanceOf(AbortSignal); // every GitHub call has a timeout
  });

  test('a page that reaches the last complete check ends paging as complete', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '09:01:00')]]).fn, at('10:00:00'));
    const g = github([[...filler(99, '11:30:00'), run(2, '08:59:00', 'other.yml')]]); // full page, oldest before 10:00 - 1 h
    await collectProbes(db, ['acme/p'], 't', g.fn, at('12:00:00'));
    expect(g.calls).toHaveLength(1);
    expect((await health())[0].last_success_at).toEqual(at('12:00:00'));
  });

  test('page 2 fails: page-1 runs are stored, the error is recorded, success and expected stay put', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '09:01:00'), run(2, '08:01:00'), run(3, '07:01:00'), run(4, '06:01:00')]]).fn, at('10:00:00'));
    const newer = [14, 13, 12, 11, 10].map((h, i) => run(10 + i, `${h}:01:00`));
    await collectProbes(db, ['acme/p'], 't', github([[...filler(95, '14:30:00'), ...newer], 502]).fn, at('15:00:00'));
    expect((await db.query(`SELECT count(*)::int AS n FROM probe_runs WHERE workflow = $1`, [HOURLY])).rows[0].n).toBe(9);
    expect(await health()).toEqual([expect.objectContaining({ last_success_at: at('10:00:00'), last_error: 'GitHub returned 502', last_error_at: at('15:00:00') })]);
    const r = await probeReport(db, ['acme/p'], at('15:00:00'));
    const hourly = r.schedules.find((s) => s.cron === '0 * * * *')!;
    expect(hourly.stats).toMatchObject({ expected: 4, ran: 4, missingShare: 0 }); // 06:00..09:00; nothing after 10:00 - 1 h counts
    expect(r.repos[0]).toMatchObject({ from: at('06:00:00'), until: at('09:00:00'), error: 'GitHub returned 502' });
  });

  // Pairs: GitHub's hourly probe against its Cronkick twin, inserted directly. Times on Nov 10, last check at `check`.
  const GH = HOURLY, CK = '.github/workflows/cronkick-hourly.yml';
  const pairDb = async (check: string, rows: [string, string, string][], states: Record<string, string> = {}, sampleFrom: string | null = null) => {
    await db.query('INSERT INTO probe_health (repo, private, last_attempt_at, last_success_at, sample_from) VALUES ($1, false, $2, $2, $3)',
      ['acme/p', at(check), sampleFrom && at(sampleFrom)]);
    for (const [i, [wf, due, started]] of rows.entries()) {
      await db.query('INSERT INTO probe_runs (run_id, repo, workflow, cron, due_at, started_at) VALUES ($1, $2, $3, $4, $5, $6)', [i + 1, 'acme/p', wf, '0 * * * *', at(due), at(started)]);
    }
    for (const [path, state] of Object.entries(states)) await db.query('INSERT INTO probe_workflows VALUES ($1, $2, $3, $4)', ['acme/p', path, state, at(check)]);
    const now = at(check);
    return (await probePairs(db, await probeReport(db, ['acme/p'], now), now)).find((x) => x.cron === '0 * * * *')!;
  };
  const hourly = (wf: string, from: number, to: number, lateS: number, skip: number[] = []) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((h) => !skip.includes(h))
      .map((h): [string, string, string] => [wf, `${String(h).padStart(2, '0')}:00:00`, `${String(h).padStart(2, '0')}:${String(Math.floor(lateS / 60)).padStart(2, '0')}:${String(lateS % 60).padStart(2, '0')}`]);

  test('pairs: both sides are counted over the same window, from the later first run to the last check less an hour', async () => {
    // GitHub from 02:00 (late, skipping 10:00-12:00), Cronkick twin from 06:00 on time; last check 21:00, so until 20:00.
    const p = await pairDb('21:00:00', [...hourly(GH, 2, 20, 600, [10, 11, 12]), ...hourly(CK, 6, 20, 1)]);
    expect(p).toMatchObject({ state: 'compared', from: at('06:00:00'), until: at('20:00:00'), hours: 14, isPublic: true });
    expect(p.github.stats).toMatchObject({ expected: 15, ran: 12, p50Sec: 600 });
    expect(p.cronkick.stats).toMatchObject({ expected: 15, ran: 15, p50Sec: 1 });
    expect(p.ticks).toHaveLength(15);
    expect(p.ticks[4]).toEqual({ due: at('10:00:00'), github: null, cronkick: 1 }); // the same instants for both strips
  });

  test('pairs: under 6 h of shared time is collecting, with how long so far', async () => {
    const short = await pairDb('21:00:00', [...hourly(GH, 2, 20, 600), ...hourly(CK, 16, 20, 1)]);
    expect(short).toMatchObject({ state: 'collecting', hours: 4 });
    expect(short.reason).toMatch(/4 h so far/);
  });

  test('pairs: no twin runs yet is collecting', async () => {
    const p = await pairDb('21:00:00', hourly(GH, 2, 20, 600));
    expect(p).toMatchObject({ state: 'collecting', reason: 'The Cronkick twin has no runs yet' });
  });

  test('pairs: a schedule GitHub turned off is paused, with no numbers', async () => {
    const p = await pairDb('21:00:00', [...hourly(GH, 2, 20, 600), ...hourly(CK, 2, 20, 1)], { [GH]: 'disabled_inactivity', [CK]: 'active' });
    expect(p).toMatchObject({ state: 'paused', reason: 'The GitHub schedule: workflow was turned off by GitHub after 60 days without commits, so this pair isn’t counted until it runs again' });
    expect(p.github.stats.expected).toBe(0);
  });

  test('pairs: the sample start bounds the window when it is later than both first runs', async () => {
    const p = await pairDb('21:00:00', [...hourly(GH, 2, 20, 600), ...hourly(CK, 2, 20, 1)], {}, '09:30:00');
    expect(p).toMatchObject({ state: 'compared', from: at('09:30:00') });
    expect(p.cronkick.stats.expected).toBe(11); // 10:00 .. 20:00
  });

  test('before any complete check, a partial attempt never moves the boundary, so a retry cannot fake completeness', async () => {
    await db.query(`INSERT INTO probe_runs (run_id, repo, workflow, cron, due_at, started_at) VALUES (1, 'acme/p', $1, '0 * * * *', $2, $3)`,
      [HOURLY, at('00:00:00'), at('00:01:00')]); // legacy data, no health row yet
    const page1 = () => [...filler(97, '12:30:00'), run(10, '12:01:00'), run(11, '11:01:00'), run(12, '10:01:00')];
    await collectProbes(db, ['acme/p'], 't', github([page1(), 502]).fn, at('13:00:00'));
    const g = github([page1(), 502]);
    await collectProbes(db, ['acme/p'], 't', g.fn, at('13:05:00'));
    expect(g.calls).toHaveLength(2); // 10:01 is still newer than 00:01 - 1 h, so paging went on
    expect(await health()).toEqual([expect.objectContaining({ last_success_at: null, bootstrap_at: at('00:01:00'), last_error: 'GitHub returned 502' })]);
  });

  test('after a complete check, hitting the page cap is recorded as incomplete and does not advance success', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '05:01:00')]]).fn, at('06:00:00'));
    const g = github(Array.from({ length: 10 }, (_, p) => filler(100, '09:00:00', p * 100)));
    await collectProbes(db, ['acme/p'], 't', g.fn, at('10:00:00'));
    expect(g.calls).toHaveLength(10);
    expect(await health()).toEqual([expect.objectContaining({ last_success_at: at('06:00:00'), last_error: CAP_ERROR })]);
  });

  test('a new repo with more history than the cap: the capped first read is complete and it contributes', async () => {
    // 1,500 hourly runs on GitHub, newest first; nothing stored yet.
    const all = Array.from({ length: 1500 }, (_, i) => ({ ...run(1 + i, '09:01:00'), created_at: new Date(at('09:01:00').getTime() - i * 3_600_000).toISOString() }));
    const g = github(Array.from({ length: 15 }, (_, p) => all.slice(p * 100, p * 100 + 100)));
    await collectProbes(db, ['acme/p'], 't', g.fn, at('10:00:00'));
    expect(g.calls).toHaveLength(10);
    expect(await health()).toEqual([expect.objectContaining({ last_success_at: at('10:00:00'), last_error: null })]);
    expect(await probeReport(db, ['acme/p'], at('10:00:00'))).toMatchObject({ contributing: 1 });
  });

  test('failed first imports, then a capped recovery that does not reach the oldest: no unexamined stretch counts as misses', async () => {
    // One run every 5 min, newest first, ending at `end`; every 12th is the hourly probe. 1,000 runs span ~3.5 days.
    const runs = (n: number, end: Date, id0: number) => Array.from({ length: n }, (_, i) => ({
      ...run(id0 + i, '00:00:00', i % 12 === 0 ? HOURLY : 'other.yml'), created_at: new Date(end.getTime() - i * 300_000).toISOString(),
    }));
    await collectProbes(db, ['acme/p'], 't', github([runs(100, new Date('2026-11-05T12:01:00Z'), 1), 502]).fn, new Date('2026-11-05T12:30:00Z'));
    // A second failed import that the recovery read *does* overlap must not keep the Nov 5 rows alive.
    const recent = runs(1000, new Date('2026-11-10T12:01:00Z'), 10_000);
    await collectProbes(db, ['acme/p'], 't', github([recent.slice(300, 400), 502]).fn, new Date('2026-11-09T12:30:00Z'));
    // Five days later the newest 1,000 runs reach back only to ~Nov 6 22:00, never to the Nov 5 rows.
    await collectProbes(db, ['acme/p'], 't', github(Array.from({ length: 10 }, (_, p) => recent.slice(p * 100, p * 100 + 100))).fn, new Date('2026-11-10T13:00:00Z'));
    const r = await probeReport(db, ['acme/p'], new Date('2026-11-10T13:00:00Z'));
    expect(r.repos[0]).toMatchObject({ live: true, error: null, lastSuccessAt: new Date('2026-11-10T13:00:00Z') });
    const hourly = r.schedules.find((s) => s.cron === '0 * * * *')!;
    expect(hourly.stats.missingShare).toBe(0); // the disconnected Nov 5 rows are gone, not counted against GitHub
  });

  const TWIN = '.github/workflows/cronkick-hourly.yml';
  const dispatched = (id: number, created: string, login = 'cronkick[bot]') =>
    run(id, created, TWIN, { event: 'workflow_dispatch', triggering_actor: { login, type: login.endsWith('[bot]') ? 'Bot' : 'User' } });
  const stored = async () => (await db.query('SELECT run_id, workflow FROM probe_runs ORDER BY run_id')).rows;

  test('twins count only runs Cronkick dispatched; GitHub probes only runs its scheduler started', async () => {
    const page = [dispatched(1, '09:00:02'), dispatched(2, '08:30:00', 'someone'), run(3, '09:01:00'), run(4, '08:02:00', HOURLY, { event: 'workflow_dispatch' })];
    await collectProbes(db, ['acme/p'], 't', github([page]).fn, at('10:00:00'));
    expect(await stored()).toEqual([{ run_id: 1, workflow: TWIN }, { run_id: 3, workflow: HOURLY }]);
  });

  test('a visibility change restarts the sample: earlier runs go, runs created before it are not stored', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '08:01:00')]]).fn, at('09:00:00'));
    const pub = { repository: { private: false } };
    // The repo went public: the check at 10:00:30 sees it, drops run 1 and does not store run 2 (created before).
    await collectProbes(db, ['acme/p'], 't', github([[run(2, '09:01:00', HOURLY, pub)]]).fn, at('10:00:30'));
    expect(await stored()).toEqual([]);
    expect((await health())[0]).toMatchObject({ private: false, sample_from: at('10:00:30') });
    // Runs after the change are measured as usual, and the same visibility doesn't restart again.
    await collectProbes(db, ['acme/p'], 't', github([[run(3, '11:01:00', HOURLY, pub), run(2, '09:01:00', HOURLY, pub)]]).fn, at('11:30:00'));
    expect(await stored()).toEqual([{ run_id: 3, workflow: HOURLY }]);
    expect((await health())[0]).toMatchObject({ sample_from: at('10:00:30') });
  });

  test('workflow states are recorded; a change clears that workflow\'s runs; a failed read keeps the last state', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '09:01:00')]], [{ path: HOURLY, state: 'active' }]).fn, at('10:00:00'));
    const states = async () => Object.fromEntries((await db.query('SELECT path, state FROM probe_workflows')).rows.map((r) => [r.path, r.state]));
    expect(await states()).toMatchObject({ [HOURLY]: 'active', [TWIN]: 'missing' });
    await collectProbes(db, ['acme/p'], 't', github([[]], [{ path: HOURLY, state: 'disabled_inactivity' }]).fn, at('10:05:00'));
    expect(await states()).toMatchObject({ [HOURLY]: 'disabled_inactivity' });
    expect(await stored()).toEqual([]);
    await collectProbes(db, ['acme/p'], 't', github([[]], 500).fn, at('10:10:00'));
    expect(await states()).toMatchObject({ [HOURLY]: 'disabled_inactivity' });
  });

  test('a repo that never succeeded is in the inventory with zero contribution and its error', async () => {
    await collectProbes(db, ['acme/broken'], 't', github([500]).fn, at('10:00:00'));
    const r = await probeReport(db, ['acme/broken'], at('10:00:00'));
    expect(r).toMatchObject({ configured: 1, contributing: 0, checkedAt: null });
    expect(r.repos).toEqual([expect.objectContaining({ repo: 'acme/broken', expected: 0, ran: 0, error: 'GitHub returned 500', errorAt: at('10:00:00') })]);
  });

  test('a healthy repo plus a never-fetched one: configured 2, contributing 1, disclosed in the sample', async () => {
    await collectProbes(db, ['acme/p'], 't', github([[run(1, '09:01:00'), run(2, '08:01:00')]]).fn, at('10:00:00'));
    const r = await probeReport(db, ['acme/p', 'acme/new'], at('10:03:00'));
    expect(r).toMatchObject({ configured: 2, contributing: 1, checkedAt: at('10:00:00') });
    expect(r.repos[1]).toMatchObject({ repo: 'acme/new', expected: 0, lastSuccessAt: null, error: null });
    expect(probeSample(r, at('10:03:00'))).toBe('1 of 2 probe repos reporting · private · since Nov 10, 08:00 UTC · last complete check 3 min ago');
  });
});

import type { Db } from '../db.ts';
import { assignRuns, dueTimes, GRACE_MS, lateness, PROBE_WORKFLOWS, type Lateness, type ProbeWorkflow } from './stats.ts';

const WINDOW_MS = 7 * 24 * 60 * 60_000;
const PAGES = 10;
export const CAP_ERROR = 'incomplete: hit the 1,000-run cap';

/**
 * Read recent scheduled runs of our own probe repos (R16). Lateness is measured to `created_at`,
 * when GitHub's scheduler created the run, so runner queue time doesn't count against it.
 * A check is complete only if every page succeeded and paging reached what earlier checks covered (or the end)
 * before the cap, or, with nothing stored before, read all the pages; only then does `last_success_at` advance. Runs from a partial check are still stored.
 */
/** The app's bot login: Cronkick's dispatches show it as the run's triggering actor. */
const appBot = () => `${process.env.GITHUB_APP_SLUG ?? 'cronkick'}[bot]`;

/** Whether a run counts for a probe workflow: GitHub's scheduler for a GitHub probe, Cronkick's own dispatch for a twin. */
export const countsFor = (wf: ProbeWorkflow, run: any, bot = appBot()) => run.path === wf.file
  && (wf.via === 'github' ? run.event === 'schedule' : run.event === 'workflow_dispatch' && run.triggering_actor?.login === bot);

export async function collectProbes(db: Db, repos: string[], token: string, fetchFn: typeof fetch = fetch, now = new Date()): Promise<void> {
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' };
  for (const repo of repos) {
    await recordWorkflowStates(db, repo, headers, fetchFn, now);
    // Runs come newest first. Stop once a page reaches runs created before the last complete check (or, before the
    // first one, the newest run stored before the first attempt, saved then), less the grace hour for runs GitHub lists a little late.
    await db.query(
      `INSERT INTO probe_health (repo, last_attempt_at, bootstrap_at) VALUES ($1, $2, (SELECT max(started_at) FROM probe_runs WHERE repo = $1))
       ON CONFLICT (repo) DO NOTHING`,
      [repo, now],
    );
    const h = (await db.query('SELECT coalesce(last_success_at, bootstrap_at) AS b FROM probe_health WHERE repo = $1', [repo])).rows[0].b as Date | null;
    const boundary = h ? h.getTime() - GRACE_MS : null;
    const runs: any[] = [];
    let complete = false;
    let error: string | null = null;
    try {
      for (let page = 1; page <= PAGES && !complete; page++) {
        // Every event: GitHub probes are `schedule` runs, their Cronkick twins `workflow_dispatch` ones (countsFor).
        const res = await fetchFn(`https://api.github.com/repos/${repo}/actions/runs?per_page=100&page=${page}`, {
          headers,
          signal: AbortSignal.timeout(15_000), // a hung GitHub call must not hold up the loop it runs in
        });
        if (!res.ok) { error = `GitHub returned ${res.status}`; break; }
        const batch: any[] = (await res.json()).workflow_runs ?? [];
        runs.push(...batch);
        // With nothing stored before, a capped read is still contiguous from the newest run, and the report
        // counts only from the first stored run, so the last page completes the check.
        complete = batch.length < 100 || (boundary !== null ? new Date(batch[batch.length - 1].created_at).getTime() <= boundary : page === PAGES);
      }
      // Never completed before: rows from earlier failed partial attempts may sit past an unexamined stretch, and a
      // newer partial overlapping this read proves nothing about older ones. Keep only what this capped read covers.
      if (complete && boundary === null && runs.length >= PAGES * 100) {
        await db.query('DELETE FROM probe_runs WHERE repo = $1 AND started_at < $2', [repo, new Date(runs[runs.length - 1].created_at)]);
      }
      if (!complete && !error) error = CAP_ERROR;
    } catch (e) {
      error = `check failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (error) console.error(`probe ${repo}: ${error}`);
    // A visibility change restarts the sample: what was measured before was measured under other conditions.
    const vis = runs[0]?.repository?.private;
    const was = (await db.query('SELECT private, sample_from FROM probe_health WHERE repo = $1', [repo])).rows[0];
    if (typeof vis === 'boolean' && was.private !== null && was.private !== vis) {
      await db.query('DELETE FROM probe_runs WHERE repo = $1', [repo]);
      await db.query('UPDATE probe_health SET sample_from = $2 WHERE repo = $1', [repo, now]);
      was.sample_from = now;
    }
    const from = was.sample_from ? new Date(was.sample_from).getTime() : -Infinity;
    for (const wf of PROBE_WORKFLOWS) {
      const taken = (await db.query('SELECT run_id, due_at FROM probe_runs WHERE repo = $1 AND workflow = $2', [repo, wf.file])).rows;
      const known = new Set(taken.map((r) => r.run_id));
      const fresh = runs.filter((r) => countsFor(wf, r) && !known.has(r.id) && new Date(r.created_at).getTime() >= from)
        .map((r) => ({ id: r.id, createdAt: new Date(r.created_at) }));
      // Re-assign with already-stored slots marked taken by feeding them in as earlier runs.
      const stored = taken.map((t, i) => ({ id: -1 - i, createdAt: new Date(t.due_at) }));
      for (const a of assignRuns(wf.cron, [...stored, ...fresh]).filter((a) => a.id > 0)) {
        await db.query(
          `INSERT INTO probe_runs (run_id, repo, workflow, cron, due_at, started_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
          [a.id, repo, wf.file, wf.cron, a.dueAt, a.createdAt],
        );
      }
    }
    await db.query(
      `INSERT INTO probe_health (repo, private, last_attempt_at, last_success_at, last_error, last_error_at)
       VALUES ($1, $2, $3, CASE WHEN $4::text IS NULL THEN $3::timestamptz END, $4, CASE WHEN $4::text IS NOT NULL THEN $3::timestamptz END)
       ON CONFLICT (repo) DO UPDATE SET
         private = coalesce(EXCLUDED.private, probe_health.private), last_attempt_at = EXCLUDED.last_attempt_at,
         last_success_at = coalesce(EXCLUDED.last_success_at, probe_health.last_success_at),
         last_error = coalesce(EXCLUDED.last_error, probe_health.last_error), last_error_at = coalesce(EXCLUDED.last_error_at, probe_health.last_error_at)`,
      [repo, runs[0]?.repository?.private ?? null, now, error],
    );
  }
}

/**
 * Each probe workflow's state on GitHub (one request). When a state changes, that workflow's runs are cleared: due
 * times while GitHub had it switched off must never count as runs it skipped. A failed read keeps the last state.
 */
async function recordWorkflowStates(db: Db, repo: string, headers: Record<string, string>, fetchFn: typeof fetch, now: Date): Promise<void> {
  let list: { path: string; state: string; created_at?: string }[];
  try {
    const res = await fetchFn(`https://api.github.com/repos/${repo}/actions/workflows?per_page=100`, { headers, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    list = (await res.json()).workflows ?? [];
  } catch (e) {
    console.error(`probe ${repo}: workflow states: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  for (const wf of PROBE_WORKFLOWS) {
    const found = list.find((w) => w.path === wf.file);
    const state = found?.state ?? 'missing';
    const prev = (await db.query('SELECT state FROM probe_workflows WHERE repo = $1 AND path = $2', [repo, wf.file])).rows[0]?.state;
    if (prev && prev !== state) await db.query('DELETE FROM probe_runs WHERE repo = $1 AND workflow = $2', [repo, wf.file]);
    await db.query(
      `INSERT INTO probe_workflows (repo, path, state, checked_at, created_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (repo, path) DO UPDATE SET state = EXCLUDED.state, checked_at = EXCLUDED.checked_at, created_at = EXCLUDED.created_at`,
      [repo, wf.file, state, now, found?.created_at ? new Date(found.created_at) : null],
    );
  }
}

/** One configured probe repo: the window it's counted over, whether it contributes (`live`), and whether its last check failed. */
export type ProbeRepo = {
  repo: string; private: boolean | null; live: boolean; from: Date | null; until: Date | null; expected: number; ran: number;
  lastSuccessAt: Date | null; error: string | null; errorAt: Date | null;
};
export type ProbeSchedule = { cron: string; file: string; via: 'github' | 'cronkick'; repos: number; stats: Lateness; since: Date | null };
/**
 * `configured` is every repo in PROBE_REPOS; `contributing` the ones with expected slots. `checkedAt` is the
 * oldest last complete check among contributing repos, so one fresh repo can't hide a stale one.
 */
export type ProbeReport = { configured: number; contributing: number; repos: ProbeRepo[]; schedules: ProbeSchedule[]; checkedAt: Date | null };

/**
 * Last 7 days per probe schedule. Each repo counts from its first stored scheduled time to its last complete check
 * minus the grace hour; time after that wasn't fully examined, so it isn't counted either way.
 */
export async function probeReport(db: Db, configured: string[], now: Date): Promise<ProbeReport> {
  const health = new Map((await db.query('SELECT * FROM probe_health WHERE repo = ANY($1)', [configured])).rows.map((h) => [h.repo, h]));
  const repos: ProbeRepo[] = configured.map((repo) => {
    const h = health.get(repo);
    const current = h?.last_error_at && (!h.last_success_at || h.last_error_at > h.last_success_at);
    return {
      repo, private: h?.private ?? null, live: false, from: null, until: h?.last_success_at ? new Date(h.last_success_at.getTime() - GRACE_MS) : null,
      expected: 0, ran: 0, lastSuccessAt: h?.last_success_at ?? null, error: current ? h.last_error : null, errorAt: current ? h.last_error_at : null,
    };
  });
  const schedules: ProbeSchedule[] = [];
  for (const wf of PROBE_WORKFLOWS) {
    const { rows } = await db.query(
      `SELECT repo, due_at, started_at FROM probe_runs WHERE workflow = $1 AND due_at > $2 AND repo = ANY($3) ORDER BY due_at`,
      [wf.file, new Date(now.getTime() - WINDOW_MS), configured],
    );
    const byRepo = new Map<string, { due: Date; started: Date }[]>();
    for (const r of rows) byRepo.set(r.repo, [...(byRepo.get(r.repo) ?? []), { due: r.due_at, started: r.started_at }]);
    let expected = 0;
    let contributing = 0;
    const delays: number[] = [];
    let since: Date | null = null;
    for (const r of repos) {
      const list = byRepo.get(r.repo);
      if (!list || !r.until || list[0].due > r.until) continue;
      const first = list[0].due;
      const n = dueTimes(wf.cron, first, r.until).length;
      const counted = list.filter((x) => x.due <= r.until!);
      expected += n;
      contributing++;
      r.live = true;
      r.expected += n;
      r.ran += counted.length;
      if (!r.from || first < r.from) r.from = first;
      if (!since || first < since) since = first;
      for (const x of counted) delays.push((x.started.getTime() - x.due.getTime()) / 1000);
    }
    schedules.push({ cron: wf.cron, file: wf.file, via: wf.via, repos: contributing, stats: lateness(delays, expected), since });
  }
  const live = repos.filter((r) => r.live);
  const checkedAt = live.reduce<Date | null>((a, r) => (!a || r.lastSuccessAt! < a ? r.lastSuccessAt : a), null);
  return { configured: configured.length, contributing: live.length, repos, schedules, checkedAt };
}

/** A pair shows numbers once both sides share this much measured time; the home page waits for a full day. */
export const PAIR_MIN_HOURS = 6;
export const HOME_MIN_HOURS = 24;
/**
 * Time a newly added workflow gets to start running before its scheduled minutes count. GitHub's scheduler can take
 * a while to pick up a new `schedule:`; Cronkick reads the file on the push and runs it within seconds.
 */
export const START_GRACE_MS = { github: GRACE_MS, cronkick: 10 * 60_000 } as const;
const H = 3_600_000;

type Side = { file: string; stats: Lateness };
/**
 * One cron measured both ways in the same repo. `compared` has numbers; `collecting` and `paused` say why not
 * (`reason`). `ticks` are the latest shared due times, the same instants for both sides, for the strips.
 */
export type Pair = {
  cron: string; state: 'compared' | 'collecting' | 'paused'; reason: string | null;
  repo: string | null; isPublic: boolean; from: Date | null; until: Date | null; hours: number;
  /** When measuring starts (or started) and when the repo's sample began; known even before there are numbers. */
  startAt: Date | null; sampleFrom: Date | null;
  github: Side; cronkick: Side;
  ticks: { due: Date; github: number | null; cronkick: number | null }[];
};

const OFF: Record<string, string> = {
  disabled_inactivity: 'turned off by GitHub after 60 days without commits',
  disabled_manually: 'disabled on GitHub',
};

/**
 * Each probe cron, GitHub's `schedule:` against its Cronkick twin, over the time both were measured. The window starts
 * an hour after both workflow files were added (time for either to start running), or at the repo's sample start if
 * later, and ends at the last complete check less the grace hour. From then every scheduled minute counts for both
 * sides alike, so a side that doesn't start running is counted as not running. Without GitHub's creation dates (older
 * rows) the window starts at the later of the two sides' first runs.
 */
export async function probePairs(db: Db, r: ProbeReport, now: Date, n = 96): Promise<Pair[]> {
  const crons = [...new Set(PROBE_WORKFLOWS.map((w) => w.cron))];
  const out: Pair[] = [];
  for (const cron of crons) {
    const gh = PROBE_WORKFLOWS.find((w) => w.cron === cron && w.via === 'github')!;
    const ck = PROBE_WORKFLOWS.find((w) => w.cron === cron && w.via === 'cronkick')!;
    const pair: Pair = {
      cron, state: 'collecting', reason: null, repo: null, isPublic: false, from: null, until: null, hours: 0, startAt: null, sampleFrom: null,
      github: { file: gh.file, stats: lateness([], 0) }, cronkick: { file: ck.file, stats: lateness([], 0) }, ticks: [],
    };
    const ghDelays: number[] = [], ckDelays: number[] = [];
    let expected = 0;
    for (const repo of r.repos.filter((x) => x.until)) {
      const wfs = new Map((await db.query('SELECT path, state, created_at FROM probe_workflows WHERE repo = $1', [repo.repo])).rows.map((x) => [x.path, x]));
      const off = [gh, ck].map((w) => ({ w, why: OFF[wfs.get(w.file)?.state] })).find((x) => x.why);
      if (off) { Object.assign(pair, { state: 'paused', repo: repo.repo, reason: `The ${off.w.via === 'github' ? 'GitHub schedule:' : 'Cronkick'} workflow was ${off.why}, so this pair isn’t counted until it runs again` }); break; }
      if (wfs.get(ck.file)?.state === 'missing') { pair.reason ??= 'The Cronkick twin isn’t in the repo yet'; continue; }
      const sampleFrom = (await db.query('SELECT sample_from FROM probe_health WHERE repo = $1', [repo.repo])).rows[0]?.sample_from as Date | null;
      const added = [gh, ck].map((w) => wfs.get(w.file)?.created_at as Date | null | undefined);
      let start: number;
      if (added.every((d) => d)) start = Math.max(...[gh, ck].map((w, i) => added[i]!.getTime() + START_GRACE_MS[w.via]));
      else {
        const firsts = new Map((await db.query(
          'SELECT workflow, min(due_at) AS first FROM probe_runs WHERE repo = $1 AND workflow = ANY($2) AND due_at > $3 AND due_at <= $4 GROUP BY workflow',
          [repo.repo, [gh.file, ck.file], new Date(now.getTime() - 7 * 24 * H), repo.until],
        )).rows.map((x) => [x.workflow, new Date(x.first).getTime()]));
        if (!firsts.has(gh.file) || !firsts.has(ck.file)) {
          pair.reason ??= !firsts.has(ck.file) ? 'The Cronkick twin has no runs yet' : 'GitHub hasn’t started this schedule yet';
          continue;
        }
        start = Math.max(firsts.get(gh.file)!, firsts.get(ck.file)!);
      }
      const from = new Date(Math.max(start, sampleFrom?.getTime() ?? 0, now.getTime() - 7 * 24 * H));
      const until = repo.until!;
      pair.startAt ??= from;
      pair.sampleFrom ??= sampleFrom;
      pair.repo ??= repo.repo;
      pair.isPublic = repo.private === false;
      // Numbers start once the first scheduled minute after the start is an hour old: GitHub may create a run that late.
      if (until <= from || !dueTimes(cron, from, until).length) { pair.reason ??= `Measuring from ${from.toISOString().slice(11, 16)} UTC`; continue; }
      const dues = dueTimes(cron, from, until);
      const { rows } = await db.query(
        'SELECT workflow, due_at, started_at FROM probe_runs WHERE repo = $1 AND workflow = ANY($2) AND due_at >= $3 AND due_at <= $4',
        [repo.repo, [gh.file, ck.file], from, until],
      );
      const delay = (file: string) => new Map(rows.filter((x) => x.workflow === file).map((x) => [x.due_at.getTime(), (x.started_at.getTime() - x.due_at.getTime()) / 1000]));
      const g = delay(gh.file), c = delay(ck.file);
      ghDelays.push(...g.values()); ckDelays.push(...c.values());
      expected += dues.length;
      // The first repo with both sides draws the strips and sets the window shown.
      if (!pair.from) {
        Object.assign(pair, { repo: repo.repo, isPublic: repo.private === false, from, until, hours: (until.getTime() - from.getTime()) / H });
        pair.ticks = dues.slice(-n).map((d) => ({ due: d, github: g.get(d.getTime()) ?? null, cronkick: c.get(d.getTime()) ?? null }));
      }
    }
    if (pair.state !== 'paused' && pair.from) {
      pair.github.stats = lateness(ghDelays, expected);
      pair.cronkick.stats = lateness(ckDelays, expected);
      // Early numbers are shown, marked early, rather than an empty box.
      if (pair.hours >= PAIR_MIN_HOURS) Object.assign(pair, { state: 'compared', reason: null });
      else pair.reason = `${Math.max(0, Math.floor(pair.hours))} h measured so far; these numbers settle after ${PAIR_MIN_HOURS} h`;
    }
    out.push(pair);
  }
  return out;
}

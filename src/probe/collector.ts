import type { Db } from '../db.ts';
import { assignRuns, dueTimes, GRACE_MS, lateness, PROBE_WORKFLOWS, type Lateness } from './stats.ts';

const WINDOW_MS = 7 * 24 * 60 * 60_000;
const PAGES = 10;
export const CAP_ERROR = 'incomplete: hit the 1,000-run cap';

/**
 * Read recent scheduled runs of our own probe repos (R16). Lateness is measured to `created_at`,
 * when GitHub's scheduler created the run, so runner queue time doesn't count against it.
 * A check is complete only if every page succeeded and paging reached what earlier checks covered (or the end)
 * before the cap, or, with nothing stored before, read all the pages; only then does `last_success_at` advance. Runs from a partial check are still stored.
 */
export async function collectProbes(db: Db, repos: string[], token: string, fetchFn: typeof fetch = fetch, now = new Date()): Promise<void> {
  for (const repo of repos) {
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
        const res = await fetchFn(`https://api.github.com/repos/${repo}/actions/runs?event=schedule&per_page=100&page=${page}`, {
          headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
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
    for (const wf of PROBE_WORKFLOWS) {
      const taken = (await db.query('SELECT run_id, due_at FROM probe_runs WHERE repo = $1 AND workflow = $2', [repo, wf.file])).rows;
      const known = new Set(taken.map((r) => r.run_id));
      const fresh = runs.filter((r) => r.path === wf.file && !known.has(r.id)).map((r) => ({ id: r.id, createdAt: new Date(r.created_at) }));
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

/** One configured probe repo: the window it's counted over, whether it contributes (`live`), and whether its last check failed. */
export type ProbeRepo = {
  repo: string; private: boolean | null; live: boolean; from: Date | null; until: Date | null; expected: number; ran: number;
  lastSuccessAt: Date | null; error: string | null; errorAt: Date | null;
};
export type ProbeSchedule = { cron: string; repos: number; stats: Lateness; since: Date | null };
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
    schedules.push({ cron: wf.cron, repos: contributing, stats: lateness(delays, expected), since });
  }
  const live = repos.filter((r) => r.live);
  const checkedAt = live.reduce<Date | null>((a, r) => (!a || r.lastSuccessAt! < a ? r.lastSuccessAt : a), null);
  return { configured: configured.length, contributing: live.length, repos, schedules, checkedAt };
}

/** One expected run of GitHub's own scheduler: when it was due, and how late GitHub created it (null: it never ran). */
export type ProbeTick = { due: Date; delaySec: number | null };

/**
 * The latest `n` due times of each probe schedule in one contributing repo, with what GitHub did at each, up to that
 * repo's last complete check (later times weren't fully examined). The counts in `probeReport` cover every repo.
 */
export async function probeStrips(db: Db, r: ProbeReport, now: Date, n = 96): Promise<{ cron: string; ticks: ProbeTick[] }[]> {
  // ponytail: one repo's strip is enough to see the pattern; draw one per repo if the probes ever disagree.
  const repo = r.repos.find((x) => x.live);
  if (!repo?.until) return [];
  return Promise.all(PROBE_WORKFLOWS.map(async (wf) => {
    const { rows } = await db.query(
      'SELECT due_at, started_at FROM probe_runs WHERE repo = $1 AND workflow = $2 AND due_at > $3 AND due_at <= $4 ORDER BY due_at',
      [repo.repo, wf.file, new Date(now.getTime() - WINDOW_MS), repo.until],
    );
    if (!rows.length) return { cron: wf.cron, ticks: [] };
    const ran = new Map(rows.map((x) => [x.due_at.getTime(), (x.started_at.getTime() - x.due_at.getTime()) / 1000]));
    const ticks = dueTimes(wf.cron, rows[0].due_at, repo.until!).slice(-n).map((d) => ({ due: d, delaySec: ran.get(d.getTime()) ?? null }));
    return { cron: wf.cron, ticks };
  }));
}

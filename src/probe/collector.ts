import type { Db } from '../db.js';
import { assignRuns, dueTimes, GRACE_MS, lateness, PROBE_WORKFLOWS, type Lateness } from './stats.js';

const WINDOW_MS = 7 * 24 * 60 * 60_000;

/**
 * Read recent scheduled runs of our own probe repos (R16). Lateness is measured to `created_at`,
 * when GitHub's scheduler created the run, so runner queue time doesn't count against it.
 */
export async function collectProbes(db: Db, repos: string[], token: string, fetchFn: typeof fetch = fetch): Promise<void> {
  for (const repo of repos) {
    // Up to 10 pages (1,000 runs, about 3 days at */5), so a late start or an outage loses nothing.
    const runs: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const res = await fetchFn(`https://api.github.com/repos/${repo}/actions/runs?event=schedule&per_page=100&page=${page}`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      });
      if (!res.ok) { console.error(`probe ${repo}: ${res.status}`); break; }
      const batch: any[] = (await res.json()).workflow_runs ?? [];
      runs.push(...batch);
      if (batch.length < 100) break;
    }
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
  }
}

export type ProbeReport = { cron: string; repos: number; stats: Lateness; since: Date | null };

/** Last 7 days per probe schedule, counting from when each probe's data starts. */
export async function probeReport(db: Db, now: Date): Promise<ProbeReport[]> {
  const out: ProbeReport[] = [];
  for (const wf of PROBE_WORKFLOWS) {
    const { rows } = await db.query(
      `SELECT repo, due_at, started_at FROM probe_runs WHERE workflow = $1 AND due_at > $2 ORDER BY due_at`,
      [wf.file, new Date(now.getTime() - WINDOW_MS)],
    );
    const settledBefore = new Date(now.getTime() - GRACE_MS);
    const byRepo = new Map<string, { due: Date; started: Date }[]>();
    for (const r of rows) byRepo.set(r.repo, [...(byRepo.get(r.repo) ?? []), { due: r.due_at, started: r.started_at }]);
    let expected = 0;
    const delays: number[] = [];
    let since: Date | null = null;
    for (const list of byRepo.values()) {
      const first = list[0].due;
      if (!since || first < since) since = first;
      expected += dueTimes(wf.cron, first, settledBefore).length;
      for (const r of list) if (r.due <= settledBefore) delays.push((r.started.getTime() - r.due.getTime()) / 1000);
    }
    out.push({ cron: wf.cron, repos: byRepo.size, stats: lateness(delays, expected), since });
  }
  return out;
}

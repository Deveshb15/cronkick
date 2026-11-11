import type { Db } from './db.ts';
import type { Deps } from './deps.ts';
import { parseMarkers } from './markers.ts';
import { dueTimes, GRACE_MS, lateness, matchRuns } from './probe/stats.ts';

const PAGES = 3; // a day of an every-5-minutes schedule is 288 runs
const KEEP_MS = 48 * 60 * 60_000;
const WINDOW_MS = 24 * 60 * 60_000;
const MIN_DUE = 3;

/** Workflows still on GitHub's own `schedule:` that the dashboard offers to move: the ones worth measuring. */
const CANDIDATES = `
  SELECT w.id, w.suggested_diff, r.full_name, r.installation_id
    FROM workflows w JOIN repos r ON r.id = w.repo_id JOIN installations i ON i.id = r.installation_id
   WHERE w.present AND w.suggested_diff IS NOT NULL AND w.dismissed_at IS NULL AND w.flags = '[]'
     AND NOT EXISTS (SELECT 1 FROM schedules s WHERE s.workflow_id = w.id)
     AND r.active AND NOT i.removed AND NOT i.suspended`;
type Candidate = { id: number; suggested_diff: string; full_name: string; installation_id: number };

const cronsOf = (suggested: string) => parseMarkers(suggested).markers.map((m) => ({ cron: m.cron, tz: m.tz }));

/** Start watching a candidate, or start over when its crons changed: earlier runs say nothing about the new ones. */
async function watch(db: Db, c: Candidate, now: Date): Promise<void> {
  const crons = JSON.stringify(cronsOf(c.suggested_diff));
  const r = await db.query(
    `INSERT INTO schedule_watch (workflow_id, crons, since) VALUES ($1, $2, $3)
     ON CONFLICT (workflow_id) DO UPDATE SET crons = EXCLUDED.crons, since = EXCLUDED.since, last_complete_at = NULL, last_error = NULL, last_error_at = NULL
       WHERE schedule_watch.crons <> EXCLUDED.crons
     RETURNING workflow_id`,
    [c.id, crons, now],
  );
  if (r.rowCount) await db.query('DELETE FROM schedule_runs WHERE workflow_id = $1 AND created_at < $2', [c.id, now]);
}

async function store(db: Db, workflowId: number, runs: { id: number; createdAt: Date }[]): Promise<void> {
  if (!runs.length) return;
  await db.query(
    `INSERT INTO schedule_runs (run_id, workflow_id, created_at) SELECT id, $1, at FROM unnest($2::bigint[], $3::timestamptz[]) AS t(id, at)
     ON CONFLICT DO NOTHING`,
    [workflowId, runs.map((r) => r.id), runs.map((r) => r.createdAt)],
  );
}

/** A `workflow_run` webhook GitHub's own scheduler started, for a workflow still on it. Returns whether it was kept. */
export async function recordScheduledRun(db: Db, run: { id: number; workflow_id: number; event: string; created_at: string }, now: Date): Promise<boolean> {
  if (run.event !== 'schedule') return false;
  const c = (await db.query<Candidate>(`${CANDIDATES} AND w.id = $1`, [run.workflow_id])).rows[0];
  if (!c) return false;
  await watch(db, c, now);
  await store(db, c.id, [{ id: run.id, createdAt: new Date(run.created_at) }]);
  return true;
}

/**
 * Hourly: keep the watch list equal to the candidates, then read each one's scheduled runs from GitHub back to its
 * last complete read. A webhook can be lost; this read is what lets a due time with no run count as skipped.
 */
export async function watchSchedules(deps: Deps, now = deps.now()): Promise<void> {
  const { db } = deps;
  const cands = (await db.query<Candidate>(CANDIDATES)).rows;
  await db.query('DELETE FROM schedule_watch WHERE NOT (workflow_id = ANY($1::bigint[]))', [cands.map((c) => c.id)]);
  await db.query('DELETE FROM schedule_runs WHERE created_at < $1', [new Date(now.getTime() - KEEP_MS)]);
  for (const c of cands) {
    await watch(db, c, now);
    const w = (await db.query('SELECT since, last_complete_at FROM schedule_watch WHERE workflow_id = $1', [c.id])).rows[0];
    const stopAt = new Date((w.last_complete_at ?? w.since).getTime() - GRACE_MS);
    let error: string | null = null;
    try {
      const { runs, complete } = await deps.gh.listScheduledRuns(c.installation_id, c.full_name, c.id, stopAt, PAGES);
      await store(db, c.id, runs.filter((r) => r.createdAt >= stopAt));
      if (!complete) error = `incomplete: more than ${PAGES * 100} runs since the last check`;
    } catch (e) {
      error = `check failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (error) console.error(`schedule watch ${c.full_name} ${c.id}: ${error}`);
    if (error) await db.query('UPDATE schedule_watch SET last_error = $2, last_error_at = $3 WHERE workflow_id = $1', [c.id, error, now]);
    else await db.query('UPDATE schedule_watch SET last_complete_at = $2, last_error = NULL, last_error_at = NULL WHERE workflow_id = $1', [c.id, now]);
  }
}

/** What GitHub's scheduler did for one workflow: counts over a window, or still measuring since a time. */
export type Evidence =
  | { measuring: true; since: string }
  | { measuring: false; ran: number; due: number; p50Sec: number | null; from: string; until: string; fullDay: boolean };

/**
 * Evidence for an installation's watched workflows, keyed by workflow id. The window is the last 24 h, never before
 * measuring began, and ends at the last complete read less the grace hour: a due time after that might still get a
 * run, so it isn't counted either way. Fewer than 3 due times in a window shorter than a day is still measuring.
 */
export async function scheduleEvidence(db: Db, installationId: number, now: Date): Promise<Map<number, Evidence>> {
  const { rows } = await db.query(
    `SELECT sw.workflow_id, sw.since, sw.last_complete_at, w.suggested_diff
       FROM schedule_watch sw JOIN workflows w ON w.id = sw.workflow_id JOIN repos r ON r.id = w.repo_id
      WHERE r.installation_id = $1`,
    [installationId],
  );
  const dayAgo = new Date(now.getTime() - WINDOW_MS);
  const runs = rows.length
    ? (await db.query('SELECT workflow_id, created_at FROM schedule_runs WHERE workflow_id = ANY($1::bigint[]) AND created_at >= $2',
      [rows.map((r) => r.workflow_id), new Date(dayAgo.getTime() - GRACE_MS)])).rows
    : [];
  const out = new Map<number, Evidence>();
  for (const w of rows) {
    const since = new Date(w.since);
    const from = since > dayAgo ? since : dayAgo;
    const until = w.last_complete_at ? new Date(w.last_complete_at.getTime() - GRACE_MS) : null;
    if (!until || until <= from) { out.set(Number(w.workflow_id), { measuring: true, since: since.toISOString() }); continue; }
    // Due times from an hour before the window too, so a late run of an earlier due time isn't credited to a later one.
    const lead = new Date(from.getTime() - GRACE_MS);
    const dues = [...new Set(cronsOf(w.suggested_diff).flatMap((c) => dueTimes(c.cron, lead, until, c.tz).map((d) => d.getTime())))]
      .sort((a, b) => a - b).map((t) => new Date(t));
    const created = runs.filter((r) => Number(r.workflow_id) === Number(w.workflow_id) && r.created_at <= w.last_complete_at).map((r) => r.created_at);
    const delays = matchRuns(dues, created).filter((_, i) => dues[i] >= from);
    const fullDay = from.getTime() === dayAgo.getTime();
    if (!delays.length || (delays.length < MIN_DUE && !fullDay)) { out.set(Number(w.workflow_id), { measuring: true, since: since.toISOString() }); continue; }
    const s = lateness(delays.filter((d): d is number => d !== null), delays.length);
    out.set(Number(w.workflow_id), { measuring: false, ran: s.ran, due: s.expected, p50Sec: s.p50Sec, from: from.toISOString(), until: until.toISOString(), fullDay });
  }
  return out;
}

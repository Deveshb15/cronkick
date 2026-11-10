import type pg from 'pg';
import { PLANS, type PlanName } from '../../src/plans.ts';

/** Colour of one slot in the dashboard strips. */
export type Tick = 'ontime' | 'late' | 'missed' | 'idle';

/** Fired within 30 s is on time; fired later is late; unknown/expired count as missed; anything not run is idle. */
export function toTick(state: string, delayMs: number | null): Tick {
  if (state === 'fired' || state === 'accepted') return delayMs !== null && delayMs > 30_000 ? 'late' : 'ontime';
  if (state === 'unknown' || state === 'expired') return 'missed';
  return 'idle';
}

/** One due slot as the UI shows it. Times are ISO strings so client components can format them in local time. */
export type SlotView = {
  id: number; workflowId: number; due: string; state: string; tick: Tick;
  delayMs: number | null; runUrl: string | null; conclusion: string | null;
};
const slotView = (r: any): SlotView => {
  const delayMs = r.delay_ms === null ? null : Number(r.delay_ms);
  return { id: Number(r.id), workflowId: Number(r.workflow_id), due: new Date(r.due_at).toISOString(), state: r.state, tick: toTick(r.state, delayMs), delayMs, runUrl: r.run_url, conclusion: r.conclusion };
};

/** The last `n` due slots of every workflow in an installation, oldest first. No padding: the strip draws the empty span. */
export async function recentSlots(db: pg.Pool, installationId: number, now: Date, n = 48): Promise<Map<number, SlotView[]>> {
  const { rows } = await db.query(
    // Per workflow via the (workflow_id, due_at) index: reads ~n rows each, not the account's whole history.
    `SELECT s.id, s.workflow_id, s.due_at, s.state, s.run_url, s.conclusion, extract(epoch FROM s.first_attempt_at - s.due_at) * 1000 AS delay_ms
       FROM workflows w JOIN repos r ON r.id = w.repo_id
       CROSS JOIN LATERAL (SELECT * FROM slots WHERE workflow_id = w.id AND due_at <= $2 ORDER BY due_at DESC LIMIT $3) s
      WHERE r.installation_id = $1 AND s.installation_id = $1
      ORDER BY s.workflow_id, s.due_at`,
    [installationId, now, n],
  );
  const out = new Map<number, SlotView[]>();
  for (const r of rows) out.set(Number(r.workflow_id), [...(out.get(Number(r.workflow_id)) ?? []), slotView(r)]);
  return out;
}

export type Flag = { line?: number; message: string };
export type Schedule = { cron: string; tz: string; status: 'active' | 'paused_limit' };
export type WorkflowStatus = 'active' | 'limited' | 'needs_fix' | 'ready' | 'none';

/** What the dashboard calls a workflow's state. */
export function workflowStatus(w: { schedules: Schedule[]; flags: Flag[]; suggested_diff: string | null }): WorkflowStatus {
  if (w.flags.length) return 'needs_fix';
  if (w.schedules.some((s) => s.status === 'active')) return 'active';
  if (w.schedules.length) return 'limited';
  return w.suggested_diff ? 'ready' : 'none';
}

export type Installation = { id: number; account_login: string; account_type: string; plan: PlanName; alert_email: string | null };

export async function installationsFor(db: pg.Pool, ids: number[]): Promise<Installation[]> {
  const { rows } = await db.query('SELECT id, account_login, account_type, plan, alert_email FROM installations WHERE id = ANY($1) AND NOT removed ORDER BY account_login', [ids]);
  return rows;
}

/** Last-24-hour outcome counts. `missed` = unconfirmed + gave up. */
export type Counts24 = { due: number; onTime: number; late: number; unconfirmed: number; gaveUp: number; passed: number; failed: number };
const COUNTS_SQL = `
  count(*) FILTER (WHERE state <> 'skipped')::int AS due,
  count(*) FILTER (WHERE state IN ('fired', 'accepted') AND first_attempt_at - due_at <= interval '30 seconds')::int AS on_time,
  count(*) FILTER (WHERE state IN ('fired', 'accepted') AND first_attempt_at - due_at > interval '30 seconds')::int AS late,
  count(*) FILTER (WHERE state = 'unknown')::int AS unconfirmed,
  count(*) FILTER (WHERE state = 'expired')::int AS gave_up,
  count(*) FILTER (WHERE conclusion = 'success')::int AS passed,
  count(*) FILTER (WHERE conclusion IS NOT NULL AND conclusion NOT IN ('success', 'neutral', 'skipped'))::int AS failed`;
const counts = (r: any): Counts24 => ({
  due: r?.due ?? 0, onTime: r?.on_time ?? 0, late: r?.late ?? 0, unconfirmed: r?.unconfirmed ?? 0, gaveUp: r?.gave_up ?? 0, passed: r?.passed ?? 0, failed: r?.failed ?? 0,
});

/** One word for how a workflow (or a whole account) did in the last 24 h. */
export type Health = 'on_time' | 'late' | 'missed' | 'no_runs';
export const healthOf = (c: Counts24): Health => (c.unconfirmed + c.gaveUp ? 'missed' : c.late ? 'late' : c.due ? 'on_time' : 'no_runs');

export type WorkflowRow = {
  id: number; repo: string; name: string; path: string; flags: Flag[]; suggested_diff: string | null; schedules: Schedule[];
  status: WorkflowStatus; c24: Counts24; nextDue: string | null; dismissed: boolean;
};
export type RepoRow = { id: number; full_name: string; default_branch: string; workflows: WorkflowRow[] };
export type Verdict = 'nothing_scheduled' | 'needs_fix' | 'missed' | 'late' | 'on_time' | 'no_runs';
export type NextKick = { due: string; workflowId: number; workflow: string; repo: string; alsoDue: number } | null;

/** Everything the overview needs for one installation. All 24 h windows are due slots only: future pending slots aren't runs yet. */
export async function overview(db: pg.Pool, installationId: number, now: Date) {
  const repos = (await db.query<{ id: number; full_name: string; default_branch: string }>(
    'SELECT id, full_name, default_branch FROM repos WHERE installation_id = $1 AND active ORDER BY full_name', [installationId],
  )).rows;

  const workflows = (await db.query(
    `SELECT w.id, w.repo_id, w.name, w.path, w.flags, w.suggested_diff, w.dismissed_at IS NOT NULL AS dismissed,
            coalesce(json_agg(json_build_object('cron', s.cron, 'tz', s.tz, 'status', s.status) ORDER BY s.id)
                     FILTER (WHERE s.id IS NOT NULL), '[]') AS schedules
       FROM workflows w JOIN repos r ON r.id = w.repo_id LEFT JOIN schedules s ON s.workflow_id = w.id
      WHERE r.installation_id = $1 AND r.active AND w.present
      GROUP BY w.id ORDER BY w.path`, [installationId],
  )).rows;

  const day = `installation_id = $1 AND due_at > $2::timestamptz - interval '24 hours' AND due_at <= $2`;
  const [perWf, delays, next] = await Promise.all([
    db.query(`SELECT workflow_id, ${COUNTS_SQL} FROM slots WHERE ${day} GROUP BY workflow_id`, [installationId, now]),
    // Start delay of the slots Cronkick actually sent, in ms.
    db.query(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d) AS median, max(d) AS max
         FROM (SELECT extract(epoch FROM first_attempt_at - due_at) * 1000 AS d FROM slots
                WHERE ${day} AND state IN ('fired', 'accepted') AND first_attempt_at IS NOT NULL) x`,
      [installationId, now],
    ),
    db.query(
      `SELECT workflow_id, min(due_at) AS due FROM slots
        WHERE installation_id = $1 AND due_at > $2 AND state = 'pending' GROUP BY workflow_id`,
      [installationId, now],
    ),
  ]);
  const stats = new Map(perWf.rows.map((r) => [Number(r.workflow_id), counts(r)]));
  const nextBy = new Map(next.rows.map((r) => [Number(r.workflow_id), new Date(r.due)]));

  const out: RepoRow[] = repos.map((r) => ({ ...r, workflows: [] }));
  const byRepo = new Map(out.map((r) => [r.id, r]));
  for (const w of workflows) {
    const repo = byRepo.get(w.repo_id);
    if (!repo) continue;
    const n = nextBy.get(Number(w.id));
    repo.workflows.push({
      id: Number(w.id), repo: repo.full_name, name: w.name, path: w.path, flags: w.flags, suggested_diff: w.suggested_diff, schedules: w.schedules,
      status: workflowStatus(w), c24: stats.get(Number(w.id)) ?? counts(null), nextDue: n ? n.toISOString() : null, dismissed: w.dismissed,
    });
  }

  const all = out.flatMap((r) => r.workflows);
  const live = all.filter((w) => w.status === 'active');
  const c24 = live.reduce<Counts24>((a, w) => ({
    due: a.due + w.c24.due, onTime: a.onTime + w.c24.onTime, late: a.late + w.c24.late, unconfirmed: a.unconfirmed + w.c24.unconfirmed,
    gaveUp: a.gaveUp + w.c24.gaveUp, passed: a.passed + w.c24.passed, failed: a.failed + w.c24.failed,
  }), counts(null));

  // The soonest pending slot across active workflows, and how many others are due at that same moment.
  const upcoming = live.filter((w) => w.nextDue).sort((a, b) => a.nextDue!.localeCompare(b.nextDue!));
  const first = upcoming[0];
  const nextKick: NextKick = first ? {
    due: first.nextDue!, workflowId: first.id, workflow: first.name, repo: first.repo,
    alsoDue: upcoming.filter((w) => w.nextDue === first.nextDue).length - 1,
  } : null;

  const health = healthOf(c24);
  const verdict: Verdict = !live.length ? 'nothing_scheduled' : all.some((w) => w.status === 'needs_fix') ? 'needs_fix' : health === 'on_time' ? 'on_time' : health;
  const d = delays.rows[0];
  const totals = {
    activeSchedules: live.reduce((n, w) => n + w.schedules.filter((s) => s.status === 'active').length, 0),
    c24,
    medianDelayMs: d?.median == null ? null : Number(d.median),
    maxDelayMs: d?.max == null ? null : Number(d.max),
    nextKick,
    verdict,
  };
  return { repos: out, totals };
}

export type ActivityItem = SlotView & { workflow: string; repo: string };

/** The latest slots Cronkick acted on across an installation, newest first. */
export async function activity(db: pg.Pool, installationId: number, now: Date, limit = 8): Promise<ActivityItem[]> {
  const { rows } = await db.query(
    `SELECT s.id, s.workflow_id, s.due_at, s.state, s.run_url, s.conclusion,
            extract(epoch FROM s.first_attempt_at - s.due_at) * 1000 AS delay_ms, w.name AS workflow, r.full_name AS repo
       FROM slots s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = s.repo_id
      WHERE s.installation_id = $1 AND s.due_at <= $2 AND s.state NOT IN ('pending', 'dispatching', 'skipped')
      ORDER BY s.due_at DESC, s.id DESC LIMIT $3`,
    [installationId, now, limit],
  );
  return rows.map((r) => ({ ...slotView(r), workflow: r.workflow, repo: r.repo }));
}

/** Per account: active schedules and last-24-hour health, for the account switcher. */
export async function accountHealth(db: pg.Pool, ids: number[], now: Date): Promise<Map<number, { schedules: number; health: Health }>> {
  const [sched, slots] = await Promise.all([
    db.query(
      `SELECT r.installation_id AS id, count(*)::int AS n FROM schedules s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = w.repo_id
        WHERE r.installation_id = ANY($1) AND r.active AND w.present AND s.status = 'active' GROUP BY r.installation_id`, [ids],
    ),
    db.query(
      `SELECT installation_id AS id, ${COUNTS_SQL} FROM slots
        WHERE installation_id = ANY($1) AND due_at > $2::timestamptz - interval '24 hours' AND due_at <= $2 GROUP BY installation_id`, [ids, now],
    ),
  ]);
  const n = new Map(sched.rows.map((r) => [Number(r.id), r.n as number]));
  const c = new Map(slots.rows.map((r) => [Number(r.id), counts(r)]));
  return new Map(ids.map((id) => [id, { schedules: n.get(id) ?? 0, health: healthOf(c.get(id) ?? counts(null)) }]));
}

export const MAX_ROWS = 500;
export type HistoryFilter = 'late' | 'missed' | 'failed';
const FILTERS: Record<HistoryFilter, string> = {
  late: `state IN ('fired', 'accepted') AND first_attempt_at - due_at > interval '30 seconds'`,
  missed: `state IN ('unknown', 'expired')`,
  failed: `conclusion IS NOT NULL AND conclusion NOT IN ('success', 'neutral', 'skipped')`,
};

/** Slot history for one workflow, limited by plan and optionally filtered; null if it isn't in this installation. */
export async function workflowHistory(db: pg.Pool, installationId: number, workflowId: number, now: Date, filter?: HistoryFilter) {
  const w = (await db.query(
    `SELECT w.id, w.name, w.path, w.present, w.flags, r.full_name, r.default_branch,
            coalesce((SELECT json_agg(json_build_object('cron', s.cron, 'tz', s.tz, 'status', s.status) ORDER BY s.id) FROM schedules s WHERE s.workflow_id = w.id), '[]') AS schedules
       FROM workflows w JOIN repos r ON r.id = w.repo_id WHERE w.id = $1 AND r.installation_id = $2`,
    [workflowId, installationId],
  )).rows[0];
  if (!w) return null;
  const plan = (await db.query('SELECT plan FROM installations WHERE id = $1', [installationId])).rows[0]?.plan as PlanName;
  const limits = PLANS[plan ?? 'free'];
  const window = limits.historyRows
    ? `id IN (SELECT id FROM slots WHERE workflow_id = $1 AND due_at <= $2 ORDER BY due_at DESC LIMIT ${limits.historyRows})`
    : `workflow_id = $1 AND due_at <= $2 AND due_at > $2::timestamptz - interval '${limits.historyDays} days'`;
  const where = filter && FILTERS[filter] ? `${window} AND ${FILTERS[filter]}` : window;
  const [slots, all, day, next] = await Promise.all([
    db.query(`SELECT *, extract(epoch FROM first_attempt_at - due_at) * 1000 AS delay_ms FROM slots WHERE ${where} ORDER BY due_at DESC LIMIT ${MAX_ROWS}`, [workflowId, now]),
    db.query(`SELECT state, count(*)::int AS n FROM slots WHERE ${window} GROUP BY state`, [workflowId, now]),
    db.query(`SELECT ${COUNTS_SQL} FROM slots WHERE workflow_id = $1 AND due_at > $2::timestamptz - interval '24 hours' AND due_at <= $2`, [workflowId, now]),
    db.query(`SELECT due_at FROM slots WHERE workflow_id = $1 AND due_at > $2 AND state = 'pending' ORDER BY due_at LIMIT 1`, [workflowId, now]),
  ]);
  const c24 = counts(day.rows[0]);
  return {
    workflow: w,
    slots: slots.rows.map((r) => ({
      ...slotView(r), responseStatus: r.response_status as number | null, responseNote: r.response_note as string | null, matchedBy: r.matched_by as string | null, attempts: r.attempts as number,
      runStartedAt: r.run_started_at ? new Date(r.run_started_at).toISOString() : null, runCompletedAt: r.run_completed_at ? new Date(r.run_completed_at).toISOString() : null,
    })),
    counts: Object.fromEntries(all.rows.map((r) => [r.state, r.n])) as Record<string, number>,
    c24,
    health: healthOf(c24),
    next: next.rows[0] ? new Date(next.rows[0].due_at).toISOString() : null,
    limits,
    plan,
  };
}

/** Hide (or show again) a workflow in the "still on GitHub's schedule" list. Only within this installation. */
export async function setDismissed(db: pg.Pool, installationId: number, workflowId: number, dismissed: boolean): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE workflows SET dismissed_at = CASE WHEN $3 THEN now() END
      WHERE id = $1 AND repo_id IN (SELECT id FROM repos WHERE installation_id = $2)`,
    [workflowId, installationId, dismissed],
  );
  return rowCount === 1;
}

export async function setAlertEmail(db: pg.Pool, installationId: number, email: string) {
  await db.query('UPDATE installations SET alert_email = $2 WHERE id = $1', [installationId, email]);
}

import type pg from 'pg';
import { PLANS, type PlanName } from '../../src/plans.ts';
import { nextDue } from '../../src/slots.ts';

/** Colour of one slot in the dashboard strips. */
export type Tick = 'ontime' | 'late' | 'waiting' | 'overdue' | 'unconfirmed' | 'missed' | 'idle';

/** How long an unsent due slot reads as "Sending" before it is overdue. Every threshold is measured from due_at. */
const WAIT_MS = 60_000;

/** The stored state, or for a due slot not sent yet, `waiting` (up to 60 s past due) or `overdue`. */
export type SlotDisplay = 'pending' | 'dispatching' | 'fired' | 'accepted' | 'unknown' | 'rejected' | 'expired' | 'skipped' | 'waiting' | 'overdue';
export function displayOf(state: string, due: Date, now: Date): SlotDisplay {
  if ((state === 'pending' || state === 'dispatching') && due <= now) return now.getTime() - due.getTime() > WAIT_MS ? 'overdue' : 'waiting';
  return state as SlotDisplay;
}

/** Sent within 30 s is on time, later is late; unconfirmed is its own tick; refused and gave up are missed. */
export function toTick(display: SlotDisplay, sendDelayMs: number | null): Tick {
  if (display === 'fired' || display === 'accepted') return sendDelayMs !== null && sendDelayMs > 30_000 ? 'late' : 'ontime';
  if (display === 'waiting' || display === 'overdue') return display;
  if (display === 'unknown') return 'unconfirmed';
  if (display === 'rejected' || display === 'expired') return 'missed';
  return 'idle';
}

/**
 * One due slot as the UI shows it. Times are ISO strings so client components can format them in local time.
 * `sendDelayMs` is from GitHub accepting the request; `triedDelayMs` is from Cronkick's first try, for rows never sent.
 */
export type SlotView = {
  id: number; workflowId: number; due: string; state: string; display: SlotDisplay; tick: Tick; attempts: number; retrying: boolean;
  sendDelayMs: number | null; triedDelayMs: number | null; runUrl: string | null; conclusion: string | null;
};
const since = (t: Date | null, due: Date) => (t ? new Date(t).getTime() - due.getTime() : null);
const slotView = (r: any, now: Date): SlotView => {
  const due = new Date(r.due_at);
  const display = displayOf(r.state, due, now);
  const sendDelayMs = since(r.fired_at, due);
  return {
    id: Number(r.id), workflowId: Number(r.workflow_id), due: due.toISOString(), state: r.state, display, tick: toTick(display, sendDelayMs),
    attempts: Number(r.attempts ?? 0), retrying: display === 'overdue' && r.response_status != null, sendDelayMs, triedDelayMs: since(r.first_attempt_at, due), runUrl: r.run_url, conclusion: r.conclusion,
  };
};

/** The last `n` due slots of every workflow in an installation, oldest first. No padding: the strip draws the empty span. */
export async function recentSlots(db: pg.Pool, installationId: number, now: Date, n = 48): Promise<Map<number, SlotView[]>> {
  const { rows } = await db.query(
    // Per workflow via the (workflow_id, due_at) index: reads ~n rows each, not the account's whole history.
    `SELECT s.id, s.workflow_id, s.due_at, s.state, s.run_url, s.conclusion, s.fired_at, s.first_attempt_at, s.attempts, s.response_status
       FROM workflows w JOIN repos r ON r.id = w.repo_id
       CROSS JOIN LATERAL (SELECT * FROM slots WHERE workflow_id = w.id AND due_at <= $2 ORDER BY due_at DESC LIMIT $3) s
      WHERE r.installation_id = $1 AND s.installation_id = $1
      ORDER BY s.workflow_id, s.due_at`,
    [installationId, now, n],
  );
  const out = new Map<number, SlotView[]>();
  for (const r of rows) out.set(Number(r.workflow_id), [...(out.get(Number(r.workflow_id)) ?? []), slotView(r, now)]);
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

/**
 * Last-24-hour outcome counts. Due slots partition exactly:
 * due = onTime + late + waiting + overdue + unconfirmed + refused + gaveUp. `retrying` is the overdue ones GitHub answered with an error.
 */
export type Counts24 = {
  due: number; onTime: number; late: number; waiting: number; overdue: number; retrying: number;
  unconfirmed: number; refused: number; gaveUp: number; passed: number; failed: number;
};
// Every query using this binds now as $2.
const UNSENT = `state IN ('pending', 'dispatching')`;
const OVERDUE = `${UNSENT} AND due_at < $2::timestamptz - interval '${WAIT_MS / 1000} seconds'`;
const COUNTS_SQL = `
  count(*) FILTER (WHERE state <> 'skipped')::int AS due,
  count(*) FILTER (WHERE state IN ('fired', 'accepted') AND fired_at - due_at <= interval '30 seconds')::int AS on_time,
  count(*) FILTER (WHERE state IN ('fired', 'accepted') AND fired_at - due_at > interval '30 seconds')::int AS late,
  count(*) FILTER (WHERE ${UNSENT} AND NOT (${OVERDUE}))::int AS waiting,
  count(*) FILTER (WHERE ${OVERDUE})::int AS overdue,
  count(*) FILTER (WHERE ${OVERDUE} AND response_status IS NOT NULL)::int AS retrying,
  count(*) FILTER (WHERE state = 'unknown')::int AS unconfirmed,
  count(*) FILTER (WHERE state = 'rejected')::int AS refused,
  count(*) FILTER (WHERE state = 'expired')::int AS gave_up,
  count(*) FILTER (WHERE conclusion = 'success')::int AS passed,
  count(*) FILTER (WHERE conclusion IS NOT NULL AND conclusion NOT IN ('success', 'neutral', 'skipped'))::int AS failed`;
const counts = (r: any): Counts24 => ({
  due: r?.due ?? 0, onTime: r?.on_time ?? 0, late: r?.late ?? 0, waiting: r?.waiting ?? 0, overdue: r?.overdue ?? 0, retrying: r?.retrying ?? 0,
  unconfirmed: r?.unconfirmed ?? 0, refused: r?.refused ?? 0, gaveUp: r?.gave_up ?? 0, passed: r?.passed ?? 0, failed: r?.failed ?? 0,
});

/** One word for how a workflow (or a whole account) did in the last 24 h. "On time" only when every due slot was. */
export type Health = 'behind' | 'missed' | 'unconfirmed' | 'in_progress' | 'late' | 'on_time' | 'no_runs';
export const healthOf = (c: Counts24): Health => (
  c.overdue ? 'behind' : c.refused + c.gaveUp ? 'missed' : c.unconfirmed ? 'unconfirmed' : c.waiting ? 'in_progress' : c.late ? 'late' : c.due ? 'on_time' : 'no_runs');

export type WorkflowRow = {
  id: number; repo: string; name: string; path: string; flags: Flag[]; suggested_diff: string | null; schedules: Schedule[];
  status: WorkflowStatus; c24: Counts24; health: WorkflowHealth; nextDue: string | null; dismissed: boolean;
};
export type RepoRow = { id: number; full_name: string; default_branch: string; workflows: WorkflowRow[] };
/** `quiet`: live schedules and earlier runs, but nothing came due in the last 24 h (a weekly job on its off days). */
export type Verdict = 'nothing_scheduled' | 'needs_fix' | 'quiet' | Health;
/**
 * One workflow's last 24 h: a fix it needs outranks its own counts. A Cronkick coverage gap is never a health: nobody
 * knows what it cost, so it is shown on its own (notice, strip separator, history annotation), not as this workflow's status.
 */
export type WorkflowHealth = Exclude<Verdict, 'nothing_scheduled' | 'quiet'>;
const workflowHealth = (needsFix: boolean, c24: Counts24): WorkflowHealth => (needsFix ? 'needs_fix' : healthOf(c24));

/**
 * The account verdict; overview and the account switcher both use it, so they can't disagree.
 * Incidents come first, then what was due; "nothing scheduled" only when nothing was due either.
 */
const verdictOf = (v: { liveSchedules: number; needsFix: boolean; c24: Counts24; anyDue: boolean }): Verdict => (
  v.needsFix || v.c24.due ? workflowHealth(v.needsFix, v.c24) : !v.liveSchedules ? 'nothing_scheduled' : v.anyDue ? 'quiet' : 'no_runs');

/** 24 h counts over all slots of each installation, whatever its workflow or repo has become since (R8). */
async function installCounts(db: pg.Pool, ids: number[], now: Date): Promise<Map<number, Counts24>> {
  const { rows } = await db.query(
    `SELECT installation_id AS id, ${COUNTS_SQL} FROM slots
      WHERE installation_id = ANY($1) AND due_at > $2::timestamptz - interval '24 hours' AND due_at <= $2 GROUP BY installation_id`, [ids, now]);
  return new Map(rows.map((r) => [Number(r.id), counts(r)]));
}

/** The planner's eligibility rule (see materialize): only these schedules will be sent, so only they get a next due time. */
const nextFor = (schedules: Schedule[], eligible: boolean, now: Date): string | null => {
  const t = eligible ? nextDue(schedules.filter((s) => s.status === 'active'), now) : null;
  return t ? t.toISOString() : null;
};

/** A stretch Cronkick's planner wasn't running: runs due then may not have been sent, and some may have been. */
export type CoverageGap = { start: string; end: string };

/** Coverage gaps overlapping (from, to], oldest first. Pass an installation's `created_at` as `from` at the latest: older gaps aren't its. */
export async function coverageGaps(db: pg.Pool, from: Date, to: Date): Promise<CoverageGap[]> {
  const { rows } = await db.query(
    'SELECT started_at, ended_at FROM coverage_gaps WHERE started_at < $2 AND ended_at > $1 ORDER BY started_at', [from, to]);
  return rows.map((r) => ({ start: new Date(r.started_at).toISOString(), end: new Date(r.ended_at).toISOString() }));
}
const DAY_MS = 24 * 60 * 60_000;
const later = (a: Date, b: Date | null | undefined) => (b && b > a ? b : a);

export type NextKick = { due: string; workflowId: number; workflow: string; repo: string; alsoDue: number } | null;

/** Everything the overview needs for one installation. All 24 h windows are due slots only: future pending slots aren't runs yet. */
export async function overview(db: pg.Pool, installationId: number, now: Date) {
  const inst = (await db.query('SELECT suspended, removed, created_at FROM installations WHERE id = $1', [installationId])).rows[0];
  const sending = inst && !inst.suspended && !inst.removed;
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
  const [perWf, delays, total, anyDue, gaps] = await Promise.all([
    db.query(`SELECT workflow_id, ${COUNTS_SQL} FROM slots WHERE ${day} GROUP BY workflow_id`, [installationId, now]),
    // Start delay of the slots Cronkick actually sent, in ms.
    db.query(
      `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d) AS median, max(d) AS max
         FROM (SELECT extract(epoch FROM fired_at - due_at) * 1000 AS d FROM slots
                WHERE ${day} AND state IN ('fired', 'accepted') AND fired_at IS NOT NULL) x`,
      [installationId, now],
    ),
    installCounts(db, [installationId], now),
    // Has anything ever come due? Until then the overview is the setup guide.
    db.query(`SELECT EXISTS (SELECT 1 FROM slots WHERE installation_id = $1 AND due_at <= $2 AND state <> 'skipped') AS any`, [installationId, now]),
    coverageGaps(db, later(new Date(now.getTime() - DAY_MS), inst?.created_at), now),
  ]);
  const stats = new Map(perWf.rows.map((r) => [Number(r.workflow_id), counts(r)]));

  const out: RepoRow[] = repos.map((r) => ({ ...r, workflows: [] }));
  const byRepo = new Map(out.map((r) => [r.id, r]));
  for (const w of workflows) {
    const repo = byRepo.get(w.repo_id);
    if (!repo) continue;
    const status = workflowStatus(w);
    const c24 = stats.get(Number(w.id)) ?? counts(null);
    repo.workflows.push({
      id: Number(w.id), repo: repo.full_name, name: w.name, path: w.path, flags: w.flags, suggested_diff: w.suggested_diff, schedules: w.schedules,
      status, c24, health: workflowHealth(status === 'needs_fix', c24), nextDue: nextFor(w.schedules, sending && status === 'active', now), dismissed: w.dismissed,
    });
  }

  const all = out.flatMap((r) => r.workflows);
  const live = all.filter((w) => w.status === 'active');
  const c24 = total.get(installationId) ?? counts(null);
  const activeSchedules = live.reduce((n, w) => n + w.schedules.filter((s) => s.status === 'active').length, 0);

  // The soonest next due time across active workflows, and how many others are due at that same moment.
  const upcoming = live.filter((w) => w.nextDue).sort((a, b) => a.nextDue!.localeCompare(b.nextDue!));
  const first = upcoming[0];
  const nextKick: NextKick = first ? {
    due: first.nextDue!, workflowId: first.id, workflow: first.name, repo: first.repo,
    alsoDue: upcoming.filter((w) => w.nextDue === first.nextDue).length - 1,
  } : null;

  const any = anyDue.rows[0].any as boolean;
  const verdict = verdictOf({ liveSchedules: activeSchedules, needsFix: all.some((w) => w.status === 'needs_fix'), c24, anyDue: any });
  const d = delays.rows[0];
  const totals = {
    activeSchedules,
    c24,
    anyDue: any,
    // Until a slot first comes due, the page is the setup guide. A paused or broken workflow, or an outage, keeps the
    // normal overview, so its reason is always on screen.
    firstRun: !any && !gaps.length && all.every((w) => w.status !== 'limited' && w.status !== 'needs_fix'),
    medianDelayMs: d?.median == null ? null : Number(d.median),
    maxDelayMs: d?.max == null ? null : Number(d.max),
    nextKick,
    verdict,
    gaps,
  };
  return { repos: out, totals };
}

export type ActivityItem = SlotView & { workflow: string; repo: string };

/** The latest slots Cronkick acted on, or should have by now (overdue), across an installation, newest first. */
export async function activity(db: pg.Pool, installationId: number, now: Date, limit = 8): Promise<ActivityItem[]> {
  const { rows } = await db.query(
    `SELECT s.id, s.workflow_id, s.due_at, s.state, s.run_url, s.conclusion, s.fired_at, s.first_attempt_at, s.attempts, s.response_status,
            w.name AS workflow, r.full_name AS repo
       FROM slots s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = s.repo_id
      WHERE s.installation_id = $1 AND s.due_at <= $2 AND s.state <> 'skipped'
        AND (s.state NOT IN ('pending', 'dispatching') OR s.due_at < $2::timestamptz - interval '${WAIT_MS / 1000} seconds')
      ORDER BY s.due_at DESC, s.id DESC LIMIT $3`,
    [installationId, now, limit],
  );
  return rows.map((r) => ({ ...slotView(r, now), workflow: r.workflow, repo: r.repo }));
}

/** Why a due slot needs attention, most serious first. */
export type ExceptionReason = 'overdue' | 'missed' | 'unconfirmed' | 'failed' | 'late';
export type ExceptionItem = ActivityItem & { reason: ExceptionReason };
const FAILED = `conclusion IS NOT NULL AND conclusion NOT IN ('success', 'neutral', 'skipped')`;
const LATE = `state IN ('fired', 'accepted') AND fired_at - due_at > interval '30 seconds'`;
const REASON = `CASE WHEN ${OVERDUE} THEN 'overdue' WHEN state IN ('rejected', 'expired') THEN 'missed' WHEN state = 'unknown' THEN 'unconfirmed'
                     WHEN ${FAILED} THEN 'failed' WHEN ${LATE} THEN 'late' END`;

/**
 * Every due slot of the last 24 h that needs a look, most serious first, then newest. Queried over the whole window
 * before the limit, so an old problem behind many successes is never hidden; `more` counts what didn't fit.
 */
export async function exceptions(db: pg.Pool, installationId: number, now: Date, limit = 6): Promise<{ items: ExceptionItem[]; more: number }> {
  const { rows } = await db.query(
    `SELECT *, count(*) OVER () AS total FROM (
       SELECT s.id, s.workflow_id, s.due_at, s.state, s.run_url, s.conclusion, s.fired_at, s.first_attempt_at, s.attempts, s.response_status,
              w.name AS workflow, r.full_name AS repo, ${REASON} AS reason
         FROM slots s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = s.repo_id
        WHERE s.installation_id = $1 AND s.due_at > $2::timestamptz - interval '24 hours' AND s.due_at <= $2) x
      WHERE reason IS NOT NULL
      ORDER BY array_position(ARRAY['overdue', 'missed', 'unconfirmed', 'failed', 'late'], reason), due_at DESC, id DESC
      LIMIT $3`,
    [installationId, now, limit],
  );
  return {
    items: rows.map((r) => ({ ...slotView(r, now), workflow: r.workflow, repo: r.repo, reason: r.reason })),
    more: Math.max(0, Number(rows[0]?.total ?? 0) - rows.length),
  };
}

/** Per account: live schedules and the same verdict the overview shows, for the account switcher and list. */
export async function accountHealth(db: pg.Pool, ids: number[], now: Date): Promise<Map<number, { schedules: number; health: Verdict }>> {
  const [wf, c, due] = await Promise.all([
    db.query(
      `SELECT r.installation_id AS id, count(s.id) FILTER (WHERE s.status = 'active' AND w.flags = '[]')::int AS n, bool_or(w.flags <> '[]') AS needs_fix
         FROM workflows w JOIN repos r ON r.id = w.repo_id LEFT JOIN schedules s ON s.workflow_id = w.id
        WHERE r.installation_id = ANY($1) AND r.active AND w.present GROUP BY r.installation_id`, [ids],
    ),
    installCounts(db, ids, now),
    db.query(`SELECT i AS id FROM unnest($1::bigint[]) i
               WHERE EXISTS (SELECT 1 FROM slots WHERE installation_id = i AND due_at <= $2 AND state <> 'skipped')`, [ids, now]),
  ]);
  const by = new Map(wf.rows.map((r) => [Number(r.id), r]));
  const ran = new Set(due.rows.map((r) => Number(r.id)));
  return new Map(ids.map((id) => {
    const schedules: number = by.get(id)?.n ?? 0;
    return [id, { schedules, health: verdictOf({ liveSchedules: schedules, needsFix: !!by.get(id)?.needs_fix, c24: c.get(id) ?? counts(null), anyDue: ran.has(id) }) }];
  }));
}

export const MAX_ROWS = 50;
export type HistoryFilter = 'late' | 'missed' | 'unconfirmed' | 'failed';
const FILTERS: Record<HistoryFilter, string> = {
  late: LATE,
  missed: `(state IN ('rejected', 'expired') OR (${OVERDUE}))`,
  unconfirmed: `state = 'unknown'`,
  failed: FAILED,
};

/**
 * Slot history for one workflow, limited by plan and optionally filtered; null if it isn't in this installation.
 * Pages of MAX_ROWS, newest first. `before` pages back (rows due strictly before it), `after` pages forward (strictly
 * after it); both stay within the plan's window. `hasOlder` / `hasNewer` say whether there is more either way.
 */
export async function workflowHistory(db: pg.Pool, installationId: number, workflowId: number, now: Date, filter?: HistoryFilter, before?: Date, after?: Date) {
  const w = (await db.query(
    `SELECT w.id, w.name, w.path, w.present, w.flags, w.suggested_diff, r.full_name, r.default_branch, r.active AS repo_active, i.suspended, i.removed, i.alert_email, i.created_at,
            coalesce((SELECT json_agg(json_build_object('cron', s.cron, 'tz', s.tz, 'status', s.status) ORDER BY s.id) FROM schedules s WHERE s.workflow_id = w.id), '[]') AS schedules
       FROM workflows w JOIN repos r ON r.id = w.repo_id JOIN installations i ON i.id = r.installation_id WHERE w.id = $1 AND r.installation_id = $2`,
    [workflowId, installationId],
  )).rows[0];
  if (!w) return null;
  const plan = (await db.query('SELECT plan FROM installations WHERE id = $1', [installationId])).rows[0]?.plan as PlanName;
  const limits = PLANS[plan ?? 'free'];
  const window = limits.historyRows
    ? `id IN (SELECT id FROM slots WHERE workflow_id = $1 AND due_at <= $2 ORDER BY due_at DESC LIMIT ${limits.historyRows})`
    : `workflow_id = $1 AND due_at <= $2 AND due_at > $2::timestamptz - interval '${limits.historyDays} days'`;
  const where = filter && FILTERS[filter] ? `${window} AND ${FILTERS[filter]}` : window;
  // The shown range; history is pruned at 91 days, so that bounds a plan without a day limit.
  const oldest = new Date(now.getTime() - (limits.historyDays ?? 91) * DAY_MS);
  // A cursor that is malformed or in the future is ignored; one at or before the oldest shown row has nothing older,
  // so it is answered without a query (which also keeps dates Postgres can't bind out of it).
  const t = before?.getTime() ?? NaN;
  const cursor = t <= now.getTime() ? before! : null;
  const exhausted = cursor !== null && cursor <= oldest;
  // `after` only when there's no `before`; one in the future has nothing newer, one before the window starts from its oldest row.
  const a = cursor ? NaN : after?.getTime() ?? NaN;
  const forward = a < now.getTime() ? new Date(Math.max(a, oldest.getTime())) : null;
  const [page, filterCounts, day, gaps] = await Promise.all([
    // due_at is unique per workflow, so a strict cursor neither skips nor repeats rows.
    exhausted ? { rows: [] }
      : forward ? db.query(`SELECT * FROM slots WHERE ${where} AND due_at > $3 ORDER BY due_at ASC LIMIT ${MAX_ROWS}`, [workflowId, now, forward])
      : db.query(`SELECT * FROM slots WHERE ${where}${cursor ? ' AND due_at < $3' : ''} ORDER BY due_at DESC LIMIT ${MAX_ROWS}`, cursor ? [workflowId, now, cursor] : [workflowId, now]),
    // Counts per filter over the whole retained window, not just this page.
    db.query(`SELECT count(*)::int AS all, ${(Object.keys(FILTERS) as HistoryFilter[]).map((k) => `count(*) FILTER (WHERE ${FILTERS[k]})::int AS ${k}`).join(', ')}
                FROM slots WHERE ${window}`, [workflowId, now]),
    db.query(`SELECT ${COUNTS_SQL}, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM fired_at - due_at) * 1000)
                       FILTER (WHERE state IN ('fired', 'accepted') AND fired_at IS NOT NULL) AS median
                FROM slots WHERE workflow_id = $1 AND due_at > $2::timestamptz - interval '24 hours' AND due_at <= $2`, [workflowId, now]),
    coverageGaps(db, later(oldest, w.created_at), now),
  ]);
  const c24 = counts(day.rows[0]);
  // Forward pages are read oldest first; keep the MAX_ROWS just after the cursor and show them newest first.
  const rows = forward ? page.rows.slice(0, MAX_ROWS).reverse() : page.rows.slice(0, MAX_ROWS);
  // What lies on each side of this page, from the rows themselves rather than the cursor, so an empty or stale page
  // still knows its way back. `newerEdge` is the due time just above the page: the history table needs it to place a
  // coverage gap that falls between two pages exactly once.
  const [top, bottom] = [rows[0]?.due_at, rows[rows.length - 1]?.due_at];
  const edges = (await db.query(
    `SELECT (SELECT min(due_at) FROM slots WHERE ${where} AND due_at > $3) AS newer,
            EXISTS (SELECT 1 FROM slots WHERE ${where} AND due_at < $4) AS older`,
    [workflowId, now, top ?? now, bottom ?? oldest],
  )).rows[0];
  return {
    workflow: w,
    status: workflowStatus(w),
    hasOlder: rows.length ? edges.older as boolean : false,
    hasNewer: rows.length ? edges.newer !== null : false,
    newerEdge: rows.length && edges.newer ? new Date(edges.newer).toISOString() : null,
    slots: rows.map((r) => ({
      ...slotView(r, now), responseStatus: r.response_status as number | null, responseNote: r.response_note as string | null, matchedBy: r.matched_by as string | null,
      runStartedAt: r.run_started_at ? new Date(r.run_started_at).toISOString() : null, runCompletedAt: r.run_completed_at ? new Date(r.run_completed_at).toISOString() : null,
    })),
    filterCounts: filterCounts.rows[0] as Record<HistoryFilter | 'all', number>,
    medianDelayMs: day.rows[0].median == null ? null : Number(day.rows[0].median),
    c24,
    health: workflowHealth(w.flags.length > 0, c24),
    next: nextFor(w.schedules, w.present && w.repo_active && !w.flags.length && !w.suspended && !w.removed, now),
    limits,
    plan,
    gaps,
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

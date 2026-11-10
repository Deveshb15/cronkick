import type pg from 'pg';
import { PLANS, type PlanName } from '../../src/plans.ts';

/** One tick per slot in the dashboard strips. */
export type Tick = 'ontime' | 'late' | 'missed' | 'idle';

/** Fired within 30 s is on time; fired later is late; unknown/expired count as missed; anything not run is idle. */
export function toTick(state: string, delayMs: number | null): Tick {
  if (state === 'fired' || state === 'accepted') return delayMs !== null && delayMs > 30_000 ? 'late' : 'ontime';
  if (state === 'unknown' || state === 'expired') return 'missed';
  return 'idle';
}

/** The last `n` due slots of every workflow in an installation, oldest first, left-padded with idle ticks. */
export async function recentTicks(db: pg.Pool, installationId: number, now: Date, n = 48): Promise<Map<number, Tick[]>> {
  const { rows } = await db.query(
    `SELECT workflow_id, state, extract(epoch FROM first_attempt_at - due_at) * 1000 AS delay_ms
       FROM (SELECT *, row_number() OVER (PARTITION BY workflow_id ORDER BY due_at DESC) AS rn
               FROM slots WHERE installation_id = $1 AND due_at <= $2) s
      WHERE rn <= $3 ORDER BY workflow_id, due_at`,
    [installationId, now, n],
  );
  const out = new Map<number, Tick[]>();
  for (const r of rows) {
    const list = out.get(r.workflow_id) ?? [];
    list.push(toTick(r.state, r.delay_ms === null ? null : Number(r.delay_ms)));
    out.set(r.workflow_id, list);
  }
  for (const [k, v] of out) out.set(k, [...Array<Tick>(Math.max(0, n - v.length)).fill('idle'), ...v]);
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

export type WorkflowRow = {
  id: number; name: string; path: string; flags: Flag[]; suggested_diff: string | null; schedules: Schedule[];
  status: WorkflowStatus; due24h: number; onTime24h: number; problems24h: number;
  lastDue: Date | null; lastState: string | null; nextDue: Date | null;
};
export type RepoRow = { id: number; full_name: string; workflows: WorkflowRow[] };

/** Everything the overview needs for one installation, in three queries. */
export async function overview(db: pg.Pool, installationId: number, now: Date) {
  const repos = (await db.query<{ id: number; full_name: string }>(
    'SELECT id, full_name FROM repos WHERE installation_id = $1 AND active ORDER BY full_name', [installationId],
  )).rows;

  const workflows = (await db.query(
    `SELECT w.id, w.repo_id, w.name, w.path, w.flags, w.suggested_diff,
            coalesce(json_agg(json_build_object('cron', s.cron, 'tz', s.tz, 'status', s.status) ORDER BY s.id)
                     FILTER (WHERE s.id IS NOT NULL), '[]') AS schedules
       FROM workflows w JOIN repos r ON r.id = w.repo_id LEFT JOIN schedules s ON s.workflow_id = w.id
      WHERE r.installation_id = $1 AND r.active AND w.present
      GROUP BY w.id ORDER BY w.path`, [installationId],
  )).rows;

  // Per workflow, the last 24 hours of slots that are due: how many, how many fired within 30 s, how many went wrong.
  const stats = new Map((await db.query(
    `SELECT workflow_id,
            count(*) FILTER (WHERE due_at > $2::timestamptz - interval '24 hours' AND state <> 'skipped')::int AS due,
            count(*) FILTER (WHERE due_at > $2::timestamptz - interval '24 hours' AND first_attempt_at - due_at <= interval '30 seconds'
                               AND state IN ('fired', 'accepted'))::int AS on_time,
            count(*) FILTER (WHERE due_at > $2::timestamptz - interval '24 hours' AND state IN ('unknown', 'expired'))::int AS problems,
            max(due_at) FILTER (WHERE due_at <= $2) AS last_due,
            (array_agg(state ORDER BY due_at DESC) FILTER (WHERE due_at <= $2))[1] AS last_state,
            min(due_at) FILTER (WHERE due_at > $2 AND state = 'pending') AS next_due
       FROM slots WHERE installation_id = $1 AND due_at > $2::timestamptz - interval '24 hours'
      GROUP BY workflow_id`, [installationId, now],
  )).rows.map((r) => [r.workflow_id as number, r]));

  const out: RepoRow[] = repos.map((r) => ({ ...r, workflows: [] }));
  const byRepo = new Map(out.map((r) => [r.id, r]));
  for (const w of workflows) {
    const s = stats.get(w.id);
    byRepo.get(w.repo_id)?.workflows.push({
      id: w.id, name: w.name, path: w.path, flags: w.flags, suggested_diff: w.suggested_diff, schedules: w.schedules,
      status: workflowStatus(w),
      due24h: s?.due ?? 0, onTime24h: s?.on_time ?? 0, problems24h: s?.problems ?? 0,
      lastDue: s?.last_due ?? null, lastState: s?.last_state ?? null, nextDue: s?.next_due ?? null,
    });
  }
  const all = out.flatMap((r) => r.workflows);
  const totals = {
    activeSchedules: all.filter((w) => w.status === 'active').reduce((n, w) => n + w.schedules.filter((s) => s.status === 'active').length, 0),
    due24h: all.reduce((n, w) => n + w.due24h, 0),
    onTime24h: all.reduce((n, w) => n + w.onTime24h, 0),
    problems24h: all.reduce((n, w) => n + w.problems24h, 0),
    nextDue: all.map((w) => w.nextDue).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
  };
  return { repos: out, totals };
}

export const MAX_ROWS = 500;

/** Slot history for one workflow, limited by plan; null if it isn't in this installation. */
export async function workflowHistory(db: pg.Pool, installationId: number, workflowId: number, now: Date) {
  const w = (await db.query(
    `SELECT w.id, w.name, w.path, r.full_name, r.default_branch,
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
  const slots = (await db.query(`SELECT * FROM slots WHERE ${window} ORDER BY due_at DESC LIMIT ${MAX_ROWS}`, [workflowId, now])).rows;
  const counts: Record<string, number> = Object.fromEntries(
    (await db.query(`SELECT state, count(*)::int AS n FROM slots WHERE ${window} GROUP BY state`, [workflowId, now])).rows.map((r) => [r.state, r.n]),
  );
  const next = (await db.query(`SELECT due_at FROM slots WHERE workflow_id = $1 AND due_at > $2 AND state = 'pending' ORDER BY due_at LIMIT 1`, [workflowId, now])).rows[0]?.due_at ?? null;
  const last = slots.find((s) => s.state !== 'pending' && s.state !== 'skipped') ?? null;
  return { workflow: w, slots, counts, next, last, limits, plan };
}

export async function setAlertEmail(db: pg.Pool, installationId: number, email: string) {
  await db.query('UPDATE installations SET alert_email = $2 WHERE id = $1', [installationId, email]);
}

/** Due slots per UTC day for one workflow, split into on time, late and missed (same rules as toTick). */
export async function dailyRuns(db: pg.Pool, workflowId: number, now: Date, days = 14) {
  const { rows } = await db.query(
    `SELECT to_char(d, 'Mon DD') AS label,
            count(s.id) FILTER (WHERE s.state IN ('fired', 'accepted') AND s.first_attempt_at - s.due_at <= interval '30 seconds')::int AS ontime,
            count(s.id) FILTER (WHERE s.state IN ('fired', 'accepted') AND s.first_attempt_at - s.due_at > interval '30 seconds')::int AS late,
            count(s.id) FILTER (WHERE s.state IN ('unknown', 'expired'))::int AS missed
       FROM generate_series(date_trunc('day', $2::timestamptz) - make_interval(days => $3 - 1), date_trunc('day', $2::timestamptz), interval '1 day') d
       LEFT JOIN slots s ON s.workflow_id = $1 AND s.due_at >= d AND s.due_at < d + interval '1 day' AND s.due_at <= $2
      GROUP BY d ORDER BY d`,
    [workflowId, now, days],
  );
  return rows as { label: string; ontime: number; late: number; missed: number }[];
}

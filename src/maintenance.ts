import { tx, type Db } from './db.ts';
import { planSlots } from './slots.ts';

export const HORIZON_MS = 2 * 60 * 60_000;

type Row = { workflow_id: number; repo_id: number; installation_id: number; cron: string; tz: string; live: boolean };

/**
 * Create slots due in (from, from + 2 h]. Live schedules get `pending` slots; schedules that are
 * paused (plan limit, flagged workflow, suspended install) get `skipped` ones, so the history shows them.
 * ON CONFLICT keeps this idempotent and stops two crons on one workflow from making two slots.
 */
export async function materialize(db: Pick<Db, 'query'>, from: Date, installationId?: number): Promise<number> {
  const { rows } = await db.query<Row>(
    `SELECT s.workflow_id, r.id AS repo_id, r.installation_id, s.cron, s.tz,
            (s.status = 'active' AND w.flags = '[]' AND NOT i.suspended) AS live
       FROM schedules s JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = w.repo_id
       JOIN installations i ON i.id = r.installation_id
      WHERE w.present AND r.active AND NOT i.removed AND ($1::bigint IS NULL OR i.id = $1)`,
    [installationId ?? null],
  );
  const byWorkflow = new Map<number, Row[]>();
  for (const r of rows) byWorkflow.set(r.workflow_id, [...(byWorkflow.get(r.workflow_id) ?? []), r]);

  const until = new Date(from.getTime() + HORIZON_MS);
  let created = 0;
  for (const [workflowId, scheds] of byWorkflow) {
    const { repo_id, installation_id } = scheds[0];
    // Live slots first so they win a collision with a skipped one.
    for (const live of [true, false]) {
      let slots;
      try {
        slots = planSlots(workflowId, scheds.filter((s) => s.live === live), from, until);
      } catch (e) {
        // One unparseable cron or time zone must not stop planning for everyone else.
        console.error(`planning workflow ${workflowId} failed; skipping it`, e);
        continue;
      }
      if (!slots.length) continue;
      const res = await db.query(
        `INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state)
         SELECT $1, $2, $3, d, f, dl, f, $7 FROM unnest($4::timestamptz[], $5::timestamptz[], $6::timestamptz[]) AS t(d, f, dl)
         ON CONFLICT DO NOTHING`,
        [installation_id, repo_id, workflowId, slots.map((s) => s.dueAt), slots.map((s) => s.fireAt), slots.map((s) => s.deadlineAt), live ? 'pending' : 'skipped'],
      );
      created += res.rowCount ?? 0;
    }
  }
  return created;
}

export const LOOKBACK_MS = 60_000;

/**
 * The main tick's planning pass; only it reads or moves the planner watermark (refreshSlots never does).
 * If planning stopped for longer than the horizon, the unplanned stretch is recorded as one coverage gap
 * rather than invented slot by slot: nobody knows what was eligible then. One transaction holds the
 * planner row, so concurrent ticks record a gap once, and a failed materialize leaves everything as it was.
 */
export async function planAhead(db: Db, now: Date): Promise<void> {
  await tx(db, async (c) => {
    const until: Date | null = (await c.query('SELECT planned_until FROM planner FOR UPDATE')).rows[0].planned_until;
    const floor = now.getTime() - LOOKBACK_MS;
    if (until && until.getTime() < floor) {
      // A healthy pass sets the watermark 2 h ahead, so the last pass, when planning stopped, was 2 h before it.
      // Limit: a release without the watermark plans without moving it, so a rollback longer than 2 h reads as
      // an outage here. The runbook (deploy/README.md) clears planned_until before redeploying after one.
      await c.query('INSERT INTO coverage_gaps (started_at, ended_at, detected_at) VALUES ($1, $2, $3)', [new Date(until.getTime() - HORIZON_MS), new Date(floor), now]);
    }
    // Plan on from where the last pass stopped (at most a minute back), so the intervals stay contiguous.
    const from = new Date(Math.min(now.getTime(), Math.max(until?.getTime() ?? Infinity, floor)));
    await materialize(c, from);
    await c.query('UPDATE planner SET planned_until = greatest(planned_until, $1)', [new Date(from.getTime() + HORIZON_MS)]);
  });
}

/**
 * After config changes: drop slots nobody has tried yet, then rebuild them from the current schedules.
 * Slots due in the last minute are rebuilt too, so a change made right at due time doesn't lose the slot.
 */
export async function refreshSlots(db: Db, installationId: number, now: Date): Promise<void> {
  const from = new Date(now.getTime() - LOOKBACK_MS);
  await tx(db, async (c) => {
    // Wait for a running planAhead: its uncommitted slots, possibly for a schedule just removed, would escape the delete.
    await c.query('SELECT 1 FROM planner FOR UPDATE');
    await c.query(
      `DELETE FROM slots WHERE installation_id = $1 AND due_at > $2 AND (state = 'skipped' OR (state = 'pending' AND attempts = 0))`,
      [installationId, from],
    );
    await materialize(c, from, installationId);
  });
}

/** Prune old history. Pending past the deadline -> expired. Lease lost mid-call -> unknown (never fire it again, R8). */
export async function settle(db: Db, now: Date): Promise<void> {
  // Pro shows 90 days of history; keep one extra day.
  await db.query(`DELETE FROM slots WHERE due_at < $1::timestamptz - interval '91 days'`, [now]);
  // Never tried (Cronkick was down or behind): say so, rather than let it read as GitHub's failure.
  await db.query(
    `UPDATE slots SET state = 'expired', updated_at = $1,
            response_note = CASE WHEN attempts = 0 THEN 'Cronkick didn''t send it before its deadline' ELSE response_note END
      WHERE state = 'pending' AND deadline_at <= $1`,
    [now],
  );
  await db.query(
    `UPDATE slots SET state = 'unknown', response_status = NULL, response_note = 'The trigger request was interrupted; GitHub may or may not have received it.', updated_at = $1
      WHERE state = 'dispatching' AND lease_until < $1`,
    [now],
  );
}

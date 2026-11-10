import type { Db } from './db.ts';
import { planSlots } from './slots.ts';

export const HORIZON_MS = 2 * 60 * 60_000;

type Row = { workflow_id: number; repo_id: number; installation_id: number; cron: string; tz: string; live: boolean };

/**
 * Create slots due in (from, from + 2 h]. Live schedules get `pending` slots; schedules that are
 * paused (plan limit, flagged workflow, suspended install) get `skipped` ones, so the history shows them.
 * ON CONFLICT keeps this idempotent and stops two crons on one workflow from making two slots.
 */
export async function materialize(db: Db, from: Date, installationId?: number): Promise<number> {
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
      const slots = planSlots(workflowId, scheds.filter((s) => s.live === live), from, until);
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
 * After config changes: drop slots nobody has tried yet, then rebuild them from the current schedules.
 * Slots due in the last minute are rebuilt too, so a change made right at due time doesn't lose the slot.
 */
export async function refreshSlots(db: Db, installationId: number, now: Date): Promise<void> {
  const from = new Date(now.getTime() - LOOKBACK_MS);
  await db.query(
    `DELETE FROM slots WHERE installation_id = $1 AND due_at > $2 AND (state = 'skipped' OR (state = 'pending' AND attempts = 0))`,
    [installationId, from],
  );
  await materialize(db, from, installationId);
}

/** Prune old history. Pending past the deadline -> expired. Lease lost mid-call -> unknown (never fire it again, R8). */
export async function settle(db: Db, now: Date): Promise<void> {
  // Pro shows 90 days of history; keep one extra day.
  await db.query(`DELETE FROM slots WHERE due_at < $1::timestamptz - interval '91 days'`, [now]);
  await db.query(`UPDATE slots SET state = 'expired', updated_at = $1 WHERE state = 'pending' AND deadline_at <= $1`, [now]);
  await db.query(
    `UPDATE slots SET state = 'unknown', response_note = 'The trigger request was interrupted; GitHub may or may not have received it.', updated_at = $1
      WHERE state = 'dispatching' AND lease_until < $1`,
    [now],
  );
}

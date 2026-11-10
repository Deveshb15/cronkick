import type { Db } from './db.ts';

export type PlanName = 'free' | 'pro';
export const PLANS = {
  free: { repos: Infinity, schedules: 10, floorMinutes: 15, historyRows: null as number | null, historyDays: 7 as number | null },
  pro: { repos: Infinity, schedules: 50, floorMinutes: 5, historyRows: null as number | null, historyDays: 90 as number | null },
} satisfies Record<PlanName, unknown>;

export async function planOf(db: Db, installationId: number): Promise<PlanName> {
  const { rows } = await db.query('SELECT plan FROM installations WHERE id = $1', [installationId]);
  return (rows[0]?.plan ?? 'free') as PlanName;
}

/**
 * Keep the oldest schedules active up to the plan's limits and pause the rest (R15).
 * Returns how many are paused for the limit.
 */
export async function applyLimits(db: Db, installationId: number): Promise<number> {
  const limits = PLANS[await planOf(db, installationId)];
  const { rows } = await db.query<{ id: number; repo_id: number }>(
    `SELECT s.id, r.id AS repo_id FROM schedules s
       JOIN workflows w ON w.id = s.workflow_id JOIN repos r ON r.id = w.repo_id
      WHERE r.installation_id = $1 AND r.active AND w.present AND w.flags = '[]'
      ORDER BY r.created_at, r.id, s.created_at, s.id`,
    [installationId],
  );
  const repos = new Set<number>();
  const keep: number[] = [];
  const pause: number[] = [];
  for (const s of rows) {
    if (!repos.has(s.repo_id) && repos.size < limits.repos) repos.add(s.repo_id);
    (repos.has(s.repo_id) && keep.length < limits.schedules ? keep : pause).push(s.id);
  }
  await db.query(`UPDATE schedules SET status = 'active' WHERE id = ANY($1)`, [keep]);
  await db.query(`UPDATE schedules SET status = 'paused_limit' WHERE id = ANY($1)`, [pause]);
  return pause.length;
}

import type { Db } from './db.ts';

export type PlanName = 'free' | 'pro' | 'team';
type Plan = {
  label: string; repos: number; schedules: number; floorMinutes: number; historyDays: number;
  /** Rescue re-runs a run GitHub broke (v1c). Every plan gets the report. */
  rescue: boolean;
  /** USD a month and a year; null for Free. */
  price: { monthly: number; yearly: number } | null;
  /** The GitHub account type that can buy it (installations.account_type); null for Free. */
  for: 'User' | 'Organization' | null;
};
export const PLANS: Record<PlanName, Plan> = {
  free: { label: 'Free', repos: Infinity, schedules: 3, floorMinutes: 15, historyDays: 7, rescue: false, price: null, for: null },
  pro: { label: 'Pro', repos: Infinity, schedules: 50, floorMinutes: 5, historyDays: 90, rescue: true, price: { monthly: 5, yearly: 50 }, for: 'User' },
  // ponytail: Team allows 200 schedules every minute, but each send is one GitHub API call and an installation gets
  // about 5,000 an hour, so ~80 one-minute schedules is the real ceiling (documented in docs/plans). Enforce a
  // per-installation sends-per-hour budget in applyLimits when a Team account gets near it.
  team: { label: 'Team', repos: Infinity, schedules: 200, floorMinutes: 1, historyDays: 400, rescue: true, price: { monthly: 19, yearly: 190 }, for: 'Organization' },
};

export const isPaid = (plan: PlanName) => plan !== 'free';
/** The one paid plan an account can buy: Team for organizations, Pro for personal accounts. */
export const paidPlanFor = (accountType: string): Exclude<PlanName, 'free'> => (accountType === 'Organization' ? 'team' : 'pro');
/** Days of history kept in the database: 91 for Free and Pro (so an upgrade shows the past 90 days), a day past Team's 400. */
export const retainDaysJson = () => JSON.stringify(Object.fromEntries(Object.entries(PLANS).map(([n, p]) => [n, Math.max(p.historyDays, 90) + 1])));

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

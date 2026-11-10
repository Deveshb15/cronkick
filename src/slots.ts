import { CronExpressionParser } from 'cron-parser';

type Sched = { cron: string; tz: string };

export const DEADLINE_MS = 5 * 60_000;
const MAX_JITTER_S = 15;

/** Due instants (ms) of all schedules merged, after `from`, up to and including `count` items or `until`. */
function merged(scheds: Sched[], from: Date, opts: { until?: Date; count?: number }): number[] {
  const out = new Set<number>();
  for (const s of scheds) {
    const it = CronExpressionParser.parse(s.cron, { tz: s.tz, currentDate: from });
    for (let i = 0; i < (opts.count ?? 100_000); i++) {
      const t = it.next().getTime();
      out.add(t);
      if (opts.until && t > opts.until.getTime()) break; // keep one past `until` for deadlines
    }
  }
  const sorted = [...out].sort((a, b) => a - b);
  return opts.count ? sorted.slice(0, opts.count) : sorted;
}

/** Smallest gap, in whole minutes, between the next 50 combined runs. */
export function minIntervalMinutes(scheds: Sched[], from = new Date()): number {
  const t = merged(scheds, from, { count: 50 });
  let gap = Infinity;
  for (let i = 1; i < t.length; i++) gap = Math.min(gap, t[i] - t[i - 1]);
  return Math.floor(gap / 60_000);
}

/** Fixed 0–15 s offset per workflow, applied only to slots at :00 to spread the top-of-hour peak. */
export function jitterMs(workflowId: number, due: Date): number {
  if (due.getUTCMinutes() !== 0 || due.getUTCSeconds() !== 0) return 0;
  return ((workflowId * 2654435761) % 2 ** 32) % (MAX_JITTER_S + 1) * 1000;
}

export type SlotPlan = { dueAt: Date; fireAt: Date; deadlineAt: Date };

/** Slots due in (from, until]. Deadline = earlier of due + 5 min and the next slot's due time. */
export function planSlots(workflowId: number, scheds: Sched[], from: Date, until: Date): SlotPlan[] {
  if (!scheds.length) return [];
  const t = merged(scheds, from, { until });
  const slots: SlotPlan[] = [];
  for (let i = 0; i < t.length && t[i] <= until.getTime(); i++) {
    const due = new Date(t[i]);
    const next = t[i + 1] ?? Infinity;
    slots.push({ dueAt: due, fireAt: new Date(t[i] + jitterMs(workflowId, due)), deadlineAt: new Date(Math.min(t[i] + DEADLINE_MS, next)) });
  }
  return slots;
}

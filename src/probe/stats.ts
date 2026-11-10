import { CronExpressionParser } from 'cron-parser';

export const PROBE_WORKFLOWS = [
  { file: '.github/workflows/every-5.yml', cron: '*/5 * * * *' },
  { file: '.github/workflows/hourly.yml', cron: '0 * * * *' },
] as const;

/** Slots older than this with no run count as dropped. */
export const GRACE_MS = 60 * 60_000;

/** Nearest-rank percentile of a sorted array. */
export function percentile(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function dueTimes(cron: string, from: Date, until: Date): Date[] {
  const it = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: new Date(from.getTime() - 1) });
  const out: Date[] = [];
  for (let d = it.next().toDate(); d <= until; d = it.next().toDate()) out.push(d);
  return out;
}

/**
 * GitHub doesn't say which slot a scheduled run was for. Assign each run (in creation order) to the
 * latest free slot at or before it. This can only under-state lateness, never over-state it.
 */
export function assignRuns(cron: string, runs: { id: number; createdAt: Date }[]): { id: number; dueAt: Date; createdAt: Date }[] {
  const taken = new Set<number>();
  const out: { id: number; dueAt: Date; createdAt: Date }[] = [];
  for (const run of [...runs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const it = CronExpressionParser.parse(cron, { tz: 'UTC', currentDate: new Date(run.createdAt.getTime() + 1) });
    for (let i = 0; i < 24; i++) {
      const due = it.prev().getTime();
      if (!taken.has(due)) {
        taken.add(due);
        out.push({ id: run.id, dueAt: new Date(due), createdAt: run.createdAt });
        break;
      }
    }
  }
  return out;
}

export type Lateness = { expected: number; ran: number; missingShare: number; p50Sec: number | null; p95Sec: number | null };

/** p50/p95 delay and the share of expected slots that never ran, with the denominator (R17). */
export function lateness(delaysSec: number[], expected: number): Lateness {
  const sorted = [...delaysSec].sort((a, b) => a - b);
  return {
    expected,
    ran: sorted.length,
    missingShare: expected ? Math.max(0, expected - sorted.length) / expected : 0,
    p50Sec: sorted.length ? percentile(sorted, 50) : null,
    p95Sec: sorted.length ? percentile(sorted, 95) : null,
  };
}

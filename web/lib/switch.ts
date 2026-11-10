import { minIntervalMinutes } from '../../src/slots.ts';

const LINE = /^#\s*cronkick:\s*"([^"]+)"(?:\s+tz=(\S+))?\s*$/;
type Cron = { cron: string; tz?: string };

const marker = (c: Cron) => `  # cronkick: "${c.cron}"${c.tz ? ` tz=${c.tz}` : ''}`;
const dispatchBlock = (cs: Cron[]) => ['on:', '  workflow_dispatch:', ...cs.map(marker)].join('\n');
const tooFastFor = (cs: Cron[], floor: number) => minIntervalMinutes(cs.map((c) => ({ cron: c.cron, tz: c.tz ?? 'UTC' }))) < floor;

/**
 * Moving a workflow from GitHub's `schedule:` to Cronkick, as the `on:` block before and after.
 * `suggested` is the stored `workflows.suggested_diff` (one `# cronkick:` line per schedule cron).
 * When the schedule is faster than the plan allows, `clamped` offers the plan-floor version, but only for plain
 * `*\/N * * * *` crons; anything else is left for the user to decide (keep it on Pro, or pick a slower cron).
 */
export function switchPlan(suggested: string, floorMinutes: number) {
  const crons: Cron[] = suggested.split('\n').map((l) => LINE.exec(l.trim())).filter((m) => !!m).map((m) => ({ cron: m![1], tz: m![2] }));
  const before = ['on:', '  schedule:', ...crons.flatMap((c) => [`    - cron: "${c.cron}"`, ...(c.tz ? [`      timezone: ${c.tz}`] : [])])].join('\n');
  const tooFast = crons.length > 0 && tooFastFor(crons, floorMinutes);
  let clamped: string | null = null;
  if (tooFast && crons.every((c) => /^\*\/\d+ \* \* \* \*$/.test(c.cron))) {
    const slower = crons.map((c) => ({ ...c, cron: `*/${Math.max(floorMinutes, Number(c.cron.slice(2).split(' ')[0]))} * * * *` }));
    if (!tooFastFor(slower, floorMinutes)) clamped = dispatchBlock(slower);
  }
  return { crons, before, after: dispatchBlock(crons), tooFast, clamped };
}

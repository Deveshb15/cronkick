import type { ProbeReport } from '../../src/probe/collector.ts';
import type { Counts24, Verdict } from './data.ts';

export const appSlug = () => process.env.GITHUB_APP_SLUG ?? 'cronkick';
export const installUrl = () => `https://github.com/apps/${appSlug()}/installations/new`;
/** Where the account owner picks which repos the app can see. */
export const manageReposUrl = (i: { id: number; account_type: string; account_login: string }) =>
  i.account_type === 'Organization'
    ? `https://github.com/organizations/${i.account_login}/settings/installations/${i.id}`
    : `https://github.com/settings/installations/${i.id}`;

/** "Nov 10, 14:05 UTC". */
export const fmtUtc = (d: Date) => `${d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' })} UTC`;
const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`;
};

/** "1 of 1 probe repos reporting · private · since Nov 10, 14:05 UTC · last complete check 3 min ago" (R12). */
export function probeSample(r: ProbeReport, now: Date): string {
  const live = r.repos.filter((x) => x.live);
  const kinds = ['public', 'private'].filter((k) => live.some((x) => x.private === (k === 'private')));
  const since = live.reduce<Date | null>((a, x) => (!a || x.from! < a ? x.from : a), null);
  return [
    `${r.contributing} of ${r.configured} probe repo${r.configured === 1 ? '' : 's'} reporting`,
    kinds.join(' and '),
    since && `since ${fmtUtc(since)}`,
    r.checkedAt && `last complete check ${ago(now.getTime() - r.checkedAt.getTime())}`,
  ].filter(Boolean).join(' · ');
}

const runs = (n: number) => `${n} run${n === 1 ? '' : 's'}`;
/** The overview headline for each verdict, given the live schedule count and the 24 h counts. */
export const VERDICT: Record<Verdict, (n: number, c: Counts24) => string> = {
  // Due history outranks an empty configuration, so an account with no live schedules left can still be on time.
  on_time: (n, c) => (n ? `All ${n} schedule${n === 1 ? '' : 's'} on time` : `No active schedules. Last 24 h: ${runs(c.due)} on time`),
  late: () => 'Some runs were sent late',
  in_progress: () => 'Sending now',
  unconfirmed: (_, c) => `${runs(c.unconfirmed)} unconfirmed`,
  missed: () => 'A run was missed',
  // Not tried yet is on Cronkick; tried and erroring is GitHub while Cronkick retries.
  behind: (_, c) => (c.overdue > c.retrying ? `Cronkick hasn’t sent ${runs(c.overdue - c.retrying)} yet` : `Retrying ${runs(c.retrying)}: GitHub returned errors`),
  needs_fix: () => 'A workflow needs a fix',
  coverage_gap: () => 'Cronkick had an outage',
  no_runs: () => 'Waiting for the first kick',
  nothing_scheduled: () => 'Nothing scheduled yet',
};

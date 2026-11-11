import type { Pair, ProbeReport } from '../../src/probe/collector.ts';
import type { Evidence } from '../../src/schedule-watch.ts';
import type { Counts24, SlotView, Verdict, WorkflowStatus } from './data.ts';
import { fmtAge, fmtDuration, plural } from './live.ts';

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

/**
 * The overview's status line for each verdict, from the 24 h counts. It says what was observed and nothing more:
 * "No dispatch issues", never "all on time", because a Cronkick coverage gap can hide runs nobody saw.
 */
export const VERDICT: Record<Verdict, (c: Counts24) => string> = {
  on_time: () => 'No dispatch issues in the last 24 h',
  late: (c) => plural(c.late, 'late run'),
  in_progress: () => 'Sending now',
  unconfirmed: (c) => plural(c.unconfirmed, 'unconfirmed run'),
  // Refused alone is GitHub's answer; anything given up includes runs Cronkick never got out.
  missed: (c) => (c.gaveUp ? `${plural(c.refused + c.gaveUp, 'run')} not sent` : `${plural(c.refused, 'run')} refused by GitHub`),
  behind: (c) => plural(c.overdue, 'overdue run'),
  needs_fix: () => 'A workflow needs a fix',
  no_runs: () => 'Waiting for the first run',
  quiet: () => 'Nothing was due in the last 24 h',
  nothing_scheduled: () => 'Nothing scheduled yet',
};

export type RowStatus = { word: string; dot: string; text: string; rank: number };
const QUIET = { dot: 'bg-zinc-500', text: 'text-zinc-400' };
const DAY_MS = 24 * 60 * 60_000;
/**
 * One status for a schedule row, counted from the same runs its strip shows, so the two can't disagree. Current
 * problems (in the last 24 h, or overdue) come first, worst first; only with none does an older one show, grey and with
 * its age (a 6-hourly strip spans 12 days). `rank` sorts the list: blockers and current problems first.
 */
export function rowStatus(status: WorkflowStatus, slots: Pick<SlotView, 'tick' | 'due'>[], now: Date): RowStatus {
  if (status === 'needs_fix') return { word: 'Needs a fix', dot: 'bg-red-500', text: 'text-red-300', rank: 0 };
  if (status === 'limited') return { word: 'Paused · plan limit', ...QUIET, rank: 4 };
  const due = slots.filter((s) => s.tick !== 'idle');
  if (!due.length) return { word: 'Waiting for first run', ...QUIET, rank: 3 };
  const kinds: [SlotView['tick'], string, Omit<RowStatus, 'word'>][] = [
    ['overdue', 'overdue', { dot: 'bg-red-500', text: 'text-red-300', rank: 1 }],
    ['missed', 'not sent', { dot: 'bg-red-500', text: 'text-red-300', rank: 1 }],
    ['unconfirmed', 'unconfirmed', { dot: 'bg-zinc-300', text: 'text-zinc-200', rank: 2 }],
    ['late', 'late', { dot: 'bg-orange-300', text: 'text-orange-200', rank: 2 }],
  ];
  const hits = (t: SlotView['tick']) => due.filter((s) => s.tick === t);
  const age = (t: SlotView['tick']) => now.getTime() - Date.parse(hits(t).at(-1)!.due);
  const current = kinds.find(([t]) => hits(t).length && (t === 'overdue' || age(t) <= DAY_MS));
  if (current) return { word: `${hits(current[0]).length} ${current[1]}`, ...current[2] };
  if (hits('waiting').length) return { word: 'Sending now', dot: 'bg-sky-400', text: 'text-sky-300', rank: 3 };
  const old = kinds.find(([t]) => hits(t).length);
  if (old) return { word: `${hits(old[0]).length} ${old[1]} · ${fmtAge(age(old[0]))} ago`, ...QUIET, rank: 3 };
  return { word: `${due.length} of ${due.length} on time`, dot: 'bg-emerald-400', text: 'text-zinc-200', rank: 3 };
}

/**
 * How to say what runs next: a steady cadence under an hour reads as one line ("then every 15 min"); anything slower
 * or irregular lists the next times. `upcoming` is ISO times, soonest first.
 */
export function nextPlan(upcoming: string[]): { kind: 'none' } | { kind: 'every'; next: string; minutes: number } | { kind: 'list'; times: string[] } {
  if (!upcoming.length) return { kind: 'none' };
  const gaps = upcoming.slice(1).map((t, i) => (Date.parse(t) - Date.parse(upcoming[i])) / 60_000);
  const steady = gaps.length > 0 && gaps.every((g) => g === gaps[0]) && gaps[0] < 60;
  return steady ? { kind: 'every', next: upcoming[0], minutes: gaps[0] } : { kind: 'list', times: upcoming };
}

/**
 * The newest run that has an outcome, in words, keeping Cronkick's part (dispatch) and GitHub's part (the run's
 * result) apart. Null when nothing has an outcome yet.
 */
export function latestRun(slots: Pick<SlotView, 'state' | 'display' | 'conclusion' | 'runMs' | 'runUrl' | 'due'>[]):
  { due: string; text: string; tone: 'ok' | 'bad' | 'quiet'; runUrl: string | null } | null {
  const s = [...slots].reverse().find((x) => !['pending', 'dispatching', 'waiting', 'skipped'].includes(x.display));
  if (!s) return null;
  const took = s.runMs !== null ? ` · ${fmtDuration(s.runMs)}` : '';
  if (s.state === 'fired' || s.state === 'accepted') {
    if (!s.conclusion) return { due: s.due, text: 'Sent; GitHub result not reported yet', tone: 'quiet', runUrl: s.runUrl };
    const ok = ['success', 'neutral', 'skipped'].includes(s.conclusion);
    return { due: s.due, text: `${s.conclusion === 'success' ? 'Passed' : ok ? s.conclusion : s.conclusion === 'failure' ? 'Failed' : s.conclusion.replace('_', ' ')} on GitHub${took}`, tone: ok ? 'ok' : 'bad', runUrl: s.runUrl };
  }
  const words: Record<string, string> = { overdue: 'Overdue: not sent yet', unknown: 'Unconfirmed: sent, GitHub didn’t confirm', rejected: 'Refused by GitHub', expired: 'Not sent before its deadline' };
  return { due: s.due, text: words[s.display] ?? s.display, tone: s.display === 'unknown' ? 'quiet' : 'bad', runUrl: null };
}


/**
 * What GitHub's own scheduler did for a workflow the user hasn't moved yet, in one line: "GitHub ran it 3 of 23 times
 * in the last 24 h · median 8 min late". `bad` when it skipped 1 in 10 or more.
 */
export function evidenceLine(e: Evidence, now: Date): { text: string; bad: boolean } {
  if (e.measuring) return { text: 'Measuring how GitHub runs it…', bad: false };
  const hours = Math.max(1, Math.round((now.getTime() - Date.parse(e.from)) / 3_600_000));
  const window = e.fullDay ? 'in the last 24 h' : `in the last ${hours} h`;
  const late = e.p50Sec === null ? '' : ` · median ${e.p50Sec < 60 ? `${Math.round(e.p50Sec)} s` : `${Math.round(e.p50Sec / 60)} min`} late`;
  return { text: `GitHub ran it ${e.ran} of ${plural(e.due, 'time')} ${window}${late}`, bad: e.due - e.ran >= e.due / 10 };
}

/** A probe pair as plain data for the client charts (dates as ISO strings). */
export const pairView = (p: Pair) => ({
  ...p, from: p.from?.toISOString() ?? null, until: p.until?.toISOString() ?? null, ticks: p.ticks.map((t) => ({ ...t, due: t.due.toISOString() })),
});

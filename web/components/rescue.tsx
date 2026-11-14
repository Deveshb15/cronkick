import { ArrowTopRightOnSquareIcon, ClockIcon, CpuChipIcon, CreditCardIcon, ExclamationCircleIcon, ExclamationTriangleIcon, MinusCircleIcon, QuestionMarkCircleIcon, XCircleIcon } from '@heroicons/react/16/solid';
import type { RescueRow } from '@/lib/data';
import { Time } from './live';
import { Badge, Pill, type Tone } from './ui';

type Look = { label: string; tone: Tone; icon: typeof ClockIcon; help: string };

// "GitHub broke it" only for no runner (R1) and a GitHub service error during setup (R4); see /docs/rescue.
const VERDICT: Record<string, Look> = {
  github_broke: { label: 'GitHub broke it', tone: 'red', icon: XCircleIcon, help: 'GitHub’s infrastructure failed the run, not your code.' },
  probably_github: { label: 'Probably GitHub', tone: 'orange', icon: ExclamationTriangleIcon, help: 'Looks like GitHub’s side, but GitHub’s own message couldn’t confirm it.' },
  not_started: { label: 'Didn’t start', tone: 'orange', icon: ExclamationCircleIcon, help: 'The run failed with no jobs at all, likely on GitHub’s side.' },
  mixed: { label: 'Partly GitHub', tone: 'amber', icon: ExclamationCircleIcon, help: 'Some failed jobs look like GitHub’s side, others don’t.' },
  user: { label: 'Not GitHub', tone: 'zinc', icon: MinusCircleIcon, help: 'Nothing points at GitHub’s infrastructure.' },
  billing: { label: 'Billing lock', tone: 'zinc', icon: CreditCardIcon, help: 'GitHub refused to start the job because of the account’s billing.' },
  self_hosted: { label: 'Self-hosted', tone: 'zinc', icon: CpuChipIcon, help: 'Ran, or was meant to run, on your own runner.' },
};
const CHECKING: Look = { label: 'Checking', tone: 'zinc', icon: ClockIcon, help: 'Reading the run’s jobs from GitHub.' };
const UNCHECKED: Look = { label: 'Couldn’t check', tone: 'zinc', icon: QuestionMarkCircleIcon, help: 'GitHub didn’t answer, so Rescue gave up on this run.' };

const CLASS: Record<string, string> = {
  no_runner: 'Never got a runner', service_5xx: 'GitHub service error during setup', no_runner_unconfirmed: 'Never got a runner (unconfirmed)',
  runner_lost: 'Runner lost mid-job', timeout: 'Timed out', runner_config: 'Retired runner image', quota_or_config: 'Quota or configuration',
  billing: 'Billing lock', self_hosted: 'Self-hosted runner', unknown: 'A step failed',
};

const lookOf = (r: RescueRow) => (r.state === 'queued' ? CHECKING : r.state === 'error' ? UNCHECKED : VERDICT[r.verdict ?? ''] ?? UNCHECKED);

export function RescuePill({ r }: { r: RescueRow }) {
  const l = lookOf(r);
  return <Pill tone={l.tone} icon={l.icon} title={l.help}>{l.label}</Pill>;
}

/** What failed, in words: the most common job class, and how many jobs. */
function what(r: RescueRow): string | null {
  if (!r.jobs.length) return r.verdict === 'not_started' ? 'No jobs started' : null;
  if (r.verdict === 'billing' || r.verdict === 'self_hosted') return null; // the pill already says it
  const counts = new Map<string, number>();
  for (const j of r.jobs) counts.set(j.class, (counts.get(j.class) ?? 0) + 1);
  const [top] = [...counts].sort((a, b) => b[1] - a[1]);
  return `${CLASS[top[0]] ?? top[0]}${r.jobs.length > 1 ? ` · ${r.jobs.length} jobs` : ''}`;
}

/** What Rescue did about it; nothing for runs that were never GitHub's. */
function outcome(r: RescueRow): { text: string; tone: string } | null {
  const muted = 'text-zinc-400';
  switch (r.state) {
    case 'queued': return null;
    case 'error': return { text: r.skipReason ?? 'GitHub didn’t answer', tone: muted };
    case 'rerun_waiting': return { text: 'Re-running once in a few minutes', tone: 'text-sky-300' };
    case 'rerun_requested': return { text: 'Re-run requested', tone: 'text-sky-300' };
    case 'rerun_started': return { text: 'Re-ran once · attempt 2 running', tone: 'text-sky-300' };
    case 'done': return { text: `Re-ran once · attempt 2 ${r.retryConclusion === 'success' ? 'passed' : r.retryConclusion}`, tone: r.retryConclusion === 'success' ? 'text-emerald-300' : 'text-red-300' };
    case 'rerun_unknown': return { text: 'Re-run sent, but GitHub’s answer was lost, so it wasn’t sent again', tone: muted };
    case 'rerun_rejected': return { text: `GitHub refused the re-run${r.rerunNote ? `: ${r.rerunNote}` : ''}`, tone: 'text-red-300' };
    case 'rerun_vanished': return { text: 'GitHub accepted the re-run but never started it', tone: muted };
  }
  return r.verdict === 'github_broke' && r.skipReason ? { text: `Not re-run: ${r.skipReason.replace(/\.$/, '')}`, tone: muted } : null;
}

/** Failed runs, newest first: a verdict pill, what failed and what Rescue did, and GitHub's own words when they matched. */
export function RescueList({ rows }: { rows: RescueRow[] }) {
  return (
    <ul role="list" className="divide-y divide-white/5 rounded-xl inset-ring inset-ring-white/10">
      {rows.map((r) => {
        const done = outcome(r);
        const said = r.jobs.find((j) => j.matched)?.matched;
        return (
          <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-start">
            <div className="sm:pt-0.5"><RescuePill r={r} /></div>
            <div className="min-w-0 max-sm:col-span-2 max-sm:row-start-2">
              <p className="text-base/6 font-medium break-words sm:text-sm/6">
                {r.workflow} <span className="font-normal text-zinc-400">· {r.repo.split('/')[1]}</span>
                {r.cronkick && <span className="ml-2 align-middle"><Badge tone="amber">Cronkick</Badge></span>}
              </p>
              {(what(r) || done) && (
                <p className="text-sm/6 text-zinc-400 sm:text-[0.8125rem]/5">
                  {what(r)}{what(r) && done && ' · '}{done && <span className={done.tone}>{done.text}</span>}
                </p>
              )}
              {said && <p className="mt-2 border-l-2 border-white/10 pl-3 font-mono text-sm/5 break-words text-zinc-400 sm:text-[0.8125rem]/5">{said}</p>}
            </div>
            <div className="flex items-center gap-x-3 text-sm/6 sm:block sm:text-right sm:text-[0.8125rem]/5">
              <p><Time iso={r.completedAt} date className="text-zinc-300 tabular-nums" /></p>
              <p>
                <a target="_blank" rel="noreferrer" href={r.runUrl} className="inline-flex min-h-11 items-center gap-x-1 text-zinc-400 hover:text-white sm:min-h-0">
                  {r.runAttempt > 1 ? `Attempt ${r.runAttempt}` : 'View run'}<span className="sr-only"> of {r.workflow} on GitHub</span>
                  <ArrowTopRightOnSquareIcon aria-hidden="true" className="size-3.5 shrink-0 fill-current" />
                </a>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The window's counts: what was GitHub's side, and what Rescue left out on purpose. */
export function RescueSummary({ counts, days }: { counts: Record<string, number>; days: number }) {
  const n = (k: string) => counts[k] ?? 0;
  const stats: [label: string, value: number, note: string, tone: string][] = [
    ['GitHub broke', n('github_broke'), 'no runner, or a GitHub service error', n('github_broke') ? 'text-red-300' : 'text-white'],
    ['Probably GitHub', n('probably_github') + n('mixed'), 'runner lost, or unconfirmed', 'text-white'],
    ['Didn’t start', n('not_started'), 'failed with no jobs', 'text-white'],
    ['Not counted', n('billing') + n('self_hosted'), 'billing locks and self-hosted runners', 'text-zinc-300'],
  ];
  return (
    <div className="@container tile">
      <dl className="grid grid-cols-2 @3xl:grid-cols-4">
        {stats.map(([label, value, note, tone]) => (
          <div key={label} className="min-w-0 border-white/5 p-5 nth-[n+3]:border-t even:border-l @3xl:nth-[n+3]:border-t-0 @3xl:not-first:border-l">
            <dt className="truncate text-sm/6 text-zinc-400 sm:text-[0.8125rem]/5">{label}</dt>
            <dd className={`mt-2 text-3xl font-semibold tracking-tight tabular-nums ${tone}`}>{value}</dd>
            <dd className="mt-1 text-sm/5 text-pretty text-zinc-500 sm:text-[0.8125rem]/5">{note}</dd>
          </div>
        ))}
      </dl>
      <p className="border-t border-white/5 px-5 py-3 text-sm/6 text-zinc-500 sm:text-[0.8125rem]/5">Failed runs in the last {days} days, in the repositories Cronkick can see.</p>
    </div>
  );
}

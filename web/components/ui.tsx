import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon, InformationCircleIcon, MinusCircleIcon, NoSymbolIcon, QuestionMarkCircleIcon, XCircleIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { SlotDisplay, Verdict } from '@/lib/data';
import { fmtSpan } from '@/lib/live';
import { TimeRange } from './live';

const base = 'inline-flex items-center justify-center gap-x-1.5 rounded-lg text-base/6 font-medium whitespace-nowrap sm:text-sm/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';
const sizes = { lg: 'px-4.5 py-3 sm:py-2.5', md: 'px-3.5 py-2.5 sm:py-2', sm: 'px-2.5 py-1.5 sm:py-1' };
const variants = {
  // One per page.
  primary: 'bg-brand-500 text-ink hover:bg-brand-400',
  secondary: 'bg-white/5 text-white inset-ring inset-ring-white/10 hover:bg-white/10',
  ghost: 'text-zinc-400 hover:bg-white/5 hover:text-white',
};
type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes };
const cls = ({ variant = 'secondary', size = 'md' }: Style, extra = '') => `${base} ${sizes[size]} ${variants[variant]} ${extra}`;

export function ButtonLink({ variant, size, className, ...props }: Style & ComponentProps<typeof Link>) {
  return <Link {...props} className={cls({ variant, size }, className)} />;
}
export function Button({ variant, size, className, ...props }: Style & ComponentProps<'button'>) {
  return <button {...props} className={cls({ variant, size }, className)} />;
}

export const tones = {
  green: 'bg-emerald-400/10 text-emerald-300 inset-ring-emerald-400/20',
  amber: 'bg-brand-500/10 text-brand-300 inset-ring-brand-500/20',
  orange: 'bg-orange-400/10 text-orange-300 inset-ring-orange-400/20',
  red: 'bg-red-500/10 text-red-300 inset-ring-red-500/20',
  blue: 'bg-sky-400/10 text-sky-300 inset-ring-sky-400/20',
  zinc: 'bg-white/5 text-zinc-400 inset-ring-white/10',
};
export type Tone = keyof typeof tones;
export function Badge({ tone = 'zinc', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-sm/5 font-medium whitespace-nowrap inset-ring sm:text-xs/5 ${tones[tone]}`}>{children}</span>;
}

// Honest slot words: what Cronkick knows, never more. The job's own result is shown separately (JobResult).
// Keyed by display state (SlotView.display): the stored state, or `waiting` / `overdue` for a due slot not sent yet.
export const SLOT_TONE: Record<SlotDisplay, Tone> = {
  accepted: 'green', fired: 'blue', unknown: 'zinc', rejected: 'red', expired: 'red', skipped: 'zinc', pending: 'zinc', dispatching: 'blue',
  waiting: 'blue', overdue: 'red',
};
export const SLOT_LABEL: Record<SlotDisplay, string> = {
  accepted: 'Started', fired: 'Sent', unknown: 'Unconfirmed', rejected: 'Refused', expired: 'Gave up', skipped: 'Skipped', pending: 'Due',
  dispatching: 'Sending', waiting: 'Sending', overdue: 'Overdue',
};
export const SLOT_HELP: Record<SlotDisplay, string> = {
  accepted: 'GitHub created the run.',
  fired: 'GitHub accepted the request; the run is not linked yet.',
  unknown: 'Cronkick sent it but could not confirm GitHub got it, so it did not resend.',
  rejected: 'GitHub refused the trigger, so Cronkick did not retry. The note says why.',
  expired: 'Not sent before its deadline, so Cronkick skipped it rather than run it late. The note says why.',
  skipped: 'Not sent: the schedule was paused or changed.',
  pending: 'Waiting for its scheduled time.',
  dispatching: 'Sending to GitHub now.',
  waiting: 'Due now; Cronkick is sending it.',
  overdue: 'Over a minute past its scheduled time and Cronkick hasn’t sent it yet.',
};
/** Overdue says whose side the delay is on: not sent yet, or GitHub erroring while Cronkick retries. */
export const slotHelp = (display: SlotDisplay, retrying = false) =>
  retrying ? 'Retrying: GitHub returned errors. Cronkick keeps trying until the deadline.' : SLOT_HELP[display];

// Account verdict words for the account list and switcher; the word always goes with the dot.
export const VERDICT_DOT: Record<Verdict, string> = {
  on_time: 'bg-emerald-400', late: 'bg-orange-300', in_progress: 'bg-sky-400', unconfirmed: 'bg-zinc-400', missed: 'bg-red-500', behind: 'bg-red-500',
  needs_fix: 'bg-red-500', no_runs: 'bg-zinc-500', quiet: 'bg-zinc-500', nothing_scheduled: 'bg-zinc-600',
};
export const VERDICT_WORD: Record<Verdict, string> = {
  on_time: 'no issues', late: 'late runs', in_progress: 'sending', unconfirmed: 'unconfirmed', missed: 'not sent', behind: 'overdue',
  needs_fix: 'needs a fix', no_runs: 'waiting for first run', quiet: 'nothing due today', nothing_scheduled: 'nothing scheduled',
};

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-[0.875em] text-zinc-200">{children}</code>;
}

/** Monospace uppercase label above section headings. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-sm/6 font-medium tracking-wide text-brand-400 uppercase sm:text-xs/6">{children}</p>;
}

export const SLOT_ICON: Record<SlotDisplay, typeof ClockIcon> = {
  accepted: CheckCircleIcon, fired: ClockIcon, unknown: QuestionMarkCircleIcon, rejected: NoSymbolIcon, expired: XCircleIcon, skipped: MinusCircleIcon,
  pending: ClockIcon, dispatching: ClockIcon, waiting: ClockIcon, overdue: ExclamationTriangleIcon,
};

/** A status pill: icon plus word, so it reads without relying on colour alone. For exceptions; routine states use a dot. */
export function Pill({ tone, icon: Icon, title, children }: { tone: Tone; icon: typeof ClockIcon; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex items-center gap-x-1 rounded-md py-0.5 pr-1.5 pl-0.5 text-xs/5 font-medium whitespace-nowrap inset-ring ${tones[tone]}`}>
      <Icon aria-hidden="true" className="size-4 shrink-0 fill-current" />{children}
    </span>
  );
}

/** Slot status pill by display state. */
export function SlotPill({ state, retrying }: { state: SlotDisplay; retrying?: boolean }) {
  return <Pill tone={SLOT_TONE[state] ?? 'zinc'} icon={SLOT_ICON[state] ?? ClockIcon} title={slotHelp(state, retrying)}>{SLOT_LABEL[state] ?? state}</Pill>;
}
export const LatePill = () => <Pill tone="orange" icon={ClockIcon} title="Sent more than 30 s after its scheduled time.">Late</Pill>;
export const JobFailedPill = () => <Pill tone="red" icon={XCircleIcon} title="GitHub ran the workflow and it failed.">Run failed</Pill>;

/** A dot and a word, for routine states. */
export function StatusDot({ dot, children, className = '' }: { dot: string; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-x-2 ${className}`}><span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />{children}</span>;
}

/** Where to set the address that limit and miss emails go to (R20). */
export function AlertHint({ id }: { id: number }) {
  return <>Add an alert email in <Link href={`/dashboard/${id}/settings`} className="font-medium text-white underline decoration-white/20 hover:decoration-white">Settings</Link> to hear about limits and misses.</>;
}

/** A neutral notice: history and context, not a problem to act on now. */
export function Notice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex gap-x-3 rounded-xl bg-white/[0.03] px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10 ${className}`}>
      <InformationCircleIcon aria-hidden="true" className="mt-1 size-4 shrink-0 fill-zinc-400" />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

/**
 * Cronkick's own planner outages that overlap what the page shows; nothing when there are none. Neutral, not red:
 * it's past, and nobody knows what it cost. The window starts at the last planning pass, and the dispatcher may have
 * kept sending runs planned before it, so it can't say none were sent.
 */
export function GapNotice({ gaps, className = '' }: { gaps: { start: string; end: string }[]; className?: string }) {
  if (!gaps.length) return null;
  return (
    <Notice className={className}>
      {gaps.map((g) => (
        <p key={g.start}>
          <span className="font-medium text-white">Coverage gap</span> · <TimeRange start={g.start} end={g.end} /> ({fmtSpan(Date.parse(g.end) - Date.parse(g.start))}).
          {' '}Runs due then may not have been sent; runs that were sent are in the history.
        </p>
      ))}
    </Notice>
  );
}

/** Compatibility messages mark code with backticks; show those parts as code. */
export function Ticks({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') ? <Code key={i}>{part.slice(1, -1)}</Code> : part))}</>;
}

// Display states that never become a GitHub run, so there is no job result to wait for.
const NO_RUN = new Set<SlotDisplay>(['overdue', 'rejected', 'expired', 'skipped']);

/** The GitHub job's own result, only when GitHub reported one; "—" for a row that was never sent. */
export function JobResult({ conclusion, display }: { conclusion: string | null; display?: SlotDisplay }) {
  if (!conclusion && display && NO_RUN.has(display)) return <span title="No run" className="text-zinc-600"><span aria-hidden="true">—</span><span className="sr-only">No run</span></span>;
  if (!conclusion) return <span className="text-zinc-400">Not reported yet</span>;
  if (conclusion === 'success') return <span className="text-emerald-300">✓ Passed</span>;
  if (conclusion === 'neutral' || conclusion === 'skipped') return <span className="text-zinc-400">{conclusion}</span>;
  return <span className="text-red-300">✕ {conclusion === 'failure' ? 'Failed' : conclusion.replace('_', ' ')}</span>;
}

const KEY: [string, string, string][] = [
  ['bg-ontime', 'On time', 'Sent to GitHub within 30 s of its scheduled time.'],
  ['bg-late', 'Late', 'Sent, but more than 30 s after its scheduled time.'],
  ['tick-waiting', 'Sending', 'Due in the last minute; Cronkick is sending it.'],
  ['tick-overdue', 'Overdue', 'Over a minute past its scheduled time and not sent yet.'],
  ['tick-unconfirmed', 'Unconfirmed', 'Sent, but GitHub didn’t confirm it. Cronkick doesn’t resend, to avoid a double run.'],
  ['bg-missed', 'Refused or gave up', 'GitHub refused the trigger, or it wasn’t sent before its deadline.'],
  ['tick-skip', 'Skipped', 'Not sent because the schedule was paused or changed.'],
  ['tick-gap', 'Coverage gap', 'Cronkick wasn’t planning runs; runs due then may not have been sent.'],
];

/** What the strip colours mean. A native popover: Escape and a click outside close it, and it never covers the page layout. */
export function StatusKey() {
  return (
    <>
      <button type="button" popoverTarget="status-key" className="-my-3 inline-flex min-h-11 items-center rounded-md px-1.5 font-medium text-zinc-300 underline decoration-white/30 underline-offset-2 hover:text-white hover:decoration-white">Status key</button>
      <div id="status-key" popover="auto" className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl bg-zinc-900 p-5 text-sm/6 text-zinc-300 shadow-2xl ring-1 ring-white/10 backdrop:bg-black/50">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-white">Status key</p>
          <button type="button" popoverTarget="status-key" popoverTargetAction="hide" className="-mr-2 inline-flex min-h-11 items-center rounded-md px-3 text-zinc-300 hover:text-white">Close</button>
        </div>
        <dl className="mt-3 space-y-2.5">
          {KEY.map(([cls, word, help]) => (
            <div key={word} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-3">
              <dt className="flex h-6 items-center"><span aria-hidden="true" className={`flex h-4 w-2.5 rounded-xs ${cls}`} /><span className="sr-only">{word}</span></dt>
              <dd><span className="font-medium text-white">{word}.</span> {help}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[13px]/5 text-zinc-400">The GitHub run’s own result (passed or failed) comes from GitHub and is shown separately in the history.</p>
      </div>
    </>
  );
}

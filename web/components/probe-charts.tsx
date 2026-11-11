'use client';
import { useState } from 'react';
import { fmtUtc } from '@/lib/format';
import { fmtDuration, humanCron } from '@/lib/live';

const POSITIONS = 96;
const num = (n: number) => n.toLocaleString('en-US');
const late = (sec: number) => (sec < 60 ? `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s` : fmtDuration(sec * 1000));

/** One probe schedule: counts over the whole sample, and its latest due times (in one probe repo) for the charts. */
export type Cohort = {
  cron: string; expected: number; ran: number; p50Sec: number | null; p95Sec: number | null;
  ticks: { due: string; delaySec: number | null }[];
};

// Log scale for "how late": 0.5 s to 1 h.
const LO = Math.log10(0.5), HI = Math.log10(3600);
const x = (sec: number) => `${Math.min(100, Math.max(0, ((Math.log10(Math.max(sec, 0.5)) - LO) / (HI - LO)) * 100))}%`;
const AXIS: [number, string][] = [[1, '1 s'], [10, '10 s'], [60, '1 min'], [600, '10 min'], [3600, '1 h']];
// A fixed vertical spread so dots at the same delay don't hide each other.
const y = (i: number) => `${15 + ((i * 37) % 70)}%`;
const tone = (t: { delaySec: number | null }) => (t.delaySec === null ? 'bg-missed' : t.delaySec <= 30 ? 'bg-ontime' : 'bg-late');
const say = (t: { due: string; delaySec: number | null }) => `${fmtUtc(new Date(t.due))} · ${t.delaySec === null ? 'GitHub never ran it' : `GitHub ran it ${late(t.delaySec)} late`}`;

/**
 * GitHub's own `schedule:` in our probe repos, drawn: the headline numbers, every recent due time as a strip (red:
 * never ran), and every run that did happen as a dot by how late it started. Tabs pick the probe schedule.
 */
export function ProbeCharts({ cohorts }: { cohorts: Cohort[] }) {
  const shown = cohorts.filter((c) => c.expected > 0);
  const [pick, setPick] = useState(0);
  if (!shown.length) return null;
  const c = shown[Math.min(pick, shown.length - 1)];
  const ran = c.ticks.filter((t) => t.delaySec !== null);
  const stat = 'text-2xl/8 font-semibold tracking-tight text-white tabular-nums';
  return (
    <div className="@container space-y-8 rounded-2xl bg-white/[0.03] p-5 inset-ring inset-ring-white/10 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base/7 font-semibold text-white">GitHub’s <code className="font-mono">schedule:</code>, run by run</h2>
        {shown.length > 1 && (
          <nav aria-label="Probe schedule" className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm/6">
            {shown.map((s, i) => (
              <button key={s.cron} type="button" aria-pressed={s === c} onClick={() => setPick(i)}
                className={`inline-flex min-h-11 items-center rounded-md px-3 sm:min-h-8 ${s === c ? 'bg-white/10 font-medium text-white' : 'text-zinc-300 hover:text-white'}`}>{humanCron(s.cron)}</button>
            ))}
          </nav>
        )}
      </div>

      <dl className="grid gap-6 @2xl:grid-cols-3 @2xl:gap-0 @2xl:divide-x @2xl:divide-white/10">
        <div className="@2xl:pr-6">
          <dt className="truncate text-sm/6 text-zinc-400">Ran when it was due</dt>
          <dd className={stat}>{((c.ran / c.expected) * 100).toFixed(1).replace(/\.0$/, '')}%</dd>
          <dd className="text-sm/6 text-zinc-400 tabular-nums">{num(c.ran)} of {num(c.expected)} runs</dd>
        </div>
        <div className="@2xl:px-6">
          <dt className="truncate text-sm/6 text-zinc-400">Typical delay</dt>
          <dd className={stat}>{c.p50Sec === null ? '—' : late(c.p50Sec)}</dd>
          <dd className="text-sm/6 text-zinc-400">Half of the runs started later than this.</dd>
        </div>
        <div className="@2xl:pl-6">
          <dt className="truncate text-sm/6 text-zinc-400">Worst 5%</dt>
          <dd className={stat}>{c.p95Sec === null ? '—' : late(c.p95Sec)}</dd>
          <dd className="text-sm/6 text-zinc-400">Or later, for 1 run in 20.</dd>
        </div>
      </dl>

      <div className="space-y-3">
        <p className="text-sm/6 text-zinc-300">Latest {POSITIONS} due times in one probe repo <span className="text-zinc-400">· hover one</span></p>
        <div role="img" aria-label={`Latest ${c.ticks.length} due times: GitHub ran ${ran.length}, never ran ${c.ticks.length - ran.length}.`}
          className="flex h-10 items-stretch gap-px rounded-sm sm:gap-[3px]">
          {POSITIONS > c.ticks.length && <span aria-hidden="true" className="tick-track" style={{ flex: POSITIONS - c.ticks.length }} />}
          {c.ticks.map((t) => <span key={t.due} aria-hidden="true" data-tip={say(t)} className={`tip tick ${tone(t)}`} />)}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]/5 text-zinc-400">
          <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-ontime" />within 30 s</span>
          <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-late" />later</span>
          <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-missed" />never ran ({num(c.ticks.length - ran.length)})</span>
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm/6 text-zinc-300">How late each of those runs started <span className="text-zinc-400">· log scale, hover a dot</span></p>
        <div role="img" aria-label={`${ran.length} runs by how late they started.`} className="relative h-14 rounded-md bg-white/[0.02] inset-ring inset-ring-white/5">
          {AXIS.map(([s]) => <span key={s} aria-hidden="true" className="absolute inset-y-0 w-px bg-white/5" style={{ left: x(s) }} />)}
          {/* `.tip` sets position: relative, so absolute! keeps the dots placed. */}
          {ran.map((t, i) => <span key={t.due} aria-hidden="true" data-tip={say(t)} className={`tip absolute! block size-2.5 -translate-1/2 rounded-full ring-1 ring-ink hover:z-10 hover:scale-150 ${tone(t)}`} style={{ left: x(t.delaySec!), top: y(i) }} />)}
        </div>
        <div aria-hidden="true" className="relative h-5 text-xs/5 whitespace-nowrap text-zinc-400 tabular-nums">
          {AXIS.map(([s, l]) => <span key={s} className="absolute -translate-x-1/2 last:-translate-x-full" style={{ left: x(s) }}>{l}</span>)}
        </div>
      </div>
    </div>
  );
}

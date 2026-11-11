'use client';
import { useState } from 'react';
import { fmtUtc } from '@/lib/format';
import { fmtDuration, humanCron } from '@/lib/live';
import { GitHubMark } from './icons';
import { Countdown, Time, useNow } from './live';

const POSITIONS = 96;
const num = (n: number) => n.toLocaleString('en-US');
const late = (sec: number) => (sec < 60 ? `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s` : fmtDuration(sec * 1000));
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1).replace(/\.0$/, '')}%`;

type Stats = { expected: number; ran: number; p50Sec: number | null; p95Sec: number | null };
/** One cron measured both ways in one repo (from `probePairs`), with dates as ISO strings. */
export type PairView = {
  cron: string; state: 'compared' | 'collecting' | 'paused'; reason: string | null;
  repo: string | null; isPublic: boolean; hours: number; from: string | null;
  startAt: string | null; sampleFrom: string | null; until: string | null;
  github: { file: string; stats: Stats }; cronkick: { file: string; stats: Stats };
  ticks: { due: string; github: number | null; cronkick: number | null }[];
};

// Log scale for "how late": 0.5 s to 1 h.
const LO = Math.log10(0.5), HI = Math.log10(3600);
const x = (sec: number) => `${Math.min(100, Math.max(0, ((Math.log10(Math.max(sec, 0.5)) - LO) / (HI - LO)) * 100))}%`;
const AXIS: [number, string][] = [[1, '1 s'], [10, '10 s'], [60, '1 min'], [600, '10 min'], [3600, '1 h']];
const y = (i: number) => `${15 + ((i * 37) % 70)}%`; // a fixed spread so equal delays don't hide each other
const tone = (d: number | null) => (d === null ? 'bg-missed' : d <= 30 ? 'bg-ontime' : 'bg-late');
const say = (due: string, d: number | null, who: string) => `${fmtUtc(new Date(due))} · ${d === null ? `${who} never ran it` : `${who} ran it ${late(d)} late`}`;
// Label above the chart on narrow screens, beside it on wide ones.
const LANE = 'grid items-center gap-x-4 gap-y-1.5 @xl:grid-cols-[8rem_minmax(0,1fr)]';
const SIDES = [['cronkick', 'Cronkick'], ['github', 'GitHub schedule:']] as const;

function Strip({ p, side }: { p: PairView; side: 'github' | 'cronkick' }) {
  const who = side === 'github' ? 'GitHub' : 'Cronkick';
  const ran = p.ticks.filter((t) => t[side] !== null).length;
  return (
    <div role="img" aria-label={`${who}, latest ${p.ticks.length} due times: ran ${ran}, never ran ${p.ticks.length - ran}.`}
      className="flex h-9 items-stretch gap-px rounded-sm @xl:gap-[3px]">
      {POSITIONS > p.ticks.length && <span aria-hidden="true" className="tick-track" style={{ flex: POSITIONS - p.ticks.length }} />}
      {p.ticks.map((t) => <span key={t.due} aria-hidden="true" data-tip={say(t.due, t[side], who)} className={`tip tick ${tone(t[side])}`} />)}
    </div>
  );
}

function Dots({ p, side }: { p: PairView; side: 'github' | 'cronkick' }) {
  const who = side === 'github' ? 'GitHub' : 'Cronkick';
  const ran = p.ticks.filter((t) => t[side] !== null);
  return (
    <div role="img" aria-label={`${who}: ${ran.length} runs by how late they started.`} className="relative h-12 rounded-md bg-white/[0.02] inset-ring inset-ring-white/5">
      {AXIS.map(([s]) => <span key={s} aria-hidden="true" className="absolute inset-y-0 w-px bg-white/5" style={{ left: x(s) }} />)}
      {/* `.tip` sets position: relative, so absolute! keeps the dots placed. */}
      {ran.map((t, i) => <span key={t.due} aria-hidden="true" data-tip={say(t.due, t[side], who)} className={`tip absolute! block size-2.5 -translate-1/2 rounded-full ring-1 ring-ink hover:z-10 hover:scale-150 ${tone(t[side])}`} style={{ left: x(t[side]!), top: y(i) }} />)}
    </div>
  );
}

const H = 3_600_000;
const plus = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
/**
 * When numbers appear. A scheduled minute only counts once GitHub has had an hour to create its run, and the probes
 * are read every 5 minutes, so the first numbers come about 1 h 5 min after measuring starts.
 */
const firstAt = (start: string) => plus(start, H + 5 * 60_000);
const fullAt = (start: string, hours: number) => plus(start, (hours + 1) * H + 5 * 60_000);

/**
 * Before a pair has numbers: how far along it is (a bar from the start of measuring to the full comparison, with the
 * first numbers marked) and the runs so far on both sides, not counted yet. Times are the viewer's.
 */
function Waiting({ p }: { p: PairView }) {
  const now = useNow(30_000);
  const start = p.startAt!;
  const first = firstAt(start), full = fullAt(start, 6);
  const span = Date.parse(full) - Date.parse(start);
  const done = now === null ? 0 : Math.min(1, Math.max(0, (now - Date.parse(start)) / span));
  const mark = (Date.parse(first) - Date.parse(start)) / span;
  // Every due time from the start to the full comparison: the runs so far, then the ones still to come.
  const step = (p.cron.startsWith('*/5') ? 5 : 60) * 60_000;
  const slots = Math.min(POSITIONS, Math.ceil(span / step));
  const lane = (side: 'github' | 'cronkick', who: string) => (
    <div className="flex h-7 items-stretch gap-px rounded-sm @xl:gap-[3px]">
      {p.ticks.slice(-slots).map((t) => (
        <span key={t.due} aria-hidden="true" className={`tip tick ${t[side] === null ? 'tick-skip' : tone(t[side])}`}
          data-tip={`${fmtUtc(new Date(t.due))} · ${t[side] === null ? `${who} hasn’t run it yet` : `${who} ran it ${late(t[side]!)} late`}`} />
      ))}
      {slots > p.ticks.length && <span aria-hidden="true" className="tick-track" style={{ flex: slots - p.ticks.length }} />}
    </div>
  );
  return (
    <div className="space-y-6 rounded-xl bg-white/[0.02] p-4 inset-ring inset-ring-white/5 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="flex items-center gap-x-2 text-base/7 font-medium text-white sm:text-sm/6">
          <span aria-hidden="true" className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-400 opacity-60" /><span className="relative inline-flex size-2 rounded-full bg-brand-400" /></span>
          Measuring
        </p>
        <p className="text-base/7 text-zinc-400 tabular-nums sm:text-sm/6">
          {now !== null && now < Date.parse(first)
            ? <>First numbers <Countdown to={first} className="font-medium text-white" /></>
            : <>Full comparison <Countdown to={full} className="font-medium text-white" /></>}
        </p>
      </div>

      <div>
        <div role="progressbar" aria-label="Measuring progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)}
          className="relative h-2 rounded-full bg-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500/60 to-brand-400 transition-[width] duration-700" style={{ width: `${done * 100}%` }} />
          <span aria-hidden="true" className="absolute -top-1 h-4 w-px bg-white/40" style={{ left: `${mark * 100}%` }} />
        </div>
        <div className="relative mt-2 h-10 text-[13px]/5 text-zinc-400 tabular-nums">
          <span className="absolute left-0"><span className="block text-zinc-300">Started</span><Time iso={start} /></span>
          <span className="absolute -translate-x-1/2 text-center max-sm:hidden" style={{ left: `${mark * 100}%` }}><span className="block text-zinc-300">First numbers</span>~<Time iso={first} /></span>
          <span className="absolute right-0 text-right"><span className="block text-zinc-300">Full comparison</span>~<Time iso={full} date /></span>
        </div>
      </div>

      {p.ticks.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm/6 text-zinc-300">Runs so far <span className="text-zinc-400">· not counted yet, hover one</span></p>
          {SIDES.map(([side, label]) => (
            <div key={side} className={LANE}>
              <p className="text-[13px]/5 font-medium text-zinc-200">{label}</p>
              {lane(side, side === 'github' ? 'GitHub' : 'Cronkick')}
            </div>
          ))}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]/5 text-zinc-400 @xl:pl-[9rem]">
            <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-ontime" />ran within 30 s</span>
            <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-late" />ran later</span>
            <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="tick-skip h-3 w-2 rounded-sm ring-1 ring-white/20" />no run yet</span>
          </p>
        </div>
      )}

      <p className="border-t border-white/5 pt-3 text-[13px]/5 text-pretty text-zinc-400">
        GitHub can create a scheduled run up to an hour late, so a scheduled minute is only counted, as ran or never ran, once that hour has passed. Both sides are counted over the same minutes.
      </p>
    </div>
  );
}

/** The three numbers, GitHub next to Cronkick. */
function Numbers({ p }: { p: PairView }) {
  const rows: [string, (s: Stats) => string, (s: Stats) => string | null][] = [
    ['Ran when it was due', (s) => pct(s.ran, s.expected), (s) => `${num(s.ran)} of ${num(s.expected)}`],
    ['Typical delay', (s) => (s.p50Sec === null ? '—' : late(s.p50Sec)), () => 'half started later'],
    ['Worst 5%', (s) => (s.p95Sec === null ? '—' : late(s.p95Sec)), () => '1 run in 20 or later'],
  ];
  return (
    <div className="overflow-hidden rounded-xl inset-ring inset-ring-white/10">
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-white/5 bg-white/[0.02] text-[13px]/5 text-zinc-400 @xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
        <span className="py-2.5 pl-4" />
        <span className="px-3 py-2.5 font-medium text-white @xl:px-4">GitHub <code className="font-mono font-normal text-zinc-300">schedule:</code></span>
        <span className="px-3 py-2.5 font-medium text-white @xl:px-4">Cronkick</span>
      </div>
      {rows.map(([label, big, small]) => (
        <div key={label} className="grid grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)] border-b border-white/5 last:border-b-0 @xl:grid-cols-[12rem_minmax(0,1fr)_minmax(0,1fr)]">
          <span className="py-3 pl-4 text-xs/5 text-zinc-400 @xl:text-[13px]/5">{label}</span>
          {[p.github.stats, p.cronkick.stats].map((s, i) => (
            <span key={i} className="px-3 py-3 @xl:px-4">
              <span className={`block text-base/6 font-semibold tracking-tight whitespace-nowrap tabular-nums @xl:text-2xl/8 ${i ? 'text-emerald-300' : 'text-orange-300'}`}>{big(s)}</span>
              <span className="block text-xs/5 text-zinc-400 tabular-nums">{small(s)}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * GitHub's own `schedule:` against a Cronkick-triggered twin with the same cron in the same repo, both read from
 * GitHub's run list over the same window: the numbers side by side, the same due times as two strips, and every run
 * as a dot by how late it started. `compact` (home page) shows one pair's numbers and strips only.
 */
export function ProbeCharts({ pairs, compact = false }: { pairs: PairView[]; compact?: boolean }) {
  const [pick, setPick] = useState(0);
  if (!pairs.length) return null;
  const p = pairs[Math.min(pick, pairs.length - 1)];
  const runs = (file: string) => `https://github.com/${p.repo}/actions/workflows/${file.split('/').pop()}`;
  const link = 'font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white';
  return (
    <div className="@container space-y-8 rounded-2xl bg-white/[0.03] p-5 text-left inset-ring inset-ring-white/10 sm:p-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base/7 font-semibold text-white">The same workflow, run two ways</h2>
          {!compact && pairs.length > 1 && (
            <nav aria-label="Schedule" className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm/6 inset-ring inset-ring-white/5">
              {pairs.map((s, i) => (
                <button key={s.cron} type="button" aria-pressed={s === p} onClick={() => setPick(i)}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-md px-3 sm:min-h-8 ${s === p ? 'bg-white/10 font-medium text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}>{humanCron(s.cron)}</button>
              ))}
            </nav>
          )}
        </div>
          <p className="text-sm/6 text-pretty text-zinc-400">
            {humanCron(p.cron)}, once on GitHub’s own <code className="font-mono">schedule:</code> and once triggered by Cronkick, in{' '}
            {p.isPublic && p.repo ? <a target="_blank" rel="noreferrer" href={`https://github.com/${p.repo}`} className={link}>{p.repo}</a> : 'one repository'}.
            {p.github.stats.expected > 0 && ` ${Math.floor(p.hours)}\u00a0h measured.`}
          </p>
      </div>

      {p.state === 'paused' || (!p.startAt && p.reason) ? (
        <p className="rounded-xl bg-white/[0.02] px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/5">
          <span className="font-medium text-white">{p.state === 'paused' ? 'Paused.' : 'Not started.'}</span> {p.reason}.
        </p>
      ) : p.github.stats.expected === 0 && p.startAt ? (
        <Waiting p={p} />
      ) : p.state === 'collecting' && p.startAt ? (
        <p className="rounded-xl bg-brand-500/[0.06] px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-brand-500/20">
          <span className="font-medium text-brand-300">Early numbers.</span> {Math.floor(p.hours)}{'\u00a0'}h measured so far; the full comparison is ready <Countdown to={fullAt(p.startAt, 6)} className="text-white" />.
        </p>
      ) : null}
      {p.state !== 'paused' && p.github.stats.expected > 0 && (
        <>
          <Numbers p={p} />

          <div className="space-y-3">
            <p className="text-sm/6 text-zinc-300">Latest {p.ticks.length} due times <span className="text-zinc-400">· the same instants on both rows, hover one</span></p>
            {SIDES.map(([side, label]) => (
              <div key={side} className={LANE}>
                <p className="text-[13px]/5 font-medium text-zinc-200">{label}</p>
                <Strip p={p} side={side} />
              </div>
            ))}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]/5 text-zinc-400 @xl:pl-[9rem]">
              <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-ontime" />within 30 s</span>
              <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-late" />later</span>
              <span className="flex items-center gap-x-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-missed" />never ran</span>
            </p>
          </div>

          {!compact && (
            <div className="space-y-2">
              <p className="text-sm/6 text-zinc-300">How late each run started <span className="text-zinc-400">· log scale, hover a dot</span></p>
              {SIDES.map(([side, label]) => (
                <div key={side} className={LANE}>
                  <p className="text-[13px]/5 font-medium text-zinc-200">{label}</p>
                  <Dots p={p} side={side} />
                </div>
              ))}
              <div aria-hidden="true" className={LANE}>
                <span className="@max-xl:hidden" />
                <div className="relative h-5 text-xs/5 whitespace-nowrap text-zinc-400 tabular-nums">
                  {AXIS.map(([s, l]) => <span key={s} className="absolute -translate-x-1/2 last:-translate-x-full" style={{ left: x(s) }}>{l}</span>)}
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {p.isPublic && p.repo && p.state !== 'paused' && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-5">
          <span className="text-base/7 text-zinc-400 sm:text-sm/6">Check it yourself:</span>
          {([[p.github.file, 'GitHub schedule'], [p.cronkick.file, 'Cronkick']] as const).map(([file, who]) => (
            <a key={file} target="_blank" rel="noreferrer" href={runs(file)}
              className="inline-flex min-h-11 items-center gap-x-2 rounded-lg bg-white/5 py-2 pr-3 pl-2.5 text-sm/6 text-zinc-200 inset-ring inset-ring-white/10 hover:bg-white/10 hover:text-white sm:min-h-9 sm:py-1.5">
              <GitHubMark className="size-4 shrink-0" />
              <span><span className="font-mono">{file.split('/').pop()}</span> <span className="text-zinc-400">· {who}</span></span>
              <span aria-hidden="true" className="text-zinc-400">↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

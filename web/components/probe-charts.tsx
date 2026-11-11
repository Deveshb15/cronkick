'use client';
import { useState } from 'react';
import { fmtUtc } from '@/lib/format';
import { fmtDuration, humanCron } from '@/lib/live';

const POSITIONS = 96;
const num = (n: number) => n.toLocaleString('en-US');
const late = (sec: number) => (sec < 60 ? `${sec < 10 ? sec.toFixed(1) : Math.round(sec)} s` : fmtDuration(sec * 1000));
const pct = (a: number, b: number) => `${((a / b) * 100).toFixed(1).replace(/\.0$/, '')}%`;

type Stats = { expected: number; ran: number; p50Sec: number | null; p95Sec: number | null };
/** One cron measured both ways in one repo (from `probePairs`), with dates as ISO strings. */
export type PairView = {
  cron: string; state: 'compared' | 'collecting' | 'paused'; reason: string | null;
  repo: string | null; isPublic: boolean; hours: number; from: string | null;
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
  return (
    <div className="@container space-y-8 rounded-2xl bg-white/[0.03] p-5 text-left inset-ring inset-ring-white/10 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base/7 font-semibold text-white">The same workflow, run two ways</h2>
          <p className="text-sm/6 text-pretty text-zinc-400">
            {humanCron(p.cron)} in one repo: once on GitHub’s own <code className="font-mono">schedule:</code>, once triggered by Cronkick. Both read from GitHub’s run list.
            {p.github.stats.expected > 0 && ` ${Math.floor(p.hours)}\u00a0h measured.`}
          </p>
        </div>
        {!compact && pairs.length > 1 && (
          <nav aria-label="Schedule" className="flex gap-1 rounded-lg bg-white/5 p-1 text-sm/6">
            {pairs.map((s, i) => (
              <button key={s.cron} type="button" aria-pressed={s === p} onClick={() => setPick(i)}
                className={`inline-flex min-h-11 items-center rounded-md px-3 sm:min-h-8 ${s === p ? 'bg-white/10 font-medium text-white' : 'text-zinc-300 hover:text-white'}`}>{humanCron(s.cron)}</button>
            ))}
          </nav>
        )}
      </div>

      {p.reason && (
        <p className="rounded-xl bg-white/[0.02] px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/5">
          <span className="font-medium text-white">{p.state === 'paused' ? 'Paused.' : p.github.stats.expected ? 'Early.' : 'Starting.'}</span> {p.reason}.
        </p>
      )}
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

          {p.isPublic && p.repo && (
            <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm/6">
              <span className="text-zinc-400">Check it yourself:</span>
              <a href={runs(p.github.file)} className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">GitHub’s runs ↗</a>
              <a href={runs(p.cronkick.file)} className="font-medium text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">Cronkick’s runs ↗</a>
            </p>
          )}
        </>
      )}
    </div>
  );
}

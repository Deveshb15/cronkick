'use client';
import Link from 'next/link';
import type { CoverageGap, SlotView, Tick } from '@/lib/data';
import { fmtDelay } from '@/lib/live';
import { localTime, useNow } from './live';
import { COLOR, WORD } from './live-strip';
import { SLOT_LABEL } from './ui';

const H = 3_600_000;
export const PAST_H = 18;
export const AHEAD_H = 6;
const SPAN = (PAST_H + AHEAD_H) * H;

export type Lane = { id: number; name: string; repo: string; slots: SlotView[]; upcoming: string[] };

const hm = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/**
 * The last 18 hours and next 6 of every live schedule, one lane each, on a real time axis: sent runs coloured by
 * outcome, planned ones outlined, a line at now, and Cronkick coverage gaps as a hatched band across every lane.
 * Pills are a picture (hover for detail); each lane's name links to its history and carries the text summary.
 * Positions are UTC-until-mounted, so server and client markup match.
 */
export function DayTimeline({ installationId, lanes, gaps, serverNow }: { installationId: number; lanes: Lane[]; gaps: CoverageGap[]; serverNow: string }) {
  const live = useNow(30_000);
  const now = live ?? Date.parse(serverNow);
  const start = now - PAST_H * H;
  const pct = (t: number) => ((t - start) / SPAN) * 100;
  const hours = Array.from({ length: 8 }, (_, i) => Math.ceil(start / (3 * H)) * 3 * H + i * 3 * H).filter((t) => t < start + SPAN);
  const bands = gaps
    .map((g) => [Math.max(Date.parse(g.start), start), Math.min(Date.parse(g.end), now)])
    .filter(([a, b]) => b > a);

  return (
    <section aria-labelledby="timeline" className="tile p-5 max-md:hidden">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="timeline" className="text-sm/6 font-semibold">Last {PAST_H} h <span className="font-normal text-zinc-400">· next {AHEAD_H} h</span></h2>
        <p className="flex items-center gap-x-4 text-xs/5 text-zinc-400">
          {(['ontime', 'late', 'missed'] as Tick[]).map((t) => <span key={t} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-1.5 rounded-sm ${COLOR[t]}`} />{WORD[t]}</span>)}
          <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-1.5 rounded-sm inset-ring-1 inset-ring-zinc-400" />planned</span>
        </p>
      </div>
      <div className="mt-3 -mx-5 -mb-5 border-t border-white/5">
        <div className="relative grid grid-cols-[11rem_minmax(0,1fr)]">
          {/* Axis */}
          <div className="h-8 border-b border-white/5" />
          <div aria-hidden="true" className="relative h-8 border-b border-white/5 font-mono text-[11px]/8 text-zinc-500 tabular-nums">
            {hours.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: `${pct(t)}%` }}>{live === null ? new Date(t).toISOString().slice(11, 16) : hm(t)}</span>)}
          </div>
          {lanes.map((l) => {
            const past = l.slots.filter((s) => Date.parse(s.due) >= start && s.tick !== 'idle');
            const next = l.upcoming.map(Date.parse).filter((t) => t > now && t < start + SPAN);
            const gap = l.upcoming.length > 1 ? Date.parse(l.upcoming[1]) - Date.parse(l.upcoming[0]) : H;
            // Wide enough to see, never wider than the gap between runs.
            const w = `max(3px, min(14px, ${((gap / SPAN) * 60).toFixed(3)}%))`;
            const counts = (Object.keys(WORD) as Tick[]).flatMap((t) => { const n = past.filter((s) => s.tick === t).length; return n ? [`${n} ${WORD[t]}`] : []; });
            const summary = `${l.name}: last ${PAST_H} h ${counts.join(', ') || 'nothing due'}${next.length ? `; next ${live === null ? `${new Date(next[0]).toISOString().slice(11, 16)} UTC` : localTime(new Date(next[0]).toISOString())}` : ''}`;
            return (
              <div key={l.id} className="contents">
                <Link href={`/dashboard/${installationId}/workflows/${l.id}`} aria-label={summary} className="flex min-w-0 flex-col justify-center border-b border-white/5 px-5 py-2.5 hover:bg-white/[0.03]">
                  <span className="truncate text-[13px]/5 font-medium">{l.name}</span>
                  <span className="truncate text-xs/4 text-zinc-500">{l.repo.split('/')[1]}</span>
                </Link>
                <div aria-hidden="true" className="relative h-14 border-b border-white/5">
                  {past.map((s) => (
                    <span key={s.id} data-tip={`${live === null ? s.due.slice(11, 16) : hm(Date.parse(s.due))} · ${SLOT_LABEL[s.display]}${s.sendDelayMs !== null ? ` · sent ${fmtDelay(s.sendDelayMs)}` : ''}`}
                      className={`tip absolute top-1/2 h-5 -translate-x-1/2 -translate-y-1/2 rounded-[4px] ${COLOR[s.tick]}`} style={{ left: `${pct(Date.parse(s.due))}%`, width: w }} />
                  ))}
                  {next.map((t) => (
                    <span key={t} data-tip={`${live === null ? new Date(t).toISOString().slice(11, 16) : hm(t)} · planned`}
                      className="tip absolute top-1/2 h-5 -translate-x-1/2 -translate-y-1/2 rounded-[4px] inset-ring-1 inset-ring-zinc-400/60" style={{ left: `${pct(t)}%`, width: w }} />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Overlays span the track column only. */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 left-44">
            <div className="tl-future absolute inset-y-0 right-0" style={{ left: `${pct(now)}%` }} />
            {bands.map(([a, b]) => <div key={a} className="tl-gap absolute inset-y-0" style={{ left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` }} />)}
            <div className="absolute top-6 bottom-0 w-px bg-brand-500 shadow-[0_0_12px_2px_rgb(255_176_32/0.5)]" style={{ left: `${pct(now)}%` }}>
              <span className="absolute -top-1 left-1/2 size-2 -translate-x-1/2 rounded-full bg-brand-500" />
            </div>
          </div>
        </div>
      </div>
      {bands.length > 0 && <p className="mt-2 text-xs/5 text-zinc-400"><span aria-hidden="true" className="tl-gap mr-1.5 inline-block h-2.5 w-4 rounded-sm align-[-1px]" />Cronkick coverage gap: runs due then may not have been sent.</p>}
    </section>
  );
}

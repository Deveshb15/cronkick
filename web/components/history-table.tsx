'use client';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { Fragment, useEffect, useState } from 'react';
import type { CoverageGap, SlotDisplay, SlotView } from '@/lib/data';
import { fmtDelay, fmtDuration, fmtSpan, gapAt } from '@/lib/live';
import { JobResult, SlotPill, StatusDot, slotHelp } from './ui';
import { Time, TimeRange, useArrivals } from './live';

export type HistoryRow = SlotView & {
  responseStatus: number | null; responseNote: string | null; matchedBy: string | null;
  runStartedAt: string | null; runCompletedAt: string | null;
};

// Routine states read as a dot and a word; problems get a pill.
const ROUTINE: Partial<Record<SlotDisplay, [string, string]>> = {
  accepted: ['bg-emerald-400', 'Started'], fired: ['bg-sky-400', 'Sent'], waiting: ['bg-sky-400', 'Sending'], dispatching: ['bg-sky-400', 'Sending'],
  pending: ['bg-zinc-500', 'Due'], skipped: ['bg-zinc-600', 'Skipped'],
};
function Status({ s }: { s: HistoryRow }) {
  const r = ROUTINE[s.display];
  return r ? <span title={slotHelp(s.display)}><StatusDot dot={r[0]}>{r[1]}</StatusDot></span> : <SlotPill state={s.display} retrying={s.retrying} />;
}
const took = (s: HistoryRow) => (s.runStartedAt && s.runCompletedAt ? fmtDuration(Date.parse(s.runCompletedAt) - Date.parse(s.runStartedAt)) : null);

/** Every step of one slot, from its scheduled time to the run's result, one per line. */
function Steps({ s }: { s: HistoryRow }) {
  const sent = s.state === 'fired' || s.state === 'accepted';
  const tries = s.attempts > 1 ? ` after ${s.attempts} tries` : '';
  const steps = [
    <>Due <Time iso={s.due} zone /></>,
    s.sendDelayMs !== null ? `Sent to GitHub ${fmtDelay(s.sendDelayMs)}${tries}` : s.triedDelayMs !== null && s.attempts > 0 ? `First tried ${fmtDelay(s.triedDelayMs)}${tries}` : 'Not sent',
    s.responseStatus ? `GitHub answered ${s.responseStatus}${s.responseNote ? ` (${s.responseNote})` : ''}` : s.responseNote ?? (sent ? 'GitHub accepted it' : slotHelp(s.display, s.retrying)),
    s.runUrl ? <a target="_blank" rel="noreferrer" href={s.runUrl} className="text-white underline decoration-white/30 hover:decoration-white">Run linked {s.matchedBy === 'time' ? 'by time (a manual run near then could match) ⚠' : 'by id'} ↗</a> : sent ? 'Run not linked yet' : null,
    // Time GitHub took to start the run after accepting it: GitHub's queue, not Cronkick.
    s.runStartedAt && s.sendDelayMs !== null ? `GitHub started the run ${fmtDuration(new Date(s.runStartedAt).getTime() - new Date(s.due).getTime() - s.sendDelayMs)} later` : null,
    s.runUrl ? <>Run <JobResult conclusion={s.conclusion} />{took(s) ? ` in ${took(s)}` : ''}</> : null,
  ].filter(Boolean);
  return (
    <ol className="space-y-1 border-l border-white/10 pl-4 text-[13px]/5 text-zinc-300">
      {steps.map((x, i) => <li key={i}>{x}</li>)}
    </ol>
  );
}

/** The viewer's calendar day for a time, e.g. "Today", "Yesterday", "Mon, Nov 9" (UTC dates until mounted). */
function dayOf(iso: string, local: boolean): string {
  const d = new Date(iso);
  if (!local) return iso.slice(0, 10);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  const label = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toDateString() === today.toDateString() ? `Today · ${label}` : d.toDateString() === y.toDateString() ? `Yesterday · ${label}` : label;
}

/**
 * One page of slot history, newest first, under day headers. A Cronkick coverage gap inside the page's range gets an
 * annotation row where it falls (never a made-up run). A row opens to show every step; `#slot-<id>` in the URL opens
 * and scrolls to that row (the strip's "Open in history" uses it).
 */
export function HistoryTable({ rows, gaps = [], newerEdge = null }: { rows: HistoryRow[]; gaps?: CoverageGap[]; newerEdge?: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const [local, setLocal] = useState(false);
  const fresh = useArrivals(rows.map((r) => r.id));
  useEffect(() => {
    setLocal(true);
    const fromHash = () => {
      const id = Number(location.hash.match(/^#slot-(\d+)$/)?.[1]);
      const row = id ? document.getElementById(`slot-${id}`) : null;
      if (!row) return;
      setOpen(id);
      row.scrollIntoView({ block: 'center' });
      row.classList.remove('row-flash');
      void row.offsetWidth;
      row.classList.add('row-flash');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);
  const toggle = (id: number) => setOpen(open === id ? null : id);
  // Each gap is annotated exactly once, just above the newest run due at or before its start: on this page if that run
  // is here and the run above it (on this page, or `newerEdge` on the page above) is due after the start. Runs sent
  // during the gap (planned before it) stay above the annotation, in time order.
  const gapBefore = (i: number) => gaps.filter((g) => gapAt(rows, i, g, newerEdge));
  const cell = 'max-sm:p-0';
  return (
    <div className="-mx-4 sm:mx-0">
      <table className="w-full text-left text-sm/6 max-sm:block">
        <thead className="text-[13px]/5 text-zinc-400 max-sm:hidden">
          <tr className="border-b border-white/10">
            <th className="py-2.5 pl-1 font-medium">Scheduled</th>
            <th className="font-medium">Status</th>
            <th className="font-medium">Sent after</th>
            <th className="font-medium">GitHub run</th>
            <th className="font-medium">Took</th>
            <th className="pr-1 text-right font-medium">Run</th>
          </tr>
        </thead>
        <tbody className="max-sm:block">
          {rows.map((s, i) => (
            <Fragment key={s.id}>
              {(i === 0 || dayOf(rows[i - 1].due, local) !== dayOf(s.due, local)) && (
                <tr className="max-sm:block"><th colSpan={6} scope="colgroup" className="sticky top-0 z-10 bg-ink/95 px-4 pt-5 pb-2 text-left text-[13px]/5 font-medium text-zinc-300 backdrop-blur max-sm:block sm:px-1">{dayOf(s.due, local)}</th></tr>
              )}
              {gapBefore(i).map((g) => (
                <tr key={g.start} className="border-t border-white/5 max-sm:block">
                  <td colSpan={6} className="px-4 py-2.5 max-sm:block sm:px-1">
                    <span className="flex items-center gap-x-3 text-[13px]/5 text-zinc-400">
                      <span aria-hidden="true" className="tick-gap h-4 shrink-0" />
                      <span><span className="font-medium text-zinc-200">Coverage gap</span> · <TimeRange start={g.start} end={g.end} /> ({fmtSpan(Date.parse(g.end) - Date.parse(g.start))}) · runs due then may not have been sent</span>
                    </span>
                  </td>
                </tr>
              ))}
              {/* The button is the keyboard toggle; a click anywhere else on the row does the same for a mouse. */}
              <tr id={`slot-${s.id}`} onClick={(e) => { if (!(e.target as Element).closest('a,button')) toggle(s.id); }}
                className={`scroll-mt-24 cursor-pointer border-t border-white/5 transition-colors hover:bg-white/[0.02] max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1 max-sm:px-4 max-sm:py-3 ${fresh.has(s.id) ? 'row-flash' : ''}`}>
                <td className={`py-3 pl-1 max-sm:order-1 ${cell}`}>
                  <button type="button" onClick={() => toggle(s.id)} aria-expanded={open === s.id} aria-controls={`steps-${s.id}`}
                    className="-mx-1 flex min-h-11 items-center gap-x-2 rounded px-1 sm:min-h-0">
                    <ChevronRightIcon aria-hidden="true" className={`size-3.5 fill-zinc-500 transition ${open === s.id ? 'rotate-90' : ''}`} />
                    <span className="sr-only">Steps for </span><Time iso={s.due} clock className="text-zinc-100 tabular-nums" />
                  </button>
                </td>
                <td className={`max-sm:order-2 max-sm:justify-self-end ${cell}`}><Status s={s} /></td>
                <td className={`font-mono text-[13px]/5 tabular-nums max-sm:order-3 ${cell} ${s.tick === 'late' ? 'text-orange-300' : 'text-zinc-300'}`}>
                  <span className="font-sans text-zinc-400 sm:hidden">Sent </span>{fmtDelay(s.sendDelayMs)}{s.tick === 'late' && <span className="font-sans"> late</span>}
                </td>
                <td className={`text-[13px]/5 max-sm:order-4 max-sm:justify-self-end ${cell}`}><span className="text-zinc-400 sm:hidden">Run </span><JobResult conclusion={s.conclusion} display={s.display} /></td>
                <td className={`font-mono text-[13px]/5 text-zinc-300 tabular-nums max-sm:hidden ${cell}`}>{took(s) ?? <span className="text-zinc-500">—</span>}</td>
                <td className={`pr-1 text-right max-sm:hidden ${cell}`}>{s.runUrl ? <a target="_blank" rel="noreferrer" href={s.runUrl} className="text-[13px]/5 text-zinc-300 hover:text-white hover:underline">View run<span className="sr-only"> for {s.due}</span> ↗</a> : <span className="text-zinc-500">—</span>}</td>
              </tr>
              <tr id={`steps-${s.id}`} hidden={open !== s.id} className="bg-white/[0.02] max-sm:[&:not([hidden])]:block">
                <td colSpan={6} className="px-4 py-3 max-sm:block sm:px-8"><Steps s={s} /></td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { Fragment, useState } from 'react';
import type { SlotView } from '@/lib/data';
import { fmtDelay, fmtDuration } from '@/lib/live';
import { JobResult, SlotPill, slotHelp } from './ui';
import { Time, useArrivals } from './live';

export type HistoryRow = SlotView & {
  responseStatus: number | null; responseNote: string | null; matchedBy: string | null;
  runStartedAt: string | null; runCompletedAt: string | null;
};

/** Every step of one slot, from its scheduled time to the job's result. */
function Steps({ s }: { s: HistoryRow }) {
  const sent = s.state === 'fired' || s.state === 'accepted';
  const tries = s.attempts > 1 ? ` after ${s.attempts} tries` : '';
  const steps = [
    <>Due <Time iso={s.due} /></>,
    s.sendDelayMs !== null ? `Sent to GitHub ${fmtDelay(s.sendDelayMs)}${tries}` : s.triedDelayMs !== null ? `First tried ${fmtDelay(s.triedDelayMs)}${tries}` : 'Not sent',
    s.responseStatus ? `GitHub answered ${s.responseStatus}${s.responseNote ? ` (${s.responseNote})` : ''}` : s.responseNote ?? (sent ? 'GitHub accepted it' : slotHelp(s.display, s.retrying)),
    s.runUrl ? <a href={s.runUrl} className="text-white hover:underline">Run linked {s.matchedBy === 'time' ? 'by time ⚠' : 'by id'} ↗</a> : sent ? 'Run not linked yet' : null,
    // Time GitHub took to start the run after accepting it: GitHub's queue, not Cronkick.
    s.runStartedAt && s.sendDelayMs !== null ? `GitHub started the run ${fmtDuration(new Date(s.runStartedAt).getTime() - new Date(s.due).getTime() - s.sendDelayMs)} later` : null,
    s.runUrl ? <>Job: <JobResult conclusion={s.conclusion} />{s.runStartedAt && s.runCompletedAt ? ` in ${fmtDuration(new Date(s.runCompletedAt).getTime() - new Date(s.runStartedAt).getTime())}` : ''}</> : null,
  ].filter(Boolean);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem]/5 text-zinc-400">
      {steps.map((x, i) => <Fragment key={i}>{i > 0 && <li aria-hidden="true" className="text-zinc-600">→</li>}<li>{x}</li></Fragment>)}
    </ol>
  );
}

/**
 * Slot history: Cronkick's part and GitHub's job result side by side; a row opens to show every step.
 * Below sm the table stacks: due and pill on one line, send delay, job result and run link under it.
 */
export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const fresh = useArrivals(rows.map((r) => r.id));
  const toggle = (id: number) => setOpen(open === id ? null : id);
  const cell = 'max-sm:p-0';
  return (
    <div className="-mx-4 sm:mx-0 sm:overflow-x-auto">
      <table className="w-full text-left text-sm/6 max-sm:block sm:min-w-[40rem]">
        <thead className="text-xs/5 text-zinc-500 max-sm:hidden">
          <tr className="border-b border-white/10">
            <th className="py-2.5 font-medium">Scheduled</th>
            <th className="font-medium">Sent after</th>
            <th className="font-medium">Cronkick</th>
            <th className="font-medium">GitHub job</th>
            <th className="text-right font-medium">Run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 max-sm:block max-sm:border-t max-sm:border-white/10">
          {rows.map((s) => (
            <Fragment key={s.id}>
              {/* The button is the keyboard toggle; a click anywhere else on the row does the same for a mouse. */}
              <tr id={`slot-${s.id}`} onClick={(e) => { if (!(e.target as Element).closest('a,button')) toggle(s.id); }}
                className={`cursor-pointer transition-colors hover:bg-white/[0.02] max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-x-4 max-sm:gap-y-1 max-sm:px-4 max-sm:py-3 ${fresh.has(s.id) ? 'row-flash' : ''}`}>
                <td className={`py-3 max-sm:order-1 max-sm:col-span-2 ${cell}`}>
                  <button type="button" onClick={() => toggle(s.id)} aria-expanded={open === s.id} aria-controls={`steps-${s.id}`}
                    className="-mx-1 flex items-center gap-x-2 rounded px-1 focus-visible:outline-2 focus-visible:outline-brand-500">
                    <ChevronRightIcon aria-hidden="true" className={`size-3.5 fill-zinc-600 transition ${open === s.id ? 'rotate-90' : ''}`} />
                    <span className="sr-only">Steps for </span><Time iso={s.due} className="text-zinc-200" />
                  </button>
                </td>
                <td className={`font-mono text-xs/5 max-sm:order-3 ${cell} ${s.tick === 'late' ? 'text-orange-300' : s.sendDelayMs === null ? 'text-zinc-500' : 'text-emerald-300'}`}>
                  {s.sendDelayMs === null && s.triedDelayMs !== null ? `tried ${fmtDelay(s.triedDelayMs)}` : <>{s.sendDelayMs !== null && <span className="font-sans text-zinc-500 sm:hidden">Sent </span>}{fmtDelay(s.sendDelayMs)}</>}
                </td>
                <td className={`max-sm:order-2 max-sm:justify-self-end ${cell}`}><SlotPill state={s.display} retrying={s.retrying} /></td>
                <td className={`text-xs/5 max-sm:order-4 ${cell}`}><span className="text-zinc-500 sm:hidden">Job </span><JobResult conclusion={s.conclusion} display={s.display} /></td>
                <td className={`text-right max-sm:order-5 ${cell}`}>{s.runUrl ? <a href={s.runUrl} className="font-mono text-xs/5 text-zinc-400 hover:text-white">view ↗</a> : <span className="text-zinc-600">—</span>}</td>
              </tr>
              <tr id={`steps-${s.id}`} hidden={open !== s.id} className="bg-white/[0.02] max-sm:[&:not([hidden])]:block">
                <td colSpan={5} className="px-4 py-3 max-sm:block sm:px-6"><Steps s={s} /></td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

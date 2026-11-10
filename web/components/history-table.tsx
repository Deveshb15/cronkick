'use client';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { Fragment, useState } from 'react';
import type { SlotView } from '@/lib/data';
import { fmtDelay, fmtDuration } from '@/lib/live';
import { JobResult, SLOT_HELP, SlotPill } from './ui';
import { Time, useArrivals } from './live';

export type HistoryRow = SlotView & {
  responseStatus: number | null; responseNote: string | null; matchedBy: string | null; attempts: number;
  runStartedAt: string | null; runCompletedAt: string | null;
};

/** Every step of one slot, from its scheduled time to the job's result. */
function Steps({ s }: { s: HistoryRow }) {
  const sent = s.state === 'fired' || s.state === 'accepted';
  const steps = [
    <>Due <Time iso={s.due} /></>,
    s.delayMs === null ? 'Not sent' : <>Sent to GitHub {fmtDelay(s.delayMs)}{s.attempts > 1 ? ` after ${s.attempts} tries` : ''}</>,
    s.responseStatus ? `GitHub answered ${s.responseStatus}${s.responseNote ? ` (${s.responseNote})` : ''}` : sent ? 'GitHub accepted it' : SLOT_HELP[s.state],
    s.runUrl ? <a href={s.runUrl} className="text-white hover:underline">Run linked {s.matchedBy === 'time' ? 'by time ⚠' : 'by id'} ↗</a> : sent ? 'Run not linked yet' : null,
    // Time GitHub took to give the job a runner after we sent it: GitHub's queue, not Cronkick.
    s.runStartedAt && s.delayMs !== null ? `Runner started ${fmtDuration(new Date(s.runStartedAt).getTime() - new Date(s.due).getTime() - s.delayMs)} later` : null,
    s.runUrl ? <>Job: <JobResult conclusion={s.conclusion} />{s.runStartedAt && s.runCompletedAt ? ` in ${fmtDuration(new Date(s.runCompletedAt).getTime() - new Date(s.runStartedAt).getTime())}` : ''}</> : null,
  ].filter(Boolean);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.6875rem]/5 text-zinc-400">
      {steps.map((x, i) => <Fragment key={i}>{i > 0 && <li aria-hidden="true" className="text-zinc-600">→</li>}<li>{x}</li></Fragment>)}
    </ol>
  );
}

/** Slot history: Cronkick's part and GitHub's job result side by side; a row opens to show every step. */
export function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const fresh = useArrivals(rows.map((r) => r.id));
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[40rem] text-left text-sm/6">
        <thead className="text-xs/5 text-zinc-500">
          <tr className="border-b border-white/10">
            <th className="py-2.5 pl-4 font-medium sm:pl-0">Scheduled</th>
            <th className="font-medium">Started after</th>
            <th className="font-medium">Cronkick</th>
            <th className="font-medium">GitHub job</th>
            <th className="pr-4 text-right font-medium sm:pr-0">Run</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((s) => (
            <Fragment key={s.id}>
              <tr id={`slot-${s.id}`} onClick={() => setOpen(open === s.id ? null : s.id)} className={`cursor-pointer transition-colors hover:bg-white/[0.02] ${fresh.has(s.id) ? 'row-flash' : ''}`}>
                <td className="py-3 pl-4 sm:pl-0">
                  <span className="flex items-center gap-x-2">
                    <ChevronRightIcon aria-hidden="true" className={`size-3.5 fill-zinc-600 transition ${open === s.id ? 'rotate-90' : ''}`} />
                    <Time iso={s.due} className="text-zinc-200" />
                  </span>
                </td>
                <td className={`font-mono text-xs/5 ${s.tick === 'late' ? 'text-orange-300' : s.delayMs === null ? 'text-zinc-600' : 'text-emerald-300'}`}>{fmtDelay(s.delayMs)}</td>
                <td><SlotPill state={s.state} /></td>
                <td className="text-xs/5"><JobResult conclusion={s.conclusion} /></td>
                <td className="pr-4 text-right sm:pr-0">{s.runUrl ? <a href={s.runUrl} onClick={(e) => e.stopPropagation()} className="font-mono text-xs/5 text-zinc-400 hover:text-white">view ↗</a> : <span className="text-zinc-600">—</span>}</td>
              </tr>
              {open === s.id && <tr className="bg-white/[0.02]"><td colSpan={5} className="px-4 py-3 sm:px-6"><Steps s={s} /></td></tr>}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

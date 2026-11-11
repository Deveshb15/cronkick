import Link from 'next/link';
import type { CoverageGap, DayCell, SlotView, WorkflowRow } from '@/lib/data';
import { latestRun, nextPlan, rowStatus } from '@/lib/format';
import { humanCron, plural } from '@/lib/live';
import { DailyCells } from './daily-cells';
import { Countdown, Time } from './live';
import { LiveStrip } from './live-strip';

const TONE = { ok: 'text-emerald-300', bad: 'text-red-300', quiet: 'text-zinc-300' };

/** What runs next: "Next 15:00 · in 9 min · then every 15 min", or the next few times when slower or irregular. */
function NextRuns({ upcoming, firstRun }: { upcoming: string[]; firstRun: boolean }) {
  const p = nextPlan(upcoming);
  if (p.kind === 'none') return <p className="text-[13px]/5 text-zinc-400">Nothing planned: this schedule isn’t being sent.</p>;
  const lead = firstRun ? 'First run' : 'Next';
  if (p.kind === 'every') {
    return (
      <p className="text-sm/6 text-zinc-300 tabular-nums">
        <span className="text-zinc-400">{lead}</span> <Time iso={p.next} className="font-medium text-white" /> · <Countdown to={p.next} />
        <span className="text-zinc-400"> · then every {p.minutes} min</span>
      </p>
    );
  }
  return (
    <div className="text-sm/6">
      <p className="text-zinc-300 tabular-nums"><span className="text-zinc-400">{lead}</span> <Time iso={p.times[0]} date className="font-medium text-white" /> · <Countdown to={p.times[0]} /></p>
      <p className="mt-1 flex flex-wrap gap-1.5 text-[13px]/5 text-zinc-300 tabular-nums" aria-label="The runs after that">
        {p.times.slice(1).map((t) => <span key={t} className="rounded-md px-2 py-0.5 inset-ring inset-ring-white/10"><Time iso={t} date /></span>)}
      </p>
    </div>
  );
}

/**
 * One schedule with room to show its record: what runs next, its latest recorded runs (pick one to see it), its days,
 * and the newest GitHub result. `spotlight` (the only schedule) shows more recent runs.
 */
export function ScheduleCard({ w, installationId, slots, days, zone, gaps, now, spotlight = false }: {
  w: WorkflowRow; installationId: number; slots: SlotView[]; days: DayCell[]; gaps: CoverageGap[]; now: Date; spotlight?: boolean;
  /** The zone the days are counted in, e.g. "GMT+5:30". */
  zone: string;
}) {
  const href = `/dashboard/${installationId}/workflows/${w.id}`;
  const row = rowStatus(w.status, slots, now);
  // "96 of 96 on time" has no window of its own here (the strip label carries it). "On time" speaks for sending only; GitHub results sit below.
  const st = / of \d+ on time$/.test(row.word) ? { ...row, word: 'On time' } : row;
  const last = latestRun(slots);
  const words = w.schedules.length === 1 ? `${humanCron(w.schedules[0].cron)} · ${w.schedules[0].tz}` : plural(w.schedules.length, 'schedule');
  const plain = w.schedules.some((x) => humanCron(x.cron) !== x.cron);
  const shown = slots.slice(spotlight ? -96 : -48);
  return (
    <article aria-labelledby={`wf-${w.id}`} className="rounded-xl p-4 inset-ring inset-ring-white/10 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 id={`wf-${w.id}`} className="text-base/6 font-semibold break-words">
            <Link href={href} className="hover:underline">{w.name}</Link> <span className="font-normal text-zinc-400">· {w.repo.split('/')[1]}</span>
          </h3>
          <p className="text-[13px]/5 text-zinc-400">{words}{plain && <span className="ml-1.5 font-mono text-xs/5 whitespace-nowrap">{w.schedules.map((s) => s.cron).join(' · ')}</span>}</p>
        </div>
        <div className="flex items-center gap-x-4 text-[13px]/5">
          <span className={`flex items-center gap-x-2 font-medium ${st.text}`}><span aria-hidden="true" className={`size-2 rounded-full ${st.dot}`} />{st.word}</span>
          <Link href={href} className="inline-flex min-h-11 items-center font-medium text-zinc-300 hover:text-white sm:min-h-0">History →</Link>
        </div>
      </div>

      <div className="mt-3"><NextRuns upcoming={w.upcoming} firstRun={!shown.length} /></div>
      {!shown.length && <p className="mt-2 text-[13px]/5 text-zinc-400">Nothing else to do. Its runs, days and results appear here once it has run.</p>}

      {shown.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs/5 text-zinc-400">
            Latest {plural(shown.length, 'recorded run')} · <Time iso={shown[0].due} date /> – <Time iso={shown[shown.length - 1].due} date />
          </p>
          <LiveStrip slots={shown} positions={spotlight ? 96 : 48} height={spotlight ? 'h-12' : 'h-9'} gaps={gaps} interactive historyHref={href} />
        </div>
      )}

      {days.some((d) => d.state !== 'none') && (
        <div className="mt-5">
          <p className="mb-2 text-xs/5 text-zinc-400">Daily · last {days.length} days, today so far · days in {zone}</p>
          <DailyCells cells={days} href={href} height={spotlight ? 'h-9' : 'h-7'} />
        </div>
      )}

      {last && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 border-t border-white/5 pt-3 text-[13px]/5">
          <span className="text-zinc-400">Latest run</span>
          <Time iso={last.due} className="text-zinc-200 tabular-nums" />
          <span className={TONE[last.tone]}>{last.text}</span>
          {last.runUrl && <a href={last.runUrl} className="inline-flex min-h-11 items-center text-zinc-300 hover:text-white hover:underline sm:min-h-0">View run ↗</a>}
        </p>
      )}
    </article>
  );
}

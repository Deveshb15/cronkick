import Link from 'next/link';
import type { CoverageGap, DayCell, SlotView, WorkflowRow } from '@/lib/data';
import { latestRun, nextPlan, rowStatus } from '@/lib/format';
import { humanCron, plural } from '@/lib/live';
import { DailyCells } from './daily-cells';
import { Countdown, Time, TMinus } from './live';
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

const DONE = <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="size-4 text-emerald-300"><path fillRule="evenodd" d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14Zm3.84-8.86a.75.75 0 0 0-1.18-.93L7.1 9.74 5.35 8.02a.75.75 0 1 0-1.05 1.07l2.35 2.3a.75.75 0 0 0 1.12-.07Z" /></svg>;
const QUEUED = <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 text-zinc-600"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2.4" /></svg>;
const SENDING = <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 animate-spin text-brand-400"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" /><path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;

/** Before the first run: what Cronkick has done and what comes next, as a deploy-style log. Only the dispatch row moves. */
function RunLog({ w }: { w: WorkflowRow }) {
  const file = w.path.split('/').pop()!;
  const rows: [icon: React.ReactNode, label: string, detail: React.ReactNode, right: React.ReactNode, active?: boolean][] = [
    [DONE, 'Read schedule', `${file} @ ${w.branch}`, <Time iso={w.readAt} clock />],
    [DONE, 'Plan runs', w.upcoming.slice(0, 4).map((t, i) => <span key={t}>{i > 0 && ' '}<Time iso={t} clock /></span>), <Time iso={w.readAt} clock />],
    [SENDING, 'Dispatch', `workflow_dispatch → ${w.branch}`, <TMinus to={w.upcoming[0]} className="text-brand-300" />, true],
    [QUEUED, 'GitHub run', 'queued after dispatch', '—'],
    [QUEUED, 'Record result', 'conclusion · run link', '—'],
  ];
  return (
    <>
      <ol role="list" className="mt-4 overflow-hidden rounded-lg bg-black/40 inset-ring inset-ring-white/[.06]">
        {rows.map(([icon, label, detail, right, active]) => (
          <li key={label} aria-current={active ? 'step' : undefined} className={`grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-white/5 px-4 py-2.5 last:border-0 ${active ? 'bg-brand-500/[.04]' : ''}`}>
            {icon}
            <p className="truncate text-[13px]/5">
              <span className={active ? 'text-white' : icon === QUEUED ? 'text-zinc-500' : 'text-zinc-200'}>{label}</span>
              <span className={`ml-2 font-mono text-xs ${icon === QUEUED ? 'text-zinc-600' : 'text-zinc-500'}`}>{detail}</span>
            </p>
            <span className={`font-mono text-xs ${icon === QUEUED ? 'text-zinc-700' : 'text-zinc-500'}`}>{right}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]/5 text-zinc-500">
        <span>No need to keep this page open: runs and results show up here.</span>
        <a target="_blank" rel="noreferrer" href={`https://github.com/${w.repo}/actions/workflows/${file}`} className="inline-flex min-h-11 items-center font-medium text-zinc-300 hover:text-white sm:min-h-0">Test it now on GitHub ↗</a>
      </p>
    </>
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

      {!shown.length && w.upcoming.length ? <RunLog w={w} /> : <div className="mt-3"><NextRuns upcoming={w.upcoming} firstRun={!shown.length} /></div>}

      {shown.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs/5 text-zinc-400">
            Latest {plural(shown.length, 'recorded run')} · <Time iso={shown[0].due} date /> – <Time iso={shown[shown.length - 1].due} date />
          </p>
          <LiveStrip slots={shown} positions={spotlight ? 96 : 48} height={spotlight ? 'h-12' : 'h-9'} gaps={gaps} interactive historyHref={href} />
        </div>
      )}

      {shown.length > 0 && days.some((d) => d.state !== 'none') && (
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
          {last.runUrl && <a target="_blank" rel="noreferrer" href={last.runUrl} className="inline-flex min-h-11 items-center text-zinc-300 hover:text-white hover:underline sm:min-h-0">View run ↗</a>}
        </p>
      )}
    </article>
  );
}

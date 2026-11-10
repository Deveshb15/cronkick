import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GitHubMark } from '@/components/icons';
import { RunsChart } from '@/components/runs-chart';
import { SlotStrip, StripLegend } from '@/components/slot-strip';
import { SlotPill } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { MAX_ROWS, dailyRuns, recentTicks, workflowHistory, type Schedule } from '@/lib/data';
import { relTime, utc } from '@/lib/format';

export const dynamic = 'force-dynamic';

const delay = (a: Date | null, b: Date) => (a ? `+${((a.getTime() - b.getTime()) / 1000).toFixed(1)}s` : '—');

function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 pt-4">
      <dt className="text-sm/6 text-zinc-500 sm:text-xs/6">{label}</dt>
      <dd className="mt-1 text-base/6 sm:text-sm/6">{children}</dd>
    </div>
  );
}

export default async function WorkflowPage({ params }: { params: Promise<{ installationId: string; workflowId: string }> }) {
  const p = await params;
  const id = Number(p.installationId);
  const wid = Number(p.workflowId);
  await requireInstallation(id, `/dashboard/${id}/workflows/${wid}`);
  const now = new Date();
  const [h, ticks, days] = await Promise.all([workflowHistory(db, id, wid, now), recentTicks(db, id, now, 96), dailyRuns(db, wid, now, 14)]);
  if (!h) notFound();
  const total = Object.values(h.counts).reduce((a, b) => a + b, 0);
  const ran = (h.counts.accepted ?? 0) + (h.counts.fired ?? 0);
  const missed = (h.counts.unknown ?? 0) + (h.counts.expired ?? 0);
  const schedules = h.workflow.schedules as Schedule[];
  const fileUrl = `https://github.com/${h.workflow.full_name}/blob/${h.workflow.default_branch}/${h.workflow.path}`;
  return (
    <div className="space-y-10">
      <div>
        <Link href={`/dashboard/${id}`} className="text-base/6 text-zinc-400 hover:text-white sm:text-sm/6">← {h.workflow.full_name}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{h.workflow.name}</h1>
          {h.last && <SlotPill state={h.last.state} />}
        </div>
        <p className="mt-1 font-mono text-sm/6 text-zinc-500 sm:text-xs/6">{h.workflow.path}</p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0 space-y-10">
          <section className="rounded-2xl bg-zinc-900/50 p-5 inset-ring inset-ring-white/10 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-sm/6 font-medium">Last 96 slots</h2>
              <StripLegend />
            </div>
            <SlotStrip ticks={ticks.get(wid) ?? Array(96).fill('idle')} size="lg" className="mt-4" />
            <h2 className="mt-8 text-sm/6 font-medium">Runs per day, last 14 days</h2>
            <div className="mt-4"><RunsChart buckets={days} /></div>
          </section>

          {h.slots.length === 0 ? (
            <p className="text-base/6 text-zinc-400 sm:text-sm/6">No runs yet. The first one is due {relTime(h.next)}.</p>
          ) : (
            <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:mx-0">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-0">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Due (UTC)', 'Triggered', 'Status', 'GitHub said', 'Run', 'Result'].map((c) => <th key={c} className="py-2.5 pr-4 font-medium whitespace-nowrap last:pr-0">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-400 tabular-nums">
                    {h.slots.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 pr-4 font-mono text-zinc-200">{utc(s.due_at)}</td>
                        <td className="py-2.5 pr-4 font-mono">{delay(s.first_attempt_at, s.due_at)}</td>
                        <td className="py-2.5 pr-4"><SlotPill state={s.state} /></td>
                        <td className="max-w-xs truncate py-2.5 pr-4" title={s.response_note ?? ''}>{s.response_status ?? ''} {s.response_note ?? ''}</td>
                        <td className="py-2.5 pr-4">
                          {s.run_url ? <a href={s.run_url} className="font-medium text-white hover:underline">View run ↗</a> : '—'}
                          {s.matched_by === 'time' && <span className="ml-2 text-zinc-500" title="Linked by time; a manual run in the same minutes could be mixed up">by time</span>}
                        </td>
                        <td className="py-2.5">{s.conclusion === 'success' ? <span className="text-emerald-300">success</span> : s.conclusion ? <span className="text-red-300">{s.conclusion}</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <aside>
          <dl className="space-y-5">
            <Rail label="Schedule">
              {schedules.length ? schedules.map((s) => <p key={`${s.cron}${s.tz}`} className="font-mono">{s.cron} <span className="text-zinc-500">{s.tz}</span></p>) : <span className="text-zinc-500">None</span>}
            </Rail>
            <Rail label="Next run">{h.next ? <>{relTime(h.next)}<span className="block font-mono text-sm/5 text-zinc-500 sm:text-xs/5">{utc(h.next)}</span></> : '—'}</Rail>
            <Rail label="Last run">{h.last ? <>{relTime(h.last.due_at)}<span className="block font-mono text-sm/5 text-zinc-500 sm:text-xs/5">{utc(h.last.due_at)}</span></> : '—'}</Rail>
            <Rail label={h.limits.historyRows ? `Last ${h.limits.historyRows} slots` : `Last ${h.limits.historyDays} days`}>
              <span className="tabular-nums">{ran} ran · <span className={missed ? 'text-red-300' : ''}>{missed} missed</span> · {total} total</span>
              {h.slots.length === MAX_ROWS && <span className="block text-sm/5 text-zinc-500 sm:text-xs/5">Newest {MAX_ROWS} shown below</span>}
            </Rail>
            <Rail label="On GitHub">
              <a href={fileUrl} className="flex items-center gap-x-1.5 font-medium hover:underline"><GitHubMark className="size-4" />Workflow file</a>
              <a href={`https://github.com/${h.workflow.full_name}/actions`} className="mt-1 flex items-center gap-x-1.5 font-medium hover:underline"><GitHubMark className="size-4" />Actions runs</a>
            </Rail>
            <Rail label="What the states mean">
              <p className="text-sm/5 text-pretty text-zinc-400 sm:text-xs/5"><span className="text-zinc-200">Unknown</span>: we sent it but couldn’t confirm GitHub got it, so we didn’t resend. <span className="text-zinc-200">Expired</span>: GitHub kept failing until the deadline, so we skipped it rather than run late.</p>
            </Rail>
          </dl>
        </aside>
      </div>
    </div>
  );
}

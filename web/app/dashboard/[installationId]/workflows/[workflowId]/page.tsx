import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SlotStrip, StripLegend } from '@/components/slot-strip';
import { Badge, SLOT_TONE } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { MAX_ROWS, recentTicks, workflowHistory } from '@/lib/data';
import { relTime, utc } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ORDER = ['accepted', 'fired', 'unknown', 'expired', 'skipped'] as const;
const LABEL: Record<string, string> = { accepted: 'Ran', fired: 'Triggered', unknown: 'Unknown', expired: 'Expired', skipped: 'Skipped', pending: 'Pending', dispatching: 'Triggering' };
const delay = (a: Date | null, b: Date) => (a ? `+${((a.getTime() - b.getTime()) / 1000).toFixed(1)}s` : '—');

export default async function WorkflowPage({ params }: { params: Promise<{ installationId: string; workflowId: string }> }) {
  const p = await params;
  const id = Number(p.installationId);
  const wid = Number(p.workflowId);
  await requireInstallation(id, `/dashboard/${id}/workflows/${wid}`);
  const now = new Date();
  const [h, ticks] = await Promise.all([workflowHistory(db, id, wid, now), recentTicks(db, id, now, 96)]);
  if (!h) notFound();
  const total = Object.values(h.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-10">
      <div>
        <Link href={`/dashboard/${id}`} className="text-base/6 text-zinc-400 hover:text-white sm:text-sm/6">← {h.workflow.full_name}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{h.workflow.name}</h1>
        <p className="mt-1 font-mono text-sm/6 text-zinc-500 sm:text-xs/6">{h.workflow.path} · next run {relTime(h.next)}</p>
      </div>

      <section className="rounded-2xl bg-zinc-900/60 p-5 inset-ring inset-ring-white/10 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm/6 text-zinc-400 sm:text-xs/6">Last 96 slots, oldest first</p>
          <StripLegend />
        </div>
        <SlotStrip ticks={ticks.get(wid) ?? Array(96).fill('idle')} size="lg" className="mt-4" />
      </section>

      <div className="@container">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 @xl:grid-cols-3 @3xl:grid-cols-6">
          <div className="border-t border-white/10 pt-4">
            <dt className="truncate text-base/6 text-zinc-400 sm:text-sm/6">Slots</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{total}</dd>
          </div>
          {ORDER.map((st) => (
            <div key={st} className="border-t border-white/10 pt-4">
              <dt className="truncate text-base/6 text-zinc-400 sm:text-sm/6">{LABEL[st]}</dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{h.counts[st] ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-[80ch] text-base/6 text-pretty text-zinc-500 sm:text-sm/6">
          {h.limits.historyRows ? `Last ${h.limits.historyRows} slots on the Free plan.` : `Last ${h.limits.historyDays} days${h.slots.length === MAX_ROWS ? `, newest ${MAX_ROWS} shown` : ''}.`}{' '}
          Unknown means we sent the trigger but couldn’t confirm GitHub got it, so we didn’t resend it. Expired means GitHub kept failing until the deadline, so we skipped it rather than run it late.
        </p>
      </div>

      {h.slots.length === 0 ? (
        <p className="text-base/6 text-zinc-400 sm:text-sm/6">No runs yet. The first one is due {relTime(h.next)}.</p>
      ) : (
        <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-10">
          <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-10">
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
                    <td className="py-2.5 pr-4"><Badge tone={SLOT_TONE[s.state] ?? 'zinc'}>{LABEL[s.state] ?? s.state}</Badge></td>
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
  );
}

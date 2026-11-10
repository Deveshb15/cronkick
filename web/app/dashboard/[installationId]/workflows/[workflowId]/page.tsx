import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, SLOT_TONE } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { MAX_ROWS, workflowHistory } from '@/lib/data';
import { relTime, utc } from '@/lib/format';

export const dynamic = 'force-dynamic';

const ORDER = ['accepted', 'fired', 'unknown', 'expired', 'skipped'] as const;
const LABEL: Record<string, string> = { accepted: 'Ran', fired: 'Triggered', unknown: 'Unknown', expired: 'Expired', skipped: 'Skipped', pending: 'Pending', dispatching: 'Triggering' };

const delay = (a: Date | null, b: Date) => (a ? `+${((a.getTime() - b.getTime()) / 1000).toFixed(1)}s` : '—');

export default async function WorkflowPage({ params }: { params: Promise<{ installationId: string; workflowId: string }> }) {
  const p = await params;
  const id = Number(p.installationId);
  await requireInstallation(id, `/dashboard/${id}/workflows/${p.workflowId}`);
  const h = await workflowHistory(db, id, Number(p.workflowId), new Date());
  if (!h) notFound();
  const total = Object.values(h.counts).reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-10">
      <div>
        <Link href={`/dashboard/${id}`} className="text-base/6 text-zinc-600 hover:text-zinc-950 sm:text-sm/6 dark:text-zinc-400 dark:hover:text-white">← {h.workflow.full_name}</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{h.workflow.name}</h1>
        <p className="mt-1 font-mono text-sm/6 text-zinc-500">{h.workflow.path} · next run {relTime(h.next)}</p>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 @xl:grid-cols-3 @3xl:grid-cols-6">
          <div className="border-t border-zinc-950/10 pt-4 dark:border-white/10">
            <dt className="truncate text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">Slots</dt>
            <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{total}</dd>
          </div>
          {ORDER.map((st) => (
            <div key={st} className="border-t border-zinc-950/10 pt-4 dark:border-white/10">
              <dt className="truncate text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{LABEL[st]}</dt>
              <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{h.counts[st] ?? 0}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-base/6 text-zinc-500 sm:text-sm/6">
          {h.limits.historyRows ? `Last ${h.limits.historyRows} slots on the Free plan.` : `Last ${h.limits.historyDays} days${h.slots.length === MAX_ROWS ? `, newest ${MAX_ROWS} shown` : ''}.`}{' '}
          Unknown means we sent the trigger but couldn’t confirm GitHub got it, so we didn’t retry. Expired means GitHub kept failing until the deadline, so we skipped it rather than run it late.
        </p>
      </div>

      {h.slots.length === 0 ? (
        <p className="text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">No runs yet. The first one is due {relTime(h.next)}.</p>
      ) : (
        <div className="-mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-10">
          <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-10">
            <table className="w-full text-left text-base/6 sm:text-sm/6">
              <thead>
                <tr className="border-b border-zinc-950/10 text-zinc-950 dark:border-white/10 dark:text-white">
                  <th className="py-2.5 pr-4 font-medium whitespace-nowrap">Due (UTC)</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Triggered</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">GitHub said</th>
                  <th className="px-4 py-2.5 font-medium whitespace-nowrap">Run</th>
                  <th className="py-2.5 pl-4 font-medium whitespace-nowrap">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-950/5 text-zinc-600 tabular-nums dark:divide-white/5 dark:text-zinc-400">
                {h.slots.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2.5 pr-4 font-mono text-zinc-950 dark:text-white">{utc(s.due_at)}</td>
                    <td className="px-4 py-2.5">{delay(s.first_attempt_at, s.due_at)}</td>
                    <td className="px-4 py-2.5"><Badge tone={SLOT_TONE[s.state] ?? 'zinc'}>{LABEL[s.state] ?? s.state}</Badge></td>
                    <td className="max-w-xs truncate px-4 py-2.5" title={s.response_note ?? ''}>{s.response_status ?? ''} {s.response_note ?? ''}</td>
                    <td className="px-4 py-2.5">
                      {s.run_url ? <a href={s.run_url} className="font-medium text-zinc-950 underline dark:text-white">View run</a> : '—'}
                      {s.matched_by === 'time' && <span className="ml-2 text-zinc-500" title="Linked by time; a manual run in the same minutes could be mixed up">by time</span>}
                    </td>
                    <td className="py-2.5 pl-4">{s.conclusion ?? '—'}</td>
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

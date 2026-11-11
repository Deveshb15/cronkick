import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HistoryTable } from '@/components/history-table';
import { GitHubMark } from '@/components/icons';
import { Countdown, Time } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { AlertHint, Code, GapBanner, Ticks, VERDICT_DOT, VERDICT_WORD } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { MAX_ROWS, recentSlots, workflowHistory, type Flag, type HistoryFilter, type Schedule } from '@/lib/data';
import { humanCron } from '@/lib/live';

export const dynamic = 'force-dynamic';

const FILTERS: { key: HistoryFilter | undefined; label: string }[] = [
  { key: undefined, label: 'All' }, { key: 'late', label: 'Late' }, { key: 'missed', label: 'Missed' }, { key: 'unconfirmed', label: 'Unconfirmed' }, { key: 'failed', label: 'Failed jobs' },
];
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';

export async function generateMetadata({ params }: { params: Promise<{ installationId: string; workflowId: string }> }): Promise<Metadata> {
  const p = await params;
  const id = Number(p.installationId);
  const w = Number.isSafeInteger(Number(p.workflowId)) && (await canSee(id)) && (await db.query(
    'SELECT w.name, r.full_name FROM workflows w JOIN repos r ON r.id = w.repo_id WHERE w.id = $1 AND r.installation_id = $2', [Number(p.workflowId), id],
  )).rows[0];
  return { title: w ? `${w.name} · ${w.full_name}` : 'Workflow' };
}

export default async function WorkflowPage({ params, searchParams }: {
  params: Promise<{ installationId: string; workflowId: string }>; searchParams: Promise<{ filter?: string; before?: string }>;
}) {
  const p = await params;
  const id = Number(p.installationId);
  const wid = Number(p.workflowId);
  const q = await searchParams;
  const filter = (['late', 'missed', 'unconfirmed', 'failed'] as const).find((f) => f === q.filter);
  await requireInstallation(id, `/dashboard/${id}/workflows/${wid}`);
  const now = new Date();
  const before = q.before ? new Date(q.before) : undefined; // workflowHistory ignores a malformed one
  const [h, strips] = await Promise.all([workflowHistory(db, id, wid, now, filter, before), recentSlots(db, id, now, 96)]);
  if (!h) notFound();
  const w = h.workflow;
  const schedules = w.schedules as Schedule[];
  const flags = w.flags as Flag[];
  const active = h.status === 'active' && w.present;
  const word = VERDICT_WORD[h.health];
  const words = schedules.map((s) => `${humanCron(s.cron)} · ${s.tz}`).join(' and ') || 'No schedule';
  const window = h.limits.historyRows ? `last ${h.limits.historyRows} slots` : `last ${h.limits.historyDays} days`;
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/5">
        <div aria-hidden="true" className="time-grid absolute inset-0 -z-10" />
        <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
        <div className={`${container} pt-12 pb-8`}>
          <Link href={`/dashboard/${id}`} className="font-mono text-xs/5 text-zinc-500 hover:text-zinc-300">← Overview / {w.full_name.split('/')[1]}</Link>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                {w.name}
                <span className="inline-flex items-center gap-x-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs/5 font-medium text-zinc-200 inset-ring inset-ring-white/10"><span aria-hidden="true" className={`size-2 rounded-full ${VERDICT_DOT[h.health]}`} />{word[0].toUpperCase() + word.slice(1)}</span>
              </h1>
              <p className="mt-2 text-sm/6 text-zinc-400">{words} <span className="ml-1 font-mono text-xs/5 text-zinc-600">{schedules.map((s) => s.cron).join(' · ')} · {w.path}</span></p>
            </div>
            <div className="flex gap-2">
              <a href={`https://github.com/${w.full_name}/blob/${w.default_branch}/${w.path}`} className="flex items-center gap-x-1.5 rounded-lg bg-white/5 px-3 py-2 text-sm/6 inset-ring inset-ring-white/10 transition hover:bg-white/10"><GitHubMark className="size-4" />Workflow file ↗</a>
              <a href={`https://github.com/${w.full_name}/actions/workflows/${w.path.split('/').pop()}`} className="rounded-lg bg-white/5 px-3 py-2 text-sm/6 inset-ring inset-ring-white/10 transition hover:bg-white/10">Runs on GitHub ↗</a>
            </div>
          </div>

          <div className="relative mt-7 overflow-hidden rounded-2xl bg-zinc-950/80 p-5 inset-ring inset-ring-white/10">
            <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-brand-300/60 to-transparent" />
            {!w.present ? (
              <p className="text-sm/6 text-zinc-300">This file was removed from {w.full_name}. Its history stays for the {window}.</p>
            ) : flags.length ? (
              <div className="text-sm/6"><p className="font-medium text-red-300">Not running: this workflow needs a fix</p><ul role="list" className="mt-2 space-y-1 text-red-300/90">{flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}</ul></div>
            ) : h.status === 'limited' ? (
              <p className="text-sm/6 text-zinc-300">Paused: you’re using every schedule on your plan. Remove a <Code># cronkick</Code> line elsewhere, or upgrade for more.{!w.alert_email && <> <AlertHint id={id} /></>}</p>
            ) : !active ? (
              <p className="text-sm/6 text-zinc-300">Not scheduled: this file has no <Code># cronkick</Code> line. Its history stays for the {window}.</p>
            ) : (
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">Next kick</p>
                  <p className="mt-1 text-sm/6">{h.next ? <><Time iso={h.next} /> <span className="text-zinc-500">your time</span></> : <span className="text-zinc-500">No upcoming slot yet</span>}</p>
                </div>
                {h.next && <Countdown to={h.next} className="font-mono text-4xl font-medium text-brand-400" />}
              </div>
            )}
            <div className="mt-5 flex items-center justify-between text-xs/5 text-zinc-500"><span>Last 96 recorded times</span><span className="max-sm:hidden">Click a tick to find it in the history</span></div>
            <div className="mt-2"><LiveStrip slots={strips.get(wid) ?? []} positions={96} next={active && !!h.next} height="h-12" linkRows /></div>
          </div>
        </div>
      </section>

      <section className={`${container} py-10`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base/7 font-semibold">History</h2>
            <p className="text-xs/5 text-zinc-500">The {window} on {h.plan === 'pro' ? 'Pro' : 'Free'}{h.hasOlder || before ? ` · ${MAX_ROWS} at a time` : ''}. Click a row to see every step.</p>
          </div>
          <nav className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-xs/5">
            {FILTERS.map((f) => (
              <Link key={f.label} href={f.key ? `?filter=${f.key}` : '?'} scroll={false} aria-current={filter === f.key ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1 transition ${filter === f.key ? 'bg-white/10 font-medium text-white' : 'text-zinc-400 hover:text-white'}`}>{f.label}</Link>
            ))}
          </nav>
        </div>
        <GapBanner gaps={h.gaps} className="mt-4" />
        <div className="mt-4">
          {h.slots.length
            ? <HistoryTable rows={h.slots} />
            : <p className="rounded-2xl px-4 py-8 text-center text-sm/6 text-zinc-500 inset-ring inset-ring-white/10">{before ? 'Nothing older in this window.' : filter ? 'Nothing here. Good news.' : h.next ? 'History starts after the first scheduled time.' : 'No runs yet.'}</p>}
        </div>
        {(h.hasOlder || before) && (
          <div className="mt-4 flex justify-center gap-4 text-sm/6 font-medium">
            {before && <Link href={filter ? `?filter=${filter}` : '?'} className="text-zinc-400 hover:text-white">← Newest</Link>}
            {h.hasOlder && <Link href={`?${new URLSearchParams({ ...(filter && { filter }), before: h.slots[h.slots.length - 1].due })}`} className="text-brand-400 hover:text-brand-300">Load older →</Link>}
          </div>
        )}
      </section>
    </>
  );
}

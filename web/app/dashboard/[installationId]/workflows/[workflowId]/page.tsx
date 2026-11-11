import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { HistoryTable } from '@/components/history-table';
import { GitHubMark } from '@/components/icons';
import { CopyButton, Countdown, Time, Zone } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { AlertHint, Code, GapNotice, StatusDot, StatusKey, Ticks, VERDICT_DOT, VERDICT_WORD } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { MAX_ROWS, recentSlots, workflowHistory, type Flag, type HistoryFilter, type Schedule } from '@/lib/data';
import { fmtDelay, humanCron, plural } from '@/lib/live';

export const dynamic = 'force-dynamic';

const FILTERS: { key: HistoryFilter | undefined; label: string }[] = [
  { key: undefined, label: 'All' }, { key: 'late', label: 'Late' }, { key: 'missed', label: 'Not sent' }, { key: 'unconfirmed', label: 'Unconfirmed' }, { key: 'failed', label: 'Failed jobs' },
];
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';
const button = 'inline-flex min-h-11 items-center gap-x-1.5 rounded-lg bg-white/5 px-3 text-sm/6 font-medium text-zinc-100 inset-ring inset-ring-white/10 transition hover:bg-white/10 sm:min-h-9';

export async function generateMetadata({ params }: { params: Promise<{ installationId: string; workflowId: string }> }): Promise<Metadata> {
  const p = await params;
  const id = Number(p.installationId);
  const w = Number.isSafeInteger(Number(p.workflowId)) && (await canSee(id)) && (await db.query(
    'SELECT w.name, r.full_name FROM workflows w JOIN repos r ON r.id = w.repo_id WHERE w.id = $1 AND r.installation_id = $2', [Number(p.workflowId), id],
  )).rows[0];
  return { title: w ? `${w.name} · ${w.full_name}` : 'Workflow' };
}

/** One fact in the header row: a quiet label over a value. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[13px]/5 text-zinc-400">{label}</dt><dd className="mt-0.5 text-sm/6 font-medium text-zinc-100 tabular-nums">{children}</dd></div>;
}

export default async function WorkflowPage({ params, searchParams }: {
  params: Promise<{ installationId: string; workflowId: string }>; searchParams: Promise<{ filter?: string; before?: string; after?: string }>;
}) {
  const p = await params;
  const id = Number(p.installationId);
  const wid = Number(p.workflowId);
  const q = await searchParams;
  const filter = (['late', 'missed', 'unconfirmed', 'failed'] as const).find((f) => f === q.filter);
  await requireInstallation(id, `/dashboard/${id}/workflows/${wid}`);
  const now = new Date();
  // workflowHistory ignores a malformed cursor.
  const before = q.before ? new Date(q.before) : undefined;
  const after = q.after && !q.before ? new Date(q.after) : undefined;
  const [h, strips] = await Promise.all([workflowHistory(db, id, wid, now, filter, before, after), recentSlots(db, id, now, 96)]);
  if (!h) notFound();
  const w = h.workflow;
  const schedules = w.schedules as Schedule[];
  const flags = w.flags as Flag[];
  const active = h.status === 'active' && w.present;
  const strip = strips.get(wid) ?? [];
  const observed = h.filterCounts.all > 0;
  const words = schedules.map((s) => `${humanCron(s.cron)} · ${s.tz}`).join(' and ') || 'No schedule';
  const window = h.limits.historyRows ? `last ${h.limits.historyRows} runs` : `last ${h.limits.historyDays} days`;
  const c = h.c24;
  const status = flags.length ? { dot: 'bg-red-500', word: 'Needs a fix' } : h.status === 'limited' ? { dot: 'bg-zinc-500', word: 'Paused' }
    : !active ? { dot: 'bg-zinc-600', word: 'Not scheduled' } : { dot: VERDICT_DOT[h.health], word: VERDICT_WORD[h.health][0].toUpperCase() + VERDICT_WORD[h.health].slice(1) };
  const link = (o: Record<string, string | undefined>) => {
    const all: Record<string, string | undefined> = { filter, ...o };
    return `?${new URLSearchParams(Object.entries(all).filter((e): e is [string, string] => !!e[1]))}#history`;
  };
  const first = h.slots[0];
  const last = h.slots[h.slots.length - 1];
  const pager = (h.hasNewer || h.hasOlder) && (
    <nav aria-label="History pages" className="flex items-center gap-2">
      {h.hasNewer ? <Link href={link({ after: first?.due })} className={button}>← Newer</Link> : <span className={`${button} pointer-events-none opacity-40`} aria-disabled="true">← Newer</span>}
      {h.hasOlder && last ? <Link href={link({ before: last.due })} className={button}>Older →</Link> : <span className={`${button} pointer-events-none opacity-40`} aria-disabled="true">Older →</span>}
    </nav>
  );

  return (
    <div className={`${container} space-y-10 pt-8 pb-16 sm:pt-10`}>
      <header>
        <nav aria-label="Breadcrumb" className="text-[13px]/5 text-zinc-400">
          <Link href={`/dashboard/${id}`} className="-my-3 inline-flex min-h-11 items-center hover:text-white sm:my-0 sm:min-h-0">Overview</Link> <span aria-hidden="true">/</span> {w.full_name.split('/')[1]}
        </nav>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl/8 font-semibold tracking-tight break-words">{w.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm/6 text-zinc-400">
              <StatusDot dot={status.dot} className="font-medium text-zinc-100">{status.word}</StatusDot>
              <span>{words}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs/5 break-all text-zinc-400">{schedules.map((s) => s.cron).join(' · ')}{schedules.length ? ' · ' : ''}{w.path}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`https://github.com/${w.full_name}/blob/${w.default_branch}/${w.path}`} className={button}><GitHubMark className="size-4" />Workflow file ↗</a>
            <a href={`https://github.com/${w.full_name}/actions/workflows/${w.path.split('/').pop()}`} className={button}>Runs on GitHub ↗</a>
          </div>
        </div>

        {active && (
          <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-white/10 py-4 sm:grid-cols-4">
            <Fact label="Next run">{h.next ? <><Time iso={h.next} zone /> <span className="font-normal whitespace-nowrap text-zinc-400">· <Countdown to={h.next} /></span></> : <span className="text-zinc-400">None planned yet</span>}</Fact>
            <Fact label="On time · 24 h">{c.due ? `${c.onTime} of ${c.due}` : <span className="text-zinc-400">Nothing due</span>}</Fact>
            <Fact label="Median send delay · 24 h">{h.medianDelayMs === null ? <span className="text-zinc-400">—</span> : fmtDelay(h.medianDelayMs)}</Fact>
            <Fact label="GitHub jobs · 24 h">{c.passed + c.failed ? <>{c.passed} passed{c.failed ? <span className="text-red-300"> · {c.failed} failed</span> : ''}</> : <span className="text-zinc-400">None reported</span>}</Fact>
          </dl>
        )}
      </header>

      {!w.present ? (
        <p className="rounded-xl px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">This file was removed from {w.full_name}. Its history stays for the {window}.</p>
      ) : flags.length ? (
        <section aria-labelledby="fix" className="rounded-xl bg-red-500/[0.06] p-5 inset-ring inset-ring-red-500/25">
          <h2 id="fix" className="text-base/6 font-semibold text-white">Cronkick can’t run this workflow yet</h2>
          <p className="mt-1 text-sm/6 text-zinc-300">Fix this in <Code>{w.path}</Code> on <Code>{w.default_branch}</Code>. Cronkick re-checks the file on your next push.</p>
          <ul role="list" className="mt-3 space-y-2 text-sm/6 text-red-200">
            {flags.map((f) => <li key={f.message} className="flex gap-x-2"><span aria-hidden="true">•</span><span>{f.line ? <span className="text-red-300/80">Line {f.line}: </span> : null}<Ticks text={f.message} /></span></li>)}
          </ul>
          {/* The one fix we can show exactly: a missing manual trigger. Other flags keep their own wording. */}
          {flags.some((f) => /workflow_dispatch/.test(f.message)) && (
            <div className="mt-4 overflow-hidden rounded-lg bg-zinc-950 inset-ring inset-ring-white/10">
              <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-1.5 font-mono text-xs/5 text-zinc-400">
                <span>{w.path.split('/').pop()}</span>
                <CopyButton text="  workflow_dispatch:" label="Copy line" className="inline-flex min-h-11 items-center rounded-md px-2 font-sans font-medium text-zinc-200 hover:text-white sm:min-h-8" />
              </div>
              <pre className="overflow-x-auto py-3 font-mono text-[13px]/6"><span className="block px-4 text-zinc-400">on:</span><span className="block bg-emerald-500/10 px-4 text-emerald-300">+   workflow_dispatch:</span><span className="block px-4 text-zinc-500">    # keep the rest as it is</span></pre>
              <p className="border-t border-white/5 px-4 py-2 text-[13px]/5 text-zinc-400">If <Code>on:</Code> is one line, such as <Code>on: push</Code>, make it a list first: <Code>on:</Code>, then <Code>push:</Code> on its own indented line.</p>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`https://github.com/${w.full_name}/edit/${w.default_branch}/${w.path}`} className="inline-flex min-h-11 items-center rounded-lg bg-brand-500 px-3.5 text-sm/6 font-medium text-ink hover:bg-brand-400 sm:min-h-9">Edit the file on GitHub ↗</a>
            <Link href="/docs/checks" className={button}>What Cronkick checks</Link>
          </div>
        </section>
      ) : h.status === 'limited' ? (
        <p className="rounded-xl px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">Paused: this account has more schedules than its plan allows ({h.limits.schedules}). Remove a <Code># cronkick</Code> line elsewhere, or upgrade.{!w.alert_email && <> <AlertHint id={id} /></>}</p>
      ) : !active ? (
        <p className="rounded-xl px-4 py-3 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">Not scheduled: this file has no <Code># cronkick</Code> line. Its history stays for the {window}.</p>
      ) : null}

      {(observed || active) && strip.length > 0 && (
        <section aria-labelledby="recent">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <h2 id="recent" className="text-base/6 font-semibold">Recent runs <span className="font-normal text-zinc-400">· last {Math.min(strip.length, 96)}</span></h2>
            <div className="flex items-center gap-x-4 text-[13px]/5 text-zinc-400"><StatusKey /></div>
          </div>
          <div className="mt-3"><LiveStrip slots={strip} positions={96} height="h-12" gaps={h.gaps} interactive /></div>
        </section>
      )}

      {observed && (
        <section aria-labelledby="history">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
            <div>
              <h2 id="history" className="text-base/6 font-semibold">History</h2>
              <p className="text-[13px]/5 text-zinc-400">The {window} on {h.plan === 'pro' ? 'Pro' : 'Free'} · {MAX_ROWS} per page · times in <Zone /></p>
            </div>
            <nav aria-label="Filter history" className="flex gap-1 rounded-lg bg-white/5 p-1 text-[13px]/5 max-sm:-mx-4 max-sm:w-[calc(100%+2rem)] max-sm:overflow-x-auto max-sm:rounded-none sm:flex-wrap">
              {FILTERS.map((f) => {
                const n = h.filterCounts[f.key ?? 'all'];
                return (
                  <Link key={f.label} href={f.key ? `?filter=${f.key}` : '?'} scroll={false} aria-current={filter === f.key ? 'page' : undefined}
                    className={`inline-flex min-h-11 shrink-0 items-center gap-x-1.5 rounded-md px-2.5 transition sm:min-h-8 ${filter === f.key ? 'bg-white/10 font-medium text-white' : 'text-zinc-300 hover:text-white'}`}>
                    {f.label}<span className={`tabular-nums ${n ? 'text-zinc-400' : 'text-zinc-600'}`}>{n}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
          <GapNotice gaps={h.gaps} className="mt-4" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13px]/5 text-zinc-400">
            <span>{h.slots.length ? <>Showing {plural(h.slots.length, 'run')}: <Time iso={last.due} date /> – <Time iso={first.due} date /></> : null}</span>
            {pager}
          </div>
          <div className="mt-2">
            {h.slots.length
              ? <HistoryTable rows={h.slots} gaps={filter ? [] : h.gaps} newerEdge={h.newerEdge} />
              : <p className="rounded-xl px-4 py-8 text-center text-sm/6 text-zinc-400 inset-ring inset-ring-white/10">
                  {before || after ? <>Nothing on this page. <Link href={link({})} className="font-medium text-white underline decoration-white/30 hover:decoration-white">Back to the latest runs</Link></> : 'No runs match this filter.'}
                </p>}
          </div>
          {h.slots.length > 10 && pager && <div className="mt-4 flex justify-end">{pager}</div>}
        </section>
      )}
      {!observed && active && <p className="text-sm/6 text-zinc-400">No runs yet. The first one is due {h.next ? <><Time iso={h.next} zone /> (<Countdown to={h.next} />)</> : 'once it’s planned'}.</p>}
    </div>
  );
}

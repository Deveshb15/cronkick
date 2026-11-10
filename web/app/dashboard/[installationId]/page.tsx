import { ChevronRightIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActivityFeed, DispatchToasts } from '@/components/activity';
import { FirstRun } from '@/components/first-run';
import { Countdown, Counter } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { SwitchSection, type Candidate } from '@/components/switch-card';
import { Code } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { activity, installationsFor, overview, recentSlots, type Counts24, type SlotView, type Verdict, type WorkflowRow } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';
import { fmtDelay, humanCron } from '@/lib/live';
import { switchPlan } from '@/lib/switch';
import { probeReport } from '../../../../src/probe/collector.ts';
import { PLANS } from '../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const STRIP = 48;
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';

const VERDICT: Record<Verdict, { dot: string; text: (n: number) => string }> = {
  on_time: { dot: 'bg-emerald-400', text: (n) => `All ${n} schedule${n === 1 ? '' : 's'} on time` },
  late: { dot: 'bg-orange-300', text: () => 'Some runs started late' },
  missed: { dot: 'bg-red-500', text: () => 'A run was missed' },
  needs_fix: { dot: 'bg-red-500', text: () => 'A workflow needs a fix' },
  no_runs: { dot: 'bg-zinc-500', text: () => 'Waiting for the first kick' },
  nothing_scheduled: { dot: 'bg-zinc-600', text: () => 'Nothing scheduled yet' },
};
const missed = (c: Counts24) => c.unconfirmed + c.gaveUp;

/** Compatibility messages mark code with backticks; show those parts as code. */
function Ticks({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') ? <Code key={i}>{part.slice(1, -1)}</Code> : part))}</>;
}

function Stat({ label, value, sub, children }: { label: string; value: ReactNode; sub: string; children?: ReactNode }) {
  return (
    <div className="group relative p-4">
      <dt className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <p className="mt-1 truncate text-xs/5 text-zinc-500">{sub}</p>
      {children}
    </div>
  );
}

function ScheduleRow({ w, installationId, slots, floor }: { w: WorkflowRow; installationId: number; slots: SlotView[]; floor: number }) {
  const active = w.status === 'active';
  const dot = w.status === 'needs_fix' || missed(w.c24) ? 'bg-red-500' : w.status === 'limited' ? 'bg-zinc-600' : w.c24.late ? 'bg-orange-300' : 'bg-emerald-400';
  const crons = w.schedules.map((s) => `${s.cron}${s.tz !== 'UTC' ? ` ${s.tz}` : ''}`).join(' · ');
  const words = w.schedules.length === 1 ? `${humanCron(w.schedules[0].cron)} · ${w.schedules[0].tz}` : `${w.schedules.length} schedules`;
  const plain = w.schedules.some((x) => humanCron(x.cron) !== x.cron); // raw cron adds nothing when there are no plain words
  return (
    <li className={w.status === 'limited' ? 'opacity-60' : ''}>
      <Link href={`/dashboard/${installationId}/workflows/${w.id}`} className="group @container block px-5 py-4 transition hover:bg-white/[0.03]">
        <div className="grid items-center gap-x-6 gap-y-3 @3xl:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_8rem_1rem]">
          <div className="flex min-w-0 items-start gap-x-3">
            <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} />
            <div className="min-w-0">
              <p className="truncate text-sm/6 font-medium">{w.name} <span className="font-normal text-zinc-500">· {w.repo.split('/')[1]}</span></p>
              <p className="truncate text-xs/5 text-zinc-400">{words} {plain && <span className="font-mono text-zinc-600">{crons}</span>}</p>
            </div>
          </div>
          {active ? <LiveStrip slots={slots} positions={STRIP} next={!!w.nextDue} /> : <div className="max-@3xl:hidden" />}
          <div className="text-sm/5 tabular-nums @3xl:text-right">
            {active && (w.c24.due
              ? <p className="font-medium"><Counter value={`${w.c24.onTime} of ${w.c24.due}`} /> on time</p>
              : <p className="font-medium text-zinc-400">No runs yet</p>)}
            {active && w.nextDue && <p className="text-xs/5 text-zinc-500">next <Countdown to={w.nextDue} className="font-mono text-brand-400" /></p>}
            {w.status === 'limited' && <p className="text-xs/5 text-zinc-400">Paused: plan limit</p>}
            {w.status === 'needs_fix' && <p className="text-xs/5 text-red-300">Needs a fix</p>}
          </div>
          <ChevronRightIcon aria-hidden="true" className="size-4 fill-zinc-600 transition group-hover:translate-x-0.5 group-hover:fill-zinc-300 max-@3xl:hidden" />
        </div>
        {w.status === 'needs_fix' && (
          <ul role="list" className="mt-2 space-y-1 pl-5.5 text-xs/5 text-red-300">{w.flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}</ul>
        )}
        {w.status === 'limited' && <p className="mt-2 pl-5.5 text-xs/5 text-zinc-400">Not running: you’re using every schedule on your plan. Remove a <Code># cronkick</Code> line elsewhere, or upgrade for more. Faster than every {floor} min also won’t run.</p>}
      </Link>
    </li>
  );
}

export default async function Overview({ params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const now = new Date();
  const [{ repos, totals }, slots, items, reports] = await Promise.all([
    overview(db, id, now), recentSlots(db, id, now, STRIP), activity(db, id, now, 8), probeReport(db, now).catch(() => []),
  ]);
  const limits = PLANS[inst.plan];
  const all = repos.flatMap((r) => r.workflows);
  const branch = new Map(repos.map((r) => [r.full_name, r.default_branch]));
  const mine = all.filter((w) => w.status === 'active' || w.status === 'limited' || w.status === 'needs_fix')
    .sort((a, b) => ({ needs_fix: 0, active: 1, limited: 2 } as Record<string, number>)[a.status] - ({ needs_fix: 0, active: 1, limited: 2 } as Record<string, number>)[b.status]);
  const candidates: Candidate[] = all.filter((w) => w.status === 'ready' && w.suggested_diff).map((w) => {
    const p = switchPlan(w.suggested_diff!, limits.floorMinutes);
    return {
      id: w.id, name: w.name, path: w.path, repo: w.repo, editUrl: `https://github.com/${w.repo}/edit/${branch.get(w.repo)}/${w.path}`,
      cadence: p.crons.map((c) => humanCron(c.cron)).join(' · '), before: p.before, after: p.after, clamped: p.clamped, tooFast: p.tooFast,
    };
  });
  const switchSection = <SwitchSection candidates={candidates} plan={inst.plan} floor={limits.floorMinutes} />;

  // Until the first kick, the page is the setup guide; it flips live when Cronkick sees the push.
  // A paused or broken workflow keeps the normal overview, so its reason is always on screen.
  if (mine.every((w) => w.status === 'active') && items.length === 0) {
    const nk = totals.nextKick;
    return (
      <>
        <FirstRun installationId={id} repos={repos.map((r) => r.full_name)} manageUrl={manageReposUrl(inst)} floor={limits.floorMinutes} candidates={candidates.length}
          found={nk ? { workflowId: nk.workflowId, workflow: nk.workflow, repo: nk.repo, due: nk.due } : null} />
        {candidates.length > 0 && <div className={`${container} pb-16`}>{switchSection}</div>}
        <DispatchToasts items={items} />
      </>
    );
  }

  const v = VERDICT[totals.verdict];
  const c = totals.c24;
  const nk = totals.nextKick;
  const bench = reports.filter((r) => r.stats.expected > 0).sort((a, b) => b.stats.expected - a.stats.expected)[0];
  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-white/5">
        <div aria-hidden="true" className="time-grid absolute inset-0 -z-10" />
        <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
        <div className={`${container} pt-12 pb-8`}>
          <p className="font-mono text-[0.6875rem]/5 tracking-wider text-zinc-500 uppercase">{inst.account_login} · Overview</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="flex items-center gap-x-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                <span aria-hidden="true" className="relative flex size-3 shrink-0">
                  {totals.verdict === 'on_time' && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-40" />}
                  <span className={`relative inline-flex size-3 rounded-full ${v.dot}`} />
                </span>
                {v.text(totals.activeSchedules)}
              </h1>
              <p className="mt-2 text-sm/6 text-zinc-400">
                {c.due ? <><Counter value={`${c.onTime} of ${c.due}`} /> runs in the last 24 h started within 30 s of their scheduled time.</> : 'No runs in the last 24 h yet.'}
              </p>
            </div>
            {nk && (
              <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-950/80 p-4 inset-ring inset-ring-white/10 backdrop-blur sm:w-[22rem]">
                <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-brand-300/60 to-transparent" />
                <p className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">Next kick</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <Link href={`/dashboard/${id}/workflows/${nk.workflowId}`} className="min-w-0 hover:underline">
                    <p className="truncate text-sm/6 font-medium">{nk.workflow}</p>
                    <p className="truncate text-xs/5 text-zinc-500">{nk.repo.split('/')[1]}{nk.alsoDue ? ` +${nk.alsoDue} more at the same time` : ''}</p>
                  </Link>
                  <Countdown to={nk.due} className="font-mono text-3xl font-medium text-brand-400" />
                </div>
              </div>
            )}
          </div>
          <dl className="mt-8 grid grid-cols-2 divide-white/10 rounded-2xl bg-zinc-950/60 inset-ring inset-ring-white/10 max-lg:divide-y lg:grid-cols-4 lg:divide-x">
            <Stat label="On time · 24 h" value={<><Counter value={c.onTime} /><span className="text-zinc-500"> of {c.due}</span></>} sub="started within 30 s">
              <div role="tooltip" className="pointer-events-none absolute top-full left-4 z-20 mt-2 hidden w-64 rounded-xl bg-zinc-800 p-3 text-xs/5 shadow-2xl ring-1 ring-white/10 group-hover:block">
                <p className="mb-1.5 font-medium">Last 24 h, by outcome</p>
                <p className="flex justify-between"><span>On time (≤ 30 s)</span><b>{c.onTime}</b></p>
                <p className="flex justify-between"><span>Late</span><b>{c.late}</b></p>
                <p className="flex justify-between"><span>Unconfirmed</span><b>{c.unconfirmed}</b></p>
                <p className="flex justify-between"><span>Gave up</span><b>{c.gaveUp}</b></p>
                <p className="mt-2 text-zinc-400">Measured from the scheduled time to Cronkick’s request to GitHub.</p>
              </div>
            </Stat>
            <Stat label="Runs · 24 h" value={<Counter value={c.due} />} sub={`${c.onTime} on time · ${c.late} late · ${missed(c)} missed`} />
            <Stat label="Start delay" value={<span className="font-mono font-medium">{fmtDelay(totals.medianDelayMs)}</span>} sub={totals.maxDelayMs === null ? 'median' : `median · slowest ${fmtDelay(totals.maxDelayMs)}`} />
            <Stat label="Job results" value={<><Counter value={c.passed} /><span className="text-zinc-500"> passed</span></>} sub={`${c.failed} failed · reported by GitHub`} />
          </dl>
        </div>
      </section>

      <div className={`${container} space-y-10 py-10`}>
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base/7 font-semibold">Your schedules</h2>
            <ul role="list" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs/5 text-zinc-400">
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-ontime" />on time</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-late" />late</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-missed" />missed</li>
              <li className="flex items-center gap-1.5"><span className="tick-skip size-2 rounded-sm" />skipped</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]" />next</li>
              <li className="flex items-center gap-1.5"><span className="tick-track inline-block h-px w-4 self-center" />before tracking</li>
            </ul>
          </div>
          <ul role="list" className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl inset-ring inset-ring-white/10">
            {mine.map((w) => <ScheduleRow key={w.id} w={w} installationId={id} slots={slots.get(w.id) ?? []} floor={limits.floorMinutes} />)}
          </ul>
        </section>

        {switchSection}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="flex items-end justify-between"><h2 className="text-base/7 font-semibold">Activity</h2><span className="text-xs/5 text-zinc-500">newest first</span></div>
            <div className="mt-4"><ActivityFeed items={items} /></div>
          </div>
          <Link href="/lateness" className="group relative flex flex-col overflow-hidden rounded-2xl bg-zinc-950 p-5 inset-ring inset-ring-white/10 transition hover:-translate-y-0.5 hover:inset-ring-white/20">
            <div aria-hidden="true" className="hero-glow absolute inset-0 opacity-0 transition group-hover:opacity-100" />
            <p className="relative font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">Public benchmark</p>
            <p className="relative mt-3 text-sm/6 font-medium">How late is GitHub’s own scheduler?</p>
            <p className="relative mt-2 text-xs/5 text-pretty text-zinc-400">
              {bench && bench.stats.p50Sec !== null
                ? <>In our probe repos over the last 7 days, GitHub’s <code className="font-mono">schedule:</code> ({humanCron(bench.cron).toLowerCase()}) started a median {Math.round(bench.stats.p50Sec / 60)} min late and never ran {Math.round(bench.stats.missingShare * 100)}% of the time.</>
                : <>We’re measuring GitHub’s <code className="font-mono">schedule:</code> in public probe repos. Numbers appear once a few days of data are in.</>}
            </p>
            <span className="relative mt-auto pt-4 text-xs/5 font-medium text-brand-400">See the numbers →</span>
          </Link>
        </section>
      </div>
      <DispatchToasts items={items} />
    </>
  );
}

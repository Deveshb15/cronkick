import { ChevronRightIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActivityFeed, DispatchToasts } from '@/components/activity';
import { FirstRun } from '@/components/first-run';
import { Countdown, Counter } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { SwitchSection, type Candidate } from '@/components/switch-card';
import { keepOnGitHub } from './actions';
import { AlertHint, Code, GapBanner, Ticks, VERDICT_DOT } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { activity, installationsFor, overview, recentSlots, type Counts24, type SlotView, type WorkflowRow } from '@/lib/data';
import { fmtUtc, manageReposUrl, probeSample, VERDICT } from '@/lib/format';
import { fmtDelay, fmtDuration, humanCron } from '@/lib/live';
import { switchPlan } from '@/lib/switch';
import { probeRepos } from '../../../../src/config.ts';
import { probeReport } from '../../../../src/probe/collector.ts';
import { PLANS } from '../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const STRIP = 48;
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';

/** Every due outcome, in the order of the 24 h partition. */
const outcomes = (c: Counts24): [string, number][] => [
  ['On time (≤ 30 s)', c.onTime], ['Late', c.late], ['Sending', c.waiting], ['Overdue', c.overdue], ['Unconfirmed', c.unconfirmed], ['Refused', c.refused], ['Gave up', c.gaveUp],
];
/** The non-zero outcomes other than on time, e.g. "1 overdue · 2 gave up"; empty when there are none. */
const problems = (c: Counts24) => outcomes(c).slice(1).filter(([, n]) => n).map(([k, n]) => `${n}\u00a0${k.toLowerCase()}`).join(' · '); // no break inside "1 gave up"

function Stat({ label, value, sub, children }: { label: string; value: ReactNode; sub: string; children?: ReactNode }) {
  return (
    <div className="group relative p-4">
      <dt className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <p className="mt-1 text-xs/5 text-pretty text-zinc-500">{sub}</p>
      {children}
    </div>
  );
}

function ScheduleRow({ w, installationId, slots, floor }: { w: WorkflowRow; installationId: number; slots: SlotView[]; floor: number }) {
  const active = w.status === 'active';
  const dot = w.status === 'limited' ? 'bg-zinc-600' : VERDICT_DOT[w.health];
  const issues = problems(w.c24);
  const crons = w.schedules.map((s) => s.cron).join(' · '); // time zones are already in the plain words
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
          {active ? <LiveStrip slots={slots} positions={STRIP} next={!!w.nextDue} /> : <div className="@max-3xl:hidden" />}
          <div className="text-sm/5 tabular-nums @3xl:text-right">
            {active && (w.c24.due
              ? <p className="font-medium"><Counter value={`${w.c24.onTime} of ${w.c24.due}`} /> on time</p>
              : <p className="font-medium text-zinc-400">No runs yet</p>)}
            {active && issues && <p className="text-xs/5 text-zinc-400">{issues}</p>}
            {active && w.nextDue && <p className="text-xs/5 text-zinc-500">next <Countdown to={w.nextDue} className="font-mono text-brand-400" /></p>}
            {w.status === 'limited' && <p className="text-xs/5 text-zinc-400">Paused: plan limit</p>}
            {w.status === 'needs_fix' && <p className="text-xs/5 text-red-300">Needs a fix</p>}
          </div>
          <ChevronRightIcon aria-hidden="true" className="size-4 fill-zinc-600 transition group-hover:translate-x-0.5 group-hover:fill-zinc-300 @max-3xl:hidden" />
        </div>
        {w.status === 'needs_fix' && (
          <ul role="list" className="mt-2 space-y-1 pl-5.5 text-xs/5 text-red-300">{w.flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}</ul>
        )}
        {w.status === 'limited' && <p className="mt-2 pl-5.5 text-xs/5 text-zinc-400">Not running: you’re using every schedule on your plan. Remove a <Code># cronkick</Code> line elsewhere, or upgrade for more. Faster than every {floor} min also won’t run.</p>}
      </Link>
    </li>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? inst.account_login : 'Dashboard' };
}

export default async function Overview({ params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const now = new Date();
  const [{ repos, totals }, slots, items, report] = await Promise.all([
    overview(db, id, now), recentSlots(db, id, now, STRIP), activity(db, id, now, 8), probeReport(db, probeRepos(), now).catch(() => null),
  ]);
  const limits = PLANS[inst.plan];
  const all = repos.flatMap((r) => r.workflows);
  const branch = new Map(repos.map((r) => [r.full_name, r.default_branch]));
  const mine = all.filter((w) => w.status === 'active' || w.status === 'limited' || w.status === 'needs_fix')
    .sort((a, b) => ({ needs_fix: 0, active: 1, limited: 2 } as Record<string, number>)[a.status] - ({ needs_fix: 0, active: 1, limited: 2 } as Record<string, number>)[b.status]);
  const hidden = all.filter((w) => w.status === 'ready' && w.suggested_diff && w.dismissed).map((w) => ({ id: w.id, name: w.name, repo: w.repo }));
  const candidates: Candidate[] = all.filter((w) => w.status === 'ready' && w.suggested_diff && !w.dismissed).map((w) => {
    const p = switchPlan(w.suggested_diff!, limits.floorMinutes);
    return {
      id: w.id, name: w.name, path: w.path, repo: w.repo, editUrl: `https://github.com/${w.repo}/edit/${branch.get(w.repo)}/${w.path}`,
      cadence: p.crons.map((c) => humanCron(c.cron)).join(' · '), before: p.before, after: p.after, clamped: p.clamped, tooFast: p.tooFast,
    };
  });
  const switchSection = <SwitchSection candidates={candidates} hidden={hidden} plan={inst.plan} floor={limits.floorMinutes} hide={keepOnGitHub.bind(null, id)} />;

  // Until a slot first comes due, the page is the setup guide; from then on, anything due (sent or not) is the overview's.
  if (totals.firstRun) {
    const nk = totals.nextKick;
    return (
      <>
        <FirstRun installationId={id} repos={repos.map((r) => r.full_name)} manageUrl={manageReposUrl(inst)} floor={limits.floorMinutes} candidates={candidates.length} alerts={!!inst.alert_email}
          found={nk ? { workflowId: nk.workflowId, workflow: nk.workflow, repo: nk.repo, due: nk.due } : null} />
        {(candidates.length > 0 || hidden.length > 0) && <div className={`${container} pb-16`}>{switchSection}</div>}
        <DispatchToasts items={items} />
      </>
    );
  }

  const c = totals.c24;
  const nk = totals.nextKick;
  const bench = report?.schedules.filter((r) => r.stats.expected > 0).sort((a, b) => b.stats.expected - a.stats.expected)[0];
  const failing = report?.repos.filter((r) => r.error) ?? [];
  return (
    <>
      <section className="relative isolate z-10 border-b border-white/5">
        <div aria-hidden="true" className="time-grid absolute inset-0 -z-10" />
        <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
        <div className={`${container} pt-12 pb-8`}>
          <p className="font-mono text-[0.6875rem]/5 tracking-wider text-zinc-500 uppercase">{inst.account_login} · Overview</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <h1 className="flex items-center gap-x-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                <span aria-hidden="true" className={`inline-flex size-3 shrink-0 rounded-full ${VERDICT_DOT[totals.verdict]}`} />
                {VERDICT[totals.verdict](totals.activeSchedules, c)}
              </h1>
              <p className="mt-2 text-sm/6 text-zinc-400">
                {c.due ? <><Counter value={`${c.onTime} of ${c.due}`} /> runs in the last 24 h were sent within 30 s of their scheduled time.</> : 'No runs in the last 24 h yet.'}
              </p>
              <GapBanner gaps={totals.gaps} className="mt-4" />
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
          <dl className="mt-8 grid grid-cols-2 rounded-2xl bg-zinc-950/60 inset-ring inset-ring-white/10 *:border-white/10 lg:grid-cols-4 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t lg:[&>*:nth-child(3)]:border-l lg:[&>*:nth-child(n+3)]:border-t-0">
            <Stat label="On time · 24 h" value={<><Counter value={c.onTime} /><span className="text-zinc-500"> of {c.due}</span></>} sub="sent within 30 s">
              <details className="mt-1 text-xs/5">
                <summary className="cursor-pointer text-zinc-400 hover:text-white">By outcome</summary>
                <div className="absolute left-4 z-20 mt-2 w-64 rounded-xl bg-zinc-800 p-3 shadow-2xl ring-1 ring-white/10">
                  {outcomes(c).map(([k, n]) => <p key={k} className="flex justify-between"><span>{k}</span><b>{n}</b></p>)}
                  <p className="mt-2 text-zinc-400">Measured from the scheduled time to GitHub accepting the request.</p>
                </div>
              </details>
            </Stat>
            <Stat label="Runs · 24 h" value={<Counter value={c.due} />} sub={[`${c.onTime} on time`, problems(c)].filter(Boolean).join(' · ')} />
            <Stat label="Send delay" value={<span className="font-mono font-medium">{fmtDelay(totals.medianDelayMs)}</span>} sub={totals.maxDelayMs === null ? 'median' : `median · slowest ${fmtDelay(totals.maxDelayMs)}`} />
            <Stat label="Job results" value={<><Counter value={c.passed} /><span className="text-zinc-500"> passed</span></>} sub={`${c.failed} failed · reported by GitHub`} />
          </dl>
        </div>
      </section>

      <div className={`${container} space-y-10 py-10`}>
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base/7 font-semibold">Your schedules</h2>
              <p className="text-xs/5 text-zinc-500">Each strip shows the last {STRIP} recorded times. The counts beside it cover the last 24 h.</p>
            </div>
            <ul role="list" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs/5 text-zinc-400">
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-ontime" />on time</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-late" />late</li>
              <li className="flex items-center gap-1.5"><span className="tick-waiting size-2 rounded-sm" />sending</li>
              <li className="flex items-center gap-1.5"><span className="tick-overdue size-2 rounded-sm" />overdue</li>
              <li className="flex items-center gap-1.5"><span className="tick-unconfirmed size-2 rounded-sm" />unconfirmed</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-missed" />refused or gave up</li>
              <li className="flex items-center gap-1.5"><span className="tick-skip size-2 rounded-sm" />skipped</li>
              <li className="flex items-center gap-1.5"><span className="size-2 rounded-sm shadow-[inset_0_0_0_1.5px_var(--color-brand-500)]" />next</li>
              <li className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-white/30" />before tracking</li>
            </ul>
          </div>
          {!repos.length && (
            <p className="mt-4 rounded-2xl px-5 py-4 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">
              Cronkick can’t see any repositories, so nothing will be sent. <a href={manageReposUrl(inst)} className="font-medium text-brand-400 hover:text-brand-300">Choose repositories on GitHub ↗</a>
            </p>
          )}
          <ul role="list" className="mt-4 divide-y divide-white/5 overflow-hidden rounded-2xl inset-ring inset-ring-white/10 empty:hidden">
            {mine.map((w) => <ScheduleRow key={w.id} w={w} installationId={id} slots={slots.get(w.id) ?? []} floor={limits.floorMinutes} />)}
          </ul>
          {!inst.alert_email && mine.some((w) => w.status === 'limited') && <p className="mt-3 text-xs/5 text-zinc-400"><AlertHint id={id} /></p>}
        </section>

        {switchSection}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0">
            <div className="flex items-end justify-between"><h2 className="text-base/7 font-semibold">Activity</h2><span className="text-xs/5 text-zinc-500">newest first</span></div>
            <div className="mt-4"><ActivityFeed items={items} /></div>
          </div>
          <Link href="/lateness" className="group relative flex flex-col overflow-hidden rounded-2xl bg-zinc-950 p-5 inset-ring inset-ring-white/10 transition hover:-translate-y-0.5 hover:inset-ring-white/20">
            <div aria-hidden="true" className="hero-glow absolute inset-0 opacity-0 transition group-hover:opacity-100" />
            <p className="relative font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">GitHub benchmark</p>
            <p className="relative mt-3 text-sm/6 font-medium">How late is GitHub’s own scheduler?</p>
            <p className="relative mt-2 text-xs/5 text-pretty text-zinc-400">
              {bench && bench.stats.p50Sec !== null
                ? <>In our probe repos, GitHub’s <code className="font-mono">schedule:</code> ({humanCron(bench.cron).toLowerCase()}) started a median {fmtDuration(bench.stats.p50Sec * 1000)} late and never ran {Math.round(bench.stats.missingShare * 100)}% of the time.</>
                : <>We’re measuring GitHub’s <code className="font-mono">schedule:</code> in our own probe repos. Numbers appear once the first checks are in.</>}
            </p>
            {report && report.configured > 0 && <p className="relative mt-2 text-xs/5 text-pretty text-zinc-500">{probeSample(report, now)}</p>}
            {report?.repos.filter((r) => r.live && r.from && r.until).map((r) => (
              <p key={r.repo} className="relative text-xs/5 text-pretty text-zinc-500">{r.repo.split('/')[1]}: {fmtUtc(r.from!)} to {fmtUtc(r.until!)}</p>
            ))}
            {failing.length > 0 && (
              <p className="relative mt-2 text-xs/5 text-pretty text-orange-300">Latest check failed ({failing.map((r) => `${r.repo.split('/')[1]}: ${r.error}`).join('; ')}). Numbers stop at the last complete check.</p>
            )}
            <span className="relative mt-auto pt-4 text-xs/5 font-medium text-brand-400">See the numbers →</span>
          </Link>
        </section>
      </div>
      <DispatchToasts items={items} />
    </>
  );
}

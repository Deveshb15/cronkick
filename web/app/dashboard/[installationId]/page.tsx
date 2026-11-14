import { ChevronRightIcon, LifebuoyIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { DispatchToasts, NeedsAttention } from '@/components/activity';
import { FirstRun } from '@/components/first-run';
import { Countdown, Time, Zone } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { DayTimeline, PAST_H, AHEAD_H } from '@/components/day-timeline';
import { NextKick } from '@/components/next-kick';
import { RecentRuns } from '@/components/recent-runs';
import { UpNext } from '@/components/up-next';
import { ScheduleCard } from '@/components/schedule-card';
import { SwitchSection, type Candidate } from '@/components/switch-card';
import { keepOnGitHub } from './actions';
import { AlertHint, Code, GapNotice, StatusKey, Ticks, VERDICT_DOT } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { activity, dailyCells, knownZone, exceptions, installationsFor, nextRuns, overview, recentSlots, rescueBrokeCount, slotsBetween, type DayCell, type SlotView, type WorkflowRow } from '@/lib/data';
import { evidenceLine, manageReposUrl, onTimePct, overviewLayout, rowStatus, VERDICT } from '@/lib/format';
import { fmtDelay, humanCron, plural, tzAbbrev, viewerZone } from '@/lib/live';
import { switchPlan } from '@/lib/switch';
import { isPaid, PLANS } from '../../../../src/plans.ts';
import { scheduleEvidence } from '../../../../src/schedule-watch.ts';

export const dynamic = 'force-dynamic';

const STRIP = 48;
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';

function ScheduleRow({ w, installationId, slots, gaps, limit, now }: {
  w: WorkflowRow; installationId: number; slots: SlotView[]; gaps: { start: string; end: string }[]; limit: number; now: Date;
}) {
  const st = rowStatus(w.status, slots, now);
  // Job results are GitHub's, not dispatch: counted over the whole 24 h (the strip may span less), on a quieter line.
  const failed = w.status === 'active' ? w.c24.failed : 0;
  const active = w.status === 'active';
  const words = w.schedules.length === 1 ? `${humanCron(w.schedules[0].cron)} · ${w.schedules[0].tz}` : w.schedules.length ? plural(w.schedules.length, 'schedule') : w.path.split('/').pop();
  const plain = w.schedules.some((x) => humanCron(x.cron) !== x.cron); // raw cron adds nothing when there are no plain words
  return (
    <li>
      <Link href={`/dashboard/${installationId}/workflows/${w.id}`} className="group @container block px-4 py-4 transition hover:bg-white/[0.03] sm:px-5">
        <div className="grid items-center gap-x-6 gap-y-2 @3xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,13rem)_1rem]">
          <div className="flex min-w-0 items-start justify-between gap-x-3">
            <div className="min-w-0">
              <p className="text-sm/6 font-medium break-words">{w.name} <span className="font-normal text-zinc-400">· {w.repo.split('/')[1]}</span></p>
              <p className="text-[13px]/5 text-zinc-400">{words}{plain && <span className="ml-1.5 font-mono text-xs/5 whitespace-nowrap text-zinc-400">{w.schedules.map((s) => s.cron).join(' · ')}</span>}</p>
            </div>
            <p className={`flex shrink-0 items-center gap-x-2 text-[13px]/6 @3xl:hidden ${st.text}`}><span aria-hidden="true" className={`size-2 rounded-full ${st.dot}`} />{st.word}</p>
          </div>
          {active ? <LiveStrip slots={slots} positions={STRIP} gaps={gaps} /> : <div className="@max-3xl:hidden" />}
          <div className="text-[13px]/5 @3xl:text-right">
            <p className={`flex items-center gap-x-2 font-medium @max-3xl:hidden @3xl:justify-end ${st.text}`}><span aria-hidden="true" className={`size-2 rounded-full ${st.dot}`} />{st.word}</p>
            {active && w.nextDue && <p className="mt-0.5 text-zinc-400 tabular-nums"><span className="whitespace-nowrap">Next <Time iso={w.nextDue} className="text-zinc-200" /></span> · <span className="whitespace-nowrap"><Countdown to={w.nextDue} /></span></p>}
            {failed > 0 && <p className="mt-0.5 text-red-300">{plural(failed, 'GitHub run')} failed · 24 h</p>}
          </div>
          <ChevronRightIcon aria-hidden="true" className="size-4 fill-zinc-500 transition group-hover:translate-x-0.5 group-hover:fill-zinc-300 @max-3xl:hidden" />
        </div>
        {w.status === 'needs_fix' && (
          <ul role="list" className="mt-2 space-y-1 text-[13px]/5 text-red-300">{w.flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}</ul>
        )}
        {w.status === 'limited' && <p className="mt-2 text-[13px]/5 text-zinc-400">Not running: this account has more schedules than its plan allows ({limit}). Remove a <Code># cronkick</Code> line elsewhere, or upgrade.</p>}
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
  const [{ repos, totals }, items, problems, evidence, broke] = await Promise.all([
    overview(db, id, now), activity(db, id, now, 8), exceptions(db, id, now), scheduleEvidence(db, id, now), rescueBrokeCount(db, id, now),
  ]);
  const limits = PLANS[inst.plan];
  const all = repos.flatMap((r) => r.workflows);
  const branch = new Map(repos.map((r) => [r.full_name, r.default_branch]));
  const hidden = all.filter((w) => w.status === 'ready' && w.suggested_diff && w.dismissed).map((w) => ({ id: w.id, name: w.name, repo: w.repo }));
  const candidates: Candidate[] = all.filter((w) => w.status === 'ready' && w.suggested_diff && !w.dismissed).map((w) => {
    const p = switchPlan(w.suggested_diff!, limits.floorMinutes);
    return {
      id: w.id, name: w.name, path: w.path, repo: w.repo, editUrl: `https://github.com/${w.repo}/edit/${branch.get(w.repo)}/${w.path}`,
      cadence: p.crons.map((c) => humanCron(c.cron)).join(' · '), before: p.before, after: p.after, clamped: p.clamped, tooFast: p.tooFast,
      evidence: evidence.has(w.id) ? evidenceLine(evidence.get(w.id)!, now) : undefined,
    };
  });
  const switchSection = <SwitchSection candidates={candidates} hidden={hidden} plan={inst.plan} floor={limits.floorMinutes} hide={keepOnGitHub.bind(null, id)} />;

  const shownWfs = all.filter((w) => w.status === 'active' || w.status === 'limited' || w.status === 'needs_fix');
  // Room per schedule shrinks as the list grows: the only schedule gets a spotlight, two or three get cards, four or
  // more keep the compact rows. Ones that need a fix or are paused stay compact rows either way, with their reason.
  // The setup guide only until a schedule is configured; from then on the cards show it, awaiting its first run.
  if (totals.firstRun && !shownWfs.length) {
    return (
      <>
        <FirstRun installationId={id} repos={repos.map(({ full_name, default_branch }) => ({ full_name, default_branch }))} manageUrl={manageReposUrl(inst)} floor={limits.floorMinutes} candidates={candidates.length} alerts={!!inst.alert_email} />
        {(candidates.length > 0 || hidden.length > 0) && <div className={`${container} pb-16`}>{switchSection}</div>}
        <DispatchToasts items={items} />
      </>
    );
  }

  const c = totals.c24;
  const mode = shownWfs.length >= 4 ? 'rows' : shownWfs.length === 1 && shownWfs[0].status === 'active' ? 'spotlight' : 'cards';
  const tz = await knownZone(db, viewerZone((await cookies()).get('tz')?.value));
  const carded = mode === 'rows' ? [] : shownWfs.filter((w) => w.status === 'active');
  const active = shownWfs.filter((w) => w.status === 'active');
  const nk = totals.nextKick;
  const layout = overviewLayout({
    active: active.length, due: c.due, ran: totals.anyDue, next: !!nk,
    problem: problems.items.length > 0 || shownWfs.some((w) => w.status !== 'active'),
  });
  const H = 3_600_000;
  const [slots, days, inWindow] = await Promise.all([
    recentSlots(db, id, now, mode === 'spotlight' ? 96 : STRIP),
    carded.length ? dailyCells(db, id, carded.map((w) => w.id), now, tz, isPaid(inst.plan) ? 30 : 7) : new Map<number, DayCell[]>(),
    layout.timeline ? slotsBetween(db, id, new Date(now.getTime() - PAST_H * H), now) : new Map<number, SlotView[]>(),
  ]);
  const mine = shownWfs
    .map((w) => ({ w, st: rowStatus(w.status, slots.get(w.id) ?? [], now) }))
    .sort((a, b) => a.st.rank - b.st.rank)
    .map((x) => x.w);
  const rows = mode === 'rows' ? mine : mine.filter((w) => w.status !== 'active');
  const pct = onTimePct(c);
  const off = c.due - c.onTime;
  // Leads with what went wrong: a pooled percentage can hide one missed weekly run among hundreds of fast ones.
  const stats: [label: string, value: string, note: string, tone: string][] = [
    ['Not on time', String(off), off ? [c.late && `${c.late} late`, c.waiting + c.overdue && `${c.waiting + c.overdue} not sent yet`, c.unconfirmed && `${c.unconfirmed} unconfirmed`, c.refused + c.gaveUp && `${c.refused + c.gaveUp} not sent`].filter(Boolean).join(' · ') : 'none', off ? 'text-orange-200' : 'text-emerald-300'],
    ['On time', pct === null ? '—' : `${pct}%`, `${c.onTime} of ${plural(c.due, 'run')} due`, 'text-white'],
    ['Median delay', fmtDelay(totals.medianDelayMs), `over ${plural(c.onTime + c.late, 'sent run')}`, 'text-white'],
    ['GitHub failures', String(c.failed), c.passed ? `${c.passed} passed` : 'no results yet', c.failed ? 'text-red-300' : 'text-white'],
  ];
  const feed = active.filter((w) => w.upcoming.length).map(({ id, name, repo, upcoming }) => ({ id, name, repo, upcoming }));
  const lanes = layout.timeline ? active.map((w) => ({
    id: w.id, name: w.name, repo: w.repo, slots: inWindow.get(w.id) ?? [], upcoming: nextRuns(w.schedules, now, 400, new Date(now.getTime() + AHEAD_H * H)),
  })) : [];
  const problemRows = (
    <ul role="list" className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl inset-ring inset-ring-white/10 empty:hidden">
      {rows.map((w) => <ScheduleRow key={w.id} w={w} installationId={id} slots={slots.get(w.id) ?? []} gaps={totals.gaps} limit={limits.schedules} now={now} />)}
    </ul>
  );
  return (
    <>
      <div className={`${container} space-y-10 pt-8 pb-16 sm:pt-10`}>
        <header className="space-y-2">
          <p className="text-[13px]/5 text-zinc-400">Overview</p>
          <h1 className="flex items-center gap-x-3 text-2xl/8 font-semibold tracking-tight text-balance">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${totals.verdict === 'no_runs' && nk ? 'animate-pulse bg-brand-500' : VERDICT_DOT[totals.verdict]}`} />
            {totals.verdict === 'no_runs' && nk ? <span>First run <Countdown to={nk.due} /></span> : VERDICT[totals.verdict](c)}
          </h1>
          <p className="text-sm/6 text-zinc-400">
            {c.due ? 'Last 24 h' : layout.quiet && nk ? <>Next run <Time iso={nk.due} className="text-zinc-200" /></> : nk ? 'Nothing has run yet' : 'Nothing is planned yet.'}
            {' '}· times in <Zone />
          </p>
          <GapNotice gaps={totals.gaps} className="mt-4" />
        </header>

        {problems.items.length > 0 && (
          <section aria-labelledby="attention">
            <h2 id="attention" className="text-base/6 font-semibold">Needs attention <span className="font-normal text-zinc-400">· last 24 h</span></h2>
            <div className="mt-3"><NeedsAttention installationId={id} items={problems.items} more={problems.more} /></div>
          </section>
        )}

        {/* A schedule that needs a fix or is paused sits right under the headline, with its reason. */}
        {layout.attentionFirst && mode !== 'rows' && rows.length > 0 && <section aria-label="Schedules that need you" className="-mt-7">{problemRows}</section>}

        {/* The bento: tiles sit 16 px apart, closer than the page's sections. */}
        <div className="space-y-4 empty:hidden">
        {(layout.hero || layout.stats) && (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {layout.hero && <NextKick installationId={id} workflows={feed} first={!totals.anyDue} className={`col-span-2 ${layout.stats ? 'lg:row-span-2' : 'lg:col-span-4'}`} />}
            {layout.stats && stats.map(([label, value, note, tone], i) => (
              <div key={label} className="tile flex min-w-0 flex-col p-5">
                <p className="truncate text-[13px]/5 text-zinc-400">{label}</p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-4">
                  <p className={`text-3xl/9 font-semibold tracking-tight tabular-nums sm:text-4xl/10 ${tone}`}>{value}</p>
                  {/* On time gets its ring: the share of due runs sent on time. */}
                  {i === 1 && pct !== null && (
                    <svg aria-hidden="true" viewBox="0 0 44 44" className="size-11 shrink-0 -rotate-90">
                      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-white/10" />
                      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" strokeLinecap="round" className={pct === 100 ? 'stroke-emerald-400' : 'stroke-orange-300'}
                        strokeDasharray={2 * Math.PI * 18} strokeDashoffset={2 * Math.PI * 18 * (1 - pct / 100)} />
                    </svg>
                  )}
                </div>
                <p className="mt-1 truncate text-xs/5 text-zinc-500">{note}</p>
              </div>
            ))}
          </div>
        )}

        {broke > 0 && (
          <Link href={`/dashboard/${id}/rescue`} className="tile group flex items-center gap-x-4 p-4 sm:px-5">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 inset-ring inset-ring-white/10"><LifebuoyIcon className="size-4 fill-zinc-300" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-base/6 font-medium sm:text-sm/6">GitHub broke {plural(broke, 'run')} in the last 7 days</p>
              <p className="text-sm/6 text-zinc-400 sm:text-[0.8125rem]/5">Not your code: GitHub never gave them a runner, or one of its services failed.</p>
            </div>
            <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 fill-zinc-500 transition group-hover:translate-x-0.5 group-hover:fill-zinc-300" />
          </Link>
        )}

        {layout.timeline && <DayTimeline installationId={id} lanes={lanes} gaps={totals.gaps} serverNow={now.toISOString()} />}

        {totals.anyDue && (
          <div className="grid gap-4 lg:grid-cols-2">
            {/* One schedule: the countdown tile and its card already say what's next. */}
            {layout.upNext && active.length > 1 && <UpNext installationId={id} workflows={feed} />}
            <RecentRuns installationId={id} items={items} className={layout.upNext && active.length > 1 ? '' : 'lg:col-span-2'} />
          </div>
        )}
        </div>

        <section aria-labelledby="schedules">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <h2 id="schedules" className="text-base/6 font-semibold">Schedules <span className="font-normal text-zinc-400">· {mine.length}</span></h2>
            <div className="flex items-center gap-x-4 text-[13px]/5 text-zinc-400">
              {mode === 'rows' && <span>Strips show the last {STRIP} runs</span>}
              <StatusKey />
            </div>
          </div>
          {!repos.length && (
            <p className="mt-3 rounded-xl px-4 py-4 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">
              Cronkick can’t see any repositories, so nothing will be sent. <a target="_blank" rel="noreferrer" href={manageReposUrl(inst)} className="font-medium text-white underline decoration-white/30 hover:decoration-white">Choose repositories on GitHub ↗</a>
            </p>
          )}
          {carded.length > 0 && (
            <div className="mt-3 space-y-4">
              {mine.filter((w) => w.status === 'active').map((w) => (
                <ScheduleCard key={w.id} w={w} installationId={id} slots={slots.get(w.id) ?? []} days={days.get(w.id) ?? []} zone={tzAbbrev(tz, now)} gaps={totals.gaps} now={now} spotlight={mode === 'spotlight'} />
              ))}
            </div>
          )}
          {(!layout.attentionFirst || mode === 'rows') && problemRows}
          {!inst.alert_email && mine.some((w) => w.status === 'limited') && <p className="mt-3 text-[13px]/5 text-zinc-400"><AlertHint id={id} /></p>}
        </section>

        {switchSection}
      </div>
      <DispatchToasts items={items} />
    </>
  );
}

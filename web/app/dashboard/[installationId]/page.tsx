import { ChevronRightIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { DispatchToasts, NeedsAttention } from '@/components/activity';
import { FirstRun } from '@/components/first-run';
import { Countdown, Time, Zone } from '@/components/live';
import { LiveStrip } from '@/components/live-strip';
import { ScheduleCard } from '@/components/schedule-card';
import { SwitchSection, type Candidate } from '@/components/switch-card';
import { keepOnGitHub } from './actions';
import { AlertHint, Code, GapNotice, StatusKey, Ticks, VERDICT_DOT } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { activity, dailyCells, knownZone, exceptions, installationsFor, overview, recentSlots, type DayCell, type SlotView, type WorkflowRow } from '@/lib/data';
import { evidenceLine, manageReposUrl, rowStatus, VERDICT } from '@/lib/format';
import { fmtDelay, humanCron, plural, tzAbbrev, viewerZone } from '@/lib/live';
import { switchPlan } from '@/lib/switch';
import { PLANS } from '../../../../src/plans.ts';
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
  const [{ repos, totals }, items, problems, evidence] = await Promise.all([
    overview(db, id, now), activity(db, id, now, 8), exceptions(db, id, now), scheduleEvidence(db, id, now),
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
        <FirstRun installationId={id} repos={repos.map((r) => r.full_name)} manageUrl={manageReposUrl(inst)} floor={limits.floorMinutes} candidates={candidates.length} alerts={!!inst.alert_email} />
        {(candidates.length > 0 || hidden.length > 0) && <div className={`${container} pb-16`}>{switchSection}</div>}
        <DispatchToasts items={items} />
      </>
    );
  }

  const c = totals.c24;
  const mode = shownWfs.length >= 4 ? 'rows' : shownWfs.length === 1 && shownWfs[0].status === 'active' ? 'spotlight' : 'cards';
  const tz = await knownZone(db, viewerZone((await cookies()).get('tz')?.value));
  const carded = mode === 'rows' ? [] : shownWfs.filter((w) => w.status === 'active');
  const [slots, days] = await Promise.all([
    recentSlots(db, id, now, mode === 'spotlight' ? 96 : STRIP),
    carded.length ? dailyCells(db, id, carded.map((w) => w.id), now, tz, inst.plan === 'pro' ? 30 : 7) : new Map<number, DayCell[]>(),
  ]);
  const mine = shownWfs
    .map((w) => ({ w, st: rowStatus(w.status, slots.get(w.id) ?? [], now) }))
    .sort((a, b) => a.st.rank - b.st.rank)
    .map((x) => x.w);
  const rows = mode === 'rows' ? mine : mine.filter((w) => w.status !== 'active');
  const summary = c.due
    ? [`${c.onTime} of ${plural(c.due, 'run')} sent on time`, totals.medianDelayMs !== null && `median delay ${fmtDelay(totals.medianDelayMs)} over ${plural(c.onTime + c.late, 'sent run')}`,
      c.failed ? `${plural(c.failed, 'GitHub run')} failed` : c.passed ? 'no failed GitHub runs' : null, 'last 24 h'].filter(Boolean).join(' · ')
    : null;
  const nk = totals.nextKick;
  return (
    <>
      <div className={`${container} space-y-10 pt-8 pb-16 sm:pt-10`}>
        <header className="space-y-2">
          <p className="text-[13px]/5 text-zinc-400">Overview</p>
          <h1 className="flex items-center gap-x-3 text-2xl/8 font-semibold tracking-tight text-balance">
            <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${VERDICT_DOT[totals.verdict]}`} />
            {VERDICT[totals.verdict](c)}
          </h1>
          <p className="text-sm/6 text-zinc-400">
            {summary ?? (nk ? <>Next run: {nk.workflow} <Time iso={nk.due} className="text-zinc-200" /> · <Countdown to={nk.due} /></> : 'Nothing is planned yet.')}
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
          <ul role="list" className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl inset-ring inset-ring-white/10 empty:hidden">
            {rows.map((w) => <ScheduleRow key={w.id} w={w} installationId={id} slots={slots.get(w.id) ?? []} gaps={totals.gaps} limit={limits.schedules} now={now} />)}
          </ul>
          {!inst.alert_email && mine.some((w) => w.status === 'limited') && <p className="mt-3 text-[13px]/5 text-zinc-400"><AlertHint id={id} /></p>}
        </section>

        {switchSection}
      </div>
      <DispatchToasts items={items} />
    </>
  );
}

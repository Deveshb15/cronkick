import { CheckCircleIcon, ClockIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Time, Zone } from '@/components/live';
import { RescueList, RescueSummary } from '@/components/rescue';
import { Notice, Pill, StatusDot } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { installationsFor, rescueRuns, rescueSettings, rescueSummary, stuckRuns, type RescueMode } from '@/lib/data';
import { PLANS } from '../../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';
const link = 'font-medium text-white underline decoration-white/30 hover:decoration-white';
const MODE: Record<RescueMode, [dot: string, word: string]> = {
  off: ['bg-zinc-500', 'Off'], shadow: ['bg-sky-400', 'Report only'], rerun: ['bg-emerald-400', 'Re-run once'],
};

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? `Rescue · ${inst.account_login}` : 'Rescue' };
}

export default async function Rescue({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ all?: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/rescue`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const all = (await searchParams).all === '1';
  const now = new Date();
  const [{ rows }, stuck, { mode }, counts] = await Promise.all([rescueRuns(db, id, now, all), stuckRuns(db, id, now), rescueSettings(db, id), rescueSummary(db, id, now)]);
  const days = PLANS[inst.plan].historyDays;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tabs = [
    { label: 'GitHub’s side', n: total - (counts.user ?? 0), href: `/dashboard/${id}/rescue`, on: !all },
    { label: 'All failed runs', n: total, href: `/dashboard/${id}/rescue?all=1`, on: all },
  ];
  const [dot, word] = MODE[mode];
  return (
    <div className={`${container} space-y-10 pt-8 pb-16 sm:pt-10`}>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-2xl space-y-1">
          <p className="text-[13px]/5 text-zinc-400">{inst.account_login}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Rescue</h1>
          <p className="text-base/7 text-pretty text-zinc-400 sm:text-sm/6">
            When a workflow run fails, Rescue checks whether GitHub’s infrastructure broke it, not your code. Times in <Zone />. <Link href="/docs/rescue" className={link}>How it decides</Link>
          </p>
        </div>
        <Link href={`/dashboard/${id}/settings#rescue`} className="inline-flex min-h-11 items-center gap-x-3 rounded-lg px-3 text-sm/6 inset-ring inset-ring-white/10 hover:bg-white/5 sm:min-h-9">
          <StatusDot dot={dot}>{word}</StatusDot><span className="text-zinc-400">Change</span>
        </Link>
      </header>

      {mode === 'off' && (
        <Notice className="-mt-4">
          <p>Rescue is off, so new failed runs aren’t checked. The runs below are from before it was turned off. <Link href={`/dashboard/${id}/settings#rescue`} className={link}>Turn it on</Link></p>
        </Notice>
      )}

      <RescueSummary counts={counts} days={days} />

      {stuck.length > 0 && (
        <section aria-labelledby="stuck">
          <h2 id="stuck" className="text-base/6 font-semibold">Stuck in GitHub’s queue <span className="font-normal text-zinc-400">· {stuck.length}</span></h2>
          <p className="mt-1 text-base/7 text-zinc-400 sm:text-sm/6">GitHub accepted these over an hour ago and never started a runner. Cronkick doesn’t cancel them; you can, on GitHub.</p>
          <ul role="list" className="mt-3 divide-y divide-white/5 rounded-xl inset-ring inset-ring-white/10">
            {stuck.map((r) => (
              <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
                <span><Pill tone="orange" icon={ClockIcon} title="Accepted by GitHub over an hour ago, never started.">Stuck</Pill></span>
                <p className="min-w-0 truncate text-base/6 font-medium max-sm:col-span-2 max-sm:row-start-2 sm:text-sm/6">{r.workflow} <span className="font-normal text-zinc-400">· {r.repo.split('/')[1]}</span></p>
                <p className="text-right text-sm/6 sm:text-[0.8125rem]/5">
                  <span className="text-zinc-400">Sent </span><Time iso={r.firedAt} date className="text-zinc-300 tabular-nums" />
                  {r.runUrl && <> · <a target="_blank" rel="noreferrer" href={r.runUrl} className="text-zinc-400 hover:text-white">View run<span className="sr-only"> of {r.workflow} on GitHub</span> ↗</a></>}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="runs">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <h2 id="runs" className="text-base/6 font-semibold">Failed runs</h2>
          <nav aria-label="Which failed runs" className="flex gap-1 rounded-lg bg-white/5 p-1 text-[13px]/5">
            {tabs.map((t) => (
              <Link key={t.label} href={t.href} scroll={false} aria-current={t.on ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-x-1.5 rounded-md px-2.5 sm:min-h-8 ${t.on ? 'bg-white/10 font-medium text-white' : 'text-zinc-300 hover:text-white'}`}>
                {t.label}<span className="text-zinc-400 tabular-nums">{t.n}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-3">
          {rows.length ? <RescueList rows={rows} /> : (
            <div className="flex items-start gap-x-3 rounded-xl px-4 py-5 text-base/7 text-zinc-300 inset-ring inset-ring-white/10 sm:text-sm/6">
              <CheckCircleIcon aria-hidden="true" className="mt-1.5 size-4 shrink-0 fill-emerald-400 sm:mt-1" />
              <p>{all ? `No failed runs in the last ${days} days.` : `GitHub didn’t break any of your runs in the last ${days} days.`}{mode === 'off' ? '' : ' Rescue checks each failed run within a minute of it ending.'}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

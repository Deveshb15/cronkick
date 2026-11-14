'use client';
import { Cog6ToothIcon, LifebuoyIcon, Squares2X2Icon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import posthog from 'posthog-js';
import { useEffect, type ReactNode } from 'react';
import { PLANS, type PlanName } from '../../src/plans.ts';

type Props = { id: number; switcher: ReactNode; userId?: number; login: string; plan: PlanName; offer: PlanName | null; used: number; limit: number; floorMinutes: number };

let identifiedUserId: number | undefined;

/** Sidebar: account switcher, two destinations, plan usage, and who is signed in. */
export function DashNav({ id, switcher, userId, login, plan, offer, used, limit, floorMinutes }: Props) {
  const path = usePathname();

  useEffect(() => {
    if (typeof userId !== 'number' || identifiedUserId === userId) return;
    posthog.identify(`github:${userId}`, { github_login: login });
    identifiedUserId = userId;
  }, [login, userId]);
  // Every event in the dashboard belongs to the GitHub account being viewed (B2B: one installation, many people).
  useEffect(() => {
    posthog.group('installation', String(id), { plan, schedules_used: used, schedule_limit: limit, at_limit: used >= limit });
  }, [id, plan, used, limit]);
  const at = path.endsWith('/settings') ? 'settings' : path.endsWith('/rescue') ? 'rescue' : 'overview';
  const item = 'flex min-h-11 items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-base/6 font-medium transition sm:text-sm/6 lg:min-h-0';
  const idle = 'text-zinc-400 hover:bg-white/5 hover:text-white';
  const on = 'bg-white/5 text-white';
  return (
    <div className="flex h-full flex-col gap-y-6">
      {switcher}
      <ul role="list" className="space-y-0.5">
        {([['overview', '', 'Overview', Squares2X2Icon], ['rescue', '/rescue', 'Rescue', LifebuoyIcon], ['settings', '/settings', 'Settings', Cog6ToothIcon]] as const).map(([key, sub, label, Icon]) => (
          <li key={key}>
            <Link href={`/dashboard/${id}${sub}`} aria-current={at === key ? 'page' : undefined} className={`${item} ${at === key ? on : idle}`}>
              <Icon aria-hidden="true" className="size-4 shrink-0 fill-current" />{label}
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto space-y-4">
        <div className="rounded-xl bg-white/[0.03] p-3 inset-ring inset-ring-white/10">
          <div className="flex items-baseline justify-between text-[13px]/5"><span className="text-zinc-400">Schedules</span><span className="tabular-nums"><b className="font-medium text-white">{used}</b><span className="text-zinc-400"> of {limit}</span></span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>
          <p className="mt-2 text-xs/4 text-zinc-400">{PLANS[plan].label} · every {floorMinutes === 1 ? 'minute' : `${floorMinutes} min`} or slower</p>
          {offer && <Link href={`/dashboard/${id}/settings`} className="mt-1.5 block text-xs/4 font-medium text-brand-400 hover:text-brand-300">Get {PLANS[offer].label}: {PLANS[offer].schedules} schedules, every {PLANS[offer].floorMinutes === 1 ? 'minute' : `${PLANS[offer].floorMinutes} min`} →</Link>}
        </div>
        <div className="flex items-center gap-x-2 px-2.5 text-xs/5 text-zinc-400">
          <img src={`https://github.com/${login}.png?size=40`} alt="" className="size-5 shrink-0 rounded-full outline-1 -outline-offset-1 outline-white/10" />
          <span className="min-w-0 truncate">Signed in as {login}</span>
          <a href="/logout" onClick={() => { posthog.reset(); identifiedUserId = undefined; }} className="-my-3 ml-auto flex min-h-11 shrink-0 items-center px-1 font-medium hover:text-white lg:my-0 lg:min-h-0">Sign out</a>
        </div>
      </div>
    </div>
  );
}

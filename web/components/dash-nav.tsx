'use client';
import { Cog6ToothIcon, Squares2X2Icon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type Props = { id: number; switcher: ReactNode; login: string; plan: string; used: number; limit: number; floorMinutes: number };

/** Sidebar: account switcher, two destinations, plan usage, and who is signed in. */
export function DashNav({ id, switcher, login, plan, used, limit, floorMinutes }: Props) {
  const path = usePathname();
  const settings = path.endsWith('/settings');
  const item = 'flex items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-base/6 font-medium transition sm:text-sm/6';
  const idle = 'text-zinc-400 hover:bg-white/5 hover:text-white';
  const on = 'bg-white/5 text-white';
  return (
    <div className="flex h-full flex-col gap-y-6">
      {switcher}
      <ul role="list" className="space-y-0.5">
        <li>
          <Link href={`/dashboard/${id}`} aria-current={!settings ? 'page' : undefined} className={`${item} ${!settings ? on : idle}`}>
            <Squares2X2Icon aria-hidden="true" className="size-4 shrink-0 fill-current" />Overview
            {used > 0 && <span className="ml-auto rounded-full bg-white/10 px-1.5 font-mono text-[0.625rem]/5 text-zinc-300">{used}</span>}
          </Link>
        </li>
        <li>
          <Link href={`/dashboard/${id}/settings`} aria-current={settings ? 'page' : undefined} className={`${item} ${settings ? on : idle}`}>
            <Cog6ToothIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />Settings
          </Link>
        </li>
      </ul>
      <div className="mt-auto space-y-4">
        <div className="rounded-xl bg-white/[0.03] p-3 inset-ring inset-ring-white/10">
          <div className="flex items-baseline justify-between text-xs/5"><span className="text-zinc-400">Schedules</span><span className="font-mono"><b className="font-medium text-white">{used}</b><span className="text-zinc-500"> / {limit}</span></span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} /></div>
          <p className="mt-2 text-[0.6875rem]/4 text-zinc-500">{plan === 'pro' ? 'Pro' : 'Free'} · every {floorMinutes} min or slower</p>
          {plan !== 'pro' && <Link href={`/dashboard/${id}/settings`} className="mt-1.5 block text-[0.6875rem]/4 font-medium text-brand-400 hover:text-brand-300">Get Pro: 50 schedules, every 5 min →</Link>}
        </div>
        <div className="flex items-center gap-x-2 px-2.5 text-xs/5 text-zinc-500">
          <img src={`https://github.com/${login}.png?size=40`} alt="" className="size-5 shrink-0 rounded-full outline-1 -outline-offset-1 outline-white/10" />
          <span className="min-w-0 truncate">Signed in as {login}</span>
          <a href="/logout" className="ml-auto shrink-0 font-medium hover:text-white">Sign out</a>
        </div>
      </div>
    </div>
  );
}

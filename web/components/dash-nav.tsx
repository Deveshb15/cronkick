'use client';
import { ArrowTopRightOnSquareIcon, ChartBarIcon, Cog6ToothIcon, HomeIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from './ui';

type Props = { id: number; installs: { id: number; account_login: string; plan: string }[]; login: string; manageUrl: string };

export function DashNav({ id, installs, login, manageUrl }: Props) {
  const path = usePathname();
  const item = 'flex items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-base/6 font-medium sm:py-1.5 sm:text-sm/6';
  const idle = 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white';
  const on = 'bg-zinc-950/5 text-zinc-950 dark:bg-white/5 dark:text-white';
  const settings = path.endsWith('/settings');
  return (
    <div className="flex h-full flex-col gap-y-8">
      <div>
        <p className="px-2.5 text-sm/6 font-medium text-zinc-500 sm:text-xs/6">Accounts</p>
        <ul role="list" className="mt-1 space-y-0.5">
          {installs.map((i) => (
            <li key={i.id}>
              <Link href={`/dashboard/${i.id}`} className={`${item} justify-between ${i.id === id ? on : idle}`}>
                <span className="min-w-0 truncate">{i.account_login}</span>
                <Badge tone={i.plan === 'pro' ? 'blue' : 'zinc'}>{i.plan === 'pro' ? 'Pro' : 'Free'}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ul role="list" className="space-y-0.5">
        <li><Link href={`/dashboard/${id}`} className={`${item} ${!settings ? on : idle}`}><HomeIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />Overview</Link></li>
        <li><Link href={`/dashboard/${id}/settings`} className={`${item} ${settings ? on : idle}`}><Cog6ToothIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />Settings</Link></li>
        <li><Link href="/lateness" className={`${item} ${idle}`}><ChartBarIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />GitHub lateness</Link></li>
        <li><a href={manageUrl} className={`${item} ${idle}`}><ArrowTopRightOnSquareIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />Choose repositories</a></li>
      </ul>
      <div className="mt-auto flex items-center justify-between gap-x-3 border-t border-zinc-950/5 px-2.5 pt-4 text-sm/6 dark:border-white/10">
        <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-400">{login}</span>
        <a href="/logout" className="shrink-0 font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white">Sign out</a>
      </div>
    </div>
  );
}

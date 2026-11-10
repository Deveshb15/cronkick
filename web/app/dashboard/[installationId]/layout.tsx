import { Bars3Icon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DashNav } from '@/components/dash-nav';
import { LiveRefresh } from '@/components/live-refresh';
import { Logo } from '@/components/site';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { installationsFor } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Shell({ children, params }: { children: ReactNode; params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}`);
  const installs = await installationsFor(db, s.installs);
  const inst = installs.find((i) => i.id === id);
  if (!inst) return <main className="p-8 text-zinc-300">This installation was removed. <Link href="/dashboard" className="text-white underline">Back</Link></main>;
  const nav = <DashNav id={id} installs={installs} login={s.login} manageUrl={manageReposUrl(inst)} />;
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="w-64 shrink-0 border-r border-white/5 bg-zinc-950 p-4 max-lg:hidden">
        <div className="sticky top-4 flex h-[calc(100dvh-2rem)] flex-col gap-y-8">
          <div className="px-2.5 pt-1"><Logo className="h-5" /></div>
          <div className="min-h-0 flex-1">{nav}</div>
        </div>
      </aside>
      <details className="group border-b border-white/5 lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3">
          <Logo className="h-5" />
          <span className="flex items-center gap-x-2 text-sm/6 font-medium text-zinc-400">
            {inst.account_login}
            <Bars3Icon aria-hidden="true" className="size-4 shrink-0 fill-current" />
            <span className="sr-only">Open menu</span>
          </span>
        </summary>
        <div className="px-4 pb-4">{nav}</div>
      </details>
      <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl"><div className="mb-6 flex justify-end"><LiveRefresh /></div>{children}</div>
      </main>
    </div>
  );
}

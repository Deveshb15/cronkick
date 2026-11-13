import Link from 'next/link';
import type { ReactNode } from 'react';
import { AccountSwitcher, type Account } from '@/components/account-switcher';
import { DashNav } from '@/components/dash-nav';
import { LiveRefresh } from '@/components/live-refresh';
import { PhoneMenu } from '@/components/phone-menu';
import { Logo } from '@/components/site';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { accountHealth, installationsFor } from '@/lib/data';
import { installUrl } from '@/lib/format';
import { isPaid, paidPlanFor, PLANS } from '../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

export default async function Shell({ children, params }: { children: ReactNode; params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}`);
  const installs = await installationsFor(db, s.installs);
  const inst = installs.find((i) => i.id === id);
  if (!inst) return <main className="p-8 text-zinc-300">This installation was removed. <Link href="/dashboard" className="text-white underline">Back</Link></main>;
  const health = await accountHealth(db, installs.map((i) => i.id), new Date());
  const accounts: Account[] = installs.map((i) => ({ id: i.id, login: i.account_login, plan: i.plan, ...health.get(i.id)! }));
  const current = accounts.find((a) => a.id === id)!;
  const limits = PLANS[inst.plan];
  const nav = (
    <DashNav id={id} userId={s.userId} login={s.login} plan={inst.plan} offer={isPaid(inst.plan) ? null : paidPlanFor(inst.account_type)} used={current.schedules} limit={limits.schedules} floorMinutes={limits.floorMinutes}
      switcher={<AccountSwitcher current={current} accounts={accounts} installUrl={installUrl()} />} />
  );
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="w-60 shrink-0 border-r border-white/5 bg-zinc-950 p-4 max-lg:hidden">
        <div className="sticky top-4 flex h-[calc(100dvh-2rem)] flex-col gap-y-6">
          <div className="px-2.5 pt-1"><Logo className="h-5" /></div>
          <div className="min-h-0 flex-1">{nav}</div>
        </div>
      </aside>
      {/* Phone: the logo link and the menu are two separate targets. */}
      <div className="relative flex items-center justify-between border-b border-white/5 px-4 py-2 lg:hidden">
        <Logo className="h-5" />
        <PhoneMenu label={inst.account_login}>{nav}</PhoneMenu>
      </div>
      <main className="relative min-w-0 flex-1">
        <div className="absolute top-5 right-4 z-10 max-sm:hidden sm:right-6 lg:right-10"><LiveRefresh installationId={id} /></div>
        {children}
      </main>
    </div>
  );
}

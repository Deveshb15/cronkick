import type { Metadata } from 'next';
import { AlertEmailForm } from '@/components/alert-email-form';
import { ButtonLink } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { accountHealth, installationsFor } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';
import { PLANS } from '../../../../../src/plans.ts';
import { saveAlertEmail } from './actions';

export const dynamic = 'force-dynamic';

const container = 'mx-auto max-w-4xl px-4 sm:px-6 lg:px-10';
const card = 'relative rounded-2xl bg-zinc-950 p-6 inset-ring inset-ring-white/10';

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? `Settings · ${inst.account_login}` : 'Settings' };
}

export default async function Settings({ params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/settings`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const used = (await accountHealth(db, [id], new Date())).get(id)!.schedules;
  const limits = PLANS[inst.plan];
  const free = inst.plan === 'free';
  const rows: [string, string, string][] = [
    ['Schedules', `${PLANS.free.schedules}`, `${PLANS.pro.schedules}`],
    ['Fastest', `every ${PLANS.free.floorMinutes} min`, `every ${PLANS.pro.floorMinutes} min`],
    ['History', `${PLANS.free.historyDays} days`, `${PLANS.pro.historyDays} days`],
    ['Email alerts', 'plan limit only', 'missed and failed runs'],
  ];
  return (
    <div className={`${container} space-y-6 py-12`}>
      <div>
        <p className="font-mono text-[0.6875rem]/5 tracking-wider text-zinc-500 uppercase">{inst.account_login} · Settings</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
      </div>

      <section className={free ? `${card} border-spin` : card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base/7 font-semibold">Plan and usage</h2>
            <p className="text-sm/6 text-zinc-400">{free ? 'Free' : 'Pro'} · billed per GitHub account or organization.</p>
          </div>
          {free && (
            // ponytail: upgrades are manual until checkout (Polar/Dodo) is wired up.
            <ButtonLink href={`mailto:hi@cronkick.xyz?subject=Upgrade%20${encodeURIComponent(inst.account_login)}%20to%20Pro`} variant="primary" className="btn-glow">Request Pro by email · $9/month</ButtonLink>
          )}
        </div>
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm/6"><span className="text-zinc-400">Schedules in use</span><span className="font-mono"><b className="font-medium">{used}</b><span className="text-zinc-500"> / {limits.schedules}</span></span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (used / limits.schedules) * 100)}%` }} /></div>
          <p className="mt-2 text-xs/5 text-zinc-500">Each <code className="font-mono">#&nbsp;cronkick</code> line is one schedule, in any repository.</p>
        </div>
        <table className="mt-6 w-full text-left text-sm/6">
          <thead className="text-xs/5 text-zinc-500"><tr className="border-b border-white/10"><th className="py-2 font-medium" /><th className={`font-medium ${free ? 'text-white' : ''}`}>Free</th><th className={`font-medium ${free ? '' : 'text-white'}`}>Pro · $9/mo</th></tr></thead>
          <tbody className="divide-y divide-white/5">{rows.map(([k, f, p]) => <tr key={k}><td className="py-2 text-zinc-400">{k}</td><td className={free ? '' : 'text-zinc-500'}>{f}</td><td className={free ? 'text-zinc-500' : ''}>{p}</td></tr>)}</tbody>
        </table>
        {free && <p className="mt-3 text-xs/5 text-zinc-500">Pro is turned on by hand for now: email us and we switch your account. There is no card checkout yet.</p>}
      </section>

      <section className={card}>
        <h2 className="text-base/7 font-semibold">Alert email</h2>
        <p className="mt-1 mb-4 text-sm/6 text-zinc-400">{free ? 'On Free we email you here when a schedule pauses at the plan limit. Missed-run and failed-run alerts are part of Pro.' : 'Where we send missed-run and failed-run alerts.'}</p>
        <AlertEmailForm action={saveAlertEmail.bind(null, id)} initial={inst.alert_email ?? ''} />
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base/7 font-semibold">Repository access</h2>
            <p className="text-sm/6 text-zinc-400">Choose which repositories Cronkick can see, on GitHub. Uninstalling there stops every schedule at once.</p>
          </div>
          <ButtonLink href={manageReposUrl(inst)}>Manage on GitHub ↗</ButtonLink>
        </div>
      </section>
    </div>
  );
}

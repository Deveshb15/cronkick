import type { Metadata } from 'next';
import { AlertEmailForm } from '@/components/alert-email-form';
import { Button, ButtonLink } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { billingEnabled } from '@/lib/billing';
import { db } from '@/lib/db';
import { accountHealth, billingOf, canBuy, installationsFor, type Billing } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';
import { isPaid, paidPlanFor, PLANS } from '../../../../../src/plans.ts';
import { openBillingPortal, saveAlertEmail, startCheckout } from './actions';

export const dynamic = 'force-dynamic';

// Same left edge as the overview; the content itself stays a readable width.
const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 *:max-w-3xl';
const card = 'relative rounded-2xl bg-zinc-950 p-6 inset-ring inset-ring-white/10';

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? `Settings · ${inst.account_login}` : 'Settings' };
}

const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const every = (m: number) => (m === 1 ? 'every minute' : `every ${m} min`);

/** One line on where the subscription stands; null when there is nothing to say (Free, or a plan set by hand). */
function billingLine(b: Billing): string | null {
  const until = b.paidThrough ? day(b.paidThrough) : null;
  if (b.status === 'active') return until ? `Renews ${until}.` : null;
  if (b.status === 'cancelled' && isPaid(b.plan)) return `Cancelled: stays ${PLANS[b.plan].label} until ${until}, then Free.`;
  if (b.status === 'past_due') return 'Your last payment failed. Update your card in Manage billing to keep your plan.';
  if (b.status === 'on_hold') return 'Payment failed, so the account is on Free. Update your card in Manage billing to resume.';
  return null;
}

export default async function Settings({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ checkout?: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/settings`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const used = (await accountHealth(db, [id], new Date())).get(id)!.schedules;
  const billing = await billingOf(db, id);
  const justPaid = (await searchParams).checkout === 'done' && !isPaid(inst.plan);
  const limits = PLANS[inst.plan];
  const free = inst.plan === 'free';
  const offer = paidPlanFor(inst.account_type);
  const paid = PLANS[offer];
  const buy = billingEnabled() && canBuy(billing);
  const rows: [string, string, string][] = [
    ['Schedules', `${PLANS.free.schedules}`, `${paid.schedules}`],
    ['Fastest', every(PLANS.free.floorMinutes), every(paid.floorMinutes)],
    ['History', `${PLANS.free.historyDays} days`, `${paid.historyDays} days`],
    ['Email alerts', 'plan limit only', 'missed and failed runs'],
  ];
  const line = billingLine(billing);
  return (
    <div className={`${container} space-y-6 pt-8 pb-16 sm:pt-10`}>
      <div>
        <p className="text-[13px]/5 text-zinc-400">{inst.account_login}</p>
        <h1 className="mt-1 text-2xl/8 font-semibold tracking-tight">Settings</h1>
      </div>

      <section className={card}>
        <h2 className="text-base/7 font-semibold">Alert email</h2>
        <p className="mt-1 mb-4 text-sm/6 text-zinc-400">{free ? `On Free we email you here when a schedule pauses at the plan limit. Missed-run and failed-run alerts are part of ${paid.label}.` : 'Where we send missed-run and failed-run alerts.'}</p>
        <AlertEmailForm action={saveAlertEmail.bind(null, id)} initial={inst.alert_email ?? ''} />
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base/7 font-semibold">Plan and usage</h2>
            <p className="text-sm/6 text-zinc-400">{limits.label} · {every(limits.floorMinutes)} or slower.{line && <> {line}</>}</p>
          </div>
          {billing.customer && (
            <form action={openBillingPortal.bind(null, id)}><Button type="submit">Manage billing</Button></form>
          )}
        </div>
        {justPaid && <p role="status" className="mt-4 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm/6 text-emerald-300 inset-ring inset-ring-emerald-400/20">Payment received. Your plan switches to {paid.label} within a few seconds; refresh this page to see it.</p>}
        {buy && (
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <form action={startCheckout.bind(null, id, 'monthly')}><Button type="submit" variant="primary">Get {paid.label} · ${paid.price!.monthly}/month</Button></form>
            <form action={startCheckout.bind(null, id, 'yearly')}><Button type="submit">${paid.price!.yearly}/year · 2 months free</Button></form>
            <p className="w-full text-[13px]/5 text-zinc-400">{paid.label} is for {offer === 'team' ? 'organizations' : 'personal accounts'}. Secure checkout by Dodo Payments; cancel any time.</p>
          </div>
        )}
        <div className="mt-5">
          <div className="flex items-baseline justify-between text-sm/6"><span className="text-zinc-400">Schedules in use</span><span className="font-mono"><b className="font-medium">{used}</b><span className="text-zinc-400"> of {limits.schedules}</span></span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, (used / limits.schedules) * 100)}%` }} /></div>
          <p className="mt-2 text-[13px]/5 text-zinc-400">Each <code className="font-mono">#&nbsp;cronkick</code> line is one schedule, in any repository.</p>
        </div>
        <details className="group mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm/6 font-medium text-zinc-300 hover:text-white sm:min-h-0">Compare plans</summary>
        <table className="mt-3 w-full text-left text-sm/6">
          <thead className="text-[13px]/5 text-zinc-400"><tr className="border-b border-white/10"><th className="py-2 font-medium" /><th className={`font-medium ${free ? 'text-white' : ''}`}>Free</th><th className={`font-medium ${free ? '' : 'text-white'}`}>{paid.label} · ${paid.price!.monthly}/mo</th></tr></thead>
          <tbody className="divide-y divide-white/5">{rows.map(([k, f, p]) => <tr key={k}><td className="py-2 text-zinc-400">{k}</td><td className={free ? '' : 'text-zinc-400'}>{f}</td><td className={free ? 'text-zinc-400' : ''}>{p}</td></tr>)}</tbody>
        </table>
        </details>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base/7 font-semibold">Repository access</h2>
            <p className="text-sm/6 text-zinc-400">Choose which repositories Cronkick can see, on GitHub. Uninstalling there stops every schedule at once.</p>
          </div>
          <ButtonLink target="_blank" rel="noreferrer" href={manageReposUrl(inst)}>Manage on GitHub ↗</ButtonLink>
        </div>
      </section>
    </div>
  );
}

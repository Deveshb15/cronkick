import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertEmailForm } from '@/components/alert-email-form';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';
import { SubmitToggle } from '@/components/submit-toggle';
import { Button, ButtonLink, StatusDot } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { billingEnabled } from '@/lib/billing';
import { db } from '@/lib/db';
import { accountHealth, billingOf, canBuy, installationsFor, rescueSettings, rescueWorkflows, type Billing } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';
import { isPaid, paidPlanFor, PLANS } from '../../../../../src/plans.ts';
import { openBillingPortal, saveAlertEmail, saveRescueMode, saveWorkflowRescue, startCheckout } from './actions';

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

export default async function Settings({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ checkout?: string; status?: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/settings`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const used = (await accountHealth(db, [id], new Date())).get(id)!.schedules;
  const billing = await billingOf(db, id);
  const rescue = await rescueSettings(db, id);
  // Re-run once exists only while the server has re-runs switched on (RESCUE_RERUN, the same env file as the worker).
  const rerunOffered = process.env.RESCUE_RERUN === 'on';
  const rescueFlows = rerunOffered && isPaid(inst.plan) ? await rescueWorkflows(db, id) : [];
  // Back from checkout: the plan and status come from Dodo's webhooks. The URL's status (Dodo appends "active" or
  // "failed", but anyone can edit it) only picks the wording while the webhook is still on its way.
  const sp = await searchParams;
  const returned = sp.checkout !== 'done' ? null
    : isPaid(inst.plan) ? 'paid'
    : sp.status === 'failed' || (billing.status === 'failed' && sp.status !== 'active') ? 'failed'
    : 'pending';
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
    ['Rescue', 'weekly report', 'weekly report, can re-run once'],
  ];
  const line = billingLine(billing);
  const modes: [value: string, label: string, help: string, disabled: boolean][] = [
    ['off', 'Off', 'Don’t check failed runs.', false],
    ['shadow', 'Report only', 'Check failed runs and email a weekly summary. Never re-runs anything.', false],
    ...(rerunOffered ? [['rerun', 'Re-run once', free ? `Part of ${paid.label}.` : 'Also re-run, once, a run Cronkick started that GitHub never gave a runner, on the workflows you turn on below.', free] as [string, string, string, boolean]] : []),
  ];
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
        {returned === 'failed' && <p role="status" className="mt-4 rounded-lg bg-red-400/10 px-3 py-2 text-sm/6 text-red-300 inset-ring inset-ring-red-400/20">The payment didn’t go through, so nothing was charged. Try again, or use a different card.</p>}
        {returned === 'pending' && <p role="status" className="mt-4 rounded-lg bg-white/5 px-3 py-2 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">Confirming your payment with Dodo. Refresh in a few seconds to see your plan.</p>}
        {returned === 'paid' && <p role="status" className="mt-4 rounded-lg bg-emerald-400/10 px-3 py-2 text-sm/6 text-emerald-300 inset-ring inset-ring-emerald-400/20">You’re on {limits.label}. Thanks for supporting Cronkick.</p>}
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

      <section id="rescue" className={`${card} scroll-mt-8`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-base/7 font-semibold">Rescue</h2>
            <p className="text-base/7 text-pretty text-zinc-400 sm:text-sm/6">Finds failed runs that GitHub’s infrastructure broke, not your code, and emails a weekly summary to your alert address. It keeps GitHub’s error message, never your logs. <Link href="/docs/rescue" className="font-medium text-white underline decoration-white/30 hover:decoration-white">How it decides</Link></p>
          </div>
          <ButtonLink href={`/dashboard/${id}/rescue`} size="sm">See runs</ButtonLink>
        </div>

        <form action={saveRescueMode.bind(null, id)} className="mt-5">
          <fieldset>
            <legend className="sr-only">Rescue mode</legend>
            <div className="divide-y divide-white/5 overflow-hidden rounded-xl inset-ring inset-ring-white/10">
              {modes.map(([value, label, help, disabled]) => (
                <label key={value} htmlFor={`rescue-${value}`} className="flex gap-x-3 px-4 py-3 has-checked:bg-white/[0.04] has-disabled:opacity-60 not-has-disabled:cursor-pointer">
                  <div className="flex h-lh shrink-0 items-center text-base/6 sm:text-sm/6">
                    <span className="group inline-grid size-5 grid-cols-1 sm:size-4">
                      <input id={`rescue-${value}`} type="radio" name="mode" value={value} disabled={disabled} defaultChecked={rescue.mode === value}
                        className="col-start-1 row-start-1 appearance-none rounded-full border border-white/10 bg-white/5 checked:border-brand-500 checked:bg-brand-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:border-white/5 disabled:bg-white/10 disabled:checked:bg-white/10 forced-colors:appearance-auto" />
                      <span className="pointer-events-none col-start-1 row-start-1 size-[round(down,40%,1px)] self-center justify-self-center rounded-full bg-ink group-not-has-checked:opacity-0 group-has-disabled:bg-white/25" />
                    </span>
                  </div>
                  <div className="min-w-0 text-base/6 sm:text-sm/6">
                    <p className="font-medium text-white">{label}</p>
                    <p className="text-zinc-400">{help}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex justify-end"><Button type="submit" size="sm">Save mode</Button></div>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl px-4 py-3 inset-ring inset-ring-white/10">
          <div className="min-w-0 max-w-lg">
            <p className="text-base/6 font-medium sm:text-sm/6">GitHub’s error messages</p>
            <p className="text-sm/6 text-pretty text-zinc-400 sm:text-[0.8125rem]/5">{rescue.checksRead
              ? 'Checks: read is approved, so Rescue can confirm when GitHub never gave a job a runner.'
              : 'Rescue needs the Checks: read permission to read them. Without it, a job that never got a runner shows as “probably GitHub”.'}</p>
          </div>
          {rescue.checksRead
            ? <p className="text-sm/6 text-zinc-300"><StatusDot dot="bg-emerald-400">Approved</StatusDot></p>
            : <ButtonLink size="sm" target="_blank" rel="noreferrer" href={manageReposUrl(inst)}>Approve on GitHub ↗</ButtonLink>}
        </div>

        {rescueFlows.length > 0 && (
          <div className="mt-8">
            <h3 className="text-base/6 font-semibold sm:text-sm/6">Workflows Rescue may re-run</h3>
            <p className="text-sm/6 text-zinc-400 sm:text-[0.8125rem]/5">{rescue.mode === 'rerun' ? 'Only the workflows turned on here are ever re-run.' : 'These take effect when the mode is Re-run once.'}</p>
            <div className="mt-3 flex gap-x-3 rounded-xl bg-orange-400/5 px-4 py-3 text-base/7 text-orange-200 inset-ring inset-ring-orange-400/15 sm:text-sm/6">
              <ExclamationTriangleIcon aria-hidden="true" className="mt-1.5 size-4 shrink-0 fill-orange-300 sm:mt-1" />
              <p>Rescue may re-run this workflow’s failed jobs and every job that depends on them, at the same commit, once. Turn this on only if every job in this workflow is safe to run twice.</p>
            </div>
            <ul role="list" className="mt-3 divide-y divide-white/5 rounded-xl inset-ring inset-ring-white/10">
              {rescueFlows.map((w) => (
                <li key={w.id} className="flex items-start justify-between gap-x-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-base/6 font-medium break-words sm:text-sm/6">{w.name} <span className="font-normal text-zinc-400">· {w.repo.split('/')[1]}</span></p>
                    {w.blockers.length > 0 && <p className="text-sm/6 text-orange-300 sm:text-[0.8125rem]/5">Can’t be re-run: {w.blockers.join(' ')}</p>}
                  </div>
                  <div className="flex h-lh items-center text-base/6 sm:text-sm/6">
                    <SubmitToggle action={saveWorkflowRescue.bind(null, id, w.id, !w.on)} on={w.on} disabled={w.blockers.length > 0 && !w.on} label={`Let Rescue re-run ${w.name}`} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
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

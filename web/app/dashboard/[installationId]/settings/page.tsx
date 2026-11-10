import { revalidatePath } from 'next/cache';
import { Button, ButtonLink } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { installationsFor, setAlertEmail } from '@/lib/data';
import { manageReposUrl } from '@/lib/format';
import { PLANS } from '../../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

export default async function Settings({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const id = Number((await params).installationId);
  const q = await searchParams;
  const s = await requireInstallation(id, `/dashboard/${id}/settings`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const limits = PLANS[inst.plan];

  async function save(form: FormData) {
    'use server';
    const { redirect } = await import('next/navigation');
    await requireInstallation(id, `/dashboard/${id}/settings`); // re-check: server actions are public endpoints
    const email = String(form.get('email') ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(`/dashboard/${id}/settings?error=email`);
    await setAlertEmail(db, id, email);
    revalidatePath(`/dashboard/${id}/settings`);
    redirect(`/dashboard/${id}/settings?saved=1`);
  }

  return (
    <div className="space-y-12">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="grid gap-x-12 gap-y-6 border-t border-white/10 pt-8 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-base/7 font-semibold sm:text-sm/6">Alert email</h2>
          <p className="mt-1 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">
            {inst.plan === 'pro' ? 'Where we send missed-run and failed-run alerts.' : 'Free accounts get plan-limit emails here. Missed-run alerts are part of Pro.'}
          </p>
        </div>
        <form action={save} className="flex max-w-md flex-wrap items-start gap-3">
          <label htmlFor="email" className="sr-only">Alert email</label>
          <input id="email" name="email" type="email" required defaultValue={inst.alert_email ?? ''} placeholder="you@company.com"
            className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-base/6 text-white inset-ring inset-ring-white/10 placeholder:text-zinc-500 focus:outline-2 focus:-outline-offset-1 focus:outline-brand-500 sm:py-1.5 sm:text-sm/6" />
          <Button type="submit" variant="primary">Save</Button>
          {q.saved && <p className="w-full text-base/6 text-emerald-300 sm:text-sm/6">Saved.</p>}
          {q.error && <p className="w-full text-base/6 text-red-300 sm:text-sm/6">That email address looks wrong.</p>}
        </form>
      </section>

      <section className="grid gap-x-12 gap-y-6 border-t border-white/10 pt-8 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-base/7 font-semibold sm:text-sm/6">Plan</h2>
          <p className="mt-1 text-base/7 text-zinc-400 sm:text-sm/6">Billed per GitHub account or organization.</p>
        </div>
        <div>
          <p className="text-base/7 sm:text-sm/6"><span className="font-medium">{inst.plan === 'pro' ? 'Pro' : 'Free'}</span> · up to {limits.schedules} schedules, every {limits.floorMinutes} minutes or slower{limits.repos === Infinity ? '' : `, ${limits.repos} repository`}.</p>
          {inst.plan === 'free' && (
            <div className="mt-4 flex flex-wrap items-center gap-4">
              {/* ponytail: upgrades are manual until checkout (Polar/Dodo) is wired up. */}
              <ButtonLink href={`mailto:hi@cronkick.xyz?subject=Upgrade%20${encodeURIComponent(inst.account_login)}%20to%20Pro`} size="sm">Upgrade to Pro, $9/month</ButtonLink>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-x-12 gap-y-6 border-t border-white/10 pt-8 md:grid-cols-[1fr_2fr]">
        <div>
          <h2 className="text-base/7 font-semibold sm:text-sm/6">Repositories and uninstall</h2>
          <p className="mt-1 text-base/7 text-zinc-400 sm:text-sm/6">Managed on GitHub. Uninstalling stops all scheduling at once.</p>
        </div>
        <div><ButtonLink href={manageReposUrl(inst)} size="sm">Open GitHub settings</ButtonLink></div>
      </section>
    </div>
  );
}

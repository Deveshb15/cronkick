import { ChevronDownIcon, EnvelopeIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/site';
import { Eyebrow } from '@/components/ui';
import { PLANS } from '../../../src/plans.ts';

export const metadata: Metadata = { title: 'Support', description: 'Get help with Cronkick: email support and answers to common questions.' };

const a = 'font-medium text-white underline decoration-brand-500/50 underline-offset-4 hover:decoration-brand-500';

// Keep answers in sync with the docs pages they link to.
const FAQ: { q: string; a: ReactNode }[] = [
  { q: 'My workflow didn’t run. What do I check?', a: <>Open your <Link href="/dashboard" className={a}>dashboard</Link>. A workflow marked <b>Needs a fix</b> names the problem, such as a leftover <code>schedule:</code> or a missing <code>workflow_dispatch:</code>. For a single run, open the workflow and click the run: it shows every step from the scheduled time to the job’s result. See <Link href="/docs/statuses" className={a}>Statuses</Link>.</> },
  { q: 'How fast does Cronkick start a run?', a: <>Within 30 seconds of the scheduled time, usually under a second. After that, GitHub queues the job for a runner, which your dashboard shows separately. See <Link href="/docs/timing" className={a}>Timing and retries</Link>.</> },
  { q: 'Can a workflow run twice?', a: <>Not because of Cronkick. If the result of a request is unclear, Cronkick doesn’t resend it. A workflow can still run twice if it keeps a <code>schedule:</code> block, because GitHub runs its own copy too; Cronkick flags that.</> },
  { q: 'What happens when GitHub is down?', a: <>Cronkick retries until 5 minutes after the scheduled time (or the next run, if sooner), then marks the run <b>Gave up</b> rather than start it late.</> },
  { q: 'Do I need a personal access token?', a: <>No. Cronkick is a GitHub App and uses short-lived tokens limited to the repositories you choose.</> },
  { q: 'Can Cronkick read my code?', a: <>It reads only the workflow files in <code>.github/workflows</code>, to find markers. It doesn’t store code or workflow logs. See <Link href="/docs/security" className={a}>Permissions and security</Link>.</> },
  { q: 'Does it work with organizations, private repositories and time zones?', a: <>Yes. Install the app on a personal account or an organization, public or private repositories. Add <code>tz=Europe/Berlin</code> (any IANA time zone) to a marker. See <Link href="/docs/marker" className={a}>The marker</Link>.</> },
  { q: 'What are the limits on the Free plan?', a: <>Unlimited repositories, {PLANS.free.schedules} schedules, every {PLANS.free.floorMinutes} minutes or slower, {PLANS.free.historyDays} days of history. See <Link href="/docs/plans" className={a}>Plans and limits</Link>.</> },
  { q: 'How do I get Pro, cancel or get a refund?', a: <>Email <a href="mailto:hi@cronkick.xyz" className={a}>hi@cronkick.xyz</a> while self-serve checkout is on its way. Any charge is fully refundable within 14 days; see the <Link href="/refunds" className={a}>refund policy</Link>.</> },
  { q: 'How do I stop Cronkick?', a: <>Remove a marker line to stop one schedule, or uninstall the GitHub App in your GitHub settings to stop everything at once.</> },
];

export default function Support() {
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="hero-glow px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Support</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How can we help?</h1>
          <p className="mt-6 text-lg text-pretty text-zinc-400">A person reads every message and replies within two business days, usually much sooner.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="mailto:hi@cronkick.xyz" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm/6 font-semibold text-ink transition hover:bg-brand-400">
              <EnvelopeIcon aria-hidden="true" className="size-4" />hi@cronkick.xyz
            </a>
            <Link href="/docs" className="rounded-lg bg-white/5 px-4 py-2.5 text-sm/6 font-medium inset-ring inset-ring-white/10 transition hover:bg-white/10">Read the docs</Link>
          </div>
          <p className="mt-6 text-sm/6 text-zinc-500">To help us answer faster, include your GitHub account or organization, the repository and workflow file, and the time of the run (with time zone).</p>
        </div>

        <section aria-labelledby="faq" className="mx-auto mt-20 max-w-3xl">
          <h2 id="faq" className="text-center text-2xl font-semibold tracking-tight">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-white/5 rounded-2xl bg-zinc-950/60 inset-ring inset-ring-white/10">
            {FAQ.map((f) => (
              <details key={f.q} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-sm/6 font-medium hover:text-white [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 fill-zinc-500 transition group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-5 text-sm/6 text-pretty text-zinc-400 [&_b]:font-medium [&_b]:text-zinc-200 [&_code]:rounded [&_code]:bg-white/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8125rem] [&_code]:text-zinc-200">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

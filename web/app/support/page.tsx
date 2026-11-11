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
  { q: 'How fast does Cronkick start a run?', a: <>Cronkick aims to send it within 30 seconds of the scheduled time. Runs due on the hour are spread over up to 15 seconds. After that, GitHub queues the job for a runner, which your dashboard shows separately. See <Link href="/docs/timing" className={a}>Timing and retries</Link>.</> },
  { q: 'Can a workflow run twice?', a: <>Cronkick retries only when GitHub answers with an error. If it can’t tell whether GitHub got a request, it doesn’t resend it and marks the run <b>Unconfirmed</b>. A workflow with a leftover <code>schedule:</code> block would also run on GitHub’s schedule, so Cronkick marks it <b>Needs a fix</b> and doesn’t send it.</> },
  { q: 'What happens when GitHub is down?', a: <>Cronkick retries until 5 minutes after the scheduled time (or the next run, if sooner), then marks the run <b>Gave up</b> rather than start it late. If GitHub refuses the request outright, the run shows <b>Refused</b> with GitHub’s reason, and Cronkick doesn’t retry it.</> },
  { q: 'Do I need a personal access token?', a: <>No. Cronkick is a GitHub App and uses short-lived tokens limited to the repositories you choose.</> },
  { q: 'Can Cronkick read my code?', a: <>It can. The Contents read permission lets the app read any file in the repositories you select. Cronkick reads workflow files in <code>.github/workflows</code> to find markers. It stores the marker lines it reads and compatibility warnings (such as a YAML parser’s error message with its line number), not your code, the files themselves or workflow logs. See <Link href="/docs/security" className={a}>Permissions and security</Link>.</> },
  { q: 'Does it work with organizations, private repositories and time zones?', a: <>Yes. Install the app on a personal account or an organization, public or private repositories. Add <code>tz=Europe/Berlin</code> (any IANA time zone) to a marker. See <Link href="/docs/marker" className={a}>The marker</Link>.</> },
  { q: 'What are the limits on the Free plan?', a: <>Unlimited repositories, {PLANS.free.schedules} schedules, every {PLANS.free.floorMinutes} minutes or slower, {PLANS.free.historyDays} days of history. See <Link href="/docs/plans" className={a}>Plans and limits</Link>.</> },
  { q: 'How do I get Pro, cancel or get a refund?', a: <>Request Pro · manual activation: email <a href="mailto:hi@cronkick.xyz" className={a}>hi@cronkick.xyz</a> and we switch your account by hand. There is no card checkout yet. Email the same address to cancel. Any charge is fully refundable within 14 days; see the <Link href="/refunds" className={a}>refund policy</Link>.</> },
  { q: 'How do I stop Cronkick?', a: <>Remove a marker line to stop one schedule, or uninstall the GitHub App in your GitHub settings to stop everything at once. To hand a workflow back to GitHub’s scheduler, see <Link href="/docs/migrate#go-back" className={a}>Go back to GitHub’s scheduler</Link>.</> },
];

export default function Support() {
  return (
    <>
      <SiteHeader />
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

import { CheckIcon, MinusIcon, XMarkIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { AppFrame } from '@/components/frame';
import { GitHubMark } from '@/components/icons';
import { Symbol } from '@/components/logo';
import { MarkerCard } from '@/components/marker-card';
import { DashboardShot, DiffVignette } from '@/components/product';
import { BentoCard, SplitHeading } from '@/components/section';
import { SiteFooter, SiteHeader, container } from '@/components/site';
import { ProbeCharts } from '@/components/probe-charts';
import { TimelineCompare } from '@/components/timeline-compare';
import { ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { installUrl, pairView } from '@/lib/format';
import { probeRepos } from '../../src/config.ts';
import { PLANS, type PlanName } from '../../src/plans.ts';
import { HOME_MIN_HOURS, probePairs, probeReport } from '../../src/probe/collector.ts';

/**
 * The measured every-5-minutes pair, once both sides share a full day; null keeps the illustration. Kept for a minute
 * per server: the home page is the busiest page and the probes only change every 5 minutes.
 */
let cache: { at: number; value: Promise<ReturnType<typeof pairView> | null> } | null = null;
function measured() {
  if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), value: read() };
  return cache.value;
}
async function read() {
  try {
    const now = new Date();
    const pairs = await probePairs(db, await probeReport(db, probeRepos(), now), now);
    const p = pairs.find((x) => x.cron === '*/5 * * * *');
    return p && p.state === 'compared' && p.hours >= HOME_MIN_HOURS ? pairView(p) : null;
  } catch (e) {
    console.error('home: probe pairs', e);
    return null;
  }
}

export const dynamic = 'force-dynamic';

// Sparkles on the hero's time-grid: [column from centre, row], in 64px cells.
const SPARKS = [[-9, 2], [-7, 5], [-6, 1], [-4, 8], [-3, 3], [-8, 9], [-5, 6], [2, 1], [3, 7], [5, 2], [6, 5], [7, 9], [8, 3], [9, 6], [4, 10], [-2, 11]];

type Cell = boolean | string;
const compare: [string, Cell, Cell, Cell][] = [
  ['Runs when it should', 'Best effort', true, true],
  ['Schedule lives in your repo', true, false, true],
  ['No personal access token', true, false, true],
  ['Records each planned run, and its own outages', false, false, true],
  ['Knows if the run passed', 'Per run', false, true],
  ['Flags workflows that would break', false, false, true],
];
function Mark({ v }: { v: Cell }) {
  if (v === true) return <CheckIcon aria-label="Yes" className="size-4 h-lh fill-emerald-400" />;
  if (v === false) return <XMarkIcon aria-label="No" className="size-4 h-lh fill-zinc-600" />;
  return <span className="flex items-center gap-x-1.5 text-zinc-400"><MinusIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-late" />{v}</span>;
}

const every = (m: number) => (m === 1 ? 'Every minute' : `Every ${m} minutes`);
const tier = (p: (typeof PLANS)[PlanName]) => [`${p.schedules} schedules, any repositories`, `${every(p.floorMinutes)} or slower`, `${p.historyDays} days of history`];
// Paid plans are bought in Settings, so their buttons go through sign-in (and install, if needed).
const plans = [
  { name: 'Free', price: '$0', note: 'Try it on the jobs that matter most.', items: tier(PLANS.free), href: installUrl(), cta: 'Install free', github: true },
  { name: 'Pro', price: `$${PLANS.pro.price!.monthly}`, note: `For personal GitHub accounts. Or $${PLANS.pro.price!.yearly} a year.`, items: [...tier(PLANS.pro), 'Email alerts for missed and failed runs'], href: '/dashboard', cta: 'Get Pro', featured: true },
  { name: 'Team', price: `$${PLANS.team.price!.monthly}`, note: `For GitHub organizations. Or $${PLANS.team.price!.yearly} a year.`, items: [...tier(PLANS.team), 'Email alerts for missed and failed runs'], href: '/dashboard', cta: 'Get Team' },
];

const inline = 'font-medium text-white hover:underline';
const faqs: { q: string; a: ReactNode }[] = [
  { q: 'Does Cronkick run my code?', a: 'No. It sends GitHub the same workflow_dispatch request as the Run workflow button. Your jobs run on your runners, exactly as before.' },
  { q: 'What if GitHub’s API is down?', a: 'If GitHub is throttling or erroring, Cronkick retries until the slot’s deadline, then skips it rather than run it late. If GitHub refuses the request, the run shows as Refused with GitHub’s reason. If Cronkick can’t tell whether GitHub got the request, it doesn’t resend.' },
  { q: 'What if Cronkick goes down?', a: <>After a restart Cronkick may still send a run if its deadline hasn’t passed; after the deadline it gives up rather than run it late, and the run shows as Gave up with a note saying so. If its scheduler is down for more than 2 hours, the gap shows as an outage window on your dashboard. Pro and Team accounts with an alert address get one outage email, plus a summary of runs Cronkick didn’t send, at most one an hour. There is no automatic fallback to GitHub’s scheduler. <Link href="/docs/migrate#go-back" className={inline}>How to go back →</Link></> },
  { q: 'Why not keep schedule: as a backup?', a: 'GitHub would then run the same workflow a second time, late. Cronkick won’t send a workflow that still has both.' },
  { q: 'Can I use timezones and several schedules?', a: 'Yes. Add tz=Europe/Berlin to a comment and as many # cronkick lines as you need. Schedules due at the same moment fire once.' },
  { q: 'What permissions does it need?', a: <>Actions read and write, Contents read and Metadata read, plus optional Checks read, which lets Rescue read GitHub’s own error message on a failed job. Cronkick reads workflow files; the permission allows reading any file in the repos you select. Actions write also allows starting any workflow that has workflow_dispatch:, on any branch, and cancelling, re-running and deleting runs; Cronkick only starts the ones you mark. Tokens are issued by GitHub for one hour at a time. <Link href="/docs/security" className={inline}>What Cronkick can access →</Link></> },
  { q: 'What if GitHub itself breaks a run?', a: <>When a run fails, Cronkick reads its job list and tells you when GitHub’s infrastructure was the cause, not your code: for example a job that never got a runner. Every plan gets a weekly email, “GitHub broke N of your runs”, and the Rescue page. Cronkick keeps only GitHub’s own error text, never your logs. <Link href="/docs/rescue" className={inline}>How Rescue decides →</Link></> },
  { q: 'What happens at my plan’s limit?', a: 'Extra schedules pause, and we email you if you’ve added an alert address in Settings. We never charge for going over.' },
];

export default async function Home() {
  const pair = await measured();
  return (
    <>
      <SiteHeader />
      <main className="overflow-x-clip">
        {/* Hero: one centred stack, then the marker card as the product shot */}
        <section className="relative isolate -mt-18 overflow-hidden pt-32 pb-24 sm:pt-38 sm:pb-28">
          <div aria-hidden="true" className="time-grid absolute inset-0 -z-10">
            {SPARKS.map(([x, y], i) => (
              <span key={i} className="absolute size-2 -translate-1/2 animate-twinkle rounded-full bg-[radial-gradient(circle,var(--color-brand-400),transparent_70%)]" style={{ left: `calc(50% + ${x * 64}px)`, top: y * 64, animationDelay: `${(i * 0.37) % 3}s` }} />
            ))}
            <span className="absolute inset-y-0 w-px animate-sweep bg-linear-to-b from-transparent via-brand-400/50 to-transparent" />
          </div>
          <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
          <div className={`${container} flex flex-col items-center text-center`}>
            <h1 className="max-w-[14ch] text-5xl/[1.02] font-semibold tracking-tight text-balance sm:text-7xl/[1.02] lg:text-[5.5rem]/[1]">
              {['Keep', 'GitHub', 'Actions', 'on', 'your'].map((w, i) => <span key={w} className="inline-block animate-rise" style={{ animationDelay: `${120 + i * 70}ms` }}>{w}&nbsp;</span>)}
              <span className="inline-block bg-[linear-gradient(90deg,var(--color-brand-300),var(--color-brand-500),#ff8a1f,var(--color-brand-300))] bg-size-[200%_auto] bg-clip-text text-transparent" style={{ animation: 'rise .9s cubic-bezier(.2,.7,.2,1) 470ms backwards, shimmer 6s linear infinite' }}>schedule.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] animate-rise text-lg text-pretty text-zinc-400 [animation-delay:480ms]">
              GitHub’s cron is best effort: runs can start late or not at all. Add one comment to your workflow and Cronkick sends it within seconds of the scheduled time, with no tokens and nothing to host.
            </p>
            <div className="mt-10 flex animate-rise flex-wrap items-center justify-center gap-3 [animation-delay:580ms]">
              <ButtonLink href={installUrl()} variant="primary" size="lg" className="btn-glow"><GitHubMark className="size-4" />Install with GitHub</ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" className="group">See how it works <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span></ButtonLink>
            </div>
            <Link href="/docs/security" className="mt-4 animate-rise text-sm/6 text-zinc-400 [animation-delay:620ms] hover:text-white">What Cronkick can access →</Link>
            <div className="mt-16 w-full animate-rise [animation-delay:720ms] sm:mt-20"><MarkerCard /></div>
            <dl className="mt-16 grid w-full max-w-3xl animate-rise divide-white/10 [animation-delay:900ms] max-sm:divide-y sm:mt-20 sm:grid-cols-3 sm:divide-x">
              {[['≤ 30 s', 'target for the first send'], ['0 tokens', 'to create, paste or rotate'], ['1 comment', 'in your workflow file']].map(([v, k]) => (
                <div key={v} className="flex flex-col-reverse py-4 sm:px-6">
                  <dt className="mt-1 text-sm/6 text-zinc-500">{k}</dt>
                  <dd className="font-mono text-2xl font-medium tracking-tight">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* The problem */}
        <section className="py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="The problem" title="GitHub’s scheduler is best effort. Your jobs aren’t.">
              {pair
                ? <p>We run the same workflow every 5 minutes, once on GitHub’s own <Code>schedule:</Code> and once with Cronkick, in one {pair.isPublic ? 'public ' : ''}repository. Measured live from GitHub’s run list. <a href="/lateness" className="font-medium text-white hover:underline">See every run →</a></p>
                : <p>GitHub’s own docs say scheduled runs can be delayed at busy times, and some are dropped. Below is an illustration, not measured data. <a href="/lateness" className="font-medium text-white hover:underline">See what we’ve measured →</a></p>}
            </SplitHeading>
            <div className="mt-14">{pair ? <ProbeCharts pairs={[pair]} compact /> : <TimelineCompare />}</div>
          </div>
        </section>

        {/* Dashboard: tilts flat as it scrolls in */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="The dashboard" title="Each run, on one screen.">
              <p>Each schedule gets a strip of its recent runs and a count of how many were sent within 30 s. Open a workflow for the full history.</p>
            </SplitHeading>
            <div className="reveal-tilt relative mt-14">
              <AppFrame url="cronkick.xyz/dashboard"><DashboardShot /></AppFrame>
            </div>
          </div>
        </section>

        {/* Bento */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Built for cron" title="What was due, and what was sent.">
              <p>Cronkick records what was due, what it sent, what GitHub said, and how the run ended.</p>
            </SplitHeading>
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              <BentoCard className="lg:row-span-2" title="Your repo stays the source of truth" body="The schedule is a comment in your workflow file. Edit it, push, and Cronkick picks it up." visual={<DiffVignette />} />
              <BentoCard title="A row for each planned run" body="When it was due, when Cronkick sent it, GitHub’s answer, and the job’s result. Runs Cronkick didn’t send show up too, with the reason. If Cronkick itself is down, the gap shows as an outage window." />
              <BentoCard title="Retries with a deadline" body="If GitHub is throttling or erroring, Cronkick retries until the slot’s deadline, then skips it rather than run it late. If it can’t tell whether GitHub got the request, it doesn’t resend." />
              <BentoCard title="No personal access token" body="Install the GitHub App. GitHub issues tokens that last an hour and cover only the repositories you pick. There is nothing to paste or rotate." />
              <BentoCard title="Checks before switching" body="Before turning a workflow on, Cronkick flags the common breakages: a leftover schedule:, a missing workflow_dispatch:, required inputs, and steps that read the schedule event." />
            </div>
          </div>
        </section>

        {/* Setup */}
        <section id="how-it-works" className="scroll-mt-20 border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Setup" title="Two minutes, three steps.">
              <p>No SDK, no agent, no dashboard to configure. Your jobs keep running on GitHub, on your runners.</p>
            </SplitHeading>
            <ol role="list" className="mt-14 grid gap-x-8 gap-y-10 lg:grid-cols-3">
              {[
                ['01', 'Install the GitHub App', <>Pick the repositories. Cronkick asks for Actions write and Contents read. <Link href="/docs/security" className="font-medium text-white hover:underline">What Cronkick can access →</Link></>],
                ['02', 'Swap the trigger', <>Replace <Code>schedule:</Code> with <Code>workflow_dispatch:</Code> and a <Code># cronkick</Code> comment holding the same cron.</>],
                ['03', 'Push', <>Cronkick reads the file on push and sends the workflow at its next scheduled time. Each run shows up in your dashboard.</>],
              ].map(([n, t, d]) => (
                <li key={n as string} className="reveal group border-t border-white/10 pt-6 transition-colors hover:border-brand-500/60">
                  <p className="font-mono text-sm/6 text-zinc-500 transition-colors group-hover:text-brand-400">{n}</p>
                  <h3 className="mt-2 text-lg font-semibold">{t}</h3>
                  <p className="mt-2 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Compare */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Compared" title="Why not the alternatives?">
              <p>Hosted cron services call GitHub on time too, but you create a token, paste it into their dashboard and build the request yourself. Then the schedule lives somewhere other than your repo.</p>
            </SplitHeading>
            <div className="mt-14 -mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-4 pr-6 font-medium whitespace-nowrap"><span className="sr-only">Feature</span></th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap text-zinc-300">GitHub <Code>schedule:</Code></th>
                      <th className="px-6 py-4 font-medium whitespace-nowrap text-zinc-300">Hosted cron + token</th>
                      <th className="py-4 pl-6 font-medium whitespace-nowrap"><span className="flex items-center gap-x-2 text-brand-400"><span aria-hidden="true" className="size-2 rounded-[2px] bg-brand-500" />Cronkick</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {compare.map(([f, a, b, c]) => (
                      <tr key={f} className="transition-colors hover:bg-white/[0.03]">
                        <td className="py-4 pr-6 font-medium">{f}</td>
                        <td className="px-6 py-4"><Mark v={a} /></td>
                        <td className="px-6 py-4"><Mark v={b} /></td>
                        <td className="py-4 pl-6"><Mark v={c} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Pricing" title="Simple pricing. No overage charges, ever.">
              <p>At your plan’s limit, extra schedules pause, and we email you if you’ve added an alert address in Settings. Nothing is charged for going over.</p>
            </SplitHeading>
            <div className="mt-14 grid gap-4 md:grid-cols-3">
              {plans.map((p) => (
                <div key={p.name} className={`reveal flex flex-col justify-between rounded-2xl p-8 transition duration-300 hover:-translate-y-1 ${p.featured ? 'border-spin shadow-[0_20px_80px_-30px_rgb(255_176_32/0.35)]' : 'bg-zinc-900/50 inset-ring inset-ring-white/10 hover:inset-ring-white/20'}`}>
                  <div>
                    <h3 className="text-lg font-semibold">{p.name}</h3>
                    <p className="mt-6 flex items-baseline gap-x-1"><span className="text-5xl font-semibold tracking-tight tabular-nums">{p.price}</span><span className="text-sm/6 text-zinc-400">/month</span></p>
                    <p className="mt-2 text-base/7 text-zinc-400 sm:text-sm/6">{p.note}</p>
                    <ul role="list" className="mt-8 space-y-3 border-t border-white/5 pt-8 text-base/7 text-zinc-300 sm:text-sm/6">
                      {p.items.map((i) => <li key={i} className="flex gap-x-3"><CheckIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-brand-500" />{i}</li>)}
                    </ul>
                  </div>
                  <div className="mt-10">
                    <ButtonLink href={p.href} variant={p.featured ? 'primary' : 'secondary'} className={`w-full ${p.featured ? 'btn-glow' : ''}`}>{p.github && <GitHubMark className="size-4" />}{p.cta}</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={`${container} grid gap-x-12 gap-y-12 lg:grid-cols-[2fr_3fr]`}>
            <div>
              <Eyebrow>Questions</Eyebrow>
              <h2 className="mt-4 max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">The fine print, up front.</h2>
              <p className="mt-6 max-w-[40ch] text-lg text-pretty text-zinc-400">Anything else? <a href="mailto:hi@cronkick.xyz" className="font-medium text-white hover:underline">hi@cronkick.xyz</a></p>
            </div>
            <dl className="divide-y divide-white/5">
              {faqs.map((f) => (
                <div key={f.q} className="py-6 first:pt-0">
                  <dt className="text-base/7 font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing */}
        <section className="relative border-t border-white/5 py-24 sm:py-32">
          <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
          <div className={`${container} text-center`}>
            <div className="reveal relative mx-auto mb-10 size-16">
              <div aria-hidden="true" className="absolute inset-0 animate-pulse rounded-2xl bg-brand-500/40 blur-2xl" />
              <div className="relative grid size-16 place-items-center rounded-2xl bg-zinc-900 inset-ring inset-ring-white/10"><Symbol className="size-9" /></div>
            </div>
            <h2 className="reveal mx-auto max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Stop wondering if last night’s job ran.</h2>
            <p className="mx-auto mt-6 max-w-[48ch] text-lg text-pretty text-zinc-400">Free for up to {PLANS.free.schedules} schedules. Two minutes to set up.</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href={installUrl()} variant="primary" size="lg" className="btn-glow"><GitHubMark className="size-4" />Install with GitHub</ButtonLink>
              <ButtonLink href="/lateness" variant="ghost" size="lg">See GitHub’s lateness <span aria-hidden="true">→</span></ButtonLink>
            </div>
            <Link href="/docs/security" className="mt-4 inline-block text-sm/6 text-zinc-400 hover:text-white">What Cronkick can access →</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

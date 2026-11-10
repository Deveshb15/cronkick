import { CheckIcon, MinusIcon, XMarkIcon } from '@heroicons/react/16/solid';
import { CopyCommand } from '@/components/copy-command';
import { AppFrame, FloatCard } from '@/components/frame';
import { GitHubMark } from '@/components/icons';
import {
  AlertVignette, ChartVignette, CompareCard, CompatVignette, DashboardShot, DiffVignette, EventCard,
  LifecycleVignette, PermissionsVignette, RunTableVignette,
} from '@/components/product';
import { BentoCard, SplitHeading } from '@/components/section';
import { SiteFooter, SiteHeader, container } from '@/components/site';
import { TimelineCompare } from '@/components/timeline-compare';
import { Badge, ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { installUrl } from '@/lib/format';
import { getSession } from '@/lib/session';
import { probeReport } from '../../src/probe/collector.ts';

export const dynamic = 'force-dynamic';

const LINE = 'workflow_dispatch: # cronkick: "0 3 * * *"';

type Cell = boolean | string;
const compare: [string, Cell, Cell, Cell][] = [
  ['Runs when it should', 'Best effort', true, true],
  ['Schedule lives in your repo', true, false, true],
  ['No personal access token', true, false, true],
  ['Every slot accounted for', false, false, true],
  ['Knows if the run passed', 'Per run', false, true],
  ['Flags workflows that would break', false, false, true],
];
function Mark({ v }: { v: Cell }) {
  if (v === true) return <CheckIcon aria-label="Yes" className="size-4 h-lh fill-emerald-400" />;
  if (v === false) return <XMarkIcon aria-label="No" className="size-4 h-lh fill-zinc-600" />;
  return <span className="flex items-center gap-x-1.5 text-zinc-400"><MinusIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-late" />{v}</span>;
}

const plans = [
  { name: 'Free', price: '$0', note: 'For one repository.', items: ['1 repository', '3 schedules', 'Every 15 minutes or slower', 'Last 20 slots per workflow'], href: installUrl(), cta: 'Install free', github: true },
  { name: 'Pro', price: '$9', note: 'Per GitHub account or organization. $90 billed yearly.', items: ['50 schedules across any repositories', 'Every 5 minutes or slower', 'Email alerts for missed and failed runs', '90 days of history and run charts'], href: 'mailto:hi@cronkick.xyz?subject=Cronkick%20Pro', cta: 'Get Pro', badge: 'Most teams' },
];

const faqs = [
  { q: 'Does Cronkick run my code?', a: 'No. It sends GitHub the same workflow_dispatch request as the Run workflow button. Your jobs run on your runners, exactly as before.' },
  { q: 'What if GitHub’s API is down?', a: 'We retry until the slot’s deadline, then mark it expired rather than run it late. Every failure shows up in your history instead of disappearing.' },
  { q: 'Why not keep schedule: as a backup?', a: 'GitHub would then run the same workflow a second time, late. Cronkick flags any workflow that still has both.' },
  { q: 'Can I use timezones and several schedules?', a: 'Yes. Add tz=Europe/Berlin to a comment and as many # cronkick lines as you need. Schedules due at the same moment fire once.' },
  { q: 'What permissions does it need?', a: 'Actions read and write to dispatch workflows, Contents read-only to find the comments. Tokens are issued by GitHub for one hour at a time.' },
  { q: 'What happens at my plan’s limit?', a: 'Extra schedules pause and we email you. We never charge for going over.' },
];

export default async function Home() {
  const [session, reports] = await Promise.all([getSession(), probeReport(db, new Date()).catch(() => [])]);
  const live = reports.find((r) => r.stats.expected > 0);
  const pill = live ? `GitHub missed ${(live.stats.missingShare * 100).toFixed(0)}% of scheduled runs this week` : 'How late is GitHub’s scheduler right now?';
  return (
    <>
      <SiteHeader signedIn={!!session} />
      <main className="overflow-x-clip">
        {/* Hero */}
        <section className="relative pt-16 sm:pt-24">
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.07)_1px,transparent_0)] bg-[size:28px_28px] [mask-image:radial-gradient(70%_60%_at_30%_20%,black,transparent)]" />
          <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
          <div className={container}>
            <a href="/lateness" className="inline-flex items-center gap-x-2 rounded-full bg-white/5 py-1 pr-3 pl-1 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10">
              <span className="rounded-full bg-red-500/15 px-2 font-mono text-xs/5 font-medium text-red-300 uppercase">live</span>
              {pill} <span aria-hidden="true" className="text-zinc-500">→</span>
            </a>
            <h1 className="mt-8 max-w-[16ch] text-5xl font-semibold tracking-tight text-balance sm:text-7xl lg:text-8xl">Scheduled workflows that run on time.</h1>
            <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <p className="max-w-[48ch] text-lg text-pretty text-zinc-400">
                GitHub’s schedule trigger is best effort, and lately it delays and drops runs. Cronkick fires your workflows on our own clock from one comment in your workflow file, and records every run.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ButtonLink href={installUrl()} variant="primary" className="pl-3"><GitHubMark className="size-4" />Install with GitHub</ButtonLink>
                <CopyCommand text={LINE} className="max-w-full" />
              </div>
            </div>
          </div>
          {/* Product shot, bleeding off the right edge, with layered cards */}
          <div className={`${container} relative mt-16 sm:mt-20`}>
            <div className="relative lg:-mr-56">
              <AppFrame url="cronkick.xyz/dashboard" className="[mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
                <DashboardShot />
              </AppFrame>
              <FloatCard className="absolute top-60 right-64 max-lg:hidden"><EventCard /></FloatCard>
              <FloatCard className="absolute -bottom-6 left-10 max-lg:hidden"><CompareCard /></FloatCard>
            </div>
          </div>
        </section>

        {/* Proof strip */}
        <section className="border-y border-white/5">
          <dl className={`${container} grid grid-cols-2 lg:grid-cols-4`}>
            {[['1 line', 'to change in your workflow'], ['0 tokens', 'to create, paste or rotate'], ['Every slot', 'recorded, with the run’s result'], ['2 minutes', 'from install to first run']].map(([v, k], i) => (
              <div key={v} className={`py-8 ${i % 2 ? 'pl-6 lg:pl-8' : 'pr-6 lg:pr-8'} ${i > 0 ? 'lg:border-l lg:border-white/5 lg:pl-8' : ''} ${i === 1 ? 'border-l border-white/5' : ''} ${i === 3 ? 'border-l border-white/5' : ''} ${i >= 2 ? 'max-lg:border-t max-lg:border-white/5' : ''}`}>
                <dd className="text-2xl font-semibold tracking-tight">{v}</dd>
                <dt className="mt-1 text-base/6 text-zinc-400 sm:text-sm/6">{k}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* The problem */}
        <section className="py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="The problem" title="GitHub’s scheduler is best effort. Your jobs aren’t.">
              <p>GitHub queues scheduled runs behind everything else and drops them under load. Same schedule, same day: here is the difference. <a href="/lateness" className="font-medium text-white hover:underline">See live numbers →</a></p>
            </SplitHeading>
            <div className="mt-14"><TimelineCompare /></div>
          </div>
        </section>

        {/* Bento */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Built for cron" title="Every slot accounted for.">
              <p>Not a cron bolted onto a webhook tool. Cronkick knows what was due, what it sent, what GitHub said, and how the run ended.</p>
            </SplitHeading>
            <div className="mt-14 grid gap-4 lg:grid-cols-3">
              <BentoCard className="lg:col-span-2" title="A row for every run" body="When it was due, when we fired it, GitHub’s answer, and whether the run passed. Missed runs are rows too, not gaps." visual={<RunTableVignette />} />
              <BentoCard title="No personal access token" body="Install the GitHub App. GitHub issues hour-long tokens scoped to Actions; there is nothing to paste or rotate." visual={<PermissionsVignette />} />
              <BentoCard title="Your repo stays the source of truth" body="The schedule is a comment in your workflow file. Edit it, push, and Cronkick picks it up." visual={<DiffVignette />} />
              <BentoCard className="lg:col-span-2" title="Never late, never twice" body="Failed requests retry until the slot’s deadline, then expire instead of running late. A request with an unclear outcome is never resent." visual={<LifecycleVignette />} />
              <BentoCard title="Alerts that mean something" body="Email when a run is missed, unclear or fails. Not when GitHub is merely slow to start a runner." visual={<AlertVignette />} />
              <BentoCard title="Safe to switch" body="Before turning a workflow on, Cronkick flags anything that behaves differently when dispatched." visual={<CompatVignette />} />
              <BentoCard title="See the trend" body="Runs per day, split into on time, late and missed, for every workflow." visual={<ChartVignette />} />
            </div>
          </div>
        </section>

        {/* Setup */}
        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Setup" title="Two minutes, three steps.">
              <p>No SDK, no agent, no dashboard to configure. If it runs on GitHub Actions today, it runs on time with Cronkick.</p>
            </SplitHeading>
            <ol role="list" className="mt-14 grid gap-x-8 gap-y-10 lg:grid-cols-3">
              {[
                ['01', 'Install the GitHub App', <>Pick the repositories. Cronkick asks for Actions write and Contents read.</>],
                ['02', 'Swap the trigger', <>Replace <Code>schedule:</Code> with <Code>workflow_dispatch:</Code> and a <Code># cronkick</Code> comment holding the same cron.</>],
                ['03', 'Push', <>Cronkick reads the file on push and starts firing on the next slot. Every run shows up in your dashboard.</>],
              ].map(([n, t, d]) => (
                <li key={n as string} className="border-t border-white/10 pt-6">
                  <p className="font-mono text-sm/6 text-brand-400">{n}</p>
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
                      <tr key={f}>
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
        <section id="pricing" className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Pricing" title="Simple pricing. No overage charges, ever.">
              <p>At your plan’s limit, extra schedules pause and we email you. Nothing is charged for going over.</p>
            </SplitHeading>
            <div className="mt-14 grid gap-4 md:grid-cols-2">
              {plans.map((p) => (
                <div key={p.name} className="flex flex-col justify-between rounded-2xl bg-zinc-900/50 p-8 inset-ring inset-ring-white/10">
                  <div>
                    <div className="flex items-center justify-between gap-x-4">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {p.badge && <Badge tone="amber">{p.badge}</Badge>}
                    </div>
                    <p className="mt-6 flex items-baseline gap-x-1"><span className="text-5xl font-semibold tracking-tight tabular-nums">{p.price}</span><span className="text-sm/6 text-zinc-400">/month</span></p>
                    <p className="mt-2 text-base/7 text-zinc-400 sm:text-sm/6">{p.note}</p>
                    <ul role="list" className="mt-8 space-y-3 border-t border-white/5 pt-8 text-base/7 text-zinc-300 sm:text-sm/6">
                      {p.items.map((i) => <li key={i} className="flex gap-x-3"><CheckIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-brand-500" />{i}</li>)}
                    </ul>
                  </div>
                  <div className="mt-10">
                    {/* ponytail: Pro is set by hand until checkout (Polar/Dodo) exists; its CTA emails us. */}
                    <ButtonLink href={p.href} className="w-full">{p.github && <GitHubMark className="size-4" />}{p.cta}</ButtonLink>
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
            <h2 className="mx-auto max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-6xl">Stop wondering if last night’s job ran.</h2>
            <p className="mx-auto mt-6 max-w-[48ch] text-lg text-pretty text-zinc-400">Free for one repository. Two minutes to set up.</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href={installUrl()} className="pl-3"><GitHubMark className="size-4" />Install with GitHub</ButtonLink>
              <ButtonLink href="/lateness" variant="ghost">See GitHub’s lateness <span aria-hidden="true">→</span></ButtonLink>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

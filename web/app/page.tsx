import { CheckIcon } from '@heroicons/react/16/solid';
import { CopyCommand } from '@/components/copy-command';
import { SiteFooter, SiteHeader, container } from '@/components/site';
import { SlotStrip, type Tick } from '@/components/slot-strip';
import { TimelineCompare } from '@/components/timeline-compare';
import { Badge, ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { installUrl } from '@/lib/format';
import { getSession } from '@/lib/session';
import { probeReport } from '../../src/probe/collector.ts';

export const dynamic = 'force-dynamic';

const LINE = 'workflow_dispatch: # cronkick: "0 3 * * *"';

function Diff() {
  const row = 'block px-4';
  return (
    <pre className="overflow-x-auto rounded-xl bg-ink py-3 font-mono text-[0.8125rem]/6 text-zinc-400 inset-ring inset-ring-white/10">
      <code>
        <span className={row}>on:</span>
        <span className={`${row} bg-red-500/10 text-red-300`}>-  schedule:</span>
        <span className={`${row} bg-red-500/10 text-red-300`}>-    - cron: &quot;0 3 * * *&quot;</span>
        <span className={`${row} bg-emerald-400/10 text-emerald-300`}>+  workflow_dispatch:</span>
        <span className={`${row} bg-emerald-400/10 text-emerald-300`}>+    # cronkick: &quot;0 3 * * *&quot;</span>
      </code>
    </pre>
  );
}

function MiniDashboard() {
  const t = (s: string): Tick[] => [...s].map((c) => (c === 'o' ? 'ontime' : c === 'm' ? 'missed' : 'idle'));
  const rows = [
    { name: 'nightly-build', cron: '0 3 * * *', ticks: t('oooooooooooooooooooooooo') },
    { name: 'sync-prices', cron: '*/15 * * * *', ticks: t('ooooooooooooooooooomoooo') },
    { name: 'weekly-report', cron: '0 9 * * 1', ticks: t('iiiiiiiiiiiiiiiiiiiioooo') },
  ];
  return (
    <ul role="list" className="divide-y divide-white/5 rounded-xl bg-ink px-4 inset-ring inset-ring-white/10">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-x-4 py-3">
          <div className="w-28 shrink-0">
            <p className="truncate font-mono text-[0.8125rem]/5 text-zinc-200">{r.name}</p>
            <p className="truncate font-mono text-xs/5 text-zinc-500">{r.cron}</p>
          </div>
          <SlotStrip ticks={r.ticks} size="sm" className="min-w-0 flex-1" />
        </li>
      ))}
    </ul>
  );
}

function Permissions() {
  const items = [['Actions', 'Read and write'], ['Contents', 'Read-only'], ['Metadata', 'Read-only']];
  return (
    <div className="rounded-xl bg-ink p-4 inset-ring inset-ring-white/10">
      <p className="font-mono text-[0.8125rem]/6 text-zinc-200">github.com/apps/cronkick</p>
      <dl className="mt-3 space-y-2 text-[0.8125rem]/5">
        {items.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-x-4"><dt className="font-medium text-zinc-200">{k}</dt><dd className="text-zinc-500">{v}</dd></div>
        ))}
        <div className="flex justify-between gap-x-4"><dt className="font-medium text-zinc-200">Personal access token</dt><dd className="text-emerald-300">Not needed</dd></div>
      </dl>
    </div>
  );
}

const steps = [
  { n: '01', name: 'Install the GitHub App', body: 'Pick the repositories. Cronkick gets short-lived GitHub App tokens, scoped to Actions. No personal access token to create or rotate.', visual: <Permissions /> },
  { n: '02', name: 'Swap the trigger', body: 'Replace schedule: with workflow_dispatch and a # cronkick comment holding the same cron. The schedule stays in your repo and syncs on every push.', visual: <Diff /> },
  { n: '03', name: 'See every run', body: 'Every scheduled slot is a tick: on time, late, or missed. Click through to when we fired it, what GitHub said, and whether the run passed.', visual: <MiniDashboard /> },
];

const features = [
  { name: 'On our clock, not GitHub’s queue', body: 'We send the trigger within seconds of the due time, spread across the minute so the top of the hour never piles up.' },
  { name: 'Never run late, never run twice', body: 'Throttled requests retry until the slot’s deadline, then the slot is marked expired. A request with an unclear outcome is marked unknown, never resent.' },
  { name: 'Safe to switch', body: 'Before turning a workflow on, we flag anything that would behave differently, like steps that read github.event.schedule.' },
  { name: 'Timezones and many schedules', body: 'Add tz=Europe/Berlin to a comment and as many # cronkick lines as you need. Schedules due at the same moment fire once.' },
  { name: 'Alerts that mean something', body: 'Email when a run is missed, unclear, or fails. Not when GitHub is merely slow to start a runner.' },
  { name: 'Your repo stays the source of truth', body: 'No dashboard to keep in sync. Delete the comment and the schedule stops; uninstall and everything stops at once.' },
];

const compare: [string, string, string, string][] = [
  ['Runs when it should', 'Best effort: delayed and dropped', 'Yes', 'Yes'],
  ['Schedule lives in your repo', 'Yes', 'No, in their dashboard', 'Yes'],
  ['No personal access token', 'Yes', 'No', 'Yes'],
  ['Every slot accounted for', 'No missed-run view', 'No', 'Yes'],
  ['Knows if the run passed', 'Per run only', 'No', 'Yes'],
  ['Flags workflows that would break', '—', 'No', 'Yes'],
];

const plans = [
  { name: 'Free', price: '$0', note: 'For one repository.', items: ['1 repository', '3 schedules', 'Every 15 minutes or slower', 'Last 20 slots per workflow'], href: installUrl(), cta: 'Install free' },
  { name: 'Pro', price: '$9', note: 'Per GitHub account or organization, or $90 a year.', items: ['50 schedules across any repositories', 'Every 5 minutes or slower', 'Email alerts for missed and failed runs', '90 days of history'], href: 'mailto:hi@cronkick.xyz?subject=Cronkick%20Pro', cta: 'Get Pro', badge: 'Most teams' },
];

const faqs = [
  { q: 'Does Cronkick run my code?', a: 'No. It sends GitHub the same workflow_dispatch request as the Run workflow button. Your jobs run on your runners, exactly as before.' },
  { q: 'What if GitHub’s API is down?', a: 'We retry until the slot’s deadline, then mark it expired rather than run it late. Every failure shows up in your history instead of disappearing.' },
  { q: 'Why not keep schedule: as a backup?', a: 'Because GitHub would then run the same workflow late, a second time. Cronkick flags any workflow that still has both.' },
  { q: 'What happens at my plan’s limit?', a: 'Extra schedules pause and we email you. We never charge for going over.' },
];

export default async function Home() {
  const [session, reports] = await Promise.all([getSession(), probeReport(db, new Date()).catch(() => [])]);
  const live = reports.find((r) => r.stats.expected > 0);
  const pill = live
    ? `GitHub’s scheduler missed ${(live.stats.missingShare * 100).toFixed(0)}% of runs this week`
    : 'See how late GitHub’s scheduler is right now';
  return (
    <>
      <SiteHeader signedIn={!!session} />
      <main>
        <section className="hero-glow pt-16 pb-20 sm:pt-24 sm:pb-28">
          <div className={container}>
            <a href="/lateness" className="inline-flex items-center gap-x-2 rounded-full bg-white/5 py-1 pr-3 pl-1 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10">
              <span className="rounded-full bg-red-500/15 px-2 font-mono text-xs/5 font-medium text-red-300 uppercase">live</span>
              {pill} <span aria-hidden="true" className="text-zinc-500">→</span>
            </a>
            <h1 className="mt-8 max-w-[20ch] text-5xl font-semibold tracking-tight text-balance sm:text-7xl">Scheduled workflows that run on time.</h1>
            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-zinc-400">
              GitHub’s schedule trigger is best effort, and lately it delays and drops runs. Cronkick fires your workflows on our own clock from one comment in your workflow file, and records every run.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <ButtonLink href={installUrl()} variant="primary">Install on GitHub</ButtonLink>
              <CopyCommand text={LINE} className="max-w-full" />
            </div>
            <div className="mt-16 sm:mt-20"><TimelineCompare /></div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-white/5 py-20 sm:py-28">
          <div className={container}>
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-3 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">From install to your first on-time run in two minutes.</h2>
            <div className="mt-14 grid gap-x-8 gap-y-14 lg:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="flex flex-col gap-y-6">
                  <div className="lg:h-52">{s.visual}</div>
                  <div>
                    <p className="font-mono text-sm/6 text-brand-400">{s.n}</p>
                    <h3 className="mt-1 text-base/7 font-semibold">{s.name}</h3>
                    <p className="mt-2 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/5 py-20 sm:py-28">
          <div className={container}>
            <Eyebrow>Built for cron, not a cron bolted on</Eyebrow>
            <h2 className="mt-3 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Every slot accounted for.</h2>
            <dl className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div key={f.name} className="border-t border-white/10 pt-6">
                  <dt className="text-base/7 font-semibold">{f.name}</dt>
                  <dd className="mt-2 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{f.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-white/5 py-20 sm:py-28">
          <div className={container}>
            <Eyebrow>Compared</Eyebrow>
            <h2 className="mt-3 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Why not the alternatives?</h2>
            <p className="mt-4 max-w-[56ch] text-base/7 text-pretty text-zinc-400">
              Hosted cron services can call GitHub on time too, but you create a token, paste it into their dashboard, and build the request yourself. Then the schedule lives somewhere other than your repo.
            </p>
            <div className="mt-10 -mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="py-3 pr-6 font-medium whitespace-nowrap"><span className="sr-only">Feature</span></th>
                      <th className="px-6 py-3 font-medium whitespace-nowrap text-zinc-300">GitHub <Code>schedule:</Code></th>
                      <th className="px-6 py-3 font-medium whitespace-nowrap text-zinc-300">Hosted cron + token</th>
                      <th className="py-3 pl-6 font-medium whitespace-nowrap text-brand-400">Cronkick</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-400">
                    {compare.map(([f, a, b, c]) => (
                      <tr key={f}>
                        <td className="py-3.5 pr-6 font-medium text-white">{f}</td>
                        <td className="px-6 py-3.5">{a}</td>
                        <td className="px-6 py-3.5">{b}</td>
                        <td className="py-3.5 pl-6 font-medium text-white">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-white/5 py-20 sm:py-28">
          <div className={container}>
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-3 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">Simple pricing. No overage charges, ever.</h2>
            <div className="mt-14 grid gap-8 md:grid-cols-2">
              {plans.map((p) => (
                <div key={p.name} className="flex flex-col justify-between rounded-2xl bg-zinc-900/60 p-8 inset-ring inset-ring-white/10">
                  <div>
                    <div className="flex items-center justify-between gap-x-4">
                      <h3 className="text-lg font-semibold">{p.name}</h3>
                      {p.badge && <Badge tone="amber">{p.badge}</Badge>}
                    </div>
                    <p className="mt-6 flex items-baseline gap-x-1"><span className="text-5xl font-semibold tracking-tight tabular-nums">{p.price}</span><span className="text-sm/6 text-zinc-400">/month</span></p>
                    <p className="mt-2 text-base/7 text-zinc-400 sm:text-sm/6">{p.note}</p>
                    <ul role="list" className="mt-8 space-y-3 text-base/7 text-zinc-300 sm:text-sm/6">
                      {p.items.map((i) => <li key={i} className="flex gap-x-3"><CheckIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-brand-500" />{i}</li>)}
                    </ul>
                  </div>
                  <div className="mt-10">
                    {/* ponytail: Pro is set by hand until checkout (Polar/Dodo) exists; its CTA emails us. */}
                    <ButtonLink href={p.href} className="w-full">{p.cta}</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-white/5 py-20 sm:py-28">
          <div className={container}>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-3 max-w-[40ch] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">The fine print, up front.</h2>
            <dl className="mt-14 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt className="text-base/7 font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-white/5 py-20 sm:py-28">
          <div className={`${container} flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between`}>
            <div>
              <h2 className="max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Stop wondering if last night’s job ran.</h2>
              <p className="mt-4 max-w-[48ch] text-lg text-pretty text-zinc-400">Free for one repository. Two minutes to set up.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href={installUrl()}>Install on GitHub</ButtonLink>
              <ButtonLink href="/lateness" variant="ghost">See GitHub’s lateness <span aria-hidden="true">→</span></ButtonLink>
            </div>
          </div>
          <div className={`${container} mt-12`}><SlotStrip ticks={Array(96).fill('ontime')} size="sm" /></div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

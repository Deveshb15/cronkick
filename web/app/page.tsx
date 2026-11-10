import { CheckIcon } from '@heroicons/react/16/solid';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink, Code } from '@/components/ui';
import { getSession } from '@/lib/session';
import { installUrl } from '@/lib/format';

const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8';

function YamlDiff() {
  const line = 'block px-4';
  return (
    <div className="overflow-hidden rounded-xl bg-zinc-950 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
      <div className="flex items-center gap-x-2 border-b border-white/10 px-4 py-2.5">
        <p className="font-mono text-xs/5 text-zinc-400">.github/workflows/nightly.yml</p>
      </div>
      <pre className="overflow-x-auto py-4 font-mono text-[0.8125rem]/6 text-zinc-300">
        <code>
          <span className={line}>on:</span>
          <span className={`${line} bg-red-500/10 text-red-300`}>-  schedule:</span>
          <span className={`${line} bg-red-500/10 text-red-300`}>-    - cron: &quot;0 3 * * *&quot;</span>
          <span className={`${line} bg-emerald-500/10 text-emerald-300`}>+  workflow_dispatch: # cronkick: &quot;0 3 * * *&quot;</span>
          <span className={line}>{'\n'}</span>
          <span className={line}>jobs:</span>
          <span className={line}>  nightly:</span>
          <span className={line}>    runs-on: ubuntu-latest</span>
          <span className={line}>    steps:</span>
          <span className={line}>      - run: ./scripts/nightly.sh</span>
        </code>
      </pre>
    </div>
  );
}

const steps = [
  { name: 'Install the GitHub App', body: 'Pick the repositories. Cronkick asks for Actions write and Contents read, and never needs a personal access token.' },
  { name: 'Change one line', body: 'Swap schedule: for a workflow_dispatch trigger with a # cronkick comment. Your schedule stays in your repo and syncs on every push.' },
  { name: 'See every run', body: 'Each scheduled slot gets a row: when it was due, when we triggered it, what GitHub said, and whether the run passed.' },
];

const rows: [string, string, string, string][] = [
  ['Runs when it should', 'Best effort; delays and dropped runs', 'Yes', 'Yes'],
  ['Schedule lives in your repo', 'Yes', 'No, in their dashboard', 'Yes'],
  ['No personal access token', 'Yes', 'No', 'Yes'],
  ['Knows if the run passed', 'Per run, no missed-run view', 'No', 'Yes, every slot'],
  ['Flags workflows that would break', '—', 'No', 'Yes'],
];

const free = ['1 repository', '3 schedules', 'Every 15 minutes or slower', 'Last 20 slots per workflow'];
const pro = ['50 schedules across any repositories', 'Every 5 minutes or slower', 'Email alerts for missed or failed runs', '90 days of history'];

const faqs = [
  { q: 'Does Cronkick run my code?', a: 'No. It sends GitHub the same workflow_dispatch request as the Run workflow button. Your jobs run on your runners, exactly as before.' },
  { q: 'What if GitHub’s API is down?', a: 'We retry throttled and failed requests until the slot’s deadline, then mark it expired instead of running it late. If a request’s outcome is unclear, we mark it unknown rather than risk a double run.' },
  { q: 'Can I use timezones and several schedules?', a: 'Yes. Add tz=Europe/Berlin to a comment, and add as many # cronkick lines as you need. Two schedules due at the same moment trigger once.' },
  { q: 'What happens at my plan’s limit?', a: 'Extra schedules pause and we email you. We never charge for going over.' },
];

export default async function Home() {
  const signedIn = !!(await getSession());
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main>
        <section className="pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className={`${container} grid items-center gap-x-12 gap-y-12 lg:grid-cols-2`}>
            <div>
              <p className="font-mono text-sm/6 font-medium tracking-wide text-brand-600 uppercase dark:text-brand-400">For GitHub Actions</p>
              <h1 className="mt-4 max-w-[24ch] text-5xl font-semibold tracking-tight text-balance sm:text-6xl">Scheduled workflows that run on time.</h1>
              <p className="mt-6 max-w-[48ch] text-lg text-pretty text-zinc-600 dark:text-zinc-400">
                GitHub’s schedule trigger is best effort, and lately it’s been delaying and dropping runs. Cronkick triggers your workflows from our own clock, keeps the schedule in your workflow file, and records every run.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
                <ButtonLink href={installUrl()} variant="primary">Install on GitHub</ButtonLink>
                <a href="/lateness" className="text-base/6 font-medium sm:text-sm/6">See how late GitHub is right now <span aria-hidden="true">→</span></a>
              </div>
            </div>
            <YamlDiff />
          </div>
        </section>

        <section id="how-it-works" className="border-t border-zinc-950/5 py-20 sm:py-28 dark:border-white/10">
          <div className={container}>
            <h2 className="max-w-[40ch] text-3xl font-semibold tracking-tight text-balance">Two minutes from install to your first on-time run.</h2>
            <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.name}>
                  <dt className="text-base/7 font-semibold sm:text-sm/6">
                    <span className="font-mono text-brand-600 dark:text-brand-400">0{i + 1}</span> <span className="ml-2">{s.name}</span>
                  </dt>
                  <dd className="mt-2 text-base/7 text-pretty text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{s.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-zinc-950/5 py-20 sm:py-28 dark:border-white/10">
          <div className={container}>
            <h2 className="max-w-[40ch] text-3xl font-semibold tracking-tight text-balance">Why not the alternatives?</h2>
            <p className="mt-4 max-w-[56ch] text-base/7 text-pretty text-zinc-600 dark:text-zinc-400">
              Hosted cron services can call GitHub on time too, but you create a token, paste it into their dashboard, and build the request yourself. Then the schedule lives somewhere other than your repo.
            </p>
            <div className="mt-10 -mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead className="text-zinc-950 dark:text-white">
                    <tr className="border-b border-zinc-950/10 dark:border-white/10">
                      <th className="py-3 pr-6 font-medium whitespace-nowrap"><span className="sr-only">Feature</span></th>
                      <th className="px-6 py-3 font-medium whitespace-nowrap">GitHub <Code>schedule:</Code></th>
                      <th className="px-6 py-3 font-medium whitespace-nowrap">Hosted cron + token</th>
                      <th className="py-3 pl-6 font-medium whitespace-nowrap">Cronkick</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-950/5 text-zinc-600 dark:divide-white/5 dark:text-zinc-400">
                    {rows.map(([f, a, b, c]) => (
                      <tr key={f}>
                        <td className="py-3 pr-6 font-medium text-zinc-950 dark:text-white">{f}</td>
                        <td className="px-6 py-3">{a}</td>
                        <td className="px-6 py-3">{b}</td>
                        <td className="py-3 pl-6 font-medium text-zinc-950 dark:text-white">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="border-t border-zinc-950/5 py-20 sm:py-28 dark:border-white/10">
          <div className={container}>
            <h2 className="max-w-[40ch] text-3xl font-semibold tracking-tight text-balance">Simple pricing, no overage charges.</h2>
            <div className="mt-12 grid gap-6 md:grid-cols-2">
              {[
                { name: 'Free', price: '$0', note: 'For trying it on one repository.', items: free, cta: 'Install free', primary: false },
                { name: 'Pro', price: '$9', note: 'Per GitHub account or organization. Or $90 a year.', items: pro, cta: 'Get Pro', primary: true },
              ].map((p) => (
                <div key={p.name} className="flex flex-col justify-between rounded-xl p-8 ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/10">
                  <div>
                    <h3 className="text-lg font-semibold">{p.name}{p.primary && <span className="ml-3 text-sm/6 font-medium text-brand-600 dark:text-brand-400">Recommended</span>}</h3>
                    <p className="mt-4 flex items-baseline gap-x-1"><span className="text-4xl font-semibold tracking-tight tabular-nums">{p.price}</span><span className="text-sm/6 text-zinc-600 dark:text-zinc-400">/month</span></p>
                    <p className="mt-2 text-base/7 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{p.note}</p>
                    <ul role="list" className="mt-8 space-y-3 text-base/7 sm:text-sm/6">
                      {p.items.map((i) => (
                        <li key={i} className="flex gap-x-3"><CheckIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-brand-500" />{i}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-10">
                    {/* ponytail: Pro is set by hand until checkout (Polar/Dodo) exists; the CTA emails us. */}
                    <ButtonLink href={p.primary ? 'mailto:hi@cronkick.xyz?subject=Cronkick%20Pro' : installUrl()} variant="secondary" className="w-full">{p.cta}</ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-zinc-950/5 py-20 sm:py-28 dark:border-white/10">
          <div className={container}>
            <h2 className="max-w-[40ch] text-3xl font-semibold tracking-tight text-balance">Questions</h2>
            <dl className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
              {faqs.map((f) => (
                <div key={f.q}>
                  <dt className="text-base/7 font-semibold sm:text-sm/6">{f.q}</dt>
                  <dd className="mt-2 text-base/7 text-pretty text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

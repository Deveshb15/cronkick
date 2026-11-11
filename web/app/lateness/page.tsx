import Link from 'next/link';
import type { Metadata } from 'next';
import { GitHubMark } from '@/components/icons';
import { Time } from '@/components/live';
import { ProbeCharts } from '@/components/probe-charts';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { installUrl, pairView } from '@/lib/format';
import { probeRepos } from '../../../src/config.ts';
import { CAP_ERROR, probePairs, probeReport } from '../../../src/probe/collector.ts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How late are GitHub Actions scheduled workflows?' };

const fmt = (s: number | null) => (s === null ? '—' : s < 120 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export default async function Lateness() {
  const now = new Date();
  const report = await probeReport(db, probeRepos(), now);
  // Pairs even before the first numbers: they know when measuring starts, which the page shows as a timeline.
  const raw = report.configured ? await probePairs(db, report, now).catch(() => []) : [];
  const pairs = raw.map(pairView);
  const compared = raw.filter((p) => p.state === 'compared');
  const health = new Map(raw.map((p) => [p.repo, p.sampleFrom]));
  const publicRepos = report.repos.filter((r) => r.private === false);
  const rules: [string, React.ReactNode][] = [
    ['The same clock', <>For both, lateness is the time from the scheduled minute until GitHub created the run, read from the repository’s run list on GitHub.</>],
    ['The same minutes', <>Both sides are counted from when both workflows were running (an hour after a new GitHub schedule, ten minutes after a new Cronkick twin) to the last complete check, less an hour.</>],
    ['Only real runs', <>A Cronkick run counts only if the Cronkick app started it; clicking “Run workflow” never counts. A scheduled minute with no run an hour later counts as never ran.</>],
    ['Honest gaps', <>A failed or partial check is never counted as a miss. If GitHub turns a schedule off after 60 days without commits, that pair pauses instead.</>],
  ];
  return (
    <>
      <SiteHeader />
      <main className="hero-glow px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <Eyebrow>Live measurement</Eyebrow>
            <h1 className="mx-auto mt-3 max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How late are GitHub’s scheduled workflows?</h1>
            <p className="mx-auto mt-6 max-w-[56ch] text-lg text-pretty text-zinc-400">
              We run the same tiny workflow two ways in {publicRepos.length ? 'a public' : 'one'} repository: on GitHub’s own <Code>schedule:</Code> trigger, and triggered by Cronkick. Both are timed the same way, from GitHub’s own run list.
            </p>
            {publicRepos.length > 0 && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                {publicRepos.map((r) => (
                  <a target="_blank" rel="noreferrer" key={r.repo} href={`https://github.com/${r.repo}/actions`}
                    className="group inline-flex min-h-11 max-w-full items-center gap-x-2.5 rounded-full bg-white/5 py-2 pr-4 pl-3 text-sm/6 font-medium text-white inset-ring inset-ring-white/10 hover:bg-white/10">
                    <GitHubMark className="size-5 shrink-0" />
                    <span className="min-w-0 truncate font-mono">{r.repo}</span>
                    <span className="shrink-0 text-zinc-400 group-hover:text-white"><span className="max-sm:hidden">See every run </span>↗</span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {pairs.length > 0 && <div className="mx-auto mt-12 max-w-5xl"><ProbeCharts pairs={pairs} /></div>}
          {!pairs.length && (
            <p className="mx-auto mt-12 max-w-[56ch] text-center text-base/7 text-zinc-400"><span className="font-semibold text-white">No probe repositories yet.</span> The comparison appears once a probe repository is configured and checked.</p>
          )}

          <section aria-labelledby="method" className="mx-auto mt-16 max-w-5xl">
            <h2 id="method" className="text-base/7 font-semibold text-white">How it’s measured</h2>
            <dl className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {rules.map(([t, d]) => (
                <div key={t} className="border-t border-white/10 pt-4">
                  <dt className="text-sm/6 font-medium text-white">{t}</dt>
                  <dd className="mt-1 text-sm/6 text-pretty text-zinc-400">{d}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-8 rounded-xl bg-white/[0.02] p-4 text-sm/6 inset-ring inset-ring-white/5 sm:p-5">
              <p className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">Sample</p>
              <ul role="list" className="mt-3 divide-y divide-white/5">
                {report.repos.map((r) => (
                  <li key={r.repo} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
                    {r.private === false
                      ? <a target="_blank" rel="noreferrer" href={`https://github.com/${r.repo}`} className="font-mono text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">{r.repo}</a>
                      : <span className="text-zinc-300">{r.private ? 'A private repository' : 'A probe repository'}</span>}
                    {r.private !== null && <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs/5 text-zinc-300 inset-ring inset-ring-white/10">{r.private ? 'Private' : 'Public'}</span>}
                    <span className="text-zinc-400">
                      {health.get(r.repo) ? <>measuring since <Time iso={new Date(health.get(r.repo)!).toISOString()} date /></> : r.from ? <>measuring since <Time iso={r.from.toISOString()} date /></> : 'not checked yet'}
                      {r.lastSuccessAt && <> · last checked <Time iso={r.lastSuccessAt.toISOString()} /></>}
                    </span>
                    {r.error && <span className="text-orange-300">· last check failed: {r.error}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs/5 text-zinc-500">Each check reads at most 1,000 runs per repository; if the collector were down for more than about 3 days, that repository would stay at its last complete check (“{CAP_ERROR}”).</p>
            </div>
          </section>

          {/* The same shared window as the card above, one row per side, so the two can never disagree. */}
          {compared.length > 0 ? (
            <div className="scroll-fade mx-auto mt-12 -my-2 max-w-5xl overflow-x-auto whitespace-nowrap">
              <div className="inline-block min-w-full py-2 align-middle">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Schedule', 'Triggered by', 'Hours measured', 'Due', 'Ran', 'Never ran', 'Typical delay (p50)', 'Worst 5% (p95)'].map((h) => <th key={h} className="py-3 pr-6 font-medium whitespace-nowrap last:pr-0">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-400 tabular-nums">
                    {compared.flatMap((p) => ([['github', p.github.stats], ['cronkick', p.cronkick.stats]] as const).map(([via, s]) => (
                      <tr key={`${p.cron}-${via}`}>
                        <td className="py-3 pr-6 font-mono text-white">{p.cron}</td>
                        <td className="py-3 pr-6">{via === 'github' ? <>GitHub <Code>schedule:</Code></> : 'Cronkick'}</td>
                        <td className="py-3 pr-6">{Math.floor(p.hours)} h</td>
                        <td className="py-3 pr-6">{s.expected}</td>
                        <td className="py-3 pr-6">{s.ran}</td>
                        <td className="py-3 pr-6 font-medium text-white">{(s.missingShare * 100).toFixed(1)}%</td>
                        <td className="py-3 pr-6">{fmt(s.p50Sec)}</td>
                        <td className="py-3">{fmt(s.p95Sec)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-4">
            <ButtonLink href={installUrl()} variant="primary">Install Cronkick</ButtonLink>
            <Link href="/#how-it-works" className="text-base/6 font-medium sm:text-sm/6">How it works <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

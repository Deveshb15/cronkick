import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { fmtUtc, installUrl, probeSample } from '@/lib/format';
import { probeRepos } from '../../../src/config.ts';
import { CAP_ERROR, probeReport } from '../../../src/probe/collector.ts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How late are GitHub Actions scheduled workflows?' };

const fmt = (s: number | null) => (s === null ? '—' : s < 120 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export default async function Lateness() {
  const now = new Date();
  const report = await probeReport(db, probeRepos(), now);
  const any = report.contributing > 0;
  return (
    <>
      <SiteHeader />
      <main className="hero-glow px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center"><Eyebrow>Live measurement</Eyebrow>
          <h1 className="mx-auto mt-3 max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How late are GitHub’s scheduled workflows?</h1>
          <p className="mx-auto mt-6 max-w-[56ch] text-lg text-pretty text-zinc-400">
            Measured live from our own repositories that use only GitHub’s native <Code>schedule:</Code> trigger. Lateness is the time from the scheduled minute until GitHub created the run. Each repo counts from its first recorded run (at most 7 days back) to its last complete check, less an hour; a slot with no run after that hour counts as never ran.
          </p></div>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl bg-white/[0.03] p-5 text-sm/6 text-zinc-400 inset-ring inset-ring-white/10">
            <p className="font-mono text-[0.6875rem]/4 tracking-wider text-zinc-500 uppercase">Sample</p>
            <p className="mt-2 text-white">{probeSample(report, now)}</p>
            <ul role="list" className="mt-3 space-y-1">
              {report.repos.map((r) => (
                <li key={r.repo}>
                  <span className="font-mono text-zinc-300">{r.private ? 'Private repo' : r.repo}</span>
                  {r.expected > 0 && r.from && r.until ? <> · {fmtUtc(r.from)} to {fmtUtc(r.until)} · {r.ran} of {r.expected} ran</> : ' · not reporting yet'}
                  {r.error && <span className="text-orange-300"> · last check failed {fmtUtc(r.errorAt!)}: {r.error}</span>}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs/5 text-zinc-500">A failed or partial check is never counted as a miss: time after a repo’s last complete check isn’t counted. Each check reads at most 1,000 runs per repo, so if the collector is down for more than about 3 days that repo stays at its last complete check (“{CAP_ERROR}”).</p>
          </div>
          {any ? (
            <div className="scroll-fade mt-12 -mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Schedule', 'Repos', 'Expected runs', 'Ran', 'Never ran', 'Typical delay (p50)', 'Worst 5% (p95)'].map((h) => <th key={h} className="py-3 pr-6 font-medium whitespace-nowrap last:pr-0">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-400 tabular-nums">
                    {report.schedules.map((r) => (
                      <tr key={r.cron}>
                        <td className="py-3 pr-6 font-mono text-white">{r.cron}</td>
                        <td className="py-3 pr-6">{r.repos} of {report.configured}</td>
                        <td className="py-3 pr-6">{r.stats.expected}</td>
                        <td className="py-3 pr-6">{r.stats.ran}</td>
                        <td className="py-3 pr-6 font-medium text-white">{(r.stats.missingShare * 100).toFixed(1)}%</td>
                        <td className="py-3 pr-6">{fmt(r.stats.p50Sec)}</td>
                        <td className="py-3">{fmt(r.stats.p95Sec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="mx-auto mt-12 max-w-[56ch] text-center text-base/7 text-zinc-400"><span className="font-semibold text-white">Collecting data.</span> The first numbers appear after the first complete check, once the probes have run for at least an hour.</p>
          )}
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

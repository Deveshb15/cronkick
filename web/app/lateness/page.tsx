import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/site';
import { ButtonLink, Code, Eyebrow } from '@/components/ui';
import { db } from '@/lib/db';
import { getSession } from '@/lib/session';
import { installUrl } from '@/lib/format';
import { probeReport } from '../../../src/probe/collector.ts';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'How late are GitHub Actions scheduled workflows?' };

const fmt = (s: number | null) => (s === null ? '—' : s < 120 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export default async function Lateness() {
  const [reports, session] = await Promise.all([probeReport(db, new Date()), getSession()]);
  const any = reports.some((r) => r.stats.expected > 0);
  return (
    <>
      <SiteHeader signedIn={!!session} />
      <main className="hero-glow px-4 pt-16 pb-24 sm:px-6 sm:pt-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center"><Eyebrow>Live measurement</Eyebrow>
          <h1 className="mx-auto mt-3 max-w-[24ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">How late are GitHub’s scheduled workflows?</h1>
          <p className="mx-auto mt-6 max-w-[56ch] text-lg text-pretty text-zinc-400">
            Measured live from our own repositories that use only GitHub’s native <Code>schedule:</Code> trigger. Lateness is the time from the scheduled minute until GitHub created the run. Last 7 days; a slot with no run after an hour counts as never ran.
          </p></div>
          {any ? (
            <div className="mt-12 -mx-4 -my-2 overflow-x-auto whitespace-nowrap sm:-mx-6 lg:-mx-8">
              <div className="inline-block min-w-full px-4 py-2 align-middle sm:px-6 lg:px-8">
                <table className="w-full text-left text-base/6 sm:text-sm/6">
                  <thead>
                    <tr className="border-b border-white/10">
                      {['Schedule', 'Repos', 'Expected runs', 'Ran', 'Never ran', 'Typical delay (p50)', 'Worst 5% (p95)'].map((h) => <th key={h} className="py-3 pr-6 font-medium whitespace-nowrap last:pr-0">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-zinc-400 tabular-nums">
                    {reports.map((r) => (
                      <tr key={r.cron}>
                        <td className="py-3 pr-6 font-mono text-white">{r.cron}</td>
                        <td className="py-3 pr-6">{r.repos}</td>
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
            <p className="mx-auto mt-12 max-w-[56ch] text-center text-base/7 text-zinc-400"><span className="font-semibold text-white">Collecting data.</span> The first numbers appear an hour after the probes start.</p>
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

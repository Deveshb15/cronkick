'use client';
import Link from 'next/link';
import { Countdown, Time, useNow } from './live';

/**
 * The next few runs across every live schedule, soonest first, each with a live countdown and a bar filling over
 * its schedule's interval. Runs drop off as they pass; the page refresh brings the next ones.
 */
export function UpNext({ installationId, workflows, count = 5, className = '' }: {
  installationId: number; workflows: { id: number; name: string; upcoming: string[] }[]; count?: number; className?: string;
}) {
  const now = useNow();
  const runs = workflows
    .flatMap((w) => w.upcoming.map((iso, i) => ({ iso, t: Date.parse(iso), w, period: i + 1 < w.upcoming.length ? Date.parse(w.upcoming[i + 1]) - Date.parse(iso) : null })))
    .filter((r) => now === null || r.t > now)
    .sort((a, b) => a.t - b.t)
    .slice(0, count);
  if (!runs.length) return null;
  return (
    <section aria-labelledby="up-next" className={`tile p-5 ${className}`}>
      <h2 id="up-next" className="text-sm/6 font-semibold">Up next</h2>
      <ol role="list" className="mt-3 -mx-2">
        {runs.map((r) => {
          // Fill over the gap before this run, using the schedule's interval (the gap after it is the same for a regular cron).
          const p = r.period && now !== null ? Math.min(1, Math.max(0, 1 - (r.t - now) / r.period)) : 0;
          return (
            <li key={`${r.w.id}-${r.iso}`}>
              <Link href={`/dashboard/${installationId}/workflows/${r.w.id}`} className="block rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                <div className="flex items-baseline justify-between gap-4 text-[13px]/5">
                  <p className="min-w-0 truncate"><span className="font-medium">{r.w.name}</span> <span className="text-zinc-400">· <Time iso={r.iso} /></span></p>
                  <Countdown to={r.iso} className="shrink-0 font-mono text-xs text-brand-300" />
                </div>
                <div aria-hidden="true" className="mt-1.5 h-0.5 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500/0 to-brand-500" style={{ width: `${p * 100}%`, transition: 'width 1s linear' }} />
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

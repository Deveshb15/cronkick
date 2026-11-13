'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localTime, useNow } from './live';

const SEGS = 30;
const pad = (n: number) => String(n).padStart(2, '0');
function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const [h, m] = [Math.floor(s / 3600), Math.floor(s / 60) % 60];
  return h >= 24 ? `${Math.floor(h / 24)}d ${pad(h % 24)}h` : h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * The overview's countdown tile: the soonest run of any live schedule, the time left in big digits, and a segmented
 * bar filling over that schedule's interval. Shows nothing once no run is planned. Frame only until mounted.
 */
export function NextKick({ installationId, workflows, first = false, className = '' }: {
  installationId: number;
  workflows: { id: number; name: string; repo: string; upcoming: string[] }[];
  /** Before anything has run: "First run" instead of "Next kick". */
  first?: boolean;
  className?: string;
}) {
  const now = useNow();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = workflows
    .flatMap((w) => w.upcoming.map((iso) => ({ t: Date.parse(iso), iso, w })))
    .filter((r) => now === null || r.t > now)
    .sort((a, b) => a.t - b.t)[0];
  if (!next) return null;
  const mine = next.w.upcoming.map(Date.parse).filter((t) => t >= next.t);
  // The bar fills over one interval of this schedule; a lone run gets an hour.
  const period = mine.length > 1 ? mine[1] - mine[0] : 3_600_000;
  const left = now === null ? period : next.t - now;
  const lit = Math.round(Math.min(1, Math.max(0, 1 - left / period)) * SEGS);
  const href = `/dashboard/${installationId}/workflows/${next.w.id}`;

  return (
    <section aria-label={first ? 'First run' : 'Next run'}
      className={`@container relative isolate flex min-h-72 flex-col overflow-hidden rounded-[1.25rem] bg-[#0d0b07] p-5 inset-ring inset-ring-brand-500/25 sm:p-6 ${className}`}>
      <div aria-hidden="true" className="hero-mesh -z-10" />
      <div aria-hidden="true" className="grain absolute inset-0 -z-10" />
      <div className="flex items-center justify-between gap-4 text-xs/5 font-medium tracking-wide text-brand-300 uppercase">
        <p className="flex items-center gap-2">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/70" />
            <span className="relative size-2 rounded-full bg-brand-500" />
          </span>
          {first ? 'First run' : 'Next kick'}
        </p>
        <p className="font-mono tabular-nums">{mounted ? localTime(next.iso) : `${next.iso.slice(11, 16)} UTC`}</p>
      </div>
      <p className="mt-3 truncate text-xl/7 font-semibold tracking-tight text-white"><Link href={href} className="hover:underline">{next.w.name}</Link></p>
      <p className="truncate text-sm/6 text-zinc-400">{next.w.repo.split('/')[1]} → default branch</p>
      <p className="mt-auto pt-6 font-mono text-6xl/none font-semibold tracking-tighter text-white tabular-nums [text-shadow:0_0_40px_rgb(255_176_32/0.35)] @md:text-7xl @lg:text-8xl">
        {now === null ? '--:--' : left <= 0 ? 'now' : clock(left)}
      </p>
      <div aria-hidden="true" className="mt-5 flex gap-1">
        {Array.from({ length: SEGS }, (_, i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < lit ? 'bg-brand-500 shadow-[0_0_10px_rgb(255_176_32/0.7)]' : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={href} className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm/5 font-semibold text-ink shadow-[0_6px_24px_-6px_rgb(255_176_32/0.8)] hover:bg-brand-400">Open history</Link>
        <a target="_blank" rel="noreferrer" href={`https://github.com/${next.w.repo}/actions`} className="rounded-lg bg-white/10 px-3.5 py-2 text-sm/5 font-semibold text-white inset-ring inset-ring-white/10 hover:bg-white/15">Runs on GitHub ↗</a>
      </div>
    </section>
  );
}

'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { localTime, useNow } from './live';

const R = 52;
const C = 2 * Math.PI * R;
const pad = (n: number) => String(n).padStart(2, '0');
function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const [h, m] = [Math.floor(s / 3600), Math.floor(s / 60) % 60];
  return h >= 24 ? `${Math.floor(h / 24)} d ${pad(h % 24)}:${pad(m)}` : h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
}

/**
 * The overview's countdown to the soonest run of any live schedule: a dial that fills over that schedule's interval,
 * the time left, and which workflow it is. Shows nothing once no run is planned. Frame only until mounted.
 */
export function NextKick({ installationId, workflows, first = false }: {
  installationId: number;
  workflows: { id: number; name: string; repo: string; upcoming: string[] }[];
  /** Before anything has run: "First run" instead of "Next kick". */
  first?: boolean;
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
  // The dial fills over one interval of this schedule; a lone run gets an hour.
  const period = mine.length > 1 ? mine[1] - mine[0] : 3_600_000;
  const left = now === null ? period : next.t - now;
  const done = Math.min(1, Math.max(0, 1 - left / period));

  return (
    <section aria-label={first ? 'First run' : 'Next run'} className="relative isolate overflow-hidden rounded-2xl bg-zinc-900/40 inset-ring inset-ring-white/10">
      <div aria-hidden="true" className="time-grid absolute inset-0 -z-10 opacity-60" />
      <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
      <div className="flex items-center gap-5 p-5 sm:gap-7 sm:p-6">
        <div className="relative size-28 shrink-0 sm:size-32">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6" className="stroke-white/[.07]" />
            <circle cx="60" cy="60" r={R} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-brand-500 drop-shadow-[0_0_6px_rgb(255_176_32/0.7)]"
              strokeDasharray={C} strokeDashoffset={C * (1 - done)} style={{ transition: 'stroke-dashoffset 1s linear' }} />
            {Array.from({ length: 12 }, (_, i) => (
              <line key={i} x1="60" y1="2" x2="60" y2={i % 3 ? 5 : 8} transform={`rotate(${i * 30} 60 60)`} className="stroke-white/20" strokeWidth="1" />
            ))}
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="font-mono text-xl/7 font-semibold tracking-tight text-white tabular-nums sm:text-2xl/8">{now === null ? '--:--' : left <= 0 ? 'now' : clock(left)}</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs/5 font-medium tracking-wide text-brand-300 uppercase">
            <span aria-hidden="true" className="relative flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/70" />
              <span className="relative size-2 rounded-full bg-brand-500" />
            </span>
            {first ? 'First run' : 'Next kick'}
          </p>
          <p className="mt-1 truncate text-lg/7 font-semibold text-white sm:text-xl/8">
            <Link href={`/dashboard/${installationId}/workflows/${next.w.id}`} className="hover:underline">{next.w.name}</Link>
          </p>
          <p className="truncate text-sm/6 text-zinc-400">
            {next.w.repo.split('/')[1]} · <span className="text-zinc-200 tabular-nums">{mounted ? localTime(next.iso) : `${next.iso.slice(11, 16)} UTC`}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

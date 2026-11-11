import { fmtDelay, plural } from '@/lib/live';

/**
 * How long after the scheduled time GitHub accepted each run, as 60 half-second bins from 0 to 30 s (the on-time
 * window), with later sends counted apart. A server-rendered SVG: bars carry their own <title>, and a table below
 * gives the same numbers as text.
 */
export function DelayDistribution({ bins, n, p50, p95, over, max, topOfHour = false }: {
  bins: number[]; n: number; p50: number | null; p95: number | null; over: number; max: number | null;
  /** Some of these runs are due at the start of a UTC hour, where Cronkick spreads sends on purpose. */
  topOfHour?: boolean;
}) {
  if (!n) return <p className="text-sm/6 text-zinc-400">Nothing sent in this range yet.</p>;
  const top = Math.max(...bins, 1);
  const W = 600, H = 96;
  const bw = W / bins.length;
  return (
    <div>
      {/* Bars stretch to the width; the axis is text, so it never scales with the chart. */}
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-24 w-full" role="img"
        aria-label={`Send delay of ${plural(n, 'run')}: median ${fmtDelay(p50)}, 95% within ${fmtDelay(p95)}, ${over} later than 30 s.`}>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="rgb(255 255 255 / 0.15)" vectorEffect="non-scaling-stroke" />
        {bins.map((v, i) => {
          const h = v ? Math.max(2, (v / top) * (H - 4)) : 0;
          return (
            <rect key={i} x={i * bw + 1} y={H - h} width={bw - 2} height={h} className="fill-emerald-400/85">
              <title>{`${(i * 0.5).toFixed(1)}–${((i + 1) * 0.5).toFixed(1)} s after the scheduled time: ${plural(v, 'run')}`}</title>
            </rect>
          );
        })}
      </svg>
      <div aria-hidden="true" className="mt-1 flex justify-between text-xs/5 text-zinc-400 tabular-nums"><span>0 s</span><span>10 s</span><span>20 s</span><span>30 s</span></div>
      <p className="mt-2 text-[13px]/5 text-zinc-300 tabular-nums">
        Median {fmtDelay(p50)} · 95% within {fmtDelay(p95)} · {plural(n, 'run')} sent
        {over > 0 ? <span className="text-orange-300"> · {over} later than 30 s (worst {fmtDelay(max)})</span> : <span className="text-zinc-400"> · none later than 30 s (worst {fmtDelay(max)})</span>}
      </p>
      {topOfHour && <p className="mt-1 text-[13px]/5 text-zinc-400">Runs due at the start of a UTC hour are sent up to 15 s after it on purpose, to spread the load on GitHub. That still counts as on time.</p>}
      <details className="mt-2 text-[13px]/5 text-zinc-400">
        <summary className="inline-flex min-h-11 cursor-pointer items-center hover:text-white sm:min-h-0">Show as a table</summary>
        <table className="mt-2 text-left tabular-nums">
          <thead><tr><th className="pr-6 font-medium">Sent after</th><th className="font-medium">Runs</th></tr></thead>
          <tbody>
            {bins.map((v, i) => (v ? <tr key={i}><td className="pr-6">{(i * 0.5).toFixed(1)}–{((i + 1) * 0.5).toFixed(1)} s</td><td>{v}</td></tr> : null))}
            {over > 0 && <tr><td className="pr-6">over 30 s</td><td>{over}</td></tr>}
          </tbody>
        </table>
      </details>
    </div>
  );
}

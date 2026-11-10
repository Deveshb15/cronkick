/** Runs per period as stacked bars: on time at the bottom, then late, then missed on top. */
export type Bucket = { label: string; ontime: number; late: number; missed: number };

export function RunsChart({ buckets, height = 'h-40' }: { buckets: Bucket[]; height?: string }) {
  const max = Math.max(1, ...buckets.map((b) => b.ontime + b.late + b.missed));
  const pct = (n: number) => `${(n / max) * 100}%`;
  return (
    <div>
      <div role="img" aria-label={`Runs per day: ${buckets.map((b) => `${b.label} ${b.ontime} on time, ${b.late} late, ${b.missed} missed`).join('; ')}`} className={`flex items-end gap-1 ${height}`}>
        {buckets.map((b) => (
          <div key={b.label} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-col overflow-hidden rounded-[3px]" style={{ height: pct(b.ontime + b.late + b.missed) }}>
              {b.missed > 0 && <span className="bg-missed" style={{ flexGrow: b.missed }} />}
              {b.late > 0 && <span className="bg-late" style={{ flexGrow: b.late }} />}
              {b.ontime > 0 && <span className="bg-ontime" style={{ flexGrow: b.ontime }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1 font-mono text-[0.6875rem]/4 text-zinc-500">
        {buckets.map((b, i) => <span key={b.label} className="flex-1 truncate text-center">{i % Math.ceil(buckets.length / 7) === 0 ? b.label : ''}</span>)}
      </div>
    </div>
  );
}

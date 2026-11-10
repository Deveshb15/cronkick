/** One tick per scheduled slot, oldest on the left: on time, late, missed, or not run. */
import type { Tick } from '@/lib/data';
export type { Tick };

const color: Record<Tick, string> = {
  ontime: 'bg-ontime',
  late: 'bg-late',
  missed: 'bg-missed',
  idle: 'bg-white/10',
};
const label: Record<Tick, string> = { ontime: 'on time', late: 'late', missed: 'missed', idle: 'not run' };

export function SlotStrip({ ticks, size = 'md', className = '' }: { ticks: Tick[]; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const h = { sm: 'h-4', md: 'h-6', lg: 'h-10' }[size];
  const counts = ticks.reduce<Record<string, number>>((a, t) => ({ ...a, [t]: (a[t] ?? 0) + 1 }), {});
  const summary = Object.entries(counts).map(([t, n]) => `${n} ${label[t as Tick]}`).join(', ');
  return (
    <div role="img" aria-label={`Last ${ticks.length} slots: ${summary}`} className={`flex items-stretch gap-[2px] ${h} ${className}`}>
      {ticks.map((t, i) => <span key={i} className={`min-w-[2px] flex-1 rounded-[1px] ${color[t]}`} />)}
    </div>
  );
}

export function StripLegend() {
  return (
    <ul role="list" className="flex flex-wrap gap-x-4 gap-y-1 text-sm/6 text-zinc-400 sm:text-xs/6">
      {(['ontime', 'late', 'missed'] as Tick[]).map((t) => (
        <li key={t} className="flex items-center gap-x-1.5"><span aria-hidden="true" className={`size-2 shrink-0 rounded-[1px] ${color[t]}`} />{label[t]}</li>
      ))}
    </ul>
  );
}

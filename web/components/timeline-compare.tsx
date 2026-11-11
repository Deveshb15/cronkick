import { SlotStrip, StripLegend, type Tick } from './slot-strip';
import { Badge } from './ui';

// An illustration of a */30 schedule, not measured data: GitHub's row shows the kinds of outcome people report (some
// runs late, some never ran) without claiming a rate; /lateness has the measured numbers. Cronkick's row is its target.
const GH = 'oolooolmoolooolloooloolooomoolllooolooloolmooloo';
const parse = (s: string): Tick[] => [...s].map((c) => (c === 'o' ? 'ontime' : c === 'l' ? 'late' : 'missed'));

// Slot i of the example day is due at i × 30 min; delays are illustrative, matching the row summaries.
// Cronkick spreads on-the-hour sends over 0–15 s (src/slots.ts), so those example delays are larger.
const due = (i: number) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
const tip = (t: Tick, i: number, gh: boolean) =>
  t === 'missed' ? `${due(i)} · never ran` : t === 'late' ? `${due(i)} · ${8 + ((i * 13) % 33)} min late` : `${due(i)} · +${gh ? 12 : i % 2 ? (((i * 7) % 15) / 10 + 0.3).toFixed(1) : (i * 7) % 15 + 0.4}s`;

function Row({ name, code, ticks, stat, sub }: { name: string; code?: boolean; ticks: Tick[]; stat: string; sub: string }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr_11rem] sm:items-center">
      <p className="text-base/6 font-medium sm:text-sm/6">{code ? <span className="font-mono text-zinc-300">schedule:</span> : name}</p>
      <SlotStrip ticks={ticks} size="lg" className="reveal-wipe" tips={ticks.map((t, i) => tip(t, i, !!code))} />
      <div className="sm:text-right">
        <p className="text-base/6 font-semibold tabular-nums sm:text-sm/6">{stat}</p>
        <p className="text-sm/6 text-zinc-500 sm:text-xs/5">{sub}</p>
      </div>
    </div>
  );
}

export function TimelineCompare() {
  const gh = parse(GH);
  return (
    <div className="rounded-2xl bg-zinc-900/60 p-5 inset-ring inset-ring-white/10 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-sm/6 text-zinc-400 sm:text-xs/6">sync.yml · every 30 min · one day · 48 slots <Badge>Illustration</Badge></p>
        <StripLegend />
      </div>
      <div className="mt-8 space-y-8">
        <Row name="GitHub" code ticks={gh} stat="Some runs late" sub="some never ran" />
        <Row name="Cronkick" ticks={Array(48).fill('ontime')} stat="Sent on time" sub="target: within 30 s" />
      </div>
    </div>
  );
}

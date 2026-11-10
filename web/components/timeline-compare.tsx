import { SlotStrip, StripLegend, type Tick } from './slot-strip';

// An example day of a */30 schedule. GitHub's row mirrors the pattern people report (late runs, dropped runs);
// Cronkick's row is what the dispatcher records. Labelled as an example on the page.
const GH = 'llmlollmmlolllmllmlolmllolllmmllollmlollmlllmolm';
const parse = (s: string): Tick[] => [...s].map((c) => (c === 'o' ? 'ontime' : c === 'l' ? 'late' : 'missed'));

function Row({ name, code, ticks, stat, sub }: { name: string; code?: boolean; ticks: Tick[]; stat: string; sub: string }) {
  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-[8rem_1fr_11rem] sm:items-center">
      <p className="text-base/6 font-medium sm:text-sm/6">{code ? <span className="font-mono text-zinc-300">schedule:</span> : name}</p>
      <SlotStrip ticks={ticks} size="lg" />
      <div className="sm:text-right">
        <p className="text-base/6 font-semibold tabular-nums sm:text-sm/6">{stat}</p>
        <p className="text-sm/6 text-zinc-500 sm:text-xs/5">{sub}</p>
      </div>
    </div>
  );
}

export function TimelineCompare() {
  const gh = parse(GH);
  const missed = gh.filter((t) => t === 'missed').length;
  return (
    <div className="rounded-2xl bg-zinc-900/60 p-5 inset-ring inset-ring-white/10 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-mono text-sm/6 text-zinc-400 sm:text-xs/6">nightly-sync.yml · every 30 min · one day · 48 slots <span className="text-zinc-500">(example)</span></p>
        <StripLegend />
      </div>
      <div className="mt-8 space-y-8">
        <Row name="GitHub" code ticks={gh} stat={`${missed} never ran`} sub="the rest up to 40 min late" />
        <Row name="Cronkick" ticks={Array(48).fill('ontime')} stat="48 of 48 on time" sub="triggered within 2 s" />
      </div>
    </div>
  );
}

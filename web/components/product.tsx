// Marketing visuals built from the same pieces and words as the real dashboard (SlotStrip, SLOT_LABEL, VERDICT_DOT).
// Example data only, tagged as such on the page; every number shown is counted from FIXTURE.
import { CheckCircleIcon } from '@heroicons/react/16/solid';
import { humanCron } from '@/lib/live';
import { Symbol } from './logo';
import { SlotStrip, type Tick } from './slot-strip';
import { Badge, SLOT_LABEL, VERDICT_DOT } from './ui';

// The last 24 h of each schedule, oldest first: o = sent within 30 s, x = gave up.
const FIXTURE = [
  { name: 'sync-prices', repo: 'platform', cron: '*/15 * * * *', day: 'o'.repeat(80) + 'x' + 'o'.repeat(15) },
  { name: 'backup', repo: 'platform', cron: '0 * * * *', day: 'o'.repeat(24) },
  { name: 'stale-issues', repo: 'web', cron: '0 0 * * *', day: 'o' },
  { name: 'release-notes', repo: 'web', cron: '0 9 * * 1-5', day: 'o' },
];
const STRIP = 48;
const rows = FIXTURE.map((w) => ({ ...w, due: w.day.length, onTime: [...w.day].filter((c) => c === 'o').length }));
const due = rows.reduce((n, w) => n + w.due, 0);
const onTime = rows.reduce((n, w) => n + w.onTime, 0);
const gaveUp = (n: number) => (n ? `${n} ${SLOT_LABEL.expired.toLowerCase()}` : '');
const strip = (day: string): Tick[] => [...day.slice(-STRIP).padStart(STRIP, 'i')].map((c) => (c === 'o' ? 'ontime' : c === 'x' ? 'missed' : 'idle'));

/** The Overview page, as the landing page's product shot. */
export function DashboardShot() {
  return (
    <div className="flex text-left">
      <aside className="w-52 shrink-0 border-r border-white/5 p-4 max-md:hidden">
        <div className="flex items-center gap-x-2 px-2"><Symbol className="size-5" /><span className="text-sm/6 font-semibold">acme</span></div>
        <ul role="list" className="mt-5 space-y-0.5 text-[0.8125rem]/5 text-zinc-400">
          {['Overview', 'Settings'].map((n, i) => <li key={n} className={`rounded-md px-2 py-1.5 ${i === 0 ? 'bg-white/5 text-white' : ''}`}>{n}</li>)}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 p-6">
        <div className="flex items-center justify-between gap-x-4">
          <p className="font-mono text-[0.6875rem]/5 tracking-wider text-zinc-500 uppercase">acme · Overview</p>
          <Badge>Example</Badge>
        </div>
        <p className="mt-2 flex items-center gap-x-2.5 text-lg font-semibold tracking-tight">
          <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${VERDICT_DOT[onTime === due ? 'on_time' : 'missed']}`} />
          {onTime === due ? `All ${rows.length} schedules on time` : 'A run was missed'}
        </p>
        <p className="mt-1 text-xs/5 text-zinc-400">{onTime} of {due} runs in the last 24 h were sent within 30 s of their scheduled time.</p>
        <ul role="list" className="mt-5 divide-y divide-white/5 rounded-xl inset-ring inset-ring-white/10">
          {rows.map((w) => (
            <li key={w.name} className="grid items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:grid-cols-[11rem_1fr_6rem]">
              <div className="flex min-w-0 items-start gap-x-2.5">
                <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${VERDICT_DOT[w.onTime === w.due ? 'on_time' : 'missed']}`} />
                <div className="min-w-0">
                  <p className="truncate text-[0.8125rem]/5 font-medium">{w.name} <span className="font-normal text-zinc-500">· {w.repo}</span></p>
                  <p className="truncate text-[0.6875rem]/4 text-zinc-500">{humanCron(w.cron)} · UTC</p>
                </div>
              </div>
              <SlotStrip ticks={strip(w.day)} size="sm" />
              <div className="text-[0.6875rem]/4 tabular-nums sm:text-right">
                <p className="font-medium">{w.onTime} of {w.due} on time</p>
                {w.onTime < w.due && <p className="text-zinc-400">{gaveUp(w.due - w.onTime)}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function DiffVignette() {
  const row = 'block px-3';
  return (
    <div className="overflow-hidden rounded-lg bg-ink inset-ring inset-ring-white/10">
      <div className="flex items-center justify-between gap-x-3 border-b border-white/5 px-3 py-2">
        <p className="font-mono text-[0.6875rem]/4 text-zinc-500">nightly.yml</p>
        <span className="flex shrink-0 items-center gap-x-2 text-[0.6875rem]/4 text-emerald-300"><CheckCircleIcon className="size-3.5 fill-current" />synced on push <Badge>Example</Badge></span>
      </div>
      <pre className="overflow-hidden py-2 font-mono text-xs/5 text-zinc-400"><code>
        <span className={row}>on:</span>
        <span className={`${row} bg-red-500/10 text-red-300`}>-  schedule:</span>
        <span className={`${row} bg-red-500/10 text-red-300`}>-    - cron: &quot;0 3 * * *&quot;</span>
        <span className={`${row} bg-emerald-400/10 text-emerald-300`}>+  workflow_dispatch:</span>
        <span className={`${row} bg-emerald-400/10 text-emerald-300`}>+    # cronkick: &quot;0 3 * * *&quot;</span>
      </code></pre>
    </div>
  );
}

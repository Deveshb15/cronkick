// Marketing visuals built from the same pieces as the real dashboard (SlotStrip, Badge, RunsChart),
// so the site shows exactly what the product looks like. Data here is illustrative.
import { CheckCircleIcon, ClockIcon, EnvelopeIcon, ExclamationTriangleIcon, XCircleIcon } from '@heroicons/react/16/solid';
import { Symbol } from './logo';
import { GitHubMark } from './icons';
import { RunsChart, type Bucket } from './runs-chart';
import { SlotStrip, type Tick } from './slot-strip';
import { Badge } from './ui';

const ticks = (s: string, n = 48): Tick[] => [...s.padStart(n, 'i').slice(-n)].map((c) => (c === 'o' ? 'ontime' : c === 'l' ? 'late' : c === 'm' ? 'missed' : 'idle'));
const all = (n = 48) => 'o'.repeat(n);

const WORKFLOWS = [
  { name: 'nightly-build', cron: '0 3 * * *', strip: all(), on: '100%', note: 'next in 6h' },
  { name: 'sync-prices', cron: '*/15 * * * *', strip: all(30) + 'm' + all(17), on: '99.0%', note: '1 missed', bad: true },
  { name: 'release-notes', cron: '0 9 * * 1-5', strip: all(), on: '100%', note: 'next in 2d' },
  { name: 'db-backup', cron: '30 */6 * * *', strip: all(40) + 'l' + all(7), on: '97.9%', note: 'next in 3h' },
  { name: 'stale-issues', cron: '0 0 * * *', strip: all(), on: '100%', note: 'next in 11h' },
];

/** The Workflows page, as the hero's product shot. */
export function DashboardShot() {
  const nav = ['Workflows', 'Settings', 'GitHub lateness', 'Choose repositories'];
  return (
    <div className="flex min-h-[30rem] text-left">
      <aside className="w-52 shrink-0 border-r border-white/5 p-4 max-md:hidden">
        <div className="flex items-center gap-x-2 px-2"><Symbol className="size-5" /><span className="text-sm/6 font-semibold">cronkick</span></div>
        <p className="mt-6 px-2 font-mono text-[0.625rem]/5 tracking-wide text-zinc-500 uppercase">Accounts</p>
        <div className="mt-1 flex items-center justify-between rounded-md bg-white/5 px-2 py-1.5 text-[0.8125rem]/5"><span>acme</span><span className="font-mono text-[0.625rem] text-zinc-500">PRO</span></div>
        <ul role="list" className="mt-5 space-y-0.5 text-[0.8125rem]/5 text-zinc-400">
          {nav.map((n, i) => <li key={n} className={`rounded-md px-2 py-1.5 ${i === 0 ? 'bg-white/5 text-white' : ''}`}>{n}</li>)}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 p-6">
        <p className="text-lg font-semibold tracking-tight">Workflows</p>
        <p className="text-xs/5 text-zinc-500">acme · Pro · 12 schedules</p>
        <dl className="mt-5 grid grid-cols-4 gap-x-5">
          {[['Active schedules', '12'], ['Runs, last 24 h', '412'], ['On time (≤ 30 s)', '99.8%'], ['Next run', 'in 4m']].map(([k, v]) => (
            <div key={k} className="border-t border-white/10 pt-2.5">
              <dt className="truncate text-[0.6875rem]/4 text-zinc-500">{k}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 border-b border-white/10 pb-2 font-mono text-xs/5 text-zinc-300">acme/platform</p>
        <ul role="list" className="divide-y divide-white/5">
          {WORKFLOWS.map((w) => (
            <li key={w.name} className="grid grid-cols-[10rem_1fr_5.5rem] items-center gap-x-5 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-x-2 text-[0.8125rem]/5 font-medium"><span className="truncate">{w.name}</span></p>
                <p className="truncate font-mono text-[0.6875rem]/4 text-zinc-500">{w.cron}</p>
              </div>
              <SlotStrip ticks={ticks(w.strip)} size="sm" />
              <div className="text-right text-[0.6875rem]/4 tabular-nums">
                <p className="font-medium">{w.on} on time</p>
                <p className={w.bad ? 'text-red-300' : 'text-zinc-500'}>{w.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** One slot, end to end: due, triggered, GitHub accepted, run passed. */
export function EventCard() {
  const rows = [
    { icon: ClockIcon, tone: 'fill-zinc-500', k: 'Due', v: '03:00:00 UTC' },
    { icon: CheckCircleIcon, tone: 'fill-ontime', k: 'Triggered', v: '+1.2 s' },
    { icon: GitHubMark, tone: 'fill-zinc-300', k: 'GitHub accepted', v: 'run #482' },
    { icon: CheckCircleIcon, tone: 'fill-ontime', k: 'Passed', v: 'in 3m 12s' },
  ];
  return (
    <div className="w-64">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs/5 text-zinc-300">nightly-build</p>
        <Badge tone="green">Ran</Badge>
      </div>
      <ol role="list" className="mt-3 space-y-2">
        {rows.map(({ icon: Icon, tone, k, v }) => (
          <li key={k} className="flex items-center gap-x-2.5 text-xs/5">
            <Icon className={`size-4 shrink-0 ${tone}`} />
            <span className="text-zinc-400">{k}</span>
            <span className="ml-auto font-mono text-zinc-200">{v}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** GitHub's schedule vs Cronkick for the same day, compact. */
export function CompareCard() {
  const gh = 'llmlollmmlolllmllmlolmllolllmmllollmlollmlllmolm';
  return (
    <div className="w-80 space-y-3">
      <p className="font-mono text-[0.6875rem]/4 text-zinc-500">same */30 schedule · one day</p>
      <div>
        <div className="flex justify-between text-xs/5"><span className="font-mono text-zinc-400">schedule:</span><span className="text-red-300">12 never ran</span></div>
        <SlotStrip ticks={ticks(gh)} size="sm" className="mt-1" />
      </div>
      <div>
        <div className="flex justify-between text-xs/5"><span className="font-medium">Cronkick</span><span className="text-emerald-300">48 / 48 on time</span></div>
        <SlotStrip ticks={ticks(all())} size="sm" className="mt-1" />
      </div>
    </div>
  );
}

/* ---- Bento vignettes ---- */

export function RunTableVignette() {
  const rows: [string, string, 'green' | 'red', string, string][] = [
    ['09:45', '+1.1s', 'green', 'Ran', 'success'],
    ['09:30', '+0.9s', 'green', 'Ran', 'success'],
    ['09:15', '—', 'red', 'Expired', 'GitHub 503 until deadline'],
    ['09:00', '+1.4s', 'green', 'Ran', 'failure'],
  ];
  return (
    <table className="w-full text-left text-xs/5">
      <thead className="text-zinc-500"><tr><th className="pb-2 font-normal">Due</th><th className="pb-2 font-normal">Triggered</th><th className="pb-2 font-normal">Status</th><th className="pb-2 font-normal">Result</th></tr></thead>
      <tbody className="divide-y divide-white/5 tabular-nums">
        {rows.map(([due, t, tone, st, res]) => (
          <tr key={due}>
            <td className="py-2 font-mono text-zinc-200">{due}</td>
            <td className="py-2 font-mono text-zinc-400">{t}</td>
            <td className="py-2"><Badge tone={tone}>{st}</Badge></td>
            <td className={`py-2 ${res === 'success' ? 'text-emerald-300' : res === 'failure' ? 'text-red-300' : 'text-zinc-500'}`}>{res}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PermissionsVignette() {
  return (
    <div className="rounded-lg bg-ink p-4 inset-ring inset-ring-white/10">
      <div className="flex items-center gap-x-3">
        <Symbol className="size-8" />
        <div><p className="text-sm/5 font-semibold">Install Cronkick</p><p className="text-xs/5 text-zinc-500">on acme · 4 repositories</p></div>
      </div>
      <ul role="list" className="mt-4 space-y-2 text-xs/5">
        {[['Actions', 'Read and write'], ['Contents', 'Read-only'], ['Metadata', 'Read-only']].map(([k, v]) => (
          <li key={k} className="flex justify-between"><span className="text-zinc-300">{k}</span><span className="text-zinc-500">{v}</span></li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-center gap-x-2 rounded-md bg-emerald-500/90 py-1.5 text-xs/5 font-semibold text-white"><GitHubMark className="size-3.5" />Install &amp; authorize</div>
    </div>
  );
}

export function DiffVignette() {
  const row = 'block px-3';
  return (
    <div className="overflow-hidden rounded-lg bg-ink inset-ring inset-ring-white/10">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <p className="font-mono text-[0.6875rem]/4 text-zinc-500">nightly.yml</p>
        <span className="flex shrink-0 items-center gap-x-1 text-[0.6875rem]/4 text-emerald-300"><CheckCircleIcon className="size-3.5 fill-current" />synced on push</span>
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

export function LifecycleVignette() {
  const steps = [
    { k: 'Due', d: '03:00:00', tone: 'bg-zinc-500' },
    { k: 'Triggered', d: '+1.2 s', tone: 'bg-ontime' },
    { k: 'Accepted', d: 'run #482', tone: 'bg-ontime' },
  ];
  return (
    <div>
      <ol role="list" className="flex items-center gap-x-2">
        {steps.map((s, i) => (
          <li key={s.k} className="flex flex-1 items-center gap-x-2">
            <div className="min-w-0">
              <p className="flex items-center gap-x-1.5 text-xs/5 font-medium"><span className={`size-2 shrink-0 rounded-full ${s.tone}`} />{s.k}</p>
              <p className="font-mono text-[0.6875rem]/4 text-zinc-500">{s.d}</p>
            </div>
            {i < steps.length - 1 && <span aria-hidden="true" className="h-px flex-1 bg-white/10" />}
          </li>
        ))}
      </ol>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs/5">
        <div className="rounded-md bg-white/5 p-2.5"><p className="flex items-center gap-x-1.5 font-medium text-zinc-200"><XCircleIcon className="size-3.5 fill-red-400" />Expired</p><p className="mt-0.5 text-zinc-500">GitHub failed until the deadline. Skipped, never run late.</p></div>
        <div className="rounded-md bg-white/5 p-2.5"><p className="flex items-center gap-x-1.5 font-medium text-zinc-200"><ExclamationTriangleIcon className="size-3.5 fill-late" />Unknown</p><p className="mt-0.5 text-zinc-500">No clear answer. Never resent, so never twice.</p></div>
      </div>
    </div>
  );
}

export function AlertVignette() {
  return (
    <div className="rounded-lg bg-ink p-4 inset-ring inset-ring-white/10">
      <div className="flex items-start gap-x-3">
        <EnvelopeIcon className="size-4 h-lh shrink-0 fill-zinc-400" />
        <div className="min-w-0 text-xs/5">
          <p className="text-zinc-500">alerts@mail.cronkick.xyz · 09:16</p>
          <p className="mt-1 font-medium text-zinc-100">acme/platform · sync-prices — expired (09:15)</p>
          <p className="mt-1 text-zinc-400">We couldn’t trigger it within its deadline (GitHub kept failing), so we skipped it rather than run it late.</p>
        </div>
      </div>
    </div>
  );
}

export function CompatVignette() {
  return (
    <div className="space-y-2 text-xs/5">
      <div className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2"><span className="font-mono text-zinc-300">report.yml</span><Badge tone="red">Needs a fix</Badge></div>
      <p className="flex gap-x-2 px-1 text-red-300"><ExclamationTriangleIcon className="size-3.5 h-lh shrink-0 fill-current" /><span><code className="font-mono">github.event.schedule</code> is empty for dispatched runs.</span></p>
      <div className="flex items-center justify-between rounded-md bg-white/5 px-3 py-2"><span className="font-mono text-zinc-300">deps.yml</span><Badge tone="blue">Ready to switch</Badge></div>
    </div>
  );
}

export const SAMPLE_WEEK: Bucket[] = ['Nov 4', 'Nov 5', 'Nov 6', 'Nov 7', 'Nov 8', 'Nov 9', 'Nov 10'].map((label, i) => ({ label, ontime: [96, 96, 95, 96, 96, 94, 96][i], late: 0, missed: [0, 0, 1, 0, 0, 2, 0][i] }));

export function ChartVignette() {
  return <RunsChart buckets={SAMPLE_WEEK} height="h-24" />;
}

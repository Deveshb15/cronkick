import { CheckCircleIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { CopyBlock } from '@/components/copy-block';
import { SlotStrip, StripLegend } from '@/components/slot-strip';
import { Badge, ButtonLink, Code, STATUS } from '@/components/ui';
import { requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { installationsFor, overview, recentTicks, type RepoRow, type Tick, type WorkflowRow } from '@/lib/data';
import { manageReposUrl, pct, relTime } from '@/lib/format';
import { PLANS } from '../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const STRIP = 48;
const STARTER = `name: nightly
on:
  workflow_dispatch: # cronkick: "0 3 * * *"
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Triggered on time by Cronkick"`;

const ORDER = { needs_fix: 0, active: 1, limited: 2, ready: 3, none: 4 } as const;

/** Compatibility messages mark code with backticks; show those parts as code. */
function Ticks({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') ? <Code key={i}>{part.slice(1, -1)}</Code> : part))}</>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-t border-white/10 pt-4">
      <dt className="truncate text-base/6 text-zinc-400 sm:text-sm/6">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</dd>
      {sub && <dd className="mt-1 truncate text-sm/6 text-zinc-500">{sub}</dd>}
    </div>
  );
}

const schedules = (w: WorkflowRow) => w.schedules.map((s) => `${s.cron}${s.tz !== 'UTC' ? ` ${s.tz}` : ''}`).join(' · ');

function WorkflowRowView({ w, installationId, floor, ticks }: { w: WorkflowRow; installationId: number; floor: number; ticks: Tick[] }) {
  const st = STATUS[w.status];
  const scheduled = w.schedules.length > 0;
  return (
    <li className="py-5">
      <div className="@container">
        <div className="grid items-center gap-x-6 gap-y-3 @3xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_7rem]">
          <div className="min-w-0">
            <div className="flex items-center gap-x-2.5">
              <p className="truncate text-base/6 font-medium sm:text-sm/6">
                {scheduled ? <Link href={`/dashboard/${installationId}/workflows/${w.id}`} className="hover:underline">{w.name}</Link> : w.name}
              </p>
              <Badge tone={st.tone}>{st.label}</Badge>
            </div>
            <p className="mt-0.5 truncate font-mono text-sm/6 text-zinc-500 sm:text-xs/6">{scheduled ? schedules(w) : w.path}</p>
          </div>
          {w.status === 'active' || w.status === 'limited' ? <SlotStrip ticks={ticks} /> : <div className="max-@3xl:hidden" />}
          <div className="text-sm/5 tabular-nums @3xl:text-right">
            {w.status === 'active' && (
              <>
                <p className="font-medium">{w.due24h ? `${pct(w.onTime24h, w.due24h)} on time` : 'No runs yet'}</p>
                <p className="text-zinc-500">{w.problems24h ? <span className="text-red-300">{w.problems24h} missed</span> : `next ${relTime(w.nextDue)}`}</p>
              </>
            )}
          </div>
        </div>
      </div>
      {w.status === 'needs_fix' && (
        <ul role="list" className="mt-3 space-y-1 text-base/6 text-red-300 sm:text-sm/6">
          {w.flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}
        </ul>
      )}
      {w.status === 'limited' && <p className="mt-3 text-base/6 text-brand-300 sm:text-sm/6">Paused because your plan’s limit is reached. Upgrade, or remove another schedule, to turn it on.</p>}
      {w.status === 'ready' && w.suggested_diff && (
        <div className="mt-4 max-w-2xl">
          <p className="text-base/6 text-pretty text-zinc-400 sm:text-sm/6">
            Uses GitHub’s <Code>schedule:</Code>. To switch, remove that block, add <Code>workflow_dispatch:</Code> under <Code>on:</Code>, and paste these lines below it. Faster than every {floor} minutes won’t run on your plan.
          </p>
          <div className="mt-3"><CopyBlock code={w.suggested_diff} label={w.path} /></div>
        </div>
      )}
    </li>
  );
}

function Repo({ r, installationId, floor, ticks }: { r: RepoRow; installationId: number; floor: number; ticks: Map<number, Tick[]> }) {
  const shown = r.workflows.filter((w) => w.status !== 'none').sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const hidden = r.workflows.length - shown.length;
  return (
    <section>
      <div className="flex items-center justify-between gap-x-4 border-b border-white/10 pb-3">
        <h3 className="min-w-0 truncate font-mono text-base/6 font-medium sm:text-sm/6">{r.full_name}</h3>
        <a href={`https://github.com/${r.full_name}/actions`} className="shrink-0 text-sm/6 text-zinc-500 hover:text-white">Actions <span aria-hidden="true">↗</span></a>
      </div>
      {r.workflows.length === 0 ? (
        <p className="py-5 text-base/6 text-zinc-500 sm:text-sm/6">No workflow files in <Code>.github/workflows</Code>.</p>
      ) : (
        <>
          {shown.length > 0 && <ul role="list" className="divide-y divide-white/5">{shown.map((w) => <WorkflowRowView key={w.id} w={w} installationId={installationId} floor={floor} ticks={ticks.get(w.id) ?? Array(STRIP).fill('idle')} />)}</ul>}
          {hidden > 0 && <p className={`text-base/6 text-zinc-500 sm:text-sm/6 ${shown.length ? 'border-t border-white/5 pt-4' : 'py-5'}`}>{hidden} other workflow{hidden === 1 ? '' : 's'} without a schedule.</p>}
        </>
      )}
    </section>
  );
}

function GettingStarted({ manageUrl, repoCount }: { manageUrl: string; repoCount: number }) {
  return (
    <section className="rounded-2xl bg-zinc-900/60 p-6 inset-ring inset-ring-white/10 sm:p-8">
      <h2 className="text-lg font-semibold">Schedule your first workflow</h2>
      <ol role="list" className="mt-6 space-y-6 text-base/7 sm:text-sm/6">
        <li className="flex gap-x-3">
          <CheckCircleIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-emerald-400" />
          <div>
            <p className="font-medium">App installed on {repoCount} {repoCount === 1 ? 'repository' : 'repositories'}</p>
            <p className="text-zinc-400">Need another repo? <a href={manageUrl} className="font-medium text-white underline">Choose repositories on GitHub</a>.</p>
          </div>
        </li>
        <li className="flex gap-x-3">
          <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-brand-400">2</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Add a <Code># cronkick</Code> comment to a workflow</p>
            <p className="text-zinc-400">Put it next to <Code>workflow_dispatch:</Code>. Already using <Code>schedule:</Code>? The workflows below show the exact lines.</p>
            <div className="mt-3 max-w-2xl"><CopyBlock code={STARTER} label=".github/workflows/nightly.yml" /></div>
          </div>
        </li>
        <li className="flex gap-x-3">
          <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-brand-400">3</span>
          <div>
            <p className="font-medium">Push to your default branch</p>
            <p className="text-zinc-400">Cronkick reads the file on push. The workflow turns Active here, and every run gets a tick.</p>
          </div>
        </li>
      </ol>
    </section>
  );
}

export default async function Overview({ params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const now = new Date();
  const [{ repos, totals }, ticks] = await Promise.all([overview(db, id, now), recentTicks(db, id, now, STRIP)]);
  const limits = PLANS[inst.plan];
  const anyActive = repos.some((r) => r.workflows.some((w) => w.status === 'active'));
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="mt-1 text-base/6 text-zinc-400 sm:text-sm/6">{inst.account_login} · {inst.plan === 'pro' ? 'Pro' : 'Free'} · up to {limits.schedules} schedules, every {limits.floorMinutes} min or slower</p>
        </div>
        <ButtonLink href={manageReposUrl(inst)} size="sm">Choose repositories</ButtonLink>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 @2xl:grid-cols-4">
          <Stat label="Active schedules" value={String(totals.activeSchedules)} sub={`of ${limits.schedules} on your plan`} />
          <Stat label="Runs, last 24 h" value={String(totals.due24h)} />
          <Stat label="On time (≤ 30 s)" value={pct(totals.onTime24h, totals.due24h)} sub="first trigger after due time" />
          <Stat label="Next run" value={relTime(totals.nextDue)} sub={totals.problems24h ? `${totals.problems24h} missed in 24 h` : 'nothing missed in 24 h'} />
        </dl>
      </div>

      {!anyActive && <GettingStarted manageUrl={manageReposUrl(inst)} repoCount={repos.length} />}

      <div className="space-y-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">By repository</h2>
          {anyActive && <div className="flex items-center gap-x-4"><span className="text-sm/6 text-zinc-500 sm:text-xs/6">Last {STRIP} slots</span><StripLegend /></div>}
        </div>
        {repos.length ? repos.map((r) => <Repo key={r.id} r={r} installationId={id} floor={limits.floorMinutes} ticks={ticks} />) : (
          <p className="text-base/6 text-zinc-400 sm:text-sm/6">No repositories yet. <a href={manageReposUrl(inst)} className="font-medium text-white underline">Choose repositories on GitHub</a>.</p>
        )}
      </div>
    </div>
  );
}

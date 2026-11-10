import { CheckCircleIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { CopyBlock } from '@/components/copy-block';
import { Badge, ButtonLink, Code, STATUS } from '@/components/ui';
import { db } from '@/lib/db';
import { installationsFor, overview, type RepoRow, type WorkflowRow } from '@/lib/data';
import { manageReposUrl, pct, relTime } from '@/lib/format';
import { requireInstallation } from '@/lib/access';
import { PLANS } from '../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const STARTER = `name: nightly
on:
  workflow_dispatch: # cronkick: "0 3 * * *"
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Triggered on time by Cronkick"`;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border-t border-zinc-950/10 pt-4 dark:border-white/10">
      <dt className="truncate text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-2xl">{value}</dd>
      {sub && <dd className="mt-1 truncate text-sm/6 text-zinc-500">{sub}</dd>}
    </div>
  );
}

const ORDER = { needs_fix: 0, active: 1, limited: 2, ready: 3, none: 4 } as const;

/** Compatibility messages mark code with backticks; show those parts as code. */
function Ticks({ text }: { text: string }) {
  return <>{text.split(/(`[^`]+`)/).map((part, i) => (part.startsWith('`') ? <Code key={i}>{part.slice(1, -1)}</Code> : part))}</>;
}

function scheduleText(w: WorkflowRow) {
  return w.schedules.map((s) => `${s.cron}${s.tz !== 'UTC' ? ` (${s.tz})` : ''}`).join(', ');
}

function WorkflowLine({ w, installationId, floor }: { w: WorkflowRow; installationId: number; floor: number }) {
  const st = STATUS[w.status];
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-base/6 font-medium sm:text-sm/6">
            {w.schedules.length ? <Link href={`/dashboard/${installationId}/workflows/${w.id}`} className="hover:underline">{w.name}</Link> : w.name}
          </p>
          <p className="mt-0.5 truncate font-mono text-sm/6 text-zinc-500 sm:text-xs/6">{w.path}{w.schedules.length > 0 && ` · ${scheduleText(w)}`}</p>
        </div>
        <div className="flex shrink-0 items-center gap-x-4 text-sm/6 text-zinc-600 tabular-nums dark:text-zinc-400">
          {w.status === 'active' && (
            <>
              <span>{w.due24h ? `${pct(w.onTime24h, w.due24h)} on time` : 'No runs yet'}</span>
              {w.problems24h > 0 && <span className="text-red-600 dark:text-red-400">{w.problems24h} missed</span>}
              <span className="max-sm:hidden">Next {relTime(w.nextDue)}</span>
            </>
          )}
          <Badge tone={st.tone}>{st.label}</Badge>
        </div>
      </div>
      {w.status === 'needs_fix' && (
        <ul role="list" className="mt-3 space-y-1 text-base/6 text-red-700 sm:text-sm/6 dark:text-red-400">
          {w.flags.map((f) => <li key={f.message}><Ticks text={f.message} /></li>)}
        </ul>
      )}
      {w.status === 'limited' && <p className="mt-2 text-base/6 text-amber-700 sm:text-sm/6 dark:text-amber-400">Paused because your plan’s limit is reached. Upgrade or remove another schedule to turn it on.</p>}
      {w.status === 'ready' && w.suggested_diff && (
        <div className="mt-3 max-w-2xl">
          <p className="text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">
            This workflow uses GitHub’s <Code>schedule:</Code>. To switch, remove that block, add <Code>workflow_dispatch:</Code> under <Code>on:</Code>, and paste these lines below it. Schedules faster than every {floor} minutes won’t run on your plan.
          </p>
          <div className="mt-3"><CopyBlock code={w.suggested_diff} label={w.path} /></div>
        </div>
      )}
    </li>
  );
}

function Repo({ r, installationId, floor }: { r: RepoRow; installationId: number; floor: number }) {
  const shown = r.workflows.filter((w) => w.status !== 'none').sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const hidden = r.workflows.length - shown.length;
  return (
    <section className="border-t border-zinc-950/10 pt-6 dark:border-white/10">
      <h3 className="font-mono text-base/6 font-medium sm:text-sm/6">{r.full_name}</h3>
      {r.workflows.length === 0 ? (
        <p className="mt-2 text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">No workflow files in <Code>.github/workflows</Code>.</p>
      ) : (
        <>
          {shown.length > 0 && <ul role="list" className="divide-y divide-zinc-950/5 dark:divide-white/5">{shown.map((w) => <WorkflowLine key={w.id} w={w} installationId={installationId} floor={floor} />)}</ul>}
          {hidden > 0 && <p className="mt-2 text-base/6 text-zinc-500 sm:text-sm/6">{hidden} workflow{hidden === 1 ? '' : 's'} without a schedule.</p>}
        </>
      )}
    </section>
  );
}

function GettingStarted({ manageUrl, repoCount }: { manageUrl: string; repoCount: number }) {
  return (
    <section className="rounded-xl p-6 ring-1 ring-zinc-950/10 sm:p-8 dark:bg-zinc-900 dark:ring-white/10">
      <h2 className="text-lg font-semibold">Schedule your first workflow</h2>
      <ol role="list" className="mt-6 space-y-6 text-base/7 sm:text-sm/6">
        <li className="flex gap-x-3">
          <CheckCircleIcon aria-hidden="true" className="size-4 h-lh shrink-0 fill-emerald-500" />
          <div>
            <p className="font-medium">App installed on {repoCount} {repoCount === 1 ? 'repository' : 'repositories'}</p>
            <p className="text-zinc-600 dark:text-zinc-400">Need a different repo? <a href={manageUrl} className="font-medium text-zinc-950 underline dark:text-white">Choose repositories on GitHub</a>.</p>
          </div>
        </li>
        <li className="flex gap-x-3">
          <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-zinc-500">2</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">Add a <Code># cronkick</Code> comment to a workflow</p>
            <p className="text-zinc-600 dark:text-zinc-400">Put it next to <Code>workflow_dispatch:</Code>. Already using <Code>schedule:</Code>? Each workflow below shows the exact lines.</p>
            <div className="mt-3 max-w-2xl"><CopyBlock code={STARTER} label=".github/workflows/nightly.yml" /></div>
          </div>
        </li>
        <li className="flex gap-x-3">
          <span aria-hidden="true" className="w-4 shrink-0 text-center font-mono text-zinc-500">3</span>
          <div>
            <p className="font-medium">Push to your default branch</p>
            <p className="text-zinc-600 dark:text-zinc-400">Cronkick reads the file on push and the workflow appears here as Active, with every run listed.</p>
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
  const { repos, totals } = await overview(db, id, new Date());
  const limits = PLANS[inst.plan];
  const anyActive = repos.some((r) => r.workflows.some((w) => w.status === 'active'));
  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">{inst.account_login} · {inst.plan === 'pro' ? 'Pro' : 'Free'} plan · up to {limits.schedules} schedules, every {limits.floorMinutes} min or slower</p>
        </div>
        <ButtonLink href={manageReposUrl(inst)} size="sm">Choose repositories</ButtonLink>
      </div>

      <div className="@container">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-6 @2xl:grid-cols-4">
          <Stat label="Active schedules" value={String(totals.activeSchedules)} sub={`of ${limits.schedules} on your plan`} />
          <Stat label="Runs in last 24h" value={String(totals.due24h)} />
          <Stat label="On time (≤ 30 s)" value={pct(totals.onTime24h, totals.due24h)} sub="first trigger after due time" />
          <Stat label="Next run" value={relTime(totals.nextDue)} sub={totals.problems24h ? `${totals.problems24h} missed in 24h` : 'No missed runs in 24h'} />
        </dl>
      </div>

      {!anyActive && <GettingStarted manageUrl={manageReposUrl(inst)} repoCount={repos.length} />}

      <div className="space-y-8">
        <h2 className="text-lg font-semibold">Repositories</h2>
        {repos.length ? repos.map((r) => <Repo key={r.id} r={r} installationId={id} floor={limits.floorMinutes} />) : (
          <p className="text-base/6 text-zinc-600 sm:text-sm/6 dark:text-zinc-400">No repositories yet. <a href={manageReposUrl(inst)} className="font-medium text-zinc-950 underline dark:text-white">Choose repositories on GitHub</a>.</p>
        )}
      </div>
    </div>
  );
}

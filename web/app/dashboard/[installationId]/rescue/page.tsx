import type { Metadata } from 'next';
import Link from 'next/link';
import { Time, Zone } from '@/components/live';
import { Badge, type Tone } from '@/components/ui';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { installationsFor, rescueRuns, rescueSettings, stuckRuns, type RescueRow } from '@/lib/data';
import { plural } from '@/lib/live';
import { PLANS } from '../../../../../src/plans.ts';

export const dynamic = 'force-dynamic';

const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';
const link = 'font-medium text-white underline decoration-white/30 hover:decoration-white';

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? `Rescue · ${inst.account_login}` : 'Rescue' };
}

// "GitHub broke" only for no runner (R1) and a GitHub service error during setup (R4); see /docs/rescue.
function verdict(r: RescueRow): [string, Tone] {
  if (r.state === 'queued') return ['Checking', 'zinc'];
  if (r.state === 'error') return ['Couldn’t check', 'zinc'];
  switch (r.verdict) {
    case 'github_broke': return [r.jobs.some((j) => j.class === 'no_runner') ? 'GitHub never gave it a runner' : 'GitHub service error during setup', 'red'];
    case 'probably_github': return ['Probably GitHub', 'orange'];
    case 'not_started': return ['Didn’t start, likely GitHub', 'orange'];
    case 'mixed': return ['Partly GitHub, partly the run', 'amber'];
    case 'billing': return ['GitHub billing lock', 'zinc'];
    case 'self_hosted': return ['Self-hosted runner', 'zinc'];
    default: return ['Not GitHub’s infrastructure', 'zinc'];
  }
}

function action(r: RescueRow): string {
  switch (r.state) {
    case 'queued': return 'Reading the job list';
    case 'error': return r.skipReason ?? 'GitHub didn’t answer';
    case 'rerun_waiting': return 'Will re-run the failed jobs once, after GitHub has had a few minutes to recover';
    case 'rerun_unknown': return `Sent the re-run; GitHub’s answer was lost, so it wasn’t sent again${r.rerunNote ? ` (${r.rerunNote})` : ''}`;
    case 'rerun_requested': return 'Re-run requested';
    case 'rerun_started': return 'Re-ran the failed jobs once';
    case 'done': return 'Re-ran the failed jobs once';
    case 'rerun_rejected': return `GitHub refused the re-run: ${r.rerunNote ?? 'no reason given'}`;
    case 'rerun_vanished': return 'GitHub accepted the re-run but never started it';
  }
  // The reason only says something for a run GitHub broke; for the rest there is nothing to re-run.
  return r.verdict === 'github_broke' && r.skipReason ? `Not re-run: ${r.skipReason}` : 'Nothing to re-run';
}

export default async function Rescue({ params, searchParams }: { params: Promise<{ installationId: string }>; searchParams: Promise<{ all?: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/rescue`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const all = (await searchParams).all === '1';
  const now = new Date();
  const [{ rows, hidden }, stuck, { mode }] = await Promise.all([rescueRuns(db, id, now, all), stuckRuns(db, id, now), rescueSettings(db, id)]);
  const limits = PLANS[inst.plan];
  return (
    <div className={`${container} space-y-8 pt-8 pb-16 sm:pt-10`}>
      <header className="max-w-3xl space-y-2">
        <p className="text-[13px]/5 text-zinc-400">{inst.account_login}</p>
        <h1 className="text-2xl/8 font-semibold tracking-tight">Rescue</h1>
        <p className="text-sm/6 text-zinc-400">
          Failed runs in your repositories, and whether GitHub’s infrastructure, not your code, broke them.{mode === 'rerun' ? ' Runs Cronkick started that never got a runner are re-run once, on the workflows you turned on.' : ' Report only: nothing is re-run.'}
          {' '}Last {limits.historyDays} days · times in <Zone /> · <Link href="/docs/rescue" className={link}>How Rescue decides</Link>
        </p>
        {mode === 'off' && <p className="text-sm/6 text-zinc-300">Rescue is off, so new failed runs aren’t read. <Link href={`/dashboard/${id}/settings`} className={link}>Turn it on in Settings</Link></p>}
      </header>

      {stuck.length > 0 && (
        <section aria-labelledby="stuck" className="max-w-3xl">
          <h2 id="stuck" className="text-base/6 font-semibold">Stuck <span className="font-normal text-zinc-400">· sent over an hour ago, never started</span></h2>
          <ul role="list" className="mt-3 divide-y divide-white/5 rounded-xl text-sm/6 inset-ring inset-ring-white/10">
            {stuck.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 px-4 py-3">
                <span>{r.repo} · {r.workflow} · sent <Time iso={r.firedAt} clock date className="text-zinc-200" /></span>
                {r.runUrl && <a target="_blank" rel="noreferrer" href={r.runUrl} className="text-[13px]/5 text-zinc-300 hover:text-white hover:underline">View run ↗</a>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px]/5 text-zinc-400">GitHub accepted these but never started a runner. Cronkick doesn’t cancel them; you can, on GitHub.</p>
        </section>
      )}

      <section aria-label="Failed runs">
        {!rows.length ? (
          <p className="max-w-3xl rounded-xl px-4 py-4 text-sm/6 text-zinc-300 inset-ring inset-ring-white/10">
            {hidden ? `No failed runs that look like GitHub’s side. ${plural(hidden, 'run')} failed in the code.` : 'No failed runs yet.'}
          </p>
        ) : (
          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[48rem] text-left text-sm/6">
              <thead className="text-[13px]/5 text-zinc-400">
                <tr className="border-b border-white/10">
                  <th className="py-2.5 pl-4 font-medium sm:pl-1">Finished</th>
                  <th className="font-medium">Run</th>
                  <th className="font-medium">Verdict</th>
                  <th className="font-medium">What Rescue did</th>
                  <th className="pr-4 text-right font-medium sm:pr-1">Attempt 2</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [word, tone] = verdict(r);
                  const matched = r.jobs.find((j) => j.matched)?.matched;
                  return (
                    <tr key={r.id} className="border-t border-white/5 align-top">
                      <td className="py-3 pl-4 whitespace-nowrap sm:pl-1"><Time iso={r.completedAt} clock date className="text-zinc-100 tabular-nums" /></td>
                      <td className="py-3 pr-4">
                        <a target="_blank" rel="noreferrer" href={r.runUrl} className="font-medium hover:underline">{r.repo.split('/')[1]} · {r.workflow}<span className="sr-only"> on GitHub</span> ↗</a>
                        <p className="text-[13px]/5 text-zinc-400">{r.cronkick ? 'Started by Cronkick' : 'Not started by Cronkick'}{r.runAttempt > 1 && ` · attempt ${r.runAttempt}`}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge tone={tone}>{word}</Badge>
                        {matched && <p className="mt-1 max-w-xs font-mono text-xs/5 break-words text-zinc-400">“{matched}”</p>}
                      </td>
                      <td className="py-3 pr-4 text-[13px]/5 text-zinc-300">{action(r)}</td>
                      <td className="py-3 pr-4 text-right text-[13px]/5 text-zinc-300 sm:pr-1">{r.retryConclusion ?? <span className="text-zinc-500">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hidden > 0 && rows.length > 0 && <p className="mt-3 text-[13px]/5 text-zinc-400"><Link href={`/dashboard/${id}/rescue?all=1`} className={link}>Show {plural(hidden, 'run')} that failed in the code too</Link></p>}
        {all && <p className="mt-3 text-[13px]/5 text-zinc-400"><Link href={`/dashboard/${id}/rescue`} className={link}>Hide runs that failed in the code</Link></p>}
      </section>
    </div>
  );
}

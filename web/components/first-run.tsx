'use client';
import { CheckIcon } from '@heroicons/react/16/solid';
import { useState } from 'react';
import { humanCron } from '@/lib/live';
import { AlertHint, ButtonLink } from './ui';

/**
 * Setup until a schedule is configured: pick a cadence, copy one line, push. The page watches live; once Cronkick
 * sees the push the overview takes over, with the new schedule awaiting its first run. With no repositories
 * selected, the page points at choosing them first.
 */
export function FirstRun({ installationId, repos, manageUrl, floor, candidates, alerts }: {
  installationId: number; repos: { full_name: string; default_branch: string }[]; manageUrl: string; floor: number; candidates: number; alerts: boolean;
}) {
  const presets = [
    { cron: `*/${Math.max(15, floor)} * * * *`, label: `Every ${Math.max(15, floor)} min` },
    { cron: '0 * * * *', label: 'Hourly' },
    { cron: '0 3 * * *', label: 'Daily 03:00' },
  ];
  const [cron, setCron] = useState(presets[0].cron);
  const [copied, setCopied] = useState(false);
  const line = `# cronkick: "${cron}"`;
  // A runnable example in GitHub's "new file" editor: one click to commit, and that commit is the push step 3 waits
  // for. The every-N-minutes preset becomes hourly so a placeholder job doesn't eat the account's Actions minutes.
  const starterCron = cron === presets[0].cron ? '0 * * * *' : cron;
  const starter = `name: Cronkick starter\n# Replace the echo with your job. Edit the cronkick line to change when it runs.\non:\n  workflow_dispatch:\n  # cronkick: "${starterCron}"\njobs:\n  hello:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo "Cronkick started this run at $(date -u)"\n`;
  const starterUrl = (r: { full_name: string; default_branch: string }) =>
    `https://github.com/${r.full_name}/new/${r.default_branch.split('/').map(encodeURIComponent).join('/')}?filename=.github/workflows/cronkick-starter.yml&value=${encodeURIComponent(starter)}`;
  const copy = () => navigator.clipboard.writeText(line).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const done = <span className="grid size-7 shrink-0 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><CheckIcon aria-hidden="true" className="size-4 fill-current" /></span>;
  const step = (n: number, on: boolean) => <span className={`grid size-7 shrink-0 place-items-center rounded-full font-mono text-sm ${on ? 'bg-brand-500 font-semibold text-ink' : 'bg-white/10 text-zinc-300'}`}>{n}</span>;
  const steps = (
        <ol role="list" className="mt-8 space-y-8">
          <li className="flex gap-4">
            {repos.length ? done : step(1, true)}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{repos.length ? `Cronkick can see ${repos.length} ${repos.length === 1 ? 'repository' : 'repositories'}` : 'Choose which repositories Cronkick can see'}</p>
              <p className="text-sm/6 text-zinc-400">{repos.length ? `${repos.map((r) => r.full_name.split('/')[1]).slice(0, 3).join(', ')}${repos.length > 3 ? ` +${repos.length - 3} more` : ''} · ` : ''}<a target="_blank" rel="noreferrer" href={manageUrl} className="text-zinc-300 underline decoration-white/20 hover:decoration-white">{repos.length ? 'Add more on GitHub ↗' : 'Pick repositories on GitHub ↗'}</a></p>
            </div>
          </li>
          <li className="flex gap-4">
            {step(2, repos.length > 0)}
            <div className="min-w-0 flex-1">
              <p className="font-medium">Add one line to a workflow</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs/5">
                <span className="text-zinc-400">How often?</span>
                <div className="flex flex-wrap gap-1 rounded-lg bg-white/5 p-0.5">
                  {presets.map((p) => <button key={p.cron} type="button" onClick={() => setCron(p.cron)} className={`rounded-md px-2.5 py-1 transition ${cron === p.cron ? 'bg-white/10 font-medium text-white' : 'text-zinc-400 hover:text-white'}`}>{p.label}</button>)}
                  {floor > 5 && <span title="Paid plans run more often" className="rounded-md px-2.5 py-1 text-zinc-600">Faster · Pro and Team</span>}
                </div>
              </div>
              <div className="mt-3 overflow-hidden rounded-xl bg-zinc-950 inset-ring inset-ring-white/10">
                <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2 font-mono text-xs/5 text-zinc-400">
                  <span>.github/workflows/your-workflow.yml</span>
                  <span className="ml-auto flex items-center gap-2"><span className="size-2 animate-pulse rounded-full bg-brand-500" />waiting for push</span>
                  <button type="button" onClick={copy} className="rounded-md bg-brand-500 px-2.5 py-1 font-sans text-xs/5 font-semibold text-ink transition hover:bg-brand-400">{copied ? 'Copied ✓' : 'Copy line'}</button>
                </div>
                <div className="py-3 font-mono text-[0.8125rem]/7 whitespace-pre text-zinc-300">
                  <div className="px-4"><span className="mr-4 text-zinc-700">1</span><span className="text-violet-300">on</span>:</div>
                  <div className="px-4"><span className="mr-4 text-zinc-700">2</span>  <span className="text-violet-300">workflow_dispatch</span>:</div>
                  <div className="overflow-x-auto bg-brand-500/10 px-4 text-brand-300 shadow-[inset_2px_0_0_var(--color-brand-500)]">
                    <span className="mr-4 text-zinc-600">3</span><span className="whitespace-pre">{`  ${line}`}</span>
                  </div>
                  <div className="px-4"><span className="mr-4 text-zinc-700">4</span><span className="text-violet-300">jobs</span>: <span className="text-zinc-600">… keep your jobs as they are</span></div>
                </div>
              </div>
              <p className="mt-2 text-[13px]/5 text-zinc-400">Runs {humanCron(cron).toLowerCase()}, UTC. Already using <code className="font-mono">schedule:</code>? Remove it so GitHub doesn’t run it a second time, late.</p>
              {repos.length > 0 && (
                <p className="mt-1 text-[13px]/5 text-zinc-400">No workflow yet? Create a starter that runs {humanCron(starterCron).toLowerCase()} in {repos.slice(0, 3).map((r, i) => <span key={r.full_name}>{i > 0 && ', '}<a target="_blank" rel="noreferrer" href={starterUrl(r)} className="text-zinc-300 underline decoration-white/20 hover:decoration-white">{r.full_name.split('/')[1]} ↗</a></span>)}. Commit it on GitHub and this page picks it up.</p>
              )}
              {candidates > 0 && <p className="mt-1 text-xs/5 text-zinc-400">Or move one of your {candidates} existing GitHub schedules: see “Still on GitHub’s schedule” below.</p>}
            </div>
          </li>
          <li className="flex gap-4">
            {step(3, false)}
            <div className="min-w-0 flex-1">
              <p className="font-medium">Push it to your default branch</p>
              {!repos.length ? (
                <p className="mt-3 text-sm/6 text-zinc-400">Choose repositories first; Cronkick watches them for the push.</p>
              ) : (
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[0.03] px-4 py-3 text-sm/6 text-zinc-400 inset-ring inset-ring-white/10">
                  <svg aria-hidden="true" className="size-4 animate-spin text-brand-400" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                  Watching {repos.length} {repos.length === 1 ? 'repository' : 'repositories'} for a push…
                </div>
              )}
            </div>
          </li>
        </ol>
  );
  return (
    <section className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6 sm:pt-10 lg:px-10">
      <div className="max-w-3xl">
        <p className="text-[13px]/5 text-zinc-400">Overview</p>
        {repos.length ? (
          <>
            <h1 className="mt-1 text-2xl/8 font-semibold tracking-tight">Schedule your first workflow</h1>
            <p className="mt-2 text-sm/6 text-zinc-400">Three steps. This page updates on its own as you go.</p>
            {steps}
          </>
        ) : (
          <>
            <h1 className="mt-1 text-2xl/8 font-semibold tracking-tight">Choose repositories for Cronkick</h1>
            <p className="mt-2 text-sm/6 text-zinc-400">Cronkick can’t see any repositories yet. Pick the ones with workflows to schedule, then add one line.</p>
            <ButtonLink target="_blank" rel="noreferrer" href={manageUrl} variant="primary" size="lg" className="mt-6">Choose repositories on GitHub ↗</ButtonLink>
            {steps}
          </>
        )}
        {!alerts && <p className="mt-10 text-sm/6 text-zinc-400"><AlertHint id={installationId} /></p>}
      </div>
    </section>
  );
}

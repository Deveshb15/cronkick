'use client';
import { ChevronDownIcon } from '@heroicons/react/16/solid';
import { useState, type ReactNode } from 'react';
import { GitHubMark } from './icons';
import { Button, ButtonLink } from './ui';

type Repo = { full_name: string; default_branch: string };
// The house text field (alert-email-form.tsx), sized to match a md button.
const field = 'w-full rounded-lg bg-white/5 px-3 py-2.5 text-base/6 text-white inset-ring inset-ring-white/10 placeholder:text-zinc-500 focus:outline-2 focus:-outline-offset-1 focus:outline-brand-500 sm:py-2 sm:text-sm/6';
const label = 'text-base/6 font-medium text-zinc-200 sm:text-sm/6';
const link = 'font-medium text-white underline decoration-white/30 underline-offset-4 hover:decoration-white';

/**
 * Opens GitHub's new-file editor with the recipe filled in (`value=` is undocumented, so the page keeps a copy button
 * on the workflow). Signed in: pick one of the installation's repos. Signed out: type owner/repo and branch.
 * Then: the two settings a recipe needs, linked straight into the chosen repo.
 */
export function AddToRepo({ slug, yaml, repos, secrets, prs, schedule, installHref }: {
  slug: string; yaml: string; repos: Repo[] | null; secrets: string[]; prs: boolean; schedule: string; installHref: string;
}) {
  const [repo, setRepo] = useState(repos?.[0]?.full_name ?? '');
  const [branch, setBranch] = useState(repos?.[0]?.default_branch ?? 'main');
  const pick = (name: string) => { setRepo(name); setBranch(repos?.find((r) => r.full_name === name)?.default_branch ?? 'main'); };
  const name = repo.trim();
  const ok = /^[\w.-]+\/[\w.-]+$/.test(name) && branch.trim() !== '';
  const file = `.github/workflows/cronkick-${slug}.yml`;
  const href = `https://github.com/${name}/new/${branch.trim().split('/').map(encodeURIComponent).join('/')}?filename=${file}&value=${encodeURIComponent(yaml)}`;
  const settings = (path: string) => (ok ? `https://github.com/${name}/settings/${path}` : undefined);

  return (
    <div className="rounded-2xl bg-zinc-900/50 p-6 inset-ring inset-ring-white/10">
      <h2 className="text-lg/7 font-semibold text-white sm:text-base/7">Add it to a repository</h2>
      <p className="mt-1 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">GitHub opens the file in its editor. Commit it, or open a pull request to review it first.</p>

      <div className="mt-6 grid gap-4">
        {repos?.length ? (
          <div className="grid gap-2">
            <label htmlFor="recipe-repo" className={label}>Repository</label>
            <div className="inline-grid grid-cols-[1fr_--spacing(8)]">
              <select id="recipe-repo" name="repo" value={repo} onChange={(e) => pick(e.target.value)}
                className={`${field} col-span-full row-start-1 appearance-none truncate pr-8 [&_option]:bg-zinc-900`}>
                {repos.map((r) => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}
              </select>
              <ChevronDownIcon aria-hidden="true" className="pointer-events-none col-start-2 row-start-1 size-4 place-self-center fill-zinc-400" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <div className="grid gap-2">
              <label htmlFor="recipe-repo" className={label}>Repository</label>
              <input id="recipe-repo" name="repo" placeholder="owner/repo" autoComplete="off" spellCheck={false} value={repo} onChange={(e) => setRepo(e.target.value)} className={field} />
            </div>
            <div className="grid gap-2">
              <label htmlFor="recipe-branch" className={label}>Branch</label>
              <input id="recipe-branch" name="branch" placeholder="main" autoComplete="off" spellCheck={false} value={branch} onChange={(e) => setBranch(e.target.value)} className={field} />
            </div>
          </div>
        )}

        {ok
          ? <ButtonLink href={href} target="_blank" rel="noreferrer" variant="primary" className="w-full"><GitHubMark className="size-4 shrink-0" />Open in GitHub</ButtonLink>
          : <Button type="button" variant="primary" disabled className="w-full cursor-not-allowed opacity-50"><GitHubMark className="size-4 shrink-0" />Open in GitHub</Button>}

        <div className="grid gap-1 text-sm/6 text-zinc-500 sm:text-xs/5">
          <p className="truncate" title={file}><span className="font-mono text-zinc-400">{file}</span> on {branch.trim() || 'the default branch'}</p>
          <p>Editor opens empty? <a href="#workflow" className={link}>Copy the workflow</a> instead.</p>
        </div>
      </div>

      <div className="mt-6 border-t border-white/5 pt-6">
        <h3 className={label}>Then</h3>
        <ol role="list" className="mt-3 grid gap-3 text-base/6 text-zinc-400 sm:text-sm/6">
          <Step n={1}>
            Add {secrets.map((s, i) => <span key={s}>{i ? ' and ' : ''}<span className="font-mono text-zinc-200">{s}</span></span>)} as {secrets.length > 1 ? 'repository secrets' : 'a repository secret'}.
            {settings('secrets/actions') && <> <a href={settings('secrets/actions')} target="_blank" rel="noreferrer" className={link}>Open secrets ↗</a></>}
          </Step>
          {prs && (
            <Step n={2}>
              Turn on “Allow GitHub Actions to create and approve pull requests”.
              {settings('actions') && <> <a href={settings('actions')} target="_blank" rel="noreferrer" className={link}>Open settings ↗</a></>}
            </Step>
          )}
          <Step n={prs ? 3 : 2}>Cronkick picks it up when you commit. Schedule: {schedule}, set by the marker line.</Step>
        </ol>
        {repos === null && <p className="mt-4 text-base/6 text-zinc-400 sm:text-sm/6">Cronkick must be installed on the repository. <a href={installHref} className={link}>Install it</a></p>}
        {repos && !repos.length && <p className="mt-4 text-base/6 text-zinc-400 sm:text-sm/6">Cronkick isn’t installed on any repository yet. <a href={installHref} className={link}>Install it</a></p>}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-x-3">
      <span className="w-4 shrink-0 font-mono text-zinc-500">{n}</span>
      <p className="min-w-0">{children}</p>
    </li>
  );
}

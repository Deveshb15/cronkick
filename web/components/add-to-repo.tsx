'use client';
import { useState } from 'react';
import { Button, ButtonLink } from './ui';

type Repo = { full_name: string; default_branch: string };
const field = 'min-h-11 rounded-lg bg-white/5 px-3 text-sm/6 text-zinc-100 inset-ring inset-ring-white/10 placeholder:text-zinc-500 focus:outline-2 focus:outline-brand-500 sm:min-h-9';

/**
 * Opens GitHub's new-file page with the recipe filled in (`value=` is undocumented, so the YAML's copy button stays
 * next to it). Signed in: a picker over the installation's active repos. Signed out: type owner/repo and branch.
 */
export function AddToRepo({ slug, yaml, repos }: { slug: string; yaml: string; repos: Repo[] | null }) {
  const [repo, setRepo] = useState(repos?.[0]?.full_name ?? '');
  const [branch, setBranch] = useState(repos?.[0]?.default_branch ?? 'main');
  const pick = (name: string) => { setRepo(name); setBranch(repos?.find((r) => r.full_name === name)?.default_branch ?? 'main'); };
  const ok = /^[\w.-]+\/[\w.-]+$/.test(repo.trim()) && branch.trim() !== '';
  const href = `https://github.com/${repo.trim()}/new/${branch.trim().split('/').map(encodeURIComponent).join('/')}`
    + `?filename=.github/workflows/cronkick-${slug}.yml&value=${encodeURIComponent(yaml)}`;
  return (
    <div className="mt-6 rounded-xl p-4 inset-ring inset-ring-white/10">
      <p className="text-sm/6 font-medium text-white">Add to a repo</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {repos?.length ? (
          <select aria-label="Repository" value={repo} onChange={(e) => pick(e.target.value)} className={`${field} min-w-0 flex-1`}>
            {repos.map((r) => <option key={r.full_name} value={r.full_name}>{r.full_name}</option>)}
          </select>
        ) : (
          <>
            <input aria-label="Repository (owner/repo)" placeholder="owner/repo" value={repo} onChange={(e) => setRepo(e.target.value)} className={`${field} min-w-0 flex-1`} />
            <input aria-label="Branch" placeholder="main" value={branch} onChange={(e) => setBranch(e.target.value)} className={`${field} w-32`} />
          </>
        )}
        {ok
          ? <ButtonLink href={href} target="_blank" rel="noreferrer" variant="primary">Open on GitHub ↗</ButtonLink>
          : <Button variant="primary" disabled className="opacity-50">Open on GitHub ↗</Button>}
      </div>
      <p className="mt-2 text-[13px]/5 text-zinc-400">
        GitHub opens a new file, <code>.github/workflows/cronkick-{slug}.yml</code>, on {branch.trim() || 'the default branch'}. Commit it, or pick “create a new branch” to review it as a PR.
        {repos ? ' Only repositories Cronkick is installed on are listed.' : ' Cronkick must be installed on the repository.'} If the editor opens empty, copy the workflow below and paste it in.
      </p>
    </div>
  );
}

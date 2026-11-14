import type { Metadata } from 'next';
import Link from 'next/link';
import { Time } from '@/components/live';
import { ENGINE, RecipeCard } from '@/components/recipes';
import { canSee, requireInstallation } from '@/lib/access';
import { db } from '@/lib/db';
import { agentWorkflows, installationsFor } from '@/lib/data';
import { receiptLine } from '@/lib/live';
import { RECIPES } from '../../../../../src/recipes.ts';

export const dynamic = 'force-dynamic';

const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-10';
const link = 'font-medium text-white underline decoration-white/30 hover:decoration-white';
const AGENT: Record<string, string> = { ...ENGINE, 'gh-aw': 'GitHub Agentic Workflows' };

export async function generateMetadata({ params }: { params: Promise<{ installationId: string }> }): Promise<Metadata> {
  const id = Number((await params).installationId);
  const inst = (await canSee(id)) ? (await installationsFor(db, [id]))[0] : null;
  return { title: inst ? `Recipes · ${inst.account_login}` : 'Recipes' };
}

/** The account's agent workflows with what each last did, then the recipes to add. Adding happens on /recipes/<slug>. */
export default async function Recipes({ params }: { params: Promise<{ installationId: string }> }) {
  const id = Number((await params).installationId);
  const s = await requireInstallation(id, `/dashboard/${id}/recipes`);
  const inst = (await installationsFor(db, s.installs)).find((i) => i.id === id)!;
  const mine = await agentWorkflows(db, id);
  const reposWith = (slug: string) => mine.filter((w) => w.path === `.github/workflows/cronkick-${slug}.yml`).map((w) => w.repo);

  return (
    <div className={`${container} space-y-10 pt-8 pb-16 sm:pt-10`}>
      <header className="max-w-2xl space-y-1">
        <p className="text-[13px]/5 text-zinc-400">{inst.account_login}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Agent recipes</h1>
        <p className="text-base/7 text-pretty text-zinc-400 sm:text-sm/6">
          Scheduled Claude Code and Codex workflows that run in your own GitHub Actions, with your own key. Each run reports what it did and what it cost. <Link href="/docs/recipes" className={link}>How recipes work</Link>
        </p>
      </header>

      <section aria-labelledby="yours">
        <h2 id="yours" className="text-base/6 font-semibold">Agent workflows <span className="font-normal text-zinc-400">· {mine.length}</span></h2>
        {mine.length ? (
          <ul role="list" className="mt-3 divide-y divide-white/5 rounded-xl inset-ring inset-ring-white/10">
            {mine.map((w) => {
              const line = receiptLine(w.receipt);
              return (
                <li key={w.id} className="grid gap-x-6 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <Link href={`/dashboard/${id}/workflows/${w.id}`} className="block truncate text-base/6 font-medium hover:underline sm:text-sm/6">{w.name}</Link>
                    <p className="truncate text-[13px]/5 text-zinc-400">{w.repo} · {AGENT[w.agent] ?? w.agent}</p>
                  </div>
                  <p className="min-w-0 text-[13px]/5 text-zinc-400 sm:text-right">
                    {!line ? <span className="text-zinc-500">No receipt yet</span>
                      : line.url ? <a href={line.url} target="_blank" rel="noreferrer" className="text-zinc-200 hover:text-white hover:underline">{line.text}</a>
                      : <span className="text-zinc-200">{line.text}</span>}
                    {w.receiptAt && <> · <Time iso={w.receiptAt} clock date /></>}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-xl px-4 py-4 text-base/7 text-pretty text-zinc-300 inset-ring inset-ring-white/10 sm:text-sm/6">
            None of {inst.account_login}’s workflows runs an agent yet. Add a recipe below; it shows up here after you commit it.
          </p>
        )}
      </section>

      <section aria-labelledby="add">
        <h2 id="add" className="text-base/6 font-semibold">Add a recipe</h2>
        <ul role="list" className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {RECIPES.map((r) => {
            const repos = reposWith(r.slug);
            return <li key={r.slug}><RecipeCard r={r} added={repos.length ? `In ${repos.join(', ')}` : undefined} /></li>;
          })}
        </ul>
      </section>
    </div>
  );
}

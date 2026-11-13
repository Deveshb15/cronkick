import type { Metadata } from 'next';
import Link from 'next/link';
import { Cards, prose } from '@/components/docs';
import { container, SiteFooter, SiteHeader } from '@/components/site';
import { RECIPES } from '../../../src/recipes.ts';

export const metadata: Metadata = {
  title: 'Agent recipes',
  description: 'Scheduled AI agent workflows for your own GitHub Actions: issue triage, dependency upgrades, docs fixes, flaky test reports and PR digests, sent on time by Cronkick.',
};

export default function Recipes() {
  return (
    <>
      <SiteHeader />
      <main className={`${container} pt-12 pb-24`}>
        <div className={`mx-auto max-w-3xl ${prose}`}>
          <p className="font-mono text-xs/5 tracking-wider text-brand-400 uppercase">Recipes</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-pretty text-white sm:text-4xl">Agent recipes</h1>
          <p className="mt-4 text-lg/8 text-pretty text-zinc-400">
            Workflows that run Claude Code or Codex on a schedule, in your own GitHub Actions, with your own API key. Cronkick sends each run on time and never twice;
            a check before the agent skips runs with nothing to do, and every run reports back what it did and what it cost.
          </p>
          <Cards items={RECIPES.map((r) => ({ href: `/recipes/${r.slug}`, title: r.title, body: r.blurb }))} />
          <p>How they avoid duplicate PRs, what they can and can’t do, and how API keys work: <Link href="/docs/recipes">Agent recipes in the docs</Link>.</p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

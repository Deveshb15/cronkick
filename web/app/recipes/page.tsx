import type { Metadata } from 'next';
import Link from 'next/link';
import { RecipeCard, RunSteps } from '@/components/recipes';
import { SplitHeading } from '@/components/section';
import { container, SiteFooter, SiteHeader } from '@/components/site';
import { Eyebrow } from '@/components/ui';
import { appSlug } from '@/lib/format';
import { RECIPES } from '../../../src/recipes.ts';

export const metadata: Metadata = {
  title: 'Agent recipes',
  description: 'Scheduled Claude Code and Codex workflows for your own GitHub Actions: issue triage, dependency upgrades, docs fixes, flaky test reports and PR digests, sent on time by Cronkick.',
};

export default function Recipes() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className={container}>
            <Eyebrow>Agent recipes</Eyebrow>
            <h1 className="mt-4 max-w-[24ch] text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">Scheduled agents that run on time, once</h1>
            <p className="mt-6 max-w-[48ch] text-lg text-pretty text-zinc-400">
              Workflows that run Claude Code or Codex in your own GitHub Actions, with your own API key. Cronkick starts each run on time and never twice, and every run reports what it did and what it cost.
            </p>
          </div>
        </section>

        <section className="pb-24 sm:pb-32">
          <div className={container}>
            <h2 className="sr-only">Recipes</h2>
            <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RECIPES.map((r) => (
                <li key={r.slug}><RecipeCard r={r} /></li>
              ))}
              <li>
                <Link href="/docs/migrate" className="group flex h-full flex-col rounded-2xl p-6 outline-1 -outline-offset-1 outline-white/15 outline-dashed hover:bg-white/[0.02] hover:outline-white/30">
                  <p className="text-base/6 font-medium text-zinc-400 sm:text-sm/6">Bring your own</p>
                  <h3 className="mt-5 text-lg/7 font-semibold text-white group-hover:text-brand-300 sm:text-base/7">Already run an agent on <span className="font-mono">schedule:</span>?</h3>
                  <p className="mt-2 flex-1 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">Swap the schedule for one marker line and Cronkick fires the workflow you already have, on time. Add <span className="font-mono text-zinc-300">{appSlug()}</span> to the agent action’s allowed bots.</p>
                  <p className="mt-6 flex items-center justify-between gap-x-4 border-t border-white/5 pt-4 text-base/6 text-zinc-300 sm:text-sm/6">
                    Moving from schedule:
                    <span aria-hidden="true" className="text-zinc-500 group-hover:text-white">→</span>
                  </p>
                </Link>
              </li>
            </ul>
          </div>
        </section>

        <section className="border-t border-white/5 py-24 sm:py-32">
          <div className={container}>
            <SplitHeading eyebrow="Every recipe" title="Built so a schedule can’t burn you">
              <p>Scheduled agents go wrong in three ways: a run that never happens, the same PR opened twice, and a green check that did nothing. Each recipe is built against all three.</p>
            </SplitHeading>
            <RunSteps output="One PR, issue, comment or message" className="mt-14 sm:grid-cols-2 lg:grid-cols-4" />
            <p className="mt-12 text-base/7 text-zinc-400 sm:text-sm/6">
              <Link href="/docs/recipes" className="font-medium text-white hover:underline">How recipes avoid duplicates, and API key or subscription →</Link>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

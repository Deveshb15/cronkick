import { ArrowLeftIcon } from '@heroicons/react/16/solid';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AddToRepo } from '@/components/add-to-repo';
import { H2 } from '@/components/docs';
import { ENGINE, EngineBadge, RunSteps, WorkflowFile } from '@/components/recipes';
import { container, SiteFooter, SiteHeader } from '@/components/site';
import { Code } from '@/components/ui';
import { db } from '@/lib/db';
import { installUrl } from '@/lib/format';
import { humanCron } from '@/lib/live';
import { getSession } from '@/lib/session';
import { RECIPES } from '../../../../src/recipes.ts';

const find = (slug: string) => RECIPES.find((r) => r.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = find((await params).slug);
  return r ? { title: `${r.title} · Agent recipes`, description: `${r.blurb} Runs ${ENGINE[r.engine]} in your own GitHub Actions, sent on time by Cronkick.` } : { title: 'Recipe' };
}

const SECRETS: Record<string, ReactNode> = {
  ANTHROPIC_API_KEY: <>An Anthropic API key. On a personal repository you can use your Claude subscription instead: run <Code>claude setup-token</Code>, save it as <Code>CLAUDE_CODE_OAUTH_TOKEN</Code>, and swap in the commented line.</>,
  OPENAI_API_KEY: 'An OpenAI API key.',
  SLACK_WEBHOOK_URL: 'A Slack incoming webhook for the channel that gets the digest. Only the step that posts can read it.',
};

const body = 'text-base/7 text-pretty text-zinc-400';

/** Term and detail rows on the page background, split by hairlines. */
function Rows({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="mt-6 divide-y divide-white/5 border-t border-white/5">
      {rows.map(([term, detail], i) => (
        <div key={i} className="grid gap-1 py-4 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
          <dt className="font-mono text-base/7 font-medium text-white sm:text-sm/7">{term}</dt>
          <dd className={`${body} sm:text-sm/7`}>{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const r = find((await params).slug);
  if (!r) notFound();
  const s = await getSession();
  const repos = s ? (await db.query(
    `SELECT r.full_name, r.default_branch FROM repos r JOIN installations i ON i.id = r.installation_id
      WHERE i.id = ANY($1) AND r.active AND NOT i.removed ORDER BY r.full_name`, [s.installs],
  )).rows : null;
  const prs = 'pull-requests: write' in r.permissions;
  const schedule = `${humanCron(r.defaultCron)} ${r.defaultTz}`;

  return (
    <>
      <SiteHeader />
      <main className="pt-10 pb-24 sm:pt-14">
        <div className={container}>
          <Link href="/recipes" className="inline-flex items-center gap-x-1.5 text-base/6 text-zinc-400 hover:text-white sm:text-sm/6">
            <ArrowLeftIcon aria-hidden="true" className="size-4 shrink-0 fill-current" />Agent recipes
          </Link>

          <div className="mt-8 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <header className="lg:col-start-1">
              <EngineBadge engine={r.engine} />
              <h1 className="mt-4 max-w-[30ch] text-4xl font-semibold tracking-tight text-balance text-white sm:text-5xl">{r.title}</h1>
              <p className="mt-6 max-w-[48ch] text-lg text-pretty text-zinc-400">{r.blurb}</p>
              <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
                {[['Schedule', schedule], ['Leaves behind', r.output], ['Needs', r.secrets.join(', ')]].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-base/6 text-zinc-500 sm:text-sm/6">{k}</dt>
                    <dd className={`mt-1 text-base/6 font-medium text-white ${k === 'Needs' ? 'font-mono sm:text-sm/6' : ''}`}>{v}</dd>
                  </div>
                ))}
              </dl>
            </header>

            {/* Second in the markup so it sits under the header on a phone; beside everything on a wide screen. */}
            <aside className="lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
              <AddToRepo slug={r.slug} yaml={r.yaml} repos={repos} secrets={r.secrets} prs={prs} schedule={schedule} installHref={installUrl()} />
            </aside>

            <div className="min-w-0 lg:col-start-1 [&>h2:first-child]:mt-0">
              <H2 id="each-run">What each run does</H2>
              <RunSteps output={r.output} className="mt-6 sm:grid-cols-2" />

              <H2 id="secrets">Secrets</H2>
              <p className={`mt-3 ${body}`}>Repository secrets stay in GitHub and are only used on your runners. Cronkick never sees them.</p>
              <Rows rows={r.secrets.map((x): [ReactNode, ReactNode] => [x, SECRETS[x]])} />

              <H2 id="permissions">Permissions</H2>
              <p className={`mt-3 ${body}`}>What the workflow’s own token may do, and why. Cronkick’s GitHub App permissions don’t change.</p>
              <Rows rows={Object.entries(r.permissions).map(([p, why]): [ReactNode, ReactNode] => [p, why])} />

              <H2 id="worst-case">Limits and worst case</H2>
              <p className={`mt-3 max-w-[65ch] ${body}`}>{r.worstCase}</p>
              {prs && (
                <p className={`mt-4 max-w-[65ch] ${body}`}>
                  PRs opened with the workflow’s <Code>GITHUB_TOKEN</Code> don’t start your other workflows, so CI won’t run on the draft by itself. Close and reopen it, or push to it.
                </p>
              )}

              <H2 id="stop">How to stop it</H2>
              <p className={`mt-3 max-w-[65ch] ${body}`}>
                Delete the <Code># cronkick:</Code> line and commit. Cronkick stops sending it right away, and you can still run it by hand from the Actions tab. Delete the file to remove it completely.
              </p>
            </div>
          </div>

          <section id="workflow" className="mt-20 scroll-mt-24">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <h2 className="text-xl/8 font-semibold tracking-tight text-white">The workflow</h2>
              <Link href="/docs/recipes" className="text-base/6 font-medium text-zinc-400 hover:text-white sm:text-sm/6">How recipes avoid duplicates →</Link>
            </div>
            <div className="mt-6"><WorkflowFile filename={`.github/workflows/cronkick-${r.slug}.yml`} yaml={r.yaml} /></div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

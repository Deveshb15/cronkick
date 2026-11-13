import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToRepo } from '@/components/add-to-repo';
import { Callout, Code, H2, prose, Terms } from '@/components/docs';
import { container, SiteFooter, SiteHeader } from '@/components/site';
import { db } from '@/lib/db';
import { humanCron } from '@/lib/live';
import { getSession } from '@/lib/session';
import { RECIPES } from '../../../../src/recipes.ts';

const find = (slug: string) => RECIPES.find((r) => r.slug === slug);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = find((await params).slug);
  return r ? { title: `${r.title} · Agent recipes`, description: r.blurb } : { title: 'Recipe' };
}

const SECRETS: Record<string, React.ReactNode> = {
  ANTHROPIC_API_KEY: <>An Anthropic API key. On a personal repo you can use your Claude subscription instead: run <code>claude setup-token</code>, save it as <code>CLAUDE_CODE_OAUTH_TOKEN</code>, and swap the commented line in.</>,
  OPENAI_API_KEY: 'An OpenAI API key.',
  SLACK_WEBHOOK_URL: 'A Slack incoming webhook URL for the channel that gets the digest. Only the posting step sees it.',
};

export default async function RecipePage({ params }: { params: Promise<{ slug: string }> }) {
  const r = find((await params).slug);
  if (!r) notFound();
  const s = await getSession();
  const repos = s ? (await db.query(
    `SELECT r.full_name, r.default_branch FROM repos r JOIN installations i ON i.id = r.installation_id
      WHERE i.id = ANY($1) AND r.active AND NOT i.removed ORDER BY r.full_name`, [s.installs],
  )).rows : null;
  const writesPrs = 'pull-requests: write' in r.permissions;
  return (
    <>
      <SiteHeader />
      <main className={`${container} pt-12 pb-24`}>
        <article className={`mx-auto max-w-3xl ${prose}`}>
          <p className="font-mono text-xs/5 tracking-wider text-brand-400 uppercase"><Link href="/recipes" className="plain hover:text-brand-300">Agent recipes</Link></p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-pretty text-white sm:text-4xl">{r.title}</h1>
          <p className="mt-4 text-lg/8 text-pretty text-zinc-400">{r.blurb}</p>
          <Terms rows={[
            ['Agent', r.engine === 'claude' ? <>Claude Code, through <code>anthropics/claude-code-action@v1</code></> : <>Codex, through <code>openai/codex-action@v1</code></>],
            ['Schedule', <>{humanCron(r.defaultCron)} {r.defaultTz} (<code>{r.defaultCron}</code>). Change the marker line to move it.</>],
            ['Runs on', 'Your GitHub Actions runners, with your secrets. Cronkick only sends the trigger.'],
          ]} />
          <AddToRepo slug={r.slug} yaml={r.yaml} repos={repos} />

          <H2 id="what-it-does">What each run does</H2>
          <ol>
            <li><strong>Checks first, without the agent.</strong> A shell step decides whether there’s anything to do and skips the run otherwise, so a quiet day costs no tokens.</li>
            <li><strong>Runs the agent</strong> with a turn cap, a time cap and only the tools it needs. The agent never pushes, labels or posts.</li>
            <li><strong>Applies the result</strong> in a plain shell step: {writesPrs ? 'one draft PR on a cronkick/… branch' : r.slug === 'pr-digest' ? 'one Slack message' : r.slug === 'flaky-tests' ? 'one rolling issue' : 'labels and comments on the new issues'}, tagged <code>cronkick:{r.slug}</code>.</li>
            <li><strong>Sends a receipt</strong> to Cronkick, shown on the run in your history: what it did, turns and cost.</li>
          </ol>

          <H2 id="secrets">Secrets</H2>
          <p>Add these under the repository’s Settings → Secrets and variables → Actions. They stay in GitHub; Cronkick never sees them.</p>
          <Terms rows={r.secrets.map((x): [React.ReactNode, React.ReactNode] => [<code key={x}>{x}</code>, SECRETS[x]])} />

          <H2 id="permissions">Permissions, and why</H2>
          <Terms rows={Object.entries(r.permissions).map(([p, why]): [React.ReactNode, React.ReactNode] => [<code key={p}>{p}</code>, why])} />
          {writesPrs && (
            <Callout title="Two GitHub settings to know">
              <p>Turn on “Allow GitHub Actions to create and approve pull requests” (Settings → Actions → General), or the PR step fails.</p>
              <p>PRs opened with the workflow’s <code>GITHUB_TOKEN</code> don’t start your other workflows, so CI won’t run on them by itself. Close and reopen the draft, or push to it, to run CI.</p>
            </Callout>
          )}

          <H2 id="worst-case">Worst case</H2>
          <p>{r.worstCase}</p>

          <H2 id="stop">How to stop it</H2>
          <p>Delete the <code># cronkick:</code> line and push. Cronkick stops sending it right away; you can still run it by hand from the Actions tab. Delete the file to remove it completely.</p>

          <H2 id="workflow">The workflow</H2>
          <Code title={`.github/workflows/cronkick-${r.slug}.yml`}>{r.yaml}</Code>
          <p>More on how recipes avoid duplicates and what the receipt contains: <Link href="/docs/recipes">Agent recipes in the docs</Link>.</p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

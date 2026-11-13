import Link from 'next/link';
import { Callout, Code, Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';
import { appSlug } from '@/lib/format';

export const metadata = docMeta('/docs/recipes');

// Keep in sync with src/recipes.ts (the workflows) and src/receipts.ts (what a receipt may contain).
export default function Recipes() {
  const bot = `${appSlug()}[bot]`;
  return (
    <Doc href="/docs/recipes">
      <H2 id="how">How recipes work</H2>
      <p>A recipe is one ordinary workflow file you commit, with a Cronkick marker under <code>workflow_dispatch:</code>. It runs Claude Code or Codex on your own runners, with your own API key, and counts as one schedule on your plan. Pick one from <Link href="/recipes">the recipes page</Link>: “Add to a repo” opens GitHub’s new-file page with it filled in, or copy the YAML.</p>
      <p>Every recipe has the same four steps:</p>
      <ol>
        <li><strong><code>check</code></strong>: a shell step that decides whether to run, using only <code>gh</code> and <code>git</code>, so a skipped run spends no tokens.</li>
        <li><strong><code>agent</code></strong>: the agent, with a turn cap, a 30-minute job timeout and a short list of allowed tools. It edits files or writes its answer; it never pushes, labels or posts.</li>
        <li><strong><code>apply</code></strong>: a shell step that turns the agent’s output into one draft PR, one issue, labels and comments, or a Slack message.</li>
        <li><strong>Receipt</strong>: tells Cronkick what happened. It never fails the job.</li>
      </ol>

      <H2 id="never-twice">How recipes avoid duplicates</H2>
      <p>Cronkick sends each scheduled run once, and never resends one GitHub didn’t confirm (<Link href="/docs/timing">Timing and retries</Link>). The workflow adds its own layers:</p>
      <Terms rows={[
        ['Concurrency', <>Every recipe sets <code>concurrency: cronkick-&lt;recipe&gt;</code> with <code>cancel-in-progress: false</code>, so a manual run waits for a scheduled one instead of overlapping it.</>],
        ['Wait', <>If a PR or issue labelled <code>cronkick:&lt;recipe&gt;</code> is still open, the run is skipped until you merge or close it. The flaky-tests recipe updates its one open issue instead.</>],
        ['Once per period', <>Each run has a key: the UTC date for daily recipes, the ISO week (<code>2026-W46</code>) for weekly ones. PR recipes work on branch <code>cronkick/&lt;recipe&gt;/&lt;key&gt;</code> and skip if it exists. Issue triage labels each issue it handled; the digest records a cache entry once it has posted.</>],
        ['Nothing new', 'No new issues, no outdated dependencies, no commits, no failed runs or no merged PRs in the window: skipped.'],
      ]} />
      <p>Everything a recipe opens is labelled <code>cronkick:&lt;recipe&gt;</code>, and its body ends with <code>&lt;!-- cronkick:&lt;recipe&gt;:&lt;key&gt; --&gt;</code>. PRs are always drafts.</p>

      <H2 id="bot">Runs come from {bot}</H2>
      <p>Runs Cronkick starts have <code>{bot}</code> as their actor. Both agent actions refuse bot-started runs unless they’re allowed, so recipes include <code>allowed_bots: {appSlug()}</code> (Claude) or <code>allow-bot-users: {bot}</code> (Codex). They also pass the workflow’s own <code>github_token</code> to the Claude action, so it doesn’t need to exchange a token for the Claude GitHub App.</p>

      <H2 id="keys">API key or subscription</H2>
      <p>Recipes use an API key by default: <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code>, saved as a repository secret. On a personal repository, for your own use, the Claude recipes can use your Claude subscription instead: run <code>claude setup-token</code>, save the token as <code>CLAUDE_CODE_OAUTH_TOKEN</code>, and swap in the commented line:</p>
      <Code>{`anthropic_api_key: \${{ secrets.ANTHROPIC_API_KEY }}
# Or a Claude subscription (personal repos, your own usage): claude_code_oauth_token: \${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`}</Code>
      <p>Use an API key on organization repositories, where other people’s issues and PRs drive the agent. Codex recipes need an OpenAI API key; OpenAI recommends against ChatGPT sign-in in CI.</p>
      <Callout title="Cronkick never touches your keys">
        <p>Keys and tokens live only in your repository’s secrets and are used only on your runners. Cronkick sends the trigger and receives the receipt; it never sees, stores or forwards a model key or token.</p>
      </Callout>

      <H2 id="caps">Cost and time caps</H2>
      <p>Every job has <code>timeout-minutes: 30</code>. Claude recipes pass <code>--max-turns</code> and <code>--max-budget-usd</code> (for example 30 turns and $3). The budget is an estimate made by the client and can be passed a little; on a subscription it isn’t money, but the turn cap still limits use. Codex has no turn or budget option, so its recipe relies on the timeout. Cronkick shows the cost each run reports; it doesn’t enforce budgets.</p>

      <H2 id="github-settings">GitHub settings for PR recipes</H2>
      <ul>
        <li>Turn on <strong>Allow GitHub Actions to create and approve pull requests</strong> (Settings → Actions → General → Workflow permissions), or the PR step fails.</li>
        <li>PRs and pushes made with the workflow’s <code>GITHUB_TOKEN</code> don’t start other workflows. CI won’t run on a recipe’s draft PR until you close and reopen it or push to it.</li>
      </ul>

      <H2 id="receipts">Receipts</H2>
      <p>The last step asks GitHub for an Actions OIDC token made out to Cronkick and posts a small JSON body to <code>/receipts</code>. Cronkick checks the token’s signature against GitHub’s published keys, its issuer, audience and expiry, and keeps the receipt only if a run Cronkick sent in that same repository has that run id. The first receipt for a run wins. It holds only:</p>
      <Terms rows={[
        [<code key="o">outcome</code>, <>One of <code>pr</code>, <code>issue</code>, <code>comment</code>, <code>message</code>, <code>skipped</code>, <code>noop</code>, <code>failed</code>.</>],
        [<code key="u">url</code>, 'Optional. A github.com link inside that repository.'],
        [<code key="r">reason</code>, 'Optional. Why it skipped, up to 200 characters.'],
        [<code key="t">turns, cost_usd</code>, 'Optional. From the Claude action’s log; Codex reports neither.'],
        [<code key="n">recipe, engine</code>, 'Which recipe and agent sent it.'],
      ]} />
      <p>Your history shows it on the run: “Opened PR · $0.84 · 22 turns”, “Skipped: open PR waiting for review” or “No changes”. To stop sending receipts, delete the last step and <code>id-token: write</code>.</p>

      <H2 id="stop">Stopping a recipe</H2>
      <p>Delete the <code># cronkick:</code> line and push; Cronkick stops sending it right away.</p>
    </Doc>
  );
}

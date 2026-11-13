import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/security');

// What the grant allows: GitHub's "Permissions required for GitHub Apps" (docs.github.com/en/rest/authentication/permissions-required-for-github-apps).
// What Cronkick calls: keep in sync with src/github.ts (listScheduledRuns and the Rescue reads too), web/app/callback/route.ts and src/probe/collector.ts.
export default function Security() {
  return (
    <Doc href="/docs/security">
      <H2 id="permissions">Permissions</H2>
      <p>You install Cronkick on the repositories you choose. In those repositories it asks for:</p>
      <Terms rows={[
        ['Actions', 'Read and write'],
        ['Checks', 'Read (for Rescue: GitHub’s own error message on a failed job; optional, Rescue works without it)'],
        ['Contents', 'Read'],
        ['Metadata', 'Read (every GitHub App gets it)'],
      ]} />
      <p>Cronkick uses GitHub App tokens that GitHub issues for one hour at a time. You never need a personal access token.</p>

      <H2 id="what-they-allow">What these permissions allow</H2>
      <p>GitHub grants each permission as a whole, not only the parts Cronkick uses. In the repositories you select:</p>
      <Terms rows={[
        ['Contents: read', 'Read any file, commit, branch and release, and download the code as an archive.'],
        ['Checks: read', 'Read check runs and check suites, and their annotations (the messages GitHub and other tools attach to a run).'],
        ['Actions: read', 'Read workflows, runs, jobs, logs and artifacts.'],
        ['Actions: write', <>Start any workflow that has a <code>workflow_dispatch:</code> trigger, on any branch or tag, with any values for its inputs; that run gets the workflow’s secrets and its <code>GITHUB_TOKEN</code>. Also cancel, re-run and delete runs, delete logs, artifacts and caches, approve runs from outside contributors’ pull requests, enable or disable workflows, and change the repository’s OIDC subject claim settings.</>],
      ]} />
      <p>Neither permission lets the app read secret values (GitHub puts those under a separate Secrets permission, which Cronkick doesn’t ask for), push commits or change files. A workflow the app starts still runs with its own secrets and permissions.</p>
      <p>If Cronkick’s app key were stolen, someone could do what the table above allows in the repositories you selected, including starting any deploy or release workflow that has <code>workflow_dispatch:</code>, with its secrets, on any branch or tag. Selecting only the repositories that need schedules keeps that small.</p>

      <H2 id="calls">What Cronkick calls</H2>
      <p>With the access you grant, Cronkick makes only these calls, plus GitHub’s installation-token exchange (<code>POST /app/installations/…/access_tokens</code>), which turns the app’s key into the one-hour token:</p>
      <Terms rows={[
        [<code key="1">GET /app/installations</code>, 'List the accounts the app is installed on (a daily check).'],
        [<code key="2">GET /installation/repositories</code>, 'List the repositories you selected.'],
        [<code key="3">GET /repos/…/actions/workflows</code>, 'List the workflows in a repository.'],
        [<code key="4">GET /repos/…/contents/…</code>, 'Read a workflow file to find markers.'],
        [<code key="5">POST /repos/…/actions/workflows/…/dispatches</code>, 'Start a workflow at its scheduled time.'],
        [<code key="6">GET /repos/…/actions/workflows/…/runs</code>, 'For a workflow still on GitHub’s own schedule, list the runs GitHub’s scheduler started, to show you how it ran.'],
        [<code key="7">GET /repos/…/actions/runs/…/attempts/…/jobs</code>, <>Rescue: list the jobs of a failed run (names, step results, runner labels and times) to tell whether GitHub broke it. <a href="/docs/rescue">How Rescue decides</a></>],
        [<code key="8">GET /repos/…/check-runs/…/annotations</code>, 'Rescue: read GitHub’s own error message on a failed job. Only after you approve Checks: read; without it Rescue uses the job list alone.'],
        [<code key="9">GET /repos/…/actions/runs?status=failure</code>, 'Rescue: once an hour, in repositories with Cronkick schedules, list the last 2 hours of failed runs, in case a webhook was lost.'],
        [<code key="10">GET /repos/…/actions/runs/…</code>, 'Rescue: check a run’s attempt before and after re-running it.'],
        [<code key="11">POST /repos/…/actions/runs/…/rerun-failed-jobs</code>, <>Rescue, Pro and Team only, off until you turn it on per workflow: re-run once the failed jobs of a run Cronkick started that GitHub never gave a runner. <a href="/docs/rescue#re-run">When it re-runs</a></>],
      ]} />
      <p>Run results come to Cronkick from GitHub’s <code>push</code> and <code>workflow_run</code> webhooks. The scheduled-runs list above is read once an hour, and only for workflows still on GitHub’s schedule, to confirm what those webhooks said.</p>
      <p>Rescue also reads the metadata of failed runs Cronkick didn’t start, in the repositories you selected: job and step names, results, runner labels and times. It stores only the verdict, the job names and, when one matched, GitHub’s own error string (at most 300 characters). It never downloads or stores logs. Turn it off under Settings → Rescue.</p>
      <p>Two other kinds of call don’t use the app’s access to your repositories:</p>
      <ul>
        <li><strong>Sign-in.</strong> GitHub’s sign-in gives Cronkick a token for you. It calls <code>GET /user</code> and <code>GET /user/installations</code> to see which accounts you can open, then discards the token.</li>
        <li><strong>The lateness probe.</strong> Cronkick reads the scheduled runs of its own probe repositories (<code>GET /repos/…/actions/runs</code>) with a separate token, to measure GitHub’s scheduler. That token is never used on your repositories.</li>
      </ul>

      <p><strong>Run receipts.</strong> <a href="/docs/recipes#receipts">Agent recipes</a> end with a step that posts a receipt to <code>https://cronkick.xyz/receipts</code>, signed with a GitHub Actions OIDC token made out to Cronkick. To check it, Cronkick fetches GitHub’s public signing keys from <code>token.actions.githubusercontent.com/.well-known/jwks</code> (cached for an hour). It keeps a receipt only when the token is valid and the run is one Cronkick sent in that same repository, and never stores the token.</p>
      <H2 id="what-it-doesnt-do">What Cronkick doesn’t do</H2>
      <p>Cronkick doesn’t read secret values, push commits or edit workflow files. It only starts workflows you marked. Those workflows run with their own secrets and permissions, exactly as they would on GitHub’s schedule, so whatever a workflow can do when it runs, it can still do when Cronkick starts it.</p>

      <H2 id="data">What we store, and where</H2>
      <p>Repository and workflow names, the <code># cronkick</code> lines Cronkick reads (and the crons of a leftover <code>schedule:</code> block, to suggest the switch), compatibility warnings, the history of each scheduled run, and for each failed run Rescue looked at: its run id, workflow name, commit SHA, branch, job names, verdict and the GitHub error string that matched. A warning can name a workflow input or give a YAML parser’s error message with its line number; it never copies the file’s lines. We don’t store your code, the rest of your workflow files, or your workflow logs. Data lives on DigitalOcean in the United States. Details and every company that processes data for us are in the <a href="/privacy">privacy policy</a>. Who runs Cronkick is on the <a href="/about">about page</a>.</p>

      <p>Agent recipes add two things. For each workflow, a flag saying whether it uses an agent action (<code>claude</code>, <code>codex</code> or <code>gh-aw</code>), found in the file text Cronkick already reads; it isn’t shown anywhere and helps us size the recipes work. For runs that send a receipt: its outcome (PR, issue, comment, message, skipped, no changes or failed), an optional github.com link in that repository, an optional reason of up to 200 characters, the turn count and cost the run reported, the recipe and agent names, and when it arrived. Cronkick never sees or stores model API keys or subscription tokens: those stay in your repository’s secrets.</p>
      <H2 id="stopping">Stopping and revoking</H2>
      <p>Remove a marker line to stop one schedule. To revoke access, uninstall the GitHub App, or remove repositories from it, under GitHub Apps in your account or organization settings; nothing is triggered after that. To move workflows back first, see <a href="/docs/migrate#go-back">Go back to GitHub’s scheduler</a>.</p>

      <H2 id="reporting">Reporting a security issue</H2>
      <p>Email <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>. The same address is in <a href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>
    </Doc>
  );
}

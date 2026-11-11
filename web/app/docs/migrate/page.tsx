import { Callout, Code, Doc, H2 } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/migrate');

export default function Migrate() {
  return (
    <Doc href="/docs/migrate">
      <H2 id="the-change">The change</H2>
      <p>Replace the <code>schedule:</code> block with <code>workflow_dispatch:</code> plus a marker holding the same cron. Keep your other triggers as they are.</p>
      <Code title="Before">{`on:
  push:
    branches: [main]
  schedule:
    - cron: "0 3 * * *"`}</Code>
      <Code title="After">{`on:
  push:
    branches: [main]
  workflow_dispatch:
  # cronkick: "0 3 * * *"`}</Code>
      <Callout tone="warn" title="Remove schedule:">
        <p>If both stayed, GitHub would run its own scheduled copy too, and the job would run twice. So Cronkick marks such a workflow <strong>Needs a fix</strong> and doesn’t send it until <code>schedule:</code> is gone.</p>
      </Callout>

      <H2 id="from-the-dashboard">From the dashboard</H2>
      <p>Your dashboard lists every workflow still on <code>schedule:</code>, with the exact lines to change and a link to edit the file on GitHub. If a cron runs faster than your plan allows, it offers a version that fits.</p>
      <p>To leave a workflow on GitHub’s scheduler, choose <strong>Keep it on GitHub</strong>. It moves to a hidden list, and you can show it again any time.</p>

      <H2 id="check-your-workflow">Check what the workflow reads</H2>
      <p>A dispatched run has <code>github.event_name == &apos;workflow_dispatch&apos;</code> and no <code>github.event.schedule</code>. If a step relies on either, see <a href="/docs/checks">Compatibility checks</a>.</p>

      <H2 id="go-back">Go back to GitHub’s scheduler</H2>
      <p>Your workflows keep <code>workflow_dispatch:</code>, so leaving takes one commit per workflow. If Cronkick is down there is no automatic fallback, so this is also what to do if you can’t wait for it.</p>
      <ol>
        <li>Put the cron from the marker back under <code>schedule:</code>. A marker with <code>tz=</code> becomes a <code>timezone:</code> line; without one, both run in UTC.</li>
        <li>Delete the <code># cronkick</code> line in the same commit, and push to the default branch.</li>
        <li>When every workflow is moved, uninstall the GitHub App (or remove the repositories from it) in your GitHub settings.</li>
      </ol>
      <Code title="Before">{`on:
  workflow_dispatch:
  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin`}</Code>
      <Code title="After">{`on:
  workflow_dispatch:
  schedule:
    - cron: "0 9 * * 1-5"
      timezone: "Europe/Berlin"`}</Code>
      <Callout tone="warn" title="Don’t keep both">
        <p>Remove the marker in the same commit that adds <code>schedule:</code>. Both together would run the job twice, so while the app is installed Cronkick stops sending a workflow that has both and marks it <strong>Needs a fix</strong>.</p>
      </Callout>
    </Doc>
  );
}

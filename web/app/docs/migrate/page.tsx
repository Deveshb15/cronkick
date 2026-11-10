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
        <p>If both stay, GitHub still runs its own scheduled copy, late, and the job runs twice. Cronkick marks such a workflow <strong>Needs a fix</strong> until <code>schedule:</code> is gone.</p>
      </Callout>

      <H2 id="from-the-dashboard">From the dashboard</H2>
      <p>Your dashboard lists every workflow still on <code>schedule:</code>, with the exact lines to change and a link to edit the file on GitHub. If a cron runs faster than your plan allows, it offers a version that fits.</p>
      <p>To leave a workflow on GitHub’s scheduler, choose <strong>Keep it on GitHub</strong>. It moves to a hidden list, and you can show it again any time.</p>

      <H2 id="check-your-workflow">Check what the workflow reads</H2>
      <p>A dispatched run has <code>github.event_name == &apos;workflow_dispatch&apos;</code> and no <code>github.event.schedule</code>. If a step relies on either, see <a href="/docs/checks">Compatibility checks</a>.</p>
    </Doc>
  );
}

import { Callout, Code, Doc, H2 } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/quickstart');

export default function QuickStart() {
  return (
    <Doc href="/docs/quickstart">
      <H2 id="install">1. Install the GitHub App</H2>
      <p><a href="https://github.com/apps/cronkick/installations/new">Install Cronkick</a> and pick the repositories it can see. You can change the list later in your GitHub settings.</p>

      <H2 id="add-the-marker">2. Add the marker</H2>
      <p>In the workflow file, add <code>workflow_dispatch:</code> under <code>on:</code>, and a <code># cronkick</code> comment with your cron right below it.</p>
      <Code title=".github/workflows/nightly.yml">{`on:
  workflow_dispatch:
  # cronkick: "0 3 * * *"
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: echo "on time"`}</Code>
      <Callout title="Already using schedule:?">
        <p>Remove the <code>schedule:</code> block in the same commit, or GitHub runs the workflow a second time, late. See <a href="/docs/migrate">Moving from schedule:</a>.</p>
      </Callout>

      <H2 id="push">3. Push to the default branch</H2>
      <p>Cronkick reads the file within seconds. Open your <a href="/dashboard">dashboard</a>: the workflow shows up with its next scheduled time. The example above first runs at the next 03:00 UTC. If something in the workflow would break a dispatched run, it shows <strong>Needs a fix</strong> with the reason instead.</p>
    </Doc>
  );
}

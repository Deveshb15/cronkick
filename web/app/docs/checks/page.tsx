import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/checks');

// Keep in sync with src/compat.ts.
export default function Checks() {
  return (
    <Doc href="/docs/checks">
      <p>A workflow that fails any of these checks is marked <strong>Needs a fix</strong> on your dashboard and isn’t triggered until you push a fix. The dashboard names the exact problem.</p>

      <H2 id="checks">Checks and fixes</H2>
      <Terms rows={[
        ['No workflow_dispatch', <>Add <code>workflow_dispatch:</code> under <code>on:</code>. Cronkick can only start workflows through it.</>],
        ['Required input', <>Give every <code>workflow_dispatch</code> input a <code>default</code>, or make it optional. Cronkick sends no inputs.</>],
        ['schedule: still there', <>Remove the <code>schedule:</code> block, or GitHub runs the workflow a second time. See <a href="/docs/migrate">Moving from schedule:</a>.</>],
        ['Reads the schedule event', <>The workflow uses <code>github.event.schedule</code> or checks <code>github.event_name == &apos;schedule&apos;</code>. Both are different in a dispatched run; check for <code>workflow_dispatch</code> instead.</>],
        ['Too fast for the plan', <>The cron runs more often than your plan allows. Slow it down, or see <a href="/docs/plans">Plans and limits</a>.</>],
        ['Can’t be read', <>The marker or the cron has a typo. Compare it with <a href="/docs/marker">the marker syntax</a>.</>],
      ]} />
    </Doc>
  );
}

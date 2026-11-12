import { Callout, Doc, H2 } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/timing');

// Keep in sync with src/dispatcher.ts, src/maintenance.ts and web/lib/data.ts (COUNTS_SQL).
export default function Timing() {
  return (
    <Doc href="/docs/timing">
      <H2 id="how-fast">How fast runs are sent</H2>
      <p>Cronkick aims to send each run within 30 seconds of its scheduled time. You can see the send delay of each run on your dashboard, and what we’ve measured of GitHub’s own scheduler on the <a href="/lateness">lateness page</a>.</p>
      <p>Runs due exactly on the hour are spread over 0–15 seconds per workflow, so thousands of workflows don’t hit GitHub in the same instant.</p>

      <H2 id="on-time">What counts as on time</H2>
      <p>A run is <strong>on time</strong> when GitHub accepted the request within 30 seconds of its scheduled time. The clock stops at the send that succeeded, not the first try: a run whose first try failed and whose retry got through 2 minutes later counts as late.</p>
      <p>Before 2026-11-11 the dashboard counted from the first try, so a few older runs may have moved from on time to late.</p>

      <H2 id="when-github-fails">When GitHub fails</H2>
      <p>If GitHub is down, throttling or returning errors, Cronkick retries until the slot’s deadline: 5 minutes after its time, or the next scheduled time if that’s sooner. After the deadline it gives up rather than run late, and the slot shows <strong>Gave up</strong>.</p>
      <p>If GitHub refuses the request (for example, the workflow or branch no longer exists), retrying won’t help, so Cronkick stops. The slot shows <strong>Refused</strong> with GitHub’s reason.</p>

      <H2 id="unclear">When the outcome is unclear</H2>
      <p>If a request’s outcome is unclear, for example a timeout after GitHub may already have received it, Cronkick does not send it again. The slot shows <strong>Unconfirmed</strong>.</p>
      <Callout title="Why not just retry?">
        <p>A deploy or a billing job running twice is usually worse than one run missing. You’ll see it on the dashboard, and Pro and Team email you if you’ve added an alert address.</p>
      </Callout>

      <H2 id="cronkick-down">When Cronkick is down</H2>
      <p>Cronkick plans each run up to 2 hours ahead. If it stops and comes back:</p>
      <ul>
        <li>After a restart Cronkick may still send a run if its deadline hasn’t passed, so it may show as late. After the deadline it gives up rather than run it late, and the run shows as <strong>Gave up</strong>, with the note “Cronkick didn’t send it before its deadline”.</li>
        <li>If planning stopped for more than 2 hours, the outage is recorded as one window, from the last planning pass to when planning resumed. Runs due then may not have been sent; any that were sent are listed in the history. The window shows as a banner on your dashboard and workflow history, and neither the overview nor the workflow page shows an on-time verdict while the window is in the last 24 hours.</li>
        <li>Pro and Team accounts with an alert address get one email per outage window, plus a summary of the runs Cronkick didn’t send, at most one an hour, not an email per run.</li>
      </ul>
      <p>There is no automatic fallback to GitHub’s scheduler. To move a workflow back, see <a href="/docs/migrate#go-back">Go back to GitHub’s scheduler</a>.</p>
      <Callout title="Limits">
        <p>Windows are recorded from Cronkick’s first deploy with this feature onward, so earlier outages don’t appear. A window covers every account: it says Cronkick wasn’t planning, not which of your runs would have been due or which were sent.</p>
      </Callout>

      <H2 id="after-sending">After sending</H2>
      <p>Once GitHub accepts the request, the job waits in GitHub’s own queue for a runner. Your dashboard shows that wait separately (“GitHub started the run 4 s later”), so you can tell Cronkick’s part from GitHub’s.</p>
    </Doc>
  );
}

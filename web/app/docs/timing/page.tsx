import { Callout, Doc, H2 } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/timing');

// Keep in sync with src/dispatcher.ts and src/maintenance.ts.
export default function Timing() {
  return (
    <Doc href="/docs/timing">
      <H2 id="how-fast">How fast runs are sent</H2>
      <p>Cronkick aims to send each run within 30 seconds of its scheduled time; typically it’s well under a second. You can see the exact delay of every run on your dashboard, and our public comparison with GitHub on the <a href="/lateness">lateness page</a>.</p>
      <p>Runs due exactly on the hour are spread over 0–15 seconds per workflow, so thousands of workflows don’t hit GitHub in the same instant.</p>

      <H2 id="when-github-fails">When GitHub fails</H2>
      <p>If GitHub is down or rate-limits the request, Cronkick retries until the slot’s deadline: 5 minutes after its time, or the next scheduled time if that’s sooner. After the deadline it gives up rather than run late, and the slot shows <strong>Gave up</strong>.</p>

      <H2 id="never-twice">Never twice</H2>
      <p>If a request’s outcome is unclear, for example a timeout after GitHub may already have received it, Cronkick does not send it again. The slot shows <strong>Unconfirmed</strong>.</p>
      <Callout title="Why not just retry?">
        <p>A deploy or a billing job running twice is usually worse than one run missing. You’ll see it on the dashboard, and Pro emails you.</p>
      </Callout>

      <H2 id="after-sending">After sending</H2>
      <p>Once GitHub accepts the request, the job waits in GitHub’s own queue for a runner. Your dashboard shows that wait separately (“runner started 4 s later”), so you can tell Cronkick’s part from GitHub’s.</p>
    </Doc>
  );
}

import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/statuses');

// Keep in sync with SLOT_LABEL / SLOT_HELP in web/components/ui.tsx.
export default function Statuses() {
  return (
    <Doc href="/docs/statuses">
      <H2 id="runs">Each run</H2>
      <p>Every scheduled time on your dashboard has one of these statuses. It describes Cronkick’s part: getting the run started.</p>
      <Terms rows={[
        ['Due', 'The scheduled time is coming up.'],
        ['Sending', 'Cronkick is asking GitHub to start the run right now.'],
        ['Started', 'GitHub created the run. It links to the run on GitHub.'],
        ['Sent', 'GitHub accepted the request; the run isn’t linked yet.'],
        ['Unconfirmed', 'Cronkick sent it but couldn’t confirm GitHub got it, so it didn’t resend.'],
        ['Gave up', 'GitHub kept failing until the deadline, so Cronkick skipped this run rather than start it late.'],
        ['Skipped', 'Not sent, because the schedule was paused or changed.'],
      ]} />

      <H2 id="job-result">The job’s result</H2>
      <p>The job’s own result (passed, failed, cancelled) is shown next to the status, exactly as GitHub reports it. A run can be started on time by Cronkick and still fail in your job.</p>

      <H2 id="workflows">Each workflow</H2>
      <Terms rows={[
        ['Active', 'Cronkick triggers it on schedule.'],
        ['Needs a fix', <>Something would break a dispatched run. See <a key="c" href="/docs/checks">Compatibility checks</a>.</>],
        ['Paused', 'Over your plan’s schedule limit. The newest schedules pause first.'],
      ]} />
    </Doc>
  );
}

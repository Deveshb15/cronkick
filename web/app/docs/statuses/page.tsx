import { Doc, H2, Terms } from '@/components/docs';
import { SLOT_HELP, SLOT_LABEL } from '@/components/ui';
import type { SlotDisplay } from '@/lib/data';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/statuses');

// Words and meanings come from the dashboard itself (SLOT_LABEL / SLOT_HELP in web/components/ui.tsx).
const RUNS: SlotDisplay[] = ['pending', 'waiting', 'overdue', 'accepted', 'fired', 'unknown', 'rejected', 'expired', 'skipped'];

export default function Statuses() {
  return (
    <Doc href="/docs/statuses">
      <H2 id="runs">Each run</H2>
      <p>Each planned run on your dashboard has one of these statuses. It describes Cronkick’s part: getting the run started.</p>
      <Terms rows={RUNS.map((s) => [SLOT_LABEL[s], SLOT_HELP[s]])} />
      <p>A run counts as <strong>on time</strong> when GitHub accepted the request within 30 seconds of its scheduled time. See <a href="/docs/timing">Timing and retries</a>.</p>

      <H2 id="outages">Cronkick outages</H2>
      <p>Cronkick plans runs up to 2 hours ahead. A planned run that Cronkick didn’t send before its deadline shows as <strong>{SLOT_LABEL.expired}</strong> with the note “Cronkick didn’t send it before its deadline”.</p>
      <p>If Cronkick’s scheduler stops for more than 2 hours, the dashboard shows one outage window, from its last planning pass to when planning resumed, rather than inventing a row per missed time. Runs due then may not have been sent; any that were sent are listed in the history. See <a href="/docs/timing#cronkick-down">When Cronkick is down</a>.</p>

      <H2 id="job-result">The run’s result</H2>
      <p>The GitHub run’s own result (passed, failed, cancelled) is shown next to the status, exactly as GitHub reports it. A run can be started on time by Cronkick and still fail on GitHub.</p>

      <H2 id="workflows">Each workflow</H2>
      <Terms rows={[
        ['Active', 'Cronkick triggers it on schedule.'],
        ['Needs a fix', <>Something would break a dispatched run. See <a key="c" href="/docs/checks">Compatibility checks</a>.</>],
        ['Paused', <>Over your plan’s schedule limit. See <a key="p" href="/docs/plans#over-the-limit">which schedules pause</a>.</>],
      ]} />
    </Doc>
  );
}

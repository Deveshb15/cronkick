import { Code, Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/marker');

// Keep in sync with src/markers.ts.
export default function Marker() {
  return (
    <Doc href="/docs/marker">
      <H2 id="syntax">Syntax</H2>
      <Code>{`# cronkick: "<cron>" [tz=<IANA time zone>]`}</Code>
      <Terms rows={[
        [<code key="c">cron</code>, 'The usual 5 fields: minute, hour, day of month, month, day of week. In double quotes.'],
        [<code key="t">tz=</code>, <>Optional. Any IANA time zone, such as <code>Europe/Berlin</code> or <code>America/New_York</code>. Without it, the cron runs in UTC.</>],
      ]} />
      <p>The marker is a YAML comment, so GitHub ignores it. Put it anywhere in the file; the convention is its own line right under <code>workflow_dispatch:</code>.</p>

      <H2 id="examples">Examples</H2>
      <Code title="Weekdays at 09:00 Berlin time">{`on:
  workflow_dispatch:
  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin`}</Code>
      <Code title="Every 15 minutes">{`on:
  workflow_dispatch:
  # cronkick: "*/15 * * * *"`}</Code>

      <H2 id="several-schedules">Several schedules</H2>
      <p>Add one marker line per schedule. Each line counts as one schedule on your plan. Schedules due at the same moment trigger the workflow once.</p>
      <Code>{`on:
  workflow_dispatch:
  # cronkick: "0 6 * * 1-5" tz=America/New_York
  # cronkick: "0 12 * * 6,0" tz=America/New_York`}</Code>

      <H2 id="daylight-saving">Daylight saving time</H2>
      <p>With a <code>tz=</code>, times follow the local clock. When the clock skips an hour, a run in the skipped hour fires once at the first valid time. When the clock repeats an hour, it runs once.</p>
    </Doc>
  );
}

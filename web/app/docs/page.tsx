import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';
import { PLANS } from '../../../src/plans.ts';

export const metadata: Metadata = { title: 'Docs', description: 'How to schedule GitHub Actions workflows with Cronkick.' };

// Keep in sync with src/markers.ts (syntax), src/compat.ts (checks), src/plans.ts (limits) and src/dispatcher.ts (timing).
export default function Docs() {
  const free = PLANS.free;
  const pro = PLANS.pro;
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Docs</h1>
        <p>Cronkick triggers your GitHub Actions workflows on schedule through <code>workflow_dispatch</code>, instead of relying on GitHub’s best-effort <code>schedule:</code> trigger. Your jobs still run on your runners, exactly as before.</p>

        <h2>Quick start</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5">
          <li><a href="https://github.com/apps/cronkick/installations/new">Install the GitHub App</a> and pick the repositories it can see.</li>
          <li>In a workflow file, add <code>workflow_dispatch:</code> under <code>on:</code> and a <code># cronkick</code> comment with your cron.</li>
          <li>Push to the default branch. Cronkick reads the file within seconds; the workflow shows up as Active on your dashboard.</li>
        </ol>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-zinc-900 p-4 font-mono text-sm/6 text-zinc-200">{`on:
  workflow_dispatch:
  # cronkick: "0 3 * * *"
jobs:
  nightly:
    runs-on: ubuntu-latest
    steps:
      - run: echo "on time"`}</pre>

        <h2>The marker</h2>
        <ul>
          <li>Syntax: <code># cronkick: "&lt;cron&gt;"</code>, optionally followed by <code>tz=&lt;IANA time zone&gt;</code>, for example <code># cronkick: "0 9 * * 1-5" tz=Europe/Berlin</code>.</li>
          <li>The cron has the usual 5 fields (minute, hour, day of month, month, day of week). Without <code>tz=</code> it runs in UTC.</li>
          <li>Put it anywhere in the file as a comment. The convention is its own line right under <code>workflow_dispatch:</code>.</li>
          <li>Several schedules: add several marker lines. Schedules due at the same moment trigger once.</li>
          <li>Daylight saving: in a time zone that skips an hour, a run in the skipped hour fires once at the first valid time.</li>
        </ul>

        <h2>Moving from <code>schedule:</code></h2>
        <p>Replace the <code>schedule:</code> block with <code>workflow_dispatch:</code> plus a marker holding the same cron, and keep your other triggers. Remove <code>schedule:</code>: if both stay, GitHub runs the workflow a second time, late. Your dashboard lists every workflow still on <code>schedule:</code> with the exact lines to change; use “Keep it on GitHub” to hide one you don’t want to move.</p>

        <h2>What Cronkick checks before turning a workflow on</h2>
        <p>A workflow with any of these is marked “Needs a fix” and isn’t triggered until you fix it:</p>
        <ul>
          <li><code>workflow_dispatch:</code> is missing.</li>
          <li>A <code>workflow_dispatch</code> input is required and has no default.</li>
          <li><code>schedule:</code> is still present.</li>
          <li>The workflow reads <code>github.event.schedule</code>, or checks <code>github.event_name == 'schedule'</code>; both differ for dispatched runs.</li>
          <li>The schedules run more often than your plan allows.</li>
          <li>The marker or cron can’t be parsed.</li>
        </ul>

        <h2>Timing</h2>
        <ul>
          <li>Cronkick aims to send each run within 30 seconds of its scheduled time; typically it’s well under a second.</li>
          <li>Runs due exactly on the hour are spread over 0–15 seconds per workflow, to avoid the top-of-hour rush.</li>
          <li>If GitHub is down or rate-limits us, Cronkick retries until the slot’s deadline: 5 minutes after its time, or the next scheduled time if that’s sooner. After that it gives up rather than run late.</li>
          <li>If a request’s outcome is unclear (for example a timeout), Cronkick does not resend it, so a workflow never runs twice for one slot.</li>
        </ul>

        <h2>What the statuses mean</h2>
        <ul>
          <li><strong>Started</strong>: GitHub created the run.</li>
          <li><strong>Sent</strong>: GitHub accepted the request; the run isn’t linked yet.</li>
          <li><strong>Unconfirmed</strong>: Cronkick sent it but couldn’t confirm GitHub got it, so it didn’t resend.</li>
          <li><strong>Gave up</strong>: GitHub kept failing until the deadline, so Cronkick skipped the slot.</li>
          <li><strong>Skipped</strong>: not sent because the schedule was paused or changed.</li>
          <li>The job’s own result (passed, failed) is shown separately, as GitHub reports it.</li>
        </ul>

        <h2>Plans</h2>
        <ul>
          <li><strong>Free</strong>: unlimited repositories, {free.schedules} schedules, every {free.floorMinutes} minutes or slower, {free.historyDays} days of history.</li>
          <li><strong>Pro</strong> ($9/month or $90/year per account): {pro.schedules} schedules, every {pro.floorMinutes} minutes or slower, {pro.historyDays} days of history, email alerts for missed and failed runs.</li>
          <li>Each marker line is one schedule. Over the limit, the newest schedules pause and we email you; nothing is ever charged for going over.</li>
        </ul>

        <h2>Permissions and security</h2>
        <ul>
          <li>The app asks for Actions (read and write) to start runs, Contents (read) to read workflow files, and Metadata (read).</li>
          <li>It uses short-lived GitHub App tokens. No personal access token is ever needed.</li>
          <li>It doesn’t store your code. Details in the <a href="/privacy">privacy policy</a>.</li>
        </ul>

        <h2>Stopping</h2>
        <p>Remove the marker line to stop one schedule, or uninstall the GitHub App to stop everything at once. Questions: <a href="/support">support</a>.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

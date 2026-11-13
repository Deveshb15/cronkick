import type { ReactNode } from 'react';
import { Callout, Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/rescue');

// Keep the strings in sync with the patterns in src/rescue.ts.
const S = ({ children }: { children: ReactNode }) => <code>{children}</code>;

export default function Rescue() {
  return (
    <Doc href="/docs/rescue">
      <H2 id="what">What Rescue does</H2>
      <p>When a workflow run fails in a repository Cronkick can see, Cronkick reads the run’s job list from GitHub and decides whether GitHub’s infrastructure broke it, or whether it failed for a reason in your code, configuration or account. Each account with an alert address gets a weekly email, “GitHub broke N of your runs this week”, and the <strong>Rescue</strong> page in the dashboard lists every run it looked at. Every plan gets this.</p>
      <p>By default Rescue only reports. On Pro and Team it can also re-run, once, a run Cronkick started that GitHub never gave a runner; that is off until you turn it on for the account and for each workflow. It never cancels anything. Settings → Rescue turns it off, to report only, or to re-run once.</p>

      <H2 id="what-it-reads">What it reads and keeps</H2>
      <p>For each failed run: the jobs’ names, results, steps, runner labels and times. If you approved <strong>Checks: read</strong>, also GitHub’s annotations on the jobs that look like GitHub’s fault, which hold GitHub’s own error message. Cronkick keeps only its verdict, the job names and, when one matched, the GitHub string below that matched (at most 300 characters). It never downloads or stores logs, and it ignores runs from forks.</p>

      <H2 id="verdicts">Verdicts</H2>
      <Terms rows={[
        ['GitHub broke it', 'Every failed job either never got a runner, or failed in a setup step because a GitHub service errored. Only these count as “GitHub broke” in the email.'],
        ['Probably GitHub', 'Every failed job looks like GitHub’s side, but at least one is unconfirmed: the runner was lost mid-job, or a job never got a runner and Cronkick couldn’t read GitHub’s message.'],
        ['Didn’t start, likely GitHub', 'The run failed with no jobs at all.'],
        ['Partly GitHub, partly the run', 'Some failed jobs look like GitHub’s side and others don’t.'],
        ['Not GitHub’s infrastructure', 'Nothing points at GitHub: a test or build step failed, a timeout, a quota or a configuration problem.'],
        ['GitHub billing lock', 'GitHub refused to start the job because of the account’s billing. Not counted as GitHub breaking it.'],
        ['Self-hosted runner', 'A job ran, or was meant to run, on your own runner. Not counted.'],
      ]} />

      <H2 id="classes">How each job is classed</H2>
      <p>Each failed or cancelled job is checked against these rules in order; the first that matches wins.</p>
      <Terms rows={[
        ['Billing', <>An annotation contains <S>account is locked due to a billing issue</S>, <S>recent account payments have failed</S> or <S>spending limit needs to be increased</S>.</>],
        ['Self-hosted', <>The job’s labels include <S>self-hosted</S>, it ran in a runner group other than GitHub’s default, or an annotation contains <S>Runner of type self-hosted</S>, <S>self-hosted runner lost communication</S> or <S>no enabled runners online</S>. Larger GitHub-hosted runners in a named group are counted here too.</>],
        ['Timeout', <>The job’s result is <S>timed_out</S>, or an annotation contains <S>has exceeded the maximum execution time of</S>.</>],
        ['Retired runner image', <>An annotation reads <S>The configuration ‘…’ is not supported</S>: the workflow asks for a runner image GitHub no longer offers.</>],
        ['Quota or configuration', <><S>Artifact storage quota has been hit</S>, <S>Cache service responded with 400</S>, <S>Unable to resolve action … unable to find version</S>, <S>Invalid workflow file</S>, <S>No space left on device</S> or <S>Unable to locate executable file</S>.</>],
        ['Never got a runner', <>A GitHub-hosted job ended with no steps and no runner, and an annotation reads <S>The job was not acquired by Runner of type hosted</S>, <S>GitHub Actions has encountered an internal error when running your job</S>, or exactly <S>Internal server error.</S> (optionally with a correlation ID).</>],
        ['Never got a runner (unconfirmed)', 'The same job shape, but Cronkick couldn’t read annotations, and the job ended 10 to 30 minutes after it was created. GitHub gives up on a queued job after about 15 minutes; billing locks and retired images end within seconds.'],
        ['Runner lost', <>A GitHub-hosted job that had started steps, with <S>The hosted runner lost communication with the server</S>, <S>The runner has received a shutdown signal</S> or <S>GitHub Actions has encountered an internal error when running your job</S>. GitHub’s message says a workflow that starves the runner can cause this too, so it only counts as “probably GitHub”.</>],
        ['GitHub service error', <>The failing step is <S>Set up job</S>, <S>Run actions/checkout</S>, <S>Run actions/upload-artifact</S>, <S>Run actions/download-artifact</S>, <S>Run actions/cache</S> or a <S>Run actions/setup-…</S> step, and an annotation contains <S>Failed to resolve action download info. Error: Service Unavailable</S> (or <S>Internal Server Error</S>, <S>Bad Gateway</S>, <S>The SSL connection could not be established</S>), <S>Failed to CreateArtifact: Unable to make request: ETIMEDOUT</S> (or FinalizeArtifact, GetSignedArtifactURL, ListArtifacts; ENOTFOUND, ECONNRESET), <S>Cache service responded with 5xx</S>, <S>The requested URL returned error: 500</S> (502, 503, 504), <S>RPC failed</S>, <S>expected ‘packfile’</S> or <S>Failed to connect to github.com port 443</S>.</>],
        ['Anything else', 'Not GitHub’s infrastructure.'],
      ]} />

      <H2 id="checks-read">Checks: read</H2>
      <p>GitHub keeps its error messages in check-run annotations, which need the <strong>Checks: read</strong> permission. Without it Rescue still works from the job list alone, so a job that never got a runner shows as “Probably GitHub”, not “GitHub broke it”.</p>

      <H2 id="stuck">Stuck runs</H2>
      <p>A run Cronkick sent that GitHub accepted over an hour ago but never started is listed as stuck, on the Rescue page and in the weekly email. Cronkick doesn’t cancel it; you can, on GitHub.</p>

      <H2 id="re-run">When Rescue re-runs</H2>
      <p>Rescue re-runs a run’s failed jobs, and every job that depends on them, at the same commit, using GitHub’s <strong>Re-run failed jobs</strong>. It does so only when all of these hold, and the Rescue page shows the first one that didn’t:</p>
      <ol>
        <li>The account is on Pro or Team, Settings → Rescue is set to <strong>Re-run once</strong>, and Checks: read is approved.</li>
        <li>You turned re-runs on for that workflow, and it has no blockers: no job with <code>environment:</code>, no job-level <code>uses:</code> (a reusable workflow), and no <code>pull_request_target</code> trigger.</li>
        <li>Cronkick started the run.</li>
        <li>It is the run’s first attempt, and Rescue hasn’t acted on it before.</li>
        <li>Every failed job never got a runner, and GitHub said so.</li>
        <li>Every failed job was meant for a GitHub-hosted runner.</li>
        <li>No other job got a runner and ran a step after the broken job ended (a re-run would run it twice).</li>
        <li>No newer run of the same schedule has started, and the next one isn’t due within 10 minutes.</li>
        <li>No more than 10 re-runs today for the account, and Cronkick-wide limits aren’t reached.</li>
      </ol>
      <p>Rescue waits 5 minutes after the run ends, and longer while githubstatus.com reports an Actions incident, but never past the next scheduled run. Before sending it checks everything again. It sends the re-run once. If GitHub’s answer is lost, it doesn’t send it again; you see “answer lost” on the Rescue page. With an alert address set, you get one email saying what was re-run and how attempt 2 ended.</p>
      <Callout title="Only turn it on for jobs that are safe to run twice">A re-run starts the failed jobs again from the beginning. A job that deploys, publishes, sends messages or charges money may do it twice.</Callout>
    </Doc>
  );
}

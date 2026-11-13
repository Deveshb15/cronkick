import * as Sentry from '@sentry/node';
import type { Db } from './db.ts';
import type { Deps } from './deps.ts';
import { RerunTimeout, type Annotation, type DispatchResult, type FailedRun, type Job } from './github.ts';
import { isPaid, type PlanName } from './plans.ts';
import { emitPostHogWorkerLog } from './posthog.ts';

// Cronkick Rescue: classify failed runs as GitHub's fault or not and report it; behind three switches, re-run the
// failed jobs of a run GitHub broke, once. Never cancels anything.

export type Verdict = 'github_broke' | 'probably_github' | 'mixed' | 'user' | 'billing' | 'self_hosted' | 'not_started';
export type JobClass = 'billing' | 'self_hosted' | 'timeout' | 'runner_config' | 'quota_or_config'
  | 'no_runner' | 'no_runner_unconfirmed' | 'runner_lost' | 'service_5xx' | 'unknown';
export type ClassifiedJob = { id: number; name: string; class: JobClass; hosted: boolean; matched: string | null };
export type Classification = { verdict: Verdict; jobs: ClassifiedJob[]; would_rerun: boolean; skip_reason: string | null };
export type ClassifyInput = {
  run: { conclusion: string; attempt: number; event: string; slotId: number | null };
  jobs: Job[];
  /** Annotations per job id. A missing entry or null: not available (no Checks: read), so only metadata counts. */
  annotations: Record<number, Annotation[] | null | undefined>;
};

// The exact strings GitHub writes; /docs/rescue lists them, keep the two in sync.
const BILLING = [/account is locked due to a billing issue/i, /recent account payments have failed/i, /spending limit needs to be increased/i];
const SELF_HOSTED = [/Runner of type self-hosted/, /self-hosted runner lost communication/i, /no enabled runners online/i];
const TIMEOUT = [/has exceeded the maximum execution time of/];
const RUNNER_CONFIG = [/The configuration '.*' is not supported/];
const QUOTA = [/Artifact storage quota has been hit/, /Cache service responded with 400/, /Unable to resolve action .*unable to find version/i,
  /Invalid workflow file/i, /No space left on device/, /Unable to locate executable file/];
const NO_RUNNER = [/The job was not acquired by Runner of type hosted/, /GitHub Actions has encountered an internal error when running your job/,
  /^Internal server error\.( Correlation ID: [0-9a-f-]{36})?$/];
const RUNNER_LOST = [/The hosted runner lost communication with the server/, /The runner has received a shutdown signal/,
  /GitHub Actions has encountered an internal error when running your job/];
const SETUP_STEP = /^(Set up job|Run actions\/checkout|Run actions\/(upload|download)-artifact|Run actions\/cache|Run actions\/setup-)/;
const SERVICE_5XX = [/Failed to resolve action download info\. Error: (Service Unavailable|Internal Server Error|Bad Gateway|The SSL connection could not be established)/,
  /Failed to (CreateArtifact|FinalizeArtifact|GetSignedArtifactURL|ListArtifacts): Unable to make request: (ETIMEDOUT|ENOTFOUND|ECONNRESET)/,
  /Cache service responded with 5\d\d/, /The requested URL returned error: 50[0234]/, /RPC failed/, /expected 'packfile'/, /Failed to connect to github\.com port 443/];
const INFRA: JobClass[] = ['no_runner', 'no_runner_unconfirmed', 'runner_lost', 'service_5xx'];

const FAILED = new Set(['failure', 'cancelled', 'timed_out']);
const MIN = 60_000;

/** The part of a GitHub annotation that matched, and nothing else of it (≤300 chars). */
function match(res: RegExp[], ann: Annotation[] | null): string | null {
  for (const a of ann ?? []) for (const re of res) {
    const m = re.exec(a.message.trim());
    if (m) return m[0].slice(0, 300);
  }
  return null;
}

// GitHub-hosted runners sit in group 0; larger hosted runners in a named group are treated as self-hosted (never re-run).
const isHosted = (j: Job) => !j.labels.some((l) => l.toLowerCase() === 'self-hosted') && !j.runnerGroupId;

/** Never got a runner: no step ran and no runner was assigned. */
const noRunnerShape = (j: Job, runConclusion: string) =>
  (j.conclusion === 'cancelled' || j.conclusion === 'failure') && j.steps.length === 0 && !j.runnerId
  && (runConclusion === 'failure' || runConclusion === 'cancelled');

function classifyJob(j: Job, runConclusion: string, ann: Annotation[] | null): ClassifiedJob {
  const hosted = isHosted(j);
  const out = (c: JobClass, matched: string | null = null): ClassifiedJob => ({ id: j.id, name: j.name, class: c, hosted, matched });
  let m: string | null;
  if ((m = match(BILLING, ann))) return out('billing', m);
  if (!hosted) return out('self_hosted');
  if ((m = match(SELF_HOSTED, ann))) return out('self_hosted', m);
  if (j.conclusion === 'timed_out') return out('timeout');
  if ((m = match(TIMEOUT, ann))) return out('timeout', m);
  if ((m = match(RUNNER_CONFIG, ann))) return out('runner_config', m);
  if ((m = match(QUOTA, ann))) return out('quota_or_config', m);
  if (noRunnerShape(j, runConclusion)) {
    if ((m = match(NO_RUNNER, ann))) return out('no_runner', m);
    // GitHub gives up on a queued job after ~15 min; billing locks and retired images end within seconds.
    const waited = j.completedAt && j.createdAt ? j.completedAt.getTime() - j.createdAt.getTime() : -1;
    if (ann === null && waited >= 10 * MIN && waited <= 30 * MIN) return out('no_runner_unconfirmed');
  }
  if (j.steps.length > 0 && (m = match(RUNNER_LOST, ann))) return out('runner_lost', m);
  const failing = j.steps.find((s) => s.conclusion === 'failure');
  if (failing && SETUP_STEP.test(failing.name) && (m = match(SERVICE_5XX, ann))) return out('service_5xx', m);
  return out('unknown');
}

/** Was this failed run GitHub's fault? Pure: first matching rule per failed job, then one verdict for the run. */
export function classify({ run, jobs, annotations }: ClassifyInput): Classification {
  const classed = jobs.filter((j) => FAILED.has(j.conclusion ?? '')).map((j) => classifyJob(j, run.conclusion, annotations[j.id] ?? null));
  const has = (cs: JobClass[]) => classed.some((j) => cs.includes(j.class));
  const all = (cs: JobClass[]) => classed.length > 0 && classed.every((j) => cs.includes(j.class));
  const verdict: Verdict =
    jobs.length === 0 && (run.conclusion === 'failure' || run.conclusion === 'startup_failure') ? 'not_started'
    : has(['billing']) ? 'billing'
    : has(['self_hosted']) ? 'self_hosted'
    : all(['no_runner', 'service_5xx']) ? 'github_broke'
    : all(INFRA) ? 'probably_github' // not all R1/R4, so at least one R1m or R3
    : has(INFRA) ? 'mixed'
    : 'user';
  // The re-run rules this evidence alone decides (3 to 6); rerunSkip adds the settings, dependents and timing.
  const skip = evidenceSkip(run, verdict, classed);
  return { verdict, jobs: classed, would_rerun: skip === null, skip_reason: skip };
}

/** Rules 3 to 6: a run Cronkick started, its first attempt, nothing but jobs that never got a GitHub-hosted runner. */
function evidenceSkip(run: ClassifyInput['run'] & { earlierAction?: boolean }, verdict: Verdict, jobs: ClassifiedJob[]): string | null {
  if (run.event !== 'workflow_dispatch' || run.slotId === null) return 'Only runs Cronkick started are re-run.';
  if (run.attempt !== 1) return `Already a re-run (attempt ${run.attempt}).`;
  if (run.earlierAction) return 'Rescue already acted on this run.';
  if (verdict !== 'github_broke') return 'Only runs GitHub never gave a runner are re-run.';
  // ponytail: setup-step service errors (R4) stay report-only until their re-run safety is reviewed.
  if (!jobs.every((j) => j.class === 'no_runner')) return 'GitHub service errors during setup aren’t re-run yet.';
  if (!jobs.every((j) => j.hosted)) return 'Self-hosted runners are never re-run.';
  return null;
}

/**
 * Rule 7: re-running failed jobs also re-runs every job that depends on them. If any job got a runner and ran a step
 * after the first broken job ended (a gate or notify job with `if: always()`), it would run twice.
 */
export function dependentsRan(jobs: Job[], broken: number[]): boolean {
  const ends = jobs.filter((j) => broken.includes(j.id) && j.completedAt).map((j) => j.completedAt!.getTime());
  if (!ends.length) return false;
  const first = Math.min(...ends);
  return jobs.some((j) => !broken.includes(j.id) && j.startedAt && j.startedAt.getTime() >= first
    && j.steps.some((s) => s.conclusion !== null && s.conclusion !== 'skipped'));
}

export const RERUNS_PER_INSTALL_DAY = 10;
export const RERUNS_PER_PLATFORM_HOUR = 100;
const NEXT_SLOT_GAP_MS = 10 * 60_000;

export type RerunContext = {
  rerunOn: boolean;
  inst: { plan: PlanName; rescue_mode: string; checks_read: boolean; removed: boolean; suspended: boolean };
  workflow: { rescue_rerun: boolean; rescue_blockers: string[] } | null;
  run: ClassifyInput['run'] & { earlierAction: boolean };
  c: Pick<Classification, 'verdict' | 'jobs'>;
  jobs: Job[];
  /** A later slot of this workflow was already tried, and when the next pending one is due. */
  later: { fired: boolean; nextDue: Date | null };
  /** Re-runs in the last day for this installation, and in the last hour everywhere. */
  counts: { installDay: number; platformHour: number };
  now: Date;
};

/** All nine re-run rules, in order. Returns the first that fails, as the reason shown to the user, or null to re-run. */
export function rerunSkip(x: RerunContext): string | null {
  if (!isPaid(x.inst.plan)) return 'Re-runs are part of Pro and Team.';
  if (x.inst.rescue_mode !== 'rerun') return 'Re-run once is off for this account.';
  if (!x.rerunOn) return 'Re-runs are paused on Cronkick’s side.';
  if (!x.inst.checks_read) return 'Checks: read isn’t approved, so GitHub’s error can’t be confirmed.';
  if (x.inst.removed || x.inst.suspended) return 'The installation isn’t active.';
  if (!x.workflow?.rescue_rerun) return 'Re-run isn’t turned on for this workflow.';
  if (x.workflow.rescue_blockers.length) return `This workflow can’t be re-run: ${x.workflow.rescue_blockers[0]}`;
  const evidence = evidenceSkip(x.run, x.c.verdict, x.c.jobs);
  if (evidence) return evidence;
  if (dependentsRan(x.jobs, x.c.jobs.map((j) => j.id))) return 'A job that runs after the broken one already ran, so a re-run would run it twice.';
  if (x.later.fired) return 'A newer run of this schedule already started.';
  if (x.later.nextDue && x.later.nextDue.getTime() - x.now.getTime() <= NEXT_SLOT_GAP_MS) return 'The next scheduled run is due within 10 minutes.';
  if (x.counts.installDay >= RERUNS_PER_INSTALL_DAY) return `Already ${RERUNS_PER_INSTALL_DAY} re-runs today for this account.`;
  if (x.counts.platformHour >= RERUNS_PER_PLATFORM_HOUR) return BREAKER;
  return null;
}

/** Jobs whose metadata already looks like no runner (R1), a lost runner (R3) or a setup-step service error (R4). */
export function wantsAnnotations(j: Job): boolean {
  if (j.conclusion !== 'failure' && j.conclusion !== 'cancelled') return false;
  if (j.steps.length === 0) return true; // R1, or the billing/retired-image look-alikes that only the text tells apart
  const failing = j.steps.find((s) => s.conclusion === 'failure');
  return isHosted(j) && (!failing || SETUP_STEP.test(failing.name)); // a lost runner leaves no failed step
}

const QUEUED = new Set(['failure', 'startup_failure', 'cancelled']);

/** Queue a failed run for classification. No GitHub calls: this runs inside the webhook. Returns whether a row was added. */
export async function queueRun(db: Db, installationId: number, repoId: number, run: FailedRun, now: Date): Promise<boolean> {
  if (!QUEUED.has(run.conclusion ?? '')) return false;
  if (run.head_repository?.id !== repoId) return false; // a fork's code, not the account's
  const { rowCount } = await db.query(
    `INSERT INTO rescue_runs (installation_id, repo_id, workflow_id, workflow_name, run_id, run_attempt, run_url, event, head_sha, head_branch,
                              run_conclusion, completed_at, slot_id, next_check_at, created_at, updated_at)
     SELECT i.id, r.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, (SELECT id FROM slots WHERE workflow_id = $3 AND run_id = $5 LIMIT 1), $13, $13, $13
       FROM installations i JOIN repos r ON r.installation_id = i.id AND r.id = $2
      WHERE i.id = $1 AND NOT i.removed AND i.rescue_mode <> 'off'
     ON CONFLICT (run_id, run_attempt) DO NOTHING`,
    [installationId, repoId, run.workflow_id, run.name, run.id, run.run_attempt, run.html_url, run.event, run.head_sha, run.head_branch,
      run.conclusion, run.updated_at, now],
  );
  return rowCount === 1;
}

/** A `workflow_run` completed: record a re-run's result on the attempt it re-ran, and queue the run if it failed. */
export async function onRunCompleted(db: Db, installationId: number, repoId: number, run: FailedRun, now: Date): Promise<void> {
  if (run.run_attempt >= 2) {
    await db.query(
      `UPDATE rescue_runs SET retry_conclusion = $3, state = 'done', updated_at = $4
        WHERE run_id = $1 AND run_attempt = $2 - 1 AND state IN ('rerun_requested', 'rerun_started', 'rerun_unknown', 'rerun_vanished')`,
      [run.id, run.run_attempt, run.conclusion, now],
    );
  }
  await queueRun(db, installationId, repoId, run, now);
}

const LEASE_MS = 5 * MIN;
const BATCH = 20;
const RETRY_MS = 5 * MIN;
const MAX_ATTEMPTS = 5;
const LOW_RATE = 500; // leave the installation's API budget to dispatches

type Claimed = {
  id: number; installation_id: number; full_name: string; run_id: number; run_attempt: number; run_conclusion: string; event: string;
  slot_id: number | null; attempts: number; checks_read: boolean; plan: string; completed_at: Date; rerun_at: Date | null;
};

/**
 * Take due rows in `state` with a lease, like dispatcher.claim. SKIP LOCKED and the lease keep two servers off the same
 * row. Rescue off stops new classification only; a row already past it is still settled.
 */
async function claim(deps: Deps, state: 'queued' | 'rerun_waiting' | 'rerun_requested' = 'queued'): Promise<Claimed[]> {
  const now = deps.now();
  const { rows } = await deps.db.query<Claimed>(
    `WITH c AS (
       UPDATE rescue_runs SET lease_until = $2, attempts = attempts + 1, updated_at = $1
        WHERE id IN (
          SELECT x.id FROM rescue_runs x JOIN installations i ON i.id = x.installation_id
           WHERE x.state = $4 AND x.next_check_at <= $1 AND (x.lease_until IS NULL OR x.lease_until < $1)
             AND NOT i.removed AND NOT i.suspended AND ($4 <> 'queued' OR i.rescue_mode <> 'off')
           ORDER BY x.next_check_at LIMIT $3
           FOR UPDATE OF x SKIP LOCKED)
       RETURNING id, installation_id, repo_id, run_id, run_attempt, run_conclusion, event, slot_id, attempts, completed_at, rerun_at)
     SELECT c.*, r.full_name, i.checks_read, i.plan FROM c JOIN repos r ON r.id = c.repo_id JOIN installations i ON i.id = c.installation_id`,
    [now, new Date(now.getTime() + LEASE_MS), BATCH, state],
  );
  return rows;
}

/** Hand a row back untried (low rate limit): it keeps its attempts and is looked at again in 5 minutes. */
async function release(deps: Deps, r: Claimed): Promise<void> {
  await deps.db.query(
    `UPDATE rescue_runs SET lease_until = NULL, attempts = attempts - 1, next_check_at = $2 WHERE id = $1 AND state = 'queued'`,
    [r.id, new Date(deps.now().getTime() + RETRY_MS)],
  );
}

/** GitHub 5xx, throttling or no answer: try again in 5 minutes, at most 5 times. Anything else is final. */
async function failed(deps: Deps, r: Claimed, e: unknown): Promise<void> {
  const status = (e as { status?: unknown })?.status;
  const retry = typeof status !== 'number' || status >= 500 || status === 429;
  const note = `GitHub ${typeof status === 'number' ? status : 'error'}: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
  if (retry && r.attempts < MAX_ATTEMPTS) {
    await deps.db.query(`UPDATE rescue_runs SET next_check_at = $2, lease_until = NULL, skip_reason = $3, updated_at = $4 WHERE id = $1 AND state = 'queued'`,
      [r.id, new Date(deps.now().getTime() + RETRY_MS), note, deps.now()]);
  } else {
    await deps.db.query(`UPDATE rescue_runs SET state = 'error', lease_until = NULL, skip_reason = $2, updated_at = $3 WHERE id = $1 AND state = 'queued'`,
      [r.id, note, deps.now()]);
  }
}

/** One pass: classify up to 20 queued runs. Read-only on GitHub: one jobs list per run, annotations only where they decide. */
export async function rescueTick(deps: Deps): Promise<number> {
  const rows = await claim(deps);
  const lowRate = new Set<number>();
  for (const r of rows) {
    if (lowRate.has(r.installation_id)) { await release(deps, r); continue; }
    try {
      const { jobs, rateRemaining } = await deps.gh.listJobs(r.installation_id, r.full_name, r.run_id, r.run_attempt);
      if (rateRemaining !== null && rateRemaining < LOW_RATE) { lowRate.add(r.installation_id); await release(deps, r); continue; }
      const annotations: ClassifyInput['annotations'] = {};
      if (r.checks_read) {
        for (const j of jobs) if (j.checkRunId && wantsAnnotations(j)) annotations[j.id] = await deps.gh.listAnnotations(r.installation_id, r.full_name, j.checkRunId);
      }
      const c = classify({ run: { conclusion: r.run_conclusion, attempt: r.run_attempt, event: r.event, slotId: r.slot_id }, jobs, annotations });
      const skip = skipFor(await context(deps, r, c, jobs));
      // A run to re-run waits 5 minutes first: GitHub is often still recovering from what broke it.
      await deps.db.query(
        `UPDATE rescue_runs SET state = $7, verdict = $2, jobs = $3, would_rerun = $4, skip_reason = $5, lease_until = NULL, updated_at = $6,
                next_check_at = CASE WHEN $7 = 'rerun_waiting' THEN greatest($6, completed_at + interval '5 minutes') ELSE next_check_at END
          WHERE id = $1 AND state = 'queued'`,
        [r.id, c.verdict, JSON.stringify(c.jobs), skip === null, skip, deps.now(), skip === null ? 'rerun_waiting' : 'classified'],
      );
      emitPostHogWorkerLog('rescue classified', {
        verdict: c.verdict, classes: [...new Set(c.jobs.map((j) => j.class))].sort().join(','), event: r.event,
        hosted: c.jobs.every((j) => j.hosted), plan: r.plan, cronkick_fired: r.slot_id !== null,
      });
    } catch (e) {
      await failed(deps, r, e);
    }
  }
  return rows.length;
}

/** Everything rerunSkip needs that isn't on the claimed row, read in one query. */
async function context(deps: Deps, r: Claimed, c: Pick<Classification, 'verdict' | 'jobs'>, jobs: Job[]): Promise<RerunContext> {
  const now = deps.now();
  const { rows: [x] } = await deps.db.query(
    `SELECT i.plan, i.rescue_mode, i.checks_read, i.removed, i.suspended, w.rescue_rerun, w.rescue_blockers,
            EXISTS (SELECT 1 FROM rescue_runs y WHERE y.run_id = x.run_id AND y.rerun_at IS NOT NULL) AS earlier_action,
            EXISTS (SELECT 1 FROM slots n WHERE n.workflow_id = s.workflow_id AND n.due_at > s.due_at AND n.first_attempt_at IS NOT NULL) AS newer_fired,
            (SELECT min(n.due_at) FROM slots n WHERE n.workflow_id = s.workflow_id AND n.due_at > s.due_at AND n.state = 'pending') AS next_due,
            (SELECT count(*)::int FROM rescue_runs y WHERE y.installation_id = x.installation_id AND y.rerun_at > $2::timestamptz - interval '1 day') AS install_day,
            (SELECT count(*)::int FROM rescue_runs y WHERE y.rerun_at > $2::timestamptz - interval '1 hour') AS platform_hour
       FROM rescue_runs x JOIN installations i ON i.id = x.installation_id
       LEFT JOIN workflows w ON w.id = x.workflow_id LEFT JOIN slots s ON s.id = x.slot_id
      WHERE x.id = $1`,
    [r.id, now],
  );
  return {
    rerunOn: !!deps.rescueRerun,
    inst: { plan: x.plan, rescue_mode: x.rescue_mode, checks_read: x.checks_read, removed: x.removed, suspended: x.suspended },
    workflow: x.rescue_rerun === null ? null : { rescue_rerun: x.rescue_rerun, rescue_blockers: x.rescue_blockers },
    run: { conclusion: r.run_conclusion, attempt: r.run_attempt, event: r.event, slotId: r.slot_id, earlierAction: x.earlier_action },
    c, jobs, later: { fired: x.newer_fired, nextDue: x.next_due }, counts: { installDay: x.install_day, platformHour: x.platform_hour }, now,
  };
}

/** Record a claimed row's outcome, only if it is still in `from`: a webhook or another server may have moved it on. */
const settle = (deps: Deps, r: Claimed, from: string, set: string, params: unknown[] = []) =>
  deps.db.query(`UPDATE rescue_runs SET ${set}, lease_until = NULL, updated_at = $2 WHERE id = $1 AND state = $3`, [r.id, deps.now(), from, ...params]);

const BREAKER = 'Re-runs are paused: too many across Cronkick this hour.';
let breakerReportedAt = 0;
/** rerunSkip, plus one Sentry report per 10 minutes per server while the platform breaker holds re-runs back. */
function skipFor(x: RerunContext): string | null {
  const skip = rerunSkip(x);
  if (skip === BREAKER && x.now.getTime() - breakerReportedAt > 10 * MIN) {
    breakerReportedAt = x.now.getTime();
    console.error(`rescue: ${x.counts.platformHour} re-runs in the last hour; re-runs paused`);
    Sentry.captureMessage('Rescue platform re-run breaker tripped', { level: 'error', extra: { lastHour: x.counts.platformHour } });
  }
  return skip;
}

/**
 * Send the one re-run of each run that waited long enough. Every rule is checked again with fresh jobs and run state,
 * then the row is claimed (state rerun_unknown, rerun_at set) BEFORE the POST: a crash or a lost answer can never send
 * it twice, and rule 4 stops any later attempt on the same run.
 */
export async function rescueSend(deps: Deps): Promise<number> {
  const rows = await claim(deps, 'rerun_waiting');
  for (const r of rows) {
    try {
      const run = await deps.gh.getRun(r.installation_id, r.full_name, r.run_id);
      if (run.status !== 'completed' || run.runAttempt !== 1) {
        await settle(deps, r, 'rerun_waiting', `state = 'classified', would_rerun = false, skip_reason = $4`, [`The run changed on GitHub (attempt ${run.runAttempt}, ${run.status}).`]);
        continue;
      }
      const { jobs } = await deps.gh.listJobs(r.installation_id, r.full_name, r.run_id, r.run_attempt);
      const stored = (await deps.db.query('SELECT verdict, jobs FROM rescue_runs WHERE id = $1', [r.id])).rows[0];
      const ctx = await context(deps, r, { verdict: stored.verdict, jobs: stored.jobs }, jobs);
      const skip = skipFor(ctx);
      if (skip) {
        await settle(deps, r, 'rerun_waiting', `state = 'classified', would_rerun = false, skip_reason = $4`, [skip]);
        continue;
      }
      // While GitHub reports an Actions incident a re-run would likely break again: wait, but never past the next slot.
      const cap = ctx.later.nextDue ?? new Date(r.completed_at.getTime() + 60 * MIN);
      if (deps.now() < cap && await deps.gh.actionsIncident()) {
        await settle(deps, r, 'rerun_waiting', `next_check_at = $4`, [new Date(Math.min(deps.now().getTime() + RETRY_MS, cap.getTime()))]);
        continue;
      }
      const claimed = await deps.db.query(
        `UPDATE rescue_runs SET state = 'rerun_unknown', rerun_at = $2, rerun_note = 'Sending the re-run.', lease_until = NULL, updated_at = $2
          WHERE id = $1 AND state = 'rerun_waiting' RETURNING id`, [r.id, deps.now()]);
      if (!claimed.rowCount) continue;
      let res: DispatchResult | RerunTimeout;
      try {
        res = await deps.gh.rerunFailedJobs(r.installation_id, r.full_name, r.run_id);
      } catch (e) {
        res = e instanceof RerunTimeout ? e : new RerunTimeout(`Unexpected error: ${(e as Error).message}`);
      }
      const now = deps.now();
      if (res instanceof RerunTimeout) {
        await deps.db.query(`UPDATE rescue_runs SET rerun_note = $2, updated_at = $3 WHERE id = $1`, [r.id, `${res.message}; not sent again.`, now]);
      } else if (res.status >= 200 && res.status < 300) {
        await deps.db.query(`UPDATE rescue_runs SET state = 'rerun_requested', rerun_note = NULL, next_check_at = $2, updated_at = $3 WHERE id = $1`,
          [r.id, new Date(now.getTime() + MIN), now]);
      } else if (res.status >= 500) {
        // GitHub answered with an error of its own; it may still have re-run it, so this stays unknown.
        await deps.db.query(`UPDATE rescue_runs SET rerun_note = $2, updated_at = $3 WHERE id = $1`, [r.id, `GitHub ${res.status}: ${res.note ?? ''}; not sent again.`, now]);
      } else {
        await deps.db.query(`UPDATE rescue_runs SET state = 'rerun_rejected', rerun_note = $2, updated_at = $3 WHERE id = $1`, [r.id, `GitHub ${res.status}: ${res.note ?? 'no reason given'}`, now]);
      }
      emitPostHogWorkerLog('rescue rerun', { outcome: res instanceof RerunTimeout ? 'unknown' : String(res.status), plan: r.plan });
    } catch (e) {
      // A read failed before the claim: try again on a later pass.
      await settle(deps, r, 'rerun_waiting', `next_check_at = $4`, [new Date(deps.now().getTime() + RETRY_MS)]).catch(() => {});
      console.error(`rescue send for run ${r.run_id} failed before sending`, e);
    }
  }
  return rows.length;
}

/** After a requested re-run: GitHub must show attempt 2 within 10 minutes, or it counts as vanished. Never re-sent. */
export async function rescueFollowUp(deps: Deps): Promise<number> {
  const rows = await claim(deps, 'rerun_requested');
  for (const r of rows) {
    const now = deps.now();
    try {
      const run = await deps.gh.getRun(r.installation_id, r.full_name, r.run_id);
      if (run.runAttempt >= 2) { await settle(deps, r, 'rerun_requested', `state = 'rerun_started'`); continue; }
    } catch (e) {
      console.error(`rescue follow-up for run ${r.run_id} failed`, e);
    }
    if (r.rerun_at && now.getTime() - new Date(r.rerun_at).getTime() >= 10 * MIN) await settle(deps, r, 'rerun_requested', `state = 'rerun_vanished'`);
    else await settle(deps, r, 'rerun_requested', `next_check_at = $4`, [new Date(now.getTime() + MIN)]);
  }
  return rows.length;
}

/**
 * Hourly: GitHub never redelivers a lost webhook (and loses more during its own incidents), so read the last 2 h of
 * failed runs in repos with Cronkick schedules and queue any that are missing.
 */
export async function reconcileRescue(deps: Deps, now = deps.now()): Promise<void> {
  const { rows } = await deps.db.query<{ id: number; full_name: string; installation_id: number }>(
    `SELECT DISTINCT r.id, r.full_name, r.installation_id
       FROM repos r JOIN installations i ON i.id = r.installation_id
       JOIN workflows w ON w.repo_id = r.id JOIN schedules s ON s.workflow_id = w.id
      WHERE r.active AND w.present AND NOT i.removed AND NOT i.suspended AND i.rescue_mode <> 'off'`,
  );
  const since = new Date(now.getTime() - 2 * 60 * MIN);
  for (const r of rows) {
    try {
      for (const run of await deps.gh.listFailedRuns(r.installation_id, r.full_name, since)) await queueRun(deps.db, r.installation_id, r.id, run, now);
    } catch (e) {
      console.error(`rescue reconcile failed for ${r.full_name}`, e);
    }
  }
}

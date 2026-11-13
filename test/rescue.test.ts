import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import type { Db } from '../src/db.ts';
import type { Annotation, Job } from '../src/github.ts';
import { classify, dependentsRan, rerunSkip, rescueFollowUp, rescueSend, rescueTick, type ClassifyInput, type RerunContext } from '../src/rescue.ts';
import { RerunTimeout } from '../src/github.ts';
import { reconcileAll } from '../src/sync.ts';
import { isoWeek, sendRescueDigests, sendRescueRerunAlerts, sendSlotAlerts } from '../src/alerts.ts';
import { handleEvent } from '../src/webhooks.ts';
import { fakeDeps } from './fakes.ts';
import { freshDb, seed } from './helpers.ts';

const T0 = new Date('2026-11-10T12:00:00Z');
const MIN = 60_000;
const at = (ms: number) => new Date(T0.getTime() + ms);

/** A job shaped like GitHub's "never got a runner": cancelled, no steps, runner 0, ended 15 min after it was created. */
const job = (o: Partial<Job> = {}): Job => ({
  id: 1, name: 'build (macos)', conclusion: 'cancelled', steps: [], runnerId: 0, runnerName: null, runnerGroupId: null, runnerGroupName: null,
  labels: ['macos-latest'], createdAt: T0, startedAt: T0, completedAt: at(15 * MIN), checkRunId: 1, ...o,
});
const ann = (...messages: string[]): Annotation[] => messages.map((message) => ({ level: 'failure', message }));
const steps = (failing: string) => [{ name: 'Set up job', conclusion: failing === 'Set up job' ? 'failure' : 'success', number: 1 },
  ...(failing === 'Set up job' ? [] : [{ name: failing, conclusion: 'failure', number: 2 }])];
const input = (jobs: Job[], annotations: ClassifyInput['annotations'], run: Partial<ClassifyInput['run']> = {}): ClassifyInput => ({
  run: { conclusion: 'failure', attempt: 1, event: 'workflow_dispatch', slotId: 5, ...run }, jobs, annotations,
});
const NOT_ACQUIRED = 'The job was not acquired by Runner of type hosted even after multiple attempts';

describe('classify', () => {
  test('R1: no runner, GitHub says so -> github_broke, would re-run, stores only the matched string', () => {
    const c = classify(input([job()], { 1: [...ann(NOT_ACQUIRED), { level: 'notice', message: 'Due to capacity constraints, jobs targeting macOS arm64 runners may experience longer queue times.' }] }));
    expect(c.verdict).toBe('github_broke');
    expect(c.would_rerun).toBe(true);
    expect(c.jobs).toEqual([{ id: 1, name: 'build (macos)', class: 'no_runner', hosted: true, matched: 'The job was not acquired by Runner of type hosted' }]);
  });

  test('R1m: same metadata, annotations not available -> probably_github, no re-run', () => {
    const c = classify(input([job()], {}));
    expect(c.verdict).toBe('probably_github');
    expect(c.jobs[0].class).toBe('no_runner_unconfirmed');
    expect(c.would_rerun).toBe(false);
  });

  test('R1m timing: no annotations and the job ended 2 s after creation -> not counted as GitHub', () => {
    expect(classify(input([job({ completedAt: at(2000) })], {})).verdict).toBe('user');
  });

  test('billing lock -> billing, never re-run', () => {
    const c = classify(input([job()], { 1: ann('The job was not started because your account is locked due to a billing issue.') }));
    expect(c.verdict).toBe('billing');
    expect(c.would_rerun).toBe(false);
  });

  test('self-hosted runner -> self_hosted', () => {
    const c = classify(input([job({ labels: ['self-hosted', 'linux'], steps: steps('Run tests'), runnerId: 7 })], { 1: ann('The self-hosted runner lost communication with the server.') }));
    expect(c.verdict).toBe('self_hosted');
    expect(c.would_rerun).toBe(false);
  });

  test('retired runner image: ended 1 s after creation, 0 steps -> user, never re-run', () => {
    const c = classify(input([job({ completedAt: at(1000) })], { 1: ann("The configuration 'macos-14-arm64-us-default' is not supported") }));
    expect(c.verdict).toBe('user');
    expect(c.jobs[0].class).toBe('runner_config');
    expect(c.would_rerun).toBe(false);
  });

  test('timeout -> user', () => {
    const c = classify(input([job({ steps: steps('Run tests'), runnerId: 3 })], { 1: ann('The job has exceeded the maximum execution time of 40m0s') }));
    expect(c.verdict).toBe('user');
    expect(c.jobs[0].class).toBe('timeout');
  });

  test('R3: runner lost after steps ran -> probably_github, no re-run', () => {
    const lost = 'The hosted runner lost communication with the server. Anything in your workflow that terminates the runner process, starves it for CPU/Memory, or blocks its network access can cause this error.';
    const c = classify(input([job({ conclusion: 'failure', runnerId: 3, steps: [{ name: 'Set up job', conclusion: 'success', number: 1 }, { name: 'Run tests', conclusion: null, number: 2 }] })], { 1: ann(lost) }));
    expect(c.verdict).toBe('probably_github');
    expect(c.jobs[0]).toMatchObject({ class: 'runner_lost', matched: 'The hosted runner lost communication with the server' });
    expect(c.would_rerun).toBe(false);
  });

  test('R4: Set up job failed on a GitHub 503 -> github_broke, not re-run in v1', () => {
    const c = classify(input([job({ conclusion: 'failure', runnerId: 3, steps: steps('Set up job') })], { 1: ann('Failed to resolve action download info. Error: Service Unavailable') }));
    expect(c.verdict).toBe('github_broke');
    expect(c.jobs[0].class).toBe('service_5xx');
    expect(c.would_rerun).toBe(false);
  });

  test.each([
    ['Run actions/cache@v4', 'Cache service responded with 400'],
    ['Run actions/upload-artifact@v4', 'Failed to CreateArtifact: Artifact storage quota has been hit. Unable to upload any new artifacts.'],
    ['Set up job', 'Unable to resolve action `actions/checkout@v6`, unable to find version `v6`'],
  ])('R4 negative: %s with "%s" -> user', (step, message) => {
    const c = classify(input([job({ conclusion: 'failure', runnerId: 3, steps: steps(step) })], { 1: ann(message) }));
    expect(c.verdict).toBe('user');
    expect(c.jobs[0].class).toBe('quota_or_config');
  });

  test('mixed: one R1 job and one failed test step -> mixed, never re-run', () => {
    const c = classify(input([job(), job({ id: 2, name: 'test', conclusion: 'failure', runnerId: 3, steps: steps('Run tests') })], { 1: ann(NOT_ACQUIRED), 2: [] }));
    expect(c.verdict).toBe('mixed');
    expect(c.would_rerun).toBe(false);
  });

  test('zero jobs, startup_failure -> not_started', () => {
    expect(classify(input([], {}, { conclusion: 'startup_failure' })).verdict).toBe('not_started');
  });

  test('an R1 run Cronkick didn’t start, or a second attempt, is never a re-run', () => {
    const a = { 1: ann(NOT_ACQUIRED) };
    expect(classify(input([job()], a, { event: 'push', slotId: null }))).toMatchObject({ verdict: 'github_broke', would_rerun: false, skip_reason: 'Only runs Cronkick started are re-run.' });
    expect(classify(input([job()], a, { attempt: 2 }))).toMatchObject({ would_rerun: false, skip_reason: 'Already a re-run (attempt 2).' });
  });
});

let db: Db;
beforeEach(async () => { db?.end(); db = await freshDb(); });
afterAll(() => db.end());

const workflowRun = (o: Record<string, unknown> = {}) => ({
  id: 900, run_attempt: 1, html_url: 'https://github.com/acme/app/actions/runs/900', event: 'workflow_dispatch', head_sha: 'abc', head_branch: 'main',
  status: 'completed', conclusion: 'failure', created_at: T0.toISOString(), updated_at: at(16 * MIN).toISOString(), workflow_id: 100, name: 'nightly',
  head_repository: { id: 10 }, ...o,
});
const completed = (o: Record<string, unknown> = {}) => ({ action: 'completed', installation: { id: 1 }, repository: { id: 10 }, workflow_run: workflowRun(o) });
const rescueRows = async () => (await db.query('SELECT run_id, run_attempt, state, slot_id, verdict, retry_conclusion, attempts FROM rescue_runs ORDER BY run_id, run_attempt')).rows;

describe('webhook', () => {
  test('a completed failure queues one row, a duplicate delivery adds none, and no GitHub call is made', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await handleEvent(f.deps, 'workflow_run', completed());
    await handleEvent(f.deps, 'workflow_run', completed());
    expect(await rescueRows()).toEqual([{ run_id: 900, run_attempt: 1, state: 'queued', slot_id: null, verdict: null, retry_conclusion: null, attempts: 0 }]);
    expect([f.gh.jobReads, f.gh.annotationReads, f.gh.runReads, f.gh.failedRunReads, f.gh.dispatches]).toEqual([[], [], [], [], []]);
  });

  test('success is not queued; cancelled and startup_failure are; a fork run is ignored; Rescue off queues nothing', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await handleEvent(f.deps, 'workflow_run', completed({ id: 1, conclusion: 'success' }));
    await handleEvent(f.deps, 'workflow_run', completed({ id: 2, conclusion: 'cancelled' }));
    await handleEvent(f.deps, 'workflow_run', completed({ id: 3, conclusion: 'startup_failure' }));
    await handleEvent(f.deps, 'workflow_run', completed({ id: 4, head_repository: { id: 99 } }));
    await handleEvent(f.deps, 'workflow_run', { ...completed({ id: 5 }), action: 'in_progress' });
    await db.query(`UPDATE installations SET rescue_mode = 'off'`);
    await handleEvent(f.deps, 'workflow_run', completed({ id: 6 }));
    expect((await rescueRows()).map((r) => r.run_id)).toEqual([2, 3]);
  });

  test('the run of a Cronkick slot is queued with that slot', async () => {
    await seed(db);
    const slot = (await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, run_id)
      VALUES (1, 10, 100, $1, $1, $1, $1, 'accepted', 900) RETURNING id`, [T0])).rows[0].id;
    await handleEvent(fakeDeps(db, at(16 * MIN)).deps, 'workflow_run', completed());
    expect((await rescueRows())[0].slot_id).toBe(slot);
  });

  test('attempt 2 completing records its result on the re-run attempt 1', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await handleEvent(f.deps, 'workflow_run', completed());
    await db.query(`UPDATE rescue_runs SET state = 'rerun_requested'`);
    await handleEvent(f.deps, 'workflow_run', completed({ run_attempt: 2, conclusion: 'success' }));
    expect(await rescueRows()).toMatchObject([{ run_attempt: 1, state: 'done', retry_conclusion: 'success' }]);
  });
});

/** Queue run `id` through the webhook, with `jobs` as GitHub's job list for it. */
async function queued(f: ReturnType<typeof fakeDeps>, id: number, jobs: Job[] | Error) {
  await handleEvent(f.deps, 'workflow_run', completed({ id }));
  f.gh.jobs.set(`${id}:1`, jobs);
}

describe('rescueTick', () => {
  test('classifies a queued run and releases its lease; a leased row is not claimed', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await queued(f, 900, [job()]);
    await queued(f, 901, [job()]);
    await db.query(`UPDATE rescue_runs SET lease_until = $1 WHERE run_id = 901`, [at(20 * MIN)]);
    expect(await rescueTick(f.deps)).toBe(1);
    expect((await db.query(`SELECT state, verdict, lease_until FROM rescue_runs WHERE run_id = 900`)).rows[0]).toEqual({ state: 'classified', verdict: 'probably_github', lease_until: null });
    expect(f.gh.jobReads).toEqual(['900:1']);
  });

  test('two concurrent ticks never process the same run twice', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    for (const id of [900, 901, 902]) await queued(f, id, [job()]);
    f.gh.delayMs = 30;
    const [a, b] = await Promise.all([rescueTick(f.deps), rescueTick(f.deps)]);
    expect(a + b).toBe(3);
    expect(f.gh.jobReads.sort()).toEqual(['900:1', '901:1', '902:1']);
  });

  test('a GitHub 5xx is retried 5 minutes later, and the run is given up after 5 attempts', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await queued(f, 900, Object.assign(new Error('Bad Gateway'), { status: 502 }));
    for (let i = 1; i <= 5; i++) {
      expect(await rescueTick(f.deps)).toBe(1);
      expect(await rescueTick(f.deps)).toBe(0); // not before its backoff
      expect((await rescueRows())[0]).toMatchObject({ attempts: i, state: i < 5 ? 'queued' : 'error' });
      f.clock.now = new Date(f.clock.now.getTime() + 5 * MIN);
    }
    expect(await rescueTick(f.deps)).toBe(0);
  });

  test('annotations are read only with Checks: read, and only for jobs that look like GitHub’s side', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    const userJob = job({ id: 2, checkRunId: 2, conclusion: 'failure', runnerId: 3, steps: steps('Run tests') });
    await queued(f, 900, [job(), userJob]);
    expect(await rescueTick(f.deps)).toBe(1);
    expect(f.gh.annotationReads).toEqual([]);

    await db.query(`UPDATE installations SET checks_read = true`);
    f.gh.annotations.set(1, ann(NOT_ACQUIRED));
    await queued(f, 901, [job()]);
    await rescueTick(f.deps);
    expect(f.gh.annotationReads).toEqual([1]);
    expect((await db.query(`SELECT verdict FROM rescue_runs WHERE run_id = 901`)).rows[0].verdict).toBe('github_broke');
  });

  test('a low rate limit hands the installation’s runs back untried', async () => {
    await seed(db);
    const f = fakeDeps(db, at(16 * MIN));
    await queued(f, 900, [job()]);
    await queued(f, 901, [job()]);
    f.gh.rateRemaining = 100;
    expect(await rescueTick(f.deps)).toBe(2);
    expect(f.gh.jobReads).toHaveLength(1); // the second run never called GitHub
    expect((await rescueRows()).map((r) => [r.state, r.attempts])).toEqual([['queued', 0], ['queued', 0]]);
  });
});

/** A classified Rescue row finished in week 46 of 2026 (Mon 2026-11-09 to Sun 2026-11-15). */
async function classified(verdict: string, o: { runId?: number; slotId?: number | null; jobs?: { class: string }[]; installationId?: number } = {}) {
  await db.query(
    `INSERT INTO rescue_runs (installation_id, repo_id, workflow_id, workflow_name, run_id, run_attempt, run_url, event, head_sha, run_conclusion, completed_at,
                              slot_id, state, verdict, jobs, next_check_at)
     VALUES ($1, 10, 100, 'nightly', $2, 1, 'u', 'workflow_dispatch', 'abc', 'failure', $3, $4, 'classified', $5, $6, $3)`,
    [o.installationId ?? 1, o.runId ?? Math.floor(Math.random() * 1e9), T0, o.slotId ?? null, verdict, JSON.stringify(o.jobs ?? [])],
  );
}
const MONDAY = new Date('2026-11-16T02:00:00Z');

describe('digest', () => {
  test('ISO weeks', () => {
    expect(isoWeek(T0)).toEqual({ start: new Date('2026-11-09T00:00:00Z'), label: '2026-W46' });
    expect(isoWeek(new Date('2027-01-01T12:00:00Z')).label).toBe('2026-W53');
  });

  test('sent once per installation per week, even with two servers; counts in plain words', async () => {
    await seed(db, { plan: 'pro' });
    await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
    await classified('github_broke', { slotId: 1, jobs: [{ class: 'no_runner' }] });
    await classified('github_broke', { jobs: [{ class: 'service_5xx' }] });
    await classified('not_started');
    await classified('probably_github', { slotId: 2 });
    await classified('billing');
    await classified('self_hosted');
    await classified('self_hosted');
    await classified('user');
    const [a, b] = [fakeDeps(db, MONDAY), fakeDeps(db, MONDAY)];
    expect((await Promise.all([sendRescueDigests(a.deps), sendRescueDigests(b.deps)])).reduce((x, y) => x + y)).toBe(1);
    expect(await sendRescueDigests(a.deps)).toBe(0);
    const [m] = [...a.sent, ...b.sent];
    expect(m.subject).toBe('GitHub broke 2 of your runs this week');
    expect(m.text).toContain('- 1 never got a runner');
    expect(m.text).toContain("- 1 didn't start, likely GitHub");
    expect(m.text).toContain('- 1 probably GitHub');
    expect(m.text).toContain('Cronkick schedules affected: acme/app · nightly (2).');
    expect(m.text).toContain('Not counted: 1 run blocked by a GitHub billing lock, 2 runs on self-hosted runners.');
    expect(m.text).not.toContain('On Pro and Team');
    expect(m.text).toContain('https://cronkick.test/dashboard/1/rescue?utm_source=digest');
    expect(await db.query(`SELECT key FROM alerts_sent`).then((r) => r.rows)).toEqual([{ key: 'digest:1:2026-W46' }]);
  });

  test('Free gets it too, with the upsell line; "GitHub broke" is never said for probable cases', async () => {
    await seed(db, { plan: 'free' });
    await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
    await classified('probably_github');
    const f = fakeDeps(db, MONDAY);
    expect(await sendRescueDigests(f.deps)).toBe(1);
    expect(f.sent[0].subject).toBe('1 run probably failed on GitHub’s side this week');
    expect(f.sent[0].text).not.toContain('GitHub broke');
    expect(f.sent[0].text).toContain('On Pro and Team, Rescue can re-run runs like these once.');
  });

  test('not sent with nothing on GitHub’s side, without an alert email, or before the week has closed', async () => {
    await seed(db, { plan: 'pro' });
    await classified('github_broke', { jobs: [{ class: 'no_runner' }] });
    expect(await sendRescueDigests(fakeDeps(db, MONDAY).deps)).toBe(0); // no alert email
    await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
    expect(await sendRescueDigests(fakeDeps(db, new Date('2026-11-16T00:30:00Z')).deps)).toBe(0);
    await db.query(`DELETE FROM rescue_runs`);
    await classified('user');
    await classified('billing');
    expect(await sendRescueDigests(fakeDeps(db, MONDAY).deps)).toBe(0);
  });

  test('a failed send releases the claim, so the next pass sends it', async () => {
    await seed(db, { plan: 'pro' });
    await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
    await classified('github_broke', { jobs: [{ class: 'no_runner' }] });
    const f = fakeDeps(db, MONDAY);
    f.setFailMail(true);
    expect(await sendRescueDigests(f.deps)).toBe(0);
    expect((await db.query(`SELECT count(*)::int AS n FROM alerts_sent`)).rows[0].n).toBe(0);
    f.setFailMail(false);
    expect(await sendRescueDigests(f.deps)).toBe(1);
  });
});

test('sendSlotAlerts: a run GitHub never gave a runner gets that wording, in one email, after Rescue has classified it', async () => {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET alert_email = 'ops@acme.dev'`);
  await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, run_id, run_url, conclusion, updated_at)
    VALUES (1, 10, 100, $1, $1, $1, $1, 'accepted', 900, 'https://github.com/acme/app/actions/runs/900', 'failure', $2)`, [T0, at(16 * MIN)]);
  const f = fakeDeps(db, at(16 * MIN));
  await handleEvent(f.deps, 'workflow_run', completed());
  expect(await sendSlotAlerts(f.deps)).toBe(0); // waiting for Rescue
  await db.query(`UPDATE rescue_runs SET state = 'classified', verdict = 'github_broke', jobs = '[{"class":"no_runner"}]'`);
  expect(await sendSlotAlerts(f.deps)).toBe(1);
  expect(await sendSlotAlerts(f.deps)).toBe(0);
  expect(f.sent).toHaveLength(1);
  expect(f.sent[0].text).toMatch(/^GitHub never gave this run a runner \(not your code\)\.\nRun: https:\/\/github\.com\/acme\/app\/actions\/runs\/900/);
});

describe('Checks: read', () => {
  const inst = (permissions?: Record<string, string>) => ({ id: 1, account: { login: 'acme', type: 'Organization' }, ...(permissions ? { permissions } : {}) });
  const checksRead = async () => (await db.query('SELECT checks_read FROM installations WHERE id = 1')).rows[0].checks_read;

  test('install and new_permissions_accepted set it from installation.permissions.checks; the daily reconcile refreshes it', async () => {
    const f = fakeDeps(db, T0);
    await handleEvent(f.deps, 'installation', { action: 'created', installation: inst({ actions: 'write', contents: 'read', metadata: 'read' }) });
    expect(await checksRead()).toBe(false);
    await handleEvent(f.deps, 'installation', { action: 'new_permissions_accepted', installation: inst({ actions: 'write', checks: 'read', contents: 'read', metadata: 'read' }) });
    expect(await checksRead()).toBe(true);
    await handleEvent(f.deps, 'installation_repositories', { installation: inst(), repositories_added: [], repositories_removed: [] });
    expect(await checksRead()).toBe(true); // a payload without permissions leaves it alone
    f.gh.installations = [inst({ actions: 'write', contents: 'read', metadata: 'read' })];
    await reconcileAll(f.deps);
    expect(await checksRead()).toBe(false); // revoked
  });
});

const base = (): RerunContext => ({
  rerunOn: true,
  inst: { plan: 'pro', rescue_mode: 'rerun', checks_read: true, removed: false, suspended: false },
  workflow: { rescue_rerun: true, rescue_blockers: [] },
  run: { conclusion: 'failure', attempt: 1, event: 'workflow_dispatch', slotId: 5, earlierAction: false },
  c: { verdict: 'github_broke', jobs: [{ id: 1, name: 'build (macos)', class: 'no_runner', hosted: true, matched: NOT_ACQUIRED }] },
  jobs: [job()], later: { fired: false, nextDue: null }, counts: { installDay: 0, platformHour: 0 }, now: at(21 * MIN),
});
/** A gate job that got a runner and ran a step after the cancelled matrix leg ended at 15 min. */
const gate = job({ id: 2, name: 'all-green', conclusion: 'success', runnerId: 9, startedAt: at(15 * MIN + 1000), steps: [{ name: 'Set up job', conclusion: 'success', number: 1 }] });

describe('re-run eligibility', () => {
  test('all nine rules hold -> re-run', () => expect(rerunSkip(base())).toBeNull());

  test.each<[string, (x: RerunContext) => void, RegExp]>([
    ['1 free plan', (x) => { x.inst.plan = 'free'; }, /part of Pro and Team/],
    ['1 report-only mode', (x) => { x.inst.rescue_mode = 'shadow'; }, /Re-run once is off/],
    ['1 RESCUE_RERUN off', (x) => { x.rerunOn = false; }, /paused on Cronkick’s side/],
    ['1 no Checks: read', (x) => { x.inst.checks_read = false; }, /Checks: read isn’t approved/],
    ['1 suspended', (x) => { x.inst.suspended = true; }, /isn’t active/],
    ['2 workflow not opted in', (x) => { x.workflow!.rescue_rerun = false; }, /isn’t turned on for this workflow/],
    ['2 workflow blocker', (x) => { x.workflow!.rescue_blockers = ['Job "deploy" uses an environment.']; }, /can’t be re-run: Job "deploy"/],
    ['3 not started by Cronkick', (x) => { x.run.slotId = null; }, /Only runs Cronkick started/],
    ['4 second attempt', (x) => { x.run.attempt = 2; }, /Already a re-run \(attempt 2\)/],
    ['4 earlier Rescue action', (x) => { x.run.earlierAction = true; }, /already acted on this run/],
    ['5 probably GitHub', (x) => { x.c.verdict = 'probably_github'; }, /never gave a runner are re-run/],
    ['5 setup-step service error', (x) => { x.c.jobs[0].class = 'service_5xx'; }, /service errors during setup/],
    ['6 self-hosted', (x) => { x.c.jobs[0].hosted = false; }, /Self-hosted runners are never re-run/],
    ['7 a dependent already ran', (x) => { x.jobs = [job(), gate]; }, /would run it twice/],
    ['8 newer slot fired', (x) => { x.later.fired = true; }, /newer run of this schedule/],
    ['8 next slot due soon', (x) => { x.later.nextDue = at(30 * MIN); }, /due within 10 minutes/],
    ['9 install breaker', (x) => { x.counts.installDay = 10; }, /Already 10 re-runs today/],
    ['9 platform breaker', (x) => { x.counts.platformHour = 100; }, /too many across Cronkick/],
  ])('rule %s', (_, flip, reason) => {
    const x = base();
    flip(x);
    expect(rerunSkip(x)).toMatch(reason);
  });

  test('dependents guard: a gate job that ran after the cancelled matrix leg blocks; a skipped one does not', () => {
    expect(dependentsRan([job(), gate], [1])).toBe(true);
    expect(dependentsRan([job(), { ...gate, steps: [{ name: 'Set up job', conclusion: 'skipped', number: 1 }] }], [1])).toBe(false);
    expect(dependentsRan([job(), { ...gate, startedAt: at(MIN) }], [1])).toBe(false); // ran before the leg broke
  });
});

/** An account with every switch on, and run 900 of a Cronkick slot that GitHub never gave a runner, queued. */
async function eligible() {
  await seed(db, { plan: 'pro' });
  await db.query(`UPDATE installations SET rescue_mode = 'rerun', checks_read = true, alert_email = 'ops@acme.dev'`);
  await db.query(`UPDATE workflows SET rescue_rerun = true`);
  await db.query(`INSERT INTO slots (installation_id, repo_id, workflow_id, due_at, fire_at, deadline_at, next_attempt_at, state, run_id, first_attempt_at, fired_at)
    VALUES (1, 10, 100, $1, $1, $1, $1, 'accepted', 900, $1, $1)`, [T0]);
  const f = fakeDeps(db, at(16 * MIN));
  f.deps.rescueRerun = true;
  f.gh.annotations.set(1, ann(NOT_ACQUIRED));
  await queued(f, 900, [job()]);
  return f;
}
const row = async () => (await db.query('SELECT state, would_rerun, skip_reason, rerun_note, retry_conclusion FROM rescue_runs WHERE run_id = 900 AND run_attempt = 1')).rows[0];
const later = (f: ReturnType<typeof fakeDeps>, ms: number) => { f.clock.now = new Date(f.clock.now.getTime() + ms); };

describe('re-run once', () => {
  test('waits 5 minutes, sends once, sees attempt 2 start, records its result and emails once', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    expect(await row()).toMatchObject({ state: 'rerun_waiting', would_rerun: true, skip_reason: null });
    expect(await rescueSend(f.deps)).toBe(0); // not before completed + 5 min
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(f.gh.reruns).toEqual([{ repo: 'acme/app', runId: 900 }]);
    expect((await row()).state).toBe('rerun_requested');
    f.gh.runs.set(900, { status: 'queued', conclusion: null, runAttempt: 2, headSha: 'abc' });
    later(f, MIN);
    await rescueFollowUp(f.deps);
    expect((await row()).state).toBe('rerun_started');
    await handleEvent(f.deps, 'workflow_run', completed({ run_attempt: 2, conclusion: 'success' }));
    expect(await row()).toMatchObject({ state: 'done', retry_conclusion: 'success' });
    expect(await sendRescueRerunAlerts(f.deps)).toBe(1);
    expect(await sendRescueRerunAlerts(f.deps)).toBe(0);
    expect(f.sent[0].text).toMatch(/^GitHub never gave acme\/app · nightly a runner at 2026-11-10 12:16 UTC\. Cronkick re-ran the failed jobs once at 2026-11-10 12:21 UTC\. Result: success\./);
    expect(f.gh.reruns).toHaveLength(1);
  });

  test('attempt 2 finishing before the follow-up pass stays done', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    await handleEvent(f.deps, 'workflow_run', completed({ run_attempt: 2, conclusion: 'success' }));
    f.gh.runs.set(900, { status: 'completed', conclusion: 'success', runAttempt: 2, headSha: 'abc' });
    later(f, MIN);
    await rescueFollowUp(f.deps);
    expect(await row()).toMatchObject({ state: 'done', retry_conclusion: 'success' });
  });

  test('RESCUE_RERUN unset: nothing ever waits or is sent', async () => {
    const f = await eligible();
    f.deps.rescueRerun = undefined;
    await rescueTick(f.deps);
    expect(await row()).toMatchObject({ state: 'classified', would_rerun: false, skip_reason: 'Re-runs are paused on Cronkick’s side.' });
    later(f, 10 * MIN);
    await rescueSend(f.deps);
    expect(f.gh.reruns).toEqual([]);
  });

  test('rules are checked again at send time: switching off in between sends nothing', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    await db.query(`UPDATE workflows SET rescue_rerun = false`);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(f.gh.reruns).toEqual([]);
    expect(await row()).toMatchObject({ state: 'classified', skip_reason: 'Re-run isn’t turned on for this workflow.' });
  });

  test('a run that changed on GitHub (someone re-ran it) is left alone', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    f.gh.runs.set(900, { status: 'in_progress', conclusion: null, runAttempt: 2, headSha: 'abc' });
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(f.gh.reruns).toEqual([]);
    expect((await row()).skip_reason).toMatch(/changed on GitHub/);
  });

  test('a POST with no answer is rerun_unknown and is never sent again', async () => {
    const f = await eligible();
    f.gh.rerunResponses = [new RerunTimeout('No response from GitHub within 10 s')];
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    for (let i = 0; i < 5; i++) { await rescueSend(f.deps); await rescueFollowUp(f.deps); await rescueTick(f.deps); later(f, 5 * MIN); }
    expect(f.gh.reruns).toHaveLength(1);
    expect(await row()).toMatchObject({ state: 'rerun_unknown', rerun_note: 'No response from GitHub within 10 s; not sent again.' });
  });

  test('two servers sending at once POST once', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await Promise.all([rescueSend(f.deps), rescueSend(f.deps)]);
    expect(f.gh.reruns).toHaveLength(1);
  });

  test('403 is rerun_rejected with GitHub’s message', async () => {
    const f = await eligible();
    f.gh.rerunResponses = [{ status: 403, note: 'This workflow run cannot be retried' }];
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(await row()).toMatchObject({ state: 'rerun_rejected', rerun_note: 'GitHub 403: This workflow run cannot be retried' });
  });

  test('no attempt 2 within 10 minutes of the request is rerun_vanished', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    for (let i = 0; i < 9; i++) { later(f, MIN); await rescueFollowUp(f.deps); }
    expect((await row()).state).toBe('rerun_requested');
    later(f, MIN);
    await rescueFollowUp(f.deps);
    expect((await row()).state).toBe('rerun_vanished');
    expect(f.gh.reruns).toHaveLength(1);
  });

  test('the installation breaker trips at the 11th re-run in a day', async () => {
    const f = await eligible();
    for (let i = 0; i < 10; i++) {
      await db.query(`INSERT INTO rescue_runs (installation_id, repo_id, workflow_id, workflow_name, run_id, run_attempt, run_url, event, head_sha, run_conclusion,
        completed_at, state, rerun_at, next_check_at) VALUES (1, 10, 100, 'nightly', $1, 1, 'u', 'workflow_dispatch', 'abc', 'failure', $2, 'done', $2, $2)`, [5000 + i, T0]);
    }
    await rescueTick(f.deps);
    expect(await row()).toMatchObject({ state: 'classified', skip_reason: 'Already 10 re-runs today for this account.' });
  });

  test('during a GitHub Actions incident it keeps waiting, but not past its cap', async () => {
    const f = await eligible();
    f.gh.incident = true;
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(f.gh.reruns).toEqual([]);
    expect((await row()).state).toBe('rerun_waiting');
    later(f, 60 * MIN); // past completed + 1 h, the cap without a next slot
    await rescueSend(f.deps);
    expect(f.gh.reruns).toHaveLength(1);
  });

  test('re-run email: pending after an hour; not for Free or without an alert email', async () => {
    const f = await eligible();
    await rescueTick(f.deps);
    later(f, 5 * MIN);
    await rescueSend(f.deps);
    expect(await sendRescueRerunAlerts(f.deps)).toBe(0);
    later(f, 61 * MIN);
    await db.query(`UPDATE installations SET plan = 'free'`);
    expect(await sendRescueRerunAlerts(f.deps)).toBe(0);
    await db.query(`UPDATE installations SET plan = 'pro'`);
    expect(await sendRescueRerunAlerts(f.deps)).toBe(1);
    expect(f.sent[0].text).toContain('Result: pending.');
  });
});

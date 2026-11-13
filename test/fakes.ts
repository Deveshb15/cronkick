import type { Deps } from '../src/deps.ts';
import type { Db } from '../src/db.ts';
import { DispatchTimeout, RerunTimeout, type Annotation, type DispatchResult, type FailedRun, type GitHub, type Job, type RepoInfo, type WorkflowInfo } from '../src/github.ts';
import type { Mail } from '../src/mailer.ts';

export class FakeGitHub implements GitHub {
  repos: RepoInfo[] = [];
  workflows = new Map<string, (Omit<WorkflowInfo, 'state'> & { state?: string })[]>();
  files = new Map<string, string>(); // "repo:path" -> text
  dispatches: { repo: string; workflowId: number; ref: string }[] = [];
  /** Responses to return in order; falls back to 204. A DispatchTimeout entry is thrown. */
  responses: (DispatchResult | DispatchTimeout)[] = [];
  delayMs = 0;

  /** Scheduled runs per workflow id, newest first; an Error entry makes the read fail. */
  scheduled = new Map<number, { id: number; createdAt: Date }[] | Error>();
  scheduledReads: number[] = [];
  async listScheduledRuns(_: number, __: string, workflowId: number, stopAt: Date | null, maxPages: number) {
    this.scheduledReads.push(workflowId);
    const all = this.scheduled.get(workflowId) ?? [];
    if (all instanceof Error) throw all;
    const runs = all.slice(0, maxPages * 100);
    const complete = all.length <= maxPages * 100 || (!!stopAt && runs[runs.length - 1].createdAt <= stopAt);
    return { runs, complete };
  }

  installations: { id: number; account: { login: string; type: string }; permissions?: Record<string, string> }[] = [];
  async listInstallations() { return this.installations; }
  async listRepos() { return this.repos; }
  async listWorkflows(_: number, repo: string) { return (this.workflows.get(repo) ?? []).map((w) => ({ state: 'active', ...w })); }
  async getFile(_: number, repo: string, path: string) { return this.files.get(`${repo}:${path}`) ?? null; }
  /** Rescue reads. Jobs per "runId:attempt" (an Error entry is thrown); annotations per check run id (null = no Checks: read). */
  jobs = new Map<string, Job[] | Error>();
  annotations = new Map<number, Annotation[] | null>();
  failedRuns = new Map<string, FailedRun[]>(); // repo -> runs
  rateRemaining: number | null = 5000;
  jobReads: string[] = [];
  annotationReads: number[] = [];
  runReads: number[] = [];
  failedRunReads: string[] = [];
  async listJobs(_: number, __: string, runId: number, attempt: number) {
    this.jobReads.push(`${runId}:${attempt}`);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const j = this.jobs.get(`${runId}:${attempt}`) ?? [];
    if (j instanceof Error) throw j;
    return { jobs: j, rateRemaining: this.rateRemaining };
  }
  async listAnnotations(_: number, __: string, checkRunId: number) {
    this.annotationReads.push(checkRunId);
    return this.annotations.has(checkRunId) ? this.annotations.get(checkRunId)! : [];
  }
  async getRun(_: number, __: string, runId: number) {
    this.runReads.push(runId);
    return this.runs.get(runId) ?? { status: 'completed', conclusion: 'failure', runAttempt: 1, headSha: 'abc' };
  }
  async listFailedRuns(_: number, repo: string) {
    this.failedRunReads.push(repo);
    return this.failedRuns.get(repo) ?? [];
  }
  /** Re-run POSTs sent, and responses to return in order (falls back to 201; a RerunTimeout entry is thrown). */
  reruns: { repo: string; runId: number }[] = [];
  rerunResponses: (DispatchResult | RerunTimeout)[] = [];
  incident = false;
  /** getRun answers per run id; falls back to completed, attempt 1. */
  runs = new Map<number, { status: string; conclusion: string | null; runAttempt: number; headSha: string }>();
  async rerunFailedJobs(_: number, repo: string, runId: number) {
    this.reruns.push({ repo, runId });
    const r = this.rerunResponses.shift() ?? { status: 201 };
    if (r instanceof RerunTimeout) throw r;
    return r;
  }
  async actionsIncident() { return this.incident; }
  async dispatch(_: number, repo: string, workflowId: number, ref: string) {
    this.dispatches.push({ repo, workflowId, ref });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const r = this.responses.shift() ?? { status: 204 };
    if (r instanceof DispatchTimeout) throw r;
    return r;
  }
}

export function fakeDeps(db: Db, now: Date) {
  const sent: Mail[] = [];
  let failMail = false;
  const clock = { now };
  const deps: Deps = {
    db,
    gh: new FakeGitHub(),
    mailer: { async send(m) { if (failMail) throw new Error('resend 500'); sent.push(m); } },
    now: () => clock.now,
    baseUrl: 'https://cronkick.test',
  };
  return { deps, gh: deps.gh as FakeGitHub, sent, clock, setFailMail: (v: boolean) => { failMail = v; } };
}

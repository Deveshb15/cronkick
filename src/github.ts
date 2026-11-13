import { App } from '@octokit/app';

export type RepoInfo = { id: number; fullName: string; defaultBranch: string };
export type WorkflowInfo = { id: number; path: string; name: string; state: string };
export type DispatchResult = { status: number; runId?: number; runUrl?: string; retryAfterMs?: number; note?: string };
export type Job = {
  id: number; name: string; conclusion: string | null; steps: { name: string; conclusion: string | null; number: number }[];
  runnerId: number | null; runnerName: string | null; runnerGroupId: number | null; runnerGroupName: string | null; labels: string[];
  createdAt: Date | null; startedAt: Date | null; completedAt: Date | null; checkRunId: number | null;
};
export type Annotation = { level: string; message: string };
/** The fields of GitHub's workflow_run object Rescue reads; a webhook's workflow_run fits as is. */
export type FailedRun = {
  id: number; run_attempt: number; html_url: string; event: string; head_sha: string; head_branch: string | null; conclusion: string | null;
  updated_at: string; workflow_id: number; name: string; head_repository: { id: number } | null;
};

/** Everything Cronkick asks GitHub, as an interface so tests can use a fake. */
export interface GitHub {
  /** Every installation of the App (used by the daily reconcile). */
  listInstallations(): Promise<{ id: number; account: { login: string; type: string }; permissions?: Record<string, string> }[]>;
  listRepos(installationId: number): Promise<RepoInfo[]>;
  listWorkflows(installationId: number, repo: string): Promise<WorkflowInfo[]>;
  /** File text at a ref, or null if it doesn't exist. */
  getFile(installationId: number, repo: string, path: string, ref: string): Promise<string | null>;
  /** Never throws for HTTP errors; throws DispatchTimeout when no answer arrived in time. */
  dispatch(installationId: number, repo: string, workflowId: number, ref: string): Promise<DispatchResult>;
  /**
   * Runs GitHub's own scheduler created for one workflow, newest first, reading pages until one reaches `stopAt` or
   * `maxPages` run out. `complete` is false when the pages ran out first.
   */
  listScheduledRuns(installationId: number, repo: string, workflowId: number, stopAt: Date | null, maxPages: number): Promise<{ runs: { id: number; createdAt: Date }[]; complete: boolean }>;
  /** Every job of one run attempt, and the installation's rate-limit budget left after the read (null if not sent). */
  listJobs(installationId: number, repo: string, runId: number, attempt: number): Promise<{ jobs: Job[]; rateRemaining: number | null }>;
  /** A job's check-run annotations: GitHub's own error text. Null without Checks: read (403), so callers use metadata only. */
  listAnnotations(installationId: number, repo: string, checkRunId: number): Promise<Annotation[] | null>;
  getRun(installationId: number, repo: string, runId: number): Promise<{ status: string; conclusion: string | null; runAttempt: number; headSha: string }>;
  /** Runs that ended in failure, created at or after `since` (Rescue's hourly check for lost webhooks). */
  listFailedRuns(installationId: number, repo: string, since: Date): Promise<FailedRun[]>;
  /** Rescue's one re-run of a run's failed jobs (and their dependents). Like dispatch: never throws for HTTP errors; RerunTimeout on no answer. */
  rerunFailedJobs(installationId: number, repo: string, runId: number): Promise<DispatchResult>;
  /** Whether githubstatus.com lists an unresolved incident touching Actions. False when it can't tell. */
  actionsIncident(): Promise<boolean>;
}

export class DispatchTimeout extends Error {}
export class RerunTimeout extends Error {}

const DISPATCH_TIMEOUT_MS = 10_000;
// Rescue's reads: no octokit retries, so a slow GitHub costs one try and rescueTick backs off on its own.
const read = () => ({ request: { signal: AbortSignal.timeout(15_000), retries: 0 } });

const toDate = (s: string | null | undefined) => (s ? new Date(s) : null);
const toJob = (j: any): Job => ({
  id: j.id, name: j.name, conclusion: j.conclusion ?? null,
  steps: (j.steps ?? []).map((s: any) => ({ name: s.name, conclusion: s.conclusion ?? null, number: s.number })),
  runnerId: j.runner_id ?? null, runnerName: j.runner_name ?? null, runnerGroupId: j.runner_group_id ?? null, runnerGroupName: j.runner_group_name ?? null,
  labels: j.labels ?? [], createdAt: toDate(j.created_at), startedAt: toDate(j.started_at), completedAt: toDate(j.completed_at),
  checkRunId: j.check_run_url ? Number(String(j.check_run_url).split('/').pop()) || null : null,
});

export function githubApp(cfg: { appId: string; privateKey: string }): App {
  return new App({ appId: cfg.appId, privateKey: cfg.privateKey });
}

function retryAfter(headers: Record<string, any>): number | undefined {
  if (headers['retry-after']) return Number(headers['retry-after']) * 1000;
  if (headers['x-ratelimit-remaining'] === '0' && headers['x-ratelimit-reset']) return Number(headers['x-ratelimit-reset']) * 1000 - Date.now();
  return undefined;
}

/** GitHub's HTTP error as a result. No HTTP answer (timeout, dropped connection) throws `Timeout`: GitHub may have received it, so never retry. */
function httpFailure(e: any, Timeout: new (message: string) => Error): DispatchResult {
  if (!e.response) throw new Timeout(e.name === 'AbortError' || e.cause?.name === 'TimeoutError' ? 'No response from GitHub within 10 s' : `Network error: ${e.message}`);
  if (typeof e.status === 'number') {
    return { status: e.status, retryAfterMs: retryAfter(e.response?.headers ?? {}), note: String(e.response?.data?.message ?? e.message).slice(0, 300) };
  }
  throw new Timeout(`Unexpected error: ${e.message}`);
}

/** Follow `page` until a short page. Avoids pulling in the paginate plugin for three calls. */
async function all(o: { request: (route: string, params: any) => Promise<any> }, route: string, key: string, params = {}): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; ; page++) {
    const res = await o.request(route, { ...params, per_page: 100, page });
    const items = key ? res.data[key] : res.data;
    out.push(...items);
    if (items.length < 100) return out;
  }
}

export function realGitHub(app: App): GitHub {
  const kit = (id: number) => app.getInstallationOctokit(id);
  const split = (repo: string) => { const [owner, name] = repo.split('/'); return { owner, repo: name }; };
  return {
    async listInstallations() {
      const list = await all(app.octokit, 'GET /app/installations', '');
      return list.filter((i) => i.account).map((i) => ({ id: i.id, account: { login: i.account.login ?? i.account.slug, type: i.account.type ?? 'Organization' }, permissions: i.permissions ?? {} }));
    },
    async listRepos(id) {
      const o = await kit(id);
      const repos = await all(o, 'GET /installation/repositories', 'repositories');
      return repos.map((r) => ({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch }));
    },
    async listWorkflows(id, repo) {
      const o = await kit(id);
      // Every page: sync treats a workflow it wasn't shown as deleted and drops its schedules.
      const workflows = await all(o, 'GET /repos/{owner}/{repo}/actions/workflows', 'workflows', split(repo));
      return workflows.map((w: any) => ({ id: w.id, path: w.path, name: w.name, state: w.state }));
    },
    async getFile(id, repo, path, ref) {
      const o = await kit(id);
      try {
        const res = await o.request('GET /repos/{owner}/{repo}/contents/{path}', { ...split(repo), path, ref, headers: { accept: 'application/vnd.github.raw+json' } });
        return String(res.data);
      } catch (e: any) {
        if (e.status === 404) return null;
        throw e;
      }
    },
    async listScheduledRuns(id, repo, workflowId, stopAt, maxPages) {
      const o = await kit(id);
      const runs: { id: number; createdAt: Date }[] = [];
      for (let page = 1; page <= maxPages; page++) {
        const res = await o.request('GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs', {
          ...split(repo), workflow_id: workflowId, event: 'schedule', per_page: 100, page, request: { signal: AbortSignal.timeout(15_000) },
        });
        const batch: any[] = res.data.workflow_runs ?? [];
        runs.push(...batch.map((r) => ({ id: r.id, createdAt: new Date(r.created_at) })));
        if (batch.length < 100 || (stopAt && runs[runs.length - 1].createdAt <= stopAt)) return { runs, complete: true };
      }
      return { runs, complete: false };
    },
    async listJobs(id, repo, runId, attempt) {
      const o = await kit(id);
      const jobs: Job[] = [];
      for (let page = 1; ; page++) {
        const res = await o.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs', {
          ...split(repo), run_id: runId, attempt_number: attempt, per_page: 100, page, ...read(),
        });
        const batch: any[] = res.data.jobs ?? [];
        jobs.push(...batch.map(toJob));
        const left = res.headers['x-ratelimit-remaining'];
        if (batch.length < 100) return { jobs, rateRemaining: left === undefined ? null : Number(left) };
      }
    },
    async listAnnotations(id, repo, checkRunId) {
      const o = await kit(id);
      try {
        const res = await o.request('GET /repos/{owner}/{repo}/check-runs/{check_run_id}/annotations', { ...split(repo), check_run_id: checkRunId, per_page: 50, ...read() });
        return (res.data as any[]).map((a) => ({ level: a.annotation_level, message: String(a.message ?? '') }));
      } catch (e: any) {
        if (e.status === 403) return null;
        throw e;
      }
    },
    async getRun(id, repo, runId) {
      const o = await kit(id);
      const { data: r } = await o.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', { ...split(repo), run_id: runId, ...read() });
      return { status: r.status ?? '', conclusion: r.conclusion ?? null, runAttempt: r.run_attempt ?? 1, headSha: r.head_sha };
    },
    async listFailedRuns(id, repo, since) {
      const o = await kit(id);
      const out: FailedRun[] = [];
      for (let page = 1; page <= 3; page++) { // 300 failures in 2 h is a repo that is all red; the rest can wait an hour
        const res = await o.request('GET /repos/{owner}/{repo}/actions/runs', {
          ...split(repo), status: 'failure', created: `>=${since.toISOString()}`, per_page: 100, page, ...read(),
        });
        const batch: any[] = res.data.workflow_runs ?? [];
        out.push(...batch.map((r) => ({
          id: r.id, run_attempt: r.run_attempt ?? 1, html_url: r.html_url, event: r.event, head_sha: r.head_sha, head_branch: r.head_branch ?? null,
          conclusion: r.conclusion ?? null, updated_at: r.updated_at, workflow_id: r.workflow_id, name: r.name ?? '', head_repository: r.head_repository ? { id: r.head_repository.id } : null,
        })));
        if (batch.length < 100) break;
      }
      return out;
    },
    async dispatch(id, repo, workflowId, ref) {
      const o = await kit(id);
      try {
        const res = await o.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
          ...split(repo), workflow_id: workflowId, ref, request: { signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS), retries: 0 },
        });
        // Newer API: 200 with the run id. Older API: bare 204.
        const d: any = res.data ?? {};
        return { status: res.status, runId: d.workflow_run_id, runUrl: d.html_url };
      } catch (e: any) {
        return httpFailure(e, DispatchTimeout);
      }
    },
    async rerunFailedJobs(id, repo, runId) {
      const o = await kit(id);
      try {
        const res = await o.request('POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs', {
          ...split(repo), run_id: runId, request: { signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS), retries: 0 },
        });
        return { status: res.status };
      } catch (e: any) {
        return httpFailure(e, RerunTimeout);
      }
    },
    async actionsIncident() {
      try {
        const res = await fetch('https://www.githubstatus.com/api/v2/incidents/unresolved.json', { signal: AbortSignal.timeout(5000) });
        const { incidents = [] } = (await res.json()) as { incidents?: { components?: { name: string }[] }[] };
        return incidents.some((i) => i.components?.some((c) => /actions/i.test(c.name)));
      } catch {
        return false;
      }
    },
  };
}

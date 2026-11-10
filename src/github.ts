import { App } from '@octokit/app';

export type RepoInfo = { id: number; fullName: string; defaultBranch: string };
export type WorkflowInfo = { id: number; path: string; name: string; state: string };
export type DispatchResult = { status: number; runId?: number; runUrl?: string; retryAfterMs?: number; note?: string };

/** Everything Ontime asks GitHub, as an interface so tests can use a fake. */
export interface GitHub {
  /** Every installation of the App (used by the daily reconcile). */
  listInstallations(): Promise<{ id: number; account: { login: string; type: string } }[]>;
  listRepos(installationId: number): Promise<RepoInfo[]>;
  listWorkflows(installationId: number, repo: string): Promise<WorkflowInfo[]>;
  /** File text at a ref, or null if it doesn't exist. */
  getFile(installationId: number, repo: string, path: string, ref: string): Promise<string | null>;
  /** Never throws for HTTP errors; throws DispatchTimeout when no answer arrived in time. */
  dispatch(installationId: number, repo: string, workflowId: number, ref: string): Promise<DispatchResult>;
}

export class DispatchTimeout extends Error {}

const DISPATCH_TIMEOUT_MS = 10_000;

export function githubApp(cfg: { appId: string; privateKey: string; clientId: string; clientSecret: string }): App {
  return new App({ appId: cfg.appId, privateKey: cfg.privateKey, oauth: { clientId: cfg.clientId, clientSecret: cfg.clientSecret } });
}

function retryAfter(headers: Record<string, any>): number | undefined {
  if (headers['retry-after']) return Number(headers['retry-after']) * 1000;
  if (headers['x-ratelimit-remaining'] === '0' && headers['x-ratelimit-reset']) return Number(headers['x-ratelimit-reset']) * 1000 - Date.now();
  return undefined;
}

/** Follow `page` until a short page. Avoids pulling in the paginate plugin for two calls. */
async function all(o: { request: (route: string, params: any) => Promise<any> }, route: string, key: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; ; page++) {
    const res = await o.request(route, { per_page: 100, page });
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
      return list.filter((i) => i.account).map((i) => ({ id: i.id, account: { login: i.account.login ?? i.account.slug, type: i.account.type ?? 'Organization' } }));
    },
    async listRepos(id) {
      const o = await kit(id);
      const repos = await all(o, 'GET /installation/repositories', 'repositories');
      return repos.map((r) => ({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch }));
    },
    async listWorkflows(id, repo) {
      const o = await kit(id);
      const res = await o.request('GET /repos/{owner}/{repo}/actions/workflows', { ...split(repo), per_page: 100 });
      return res.data.workflows.map((w: any) => ({ id: w.id, path: w.path, name: w.name, state: w.state }));
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
        // No HTTP response (timeout, dropped connection): GitHub may have received it, so never retry.
        if (!e.response) throw new DispatchTimeout(e.name === 'AbortError' || e.cause?.name === 'TimeoutError' ? 'No response from GitHub within 10 s' : `Network error: ${e.message}`);
        if (typeof e.status === 'number') {
          return { status: e.status, retryAfterMs: retryAfter(e.response?.headers ?? {}), note: String(e.response?.data?.message ?? e.message).slice(0, 300) };
        }
        throw new DispatchTimeout(`Unexpected error: ${e.message}`);
      }
    },
  };
}

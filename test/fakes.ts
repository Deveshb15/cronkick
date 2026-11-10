import type { Deps } from '../src/deps.js';
import type { Db } from '../src/db.js';
import { DispatchTimeout, type DispatchResult, type GitHub, type RepoInfo, type WorkflowInfo } from '../src/github.js';
import type { Mail } from '../src/mailer.js';

export class FakeGitHub implements GitHub {
  repos: RepoInfo[] = [];
  workflows = new Map<string, (Omit<WorkflowInfo, 'state'> & { state?: string })[]>();
  files = new Map<string, string>(); // "repo:path" -> text
  dispatches: { repo: string; workflowId: number; ref: string }[] = [];
  /** Responses to return in order; falls back to 204. A DispatchTimeout entry is thrown. */
  responses: (DispatchResult | DispatchTimeout)[] = [];
  delayMs = 0;

  installations: { id: number; account: { login: string; type: string } }[] = [];
  async listInstallations() { return this.installations; }
  async listRepos() { return this.repos; }
  async listWorkflows(_: number, repo: string) { return (this.workflows.get(repo) ?? []).map((w) => ({ state: 'active', ...w })); }
  async getFile(_: number, repo: string, path: string) { return this.files.get(`${repo}:${path}`) ?? null; }
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

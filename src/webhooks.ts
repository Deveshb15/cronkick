import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Deps } from './deps.ts';
import { linkRun } from './runs.ts';
import { onRunCompleted } from './rescue.ts';
import { identifyInstallation, track } from './posthog.ts';
import { recordScheduledRun } from './schedule-watch.ts';
import { pauseRepos, setInstallationState, syncInstallation, syncRepo, upsertInstallation } from './sync.ts';

/** X-Hub-Signature-256 check over the raw body (R1). */
export function verifySignature(secret: string, body: string, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const got = Buffer.from(header);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const touchesWorkflows = (commits: any[]) =>
  commits.some((c) => [...(c.added ?? []), ...(c.modified ?? []), ...(c.removed ?? [])].some((f: string) => f.startsWith('.github/workflows/')));

export async function handleEvent(deps: Deps, event: string, p: any): Promise<void> {
  const installationId: number | undefined = p.installation?.id;
  switch (event) {
    case 'installation':
      track(`app_${p.action}`, installationId, { account_login: p.installation?.account?.login ?? null, account_type: p.installation?.account?.type ?? null, repository_selection: p.installation?.repository_selection ?? null, repository_count: p.repositories?.length ?? null }, p.sender?.id);
      if (p.installation?.account) identifyInstallation(p.installation.id, { name: p.installation.account.login, account_type: p.installation.account.type, removed: p.action === 'deleted' });
      if (p.action === 'created' || p.action === 'new_permissions_accepted') {
        await upsertInstallation(deps, p.installation);
        await syncInstallation(deps, p.installation.id);
      } else if (p.action === 'deleted') await setInstallationState(deps, p.installation.id, { removed: true });
      else if (p.action === 'suspend') await setInstallationState(deps, p.installation.id, { suspended: true });
      else if (p.action === 'unsuspend') {
        await setInstallationState(deps, p.installation.id, { suspended: false });
        await syncInstallation(deps, p.installation.id);
      }
      return;
    case 'installation_repositories':
      track('app_repositories_changed', installationId, { added: p.repositories_added?.length ?? 0, removed: p.repositories_removed?.length ?? 0, repository_selection: p.repository_selection ?? null }, p.sender?.id);
      await upsertInstallation(deps, p.installation);
      if (p.repositories_removed?.length) await pauseRepos(deps, p.installation.id, p.repositories_removed.map((r: any) => r.id));
      if (p.repositories_added?.length) await syncInstallation(deps, p.installation.id);
      return;
    case 'push': {
      const repo = p.repository;
      if (!installationId || p.ref !== `refs/heads/${repo.default_branch}`) return;
      const known = await deps.db.query('SELECT 1 FROM installations WHERE id = $1 AND NOT removed', [installationId]);
      if (!known.rowCount) return; // the daily reconcile picks up installations we never heard about
      // GitHub caps the commit list at 20, so a long push may hide a workflow change: re-sync to be safe.
      if (!touchesWorkflows(p.commits ?? []) && (p.commits?.length ?? 0) < 20) return;
      await syncRepo(deps, installationId, { id: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch });
      return;
    }
    case 'workflow_run':
      // GitHub's own scheduler started it: evidence for a workflow the user hasn't moved yet. Otherwise it's ours.
      if (p.workflow_run?.event === 'schedule') track('github_scheduled_run_seen', installationId);
      if (p.workflow_run?.event === 'schedule') await recordScheduledRun(deps.db, p.workflow_run, deps.now());
      else await linkRun(deps.db, p.workflow_run);
      // After linkRun, so a run it just matched to a slot is queued with that slot. Database only: no GitHub calls here.
      if (p.action === 'completed' && installationId && p.repository?.id) await onRunCompleted(deps.db, installationId, p.repository.id, p.workflow_run, deps.now());
      return;
  }
}

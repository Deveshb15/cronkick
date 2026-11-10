import { tx } from './db.ts';
import type { Deps } from './deps.ts';
import { checkWorkflow, type WorkflowCheck } from './compat.ts';
import { applyLimits, PLANS, planOf } from './plans.ts';
import { refreshSlots } from './maintenance.ts';
import { sendLimitNotice } from './alerts.ts';
import type { RepoInfo } from './github.ts';

export async function upsertInstallation(deps: Deps, inst: { id: number; account: { login: string; type: string } }) {
  await deps.db.query(
    `INSERT INTO installations (id, account_login, account_type) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET account_login = $2, account_type = $3, removed = false`,
    [inst.id, inst.account.login, inst.account.type],
  );
}

/** Re-read every repo the installation can see; repos no longer listed are paused (R4). */
export async function syncInstallation(deps: Deps, installationId: number): Promise<void> {
  const repos = await deps.gh.listRepos(installationId);
  for (const repo of repos) await syncRepo(deps, installationId, repo, { refresh: false });
  await deps.db.query(`UPDATE repos SET active = false WHERE installation_id = $1 AND NOT (id = ANY($2))`, [installationId, repos.map((r) => r.id)]);
  await afterChange(deps, installationId);
}

/** Read the repo's workflow files on the default branch and store markers, flags and suggested diffs (R3). */
export async function syncRepo(deps: Deps, installationId: number, repo: RepoInfo, opts = { refresh: true }): Promise<void> {
  const floor = PLANS[await planOf(deps.db, installationId)].floorMinutes;
  const found: { id: number; path: string; name: string; check: WorkflowCheck | null }[] = [];
  for (const w of await deps.gh.listWorkflows(installationId, repo.fullName)) {
    if (!w.path.startsWith('.github/workflows/')) continue; // dynamic workflows (Dependabot, Pages) have no file
    // A disabled workflow rejects every dispatch, so treat it as absent until it's re-enabled.
    const text = w.state === 'active' ? await deps.gh.getFile(installationId, repo.fullName, w.path, repo.defaultBranch) : null;
    found.push({ ...w, check: text === null ? null : checkWorkflow(text, floor) });
  }

  await tx(deps.db, async (c) => {
    await c.query(
      `INSERT INTO repos (id, installation_id, full_name, default_branch, active) VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO UPDATE SET full_name = $3, default_branch = $4, active = true, installation_id = $2`,
      [repo.id, installationId, repo.fullName, repo.defaultBranch],
    );
    for (const w of found) {
      const present = w.check !== null;
      await c.query(
        `INSERT INTO workflows (id, repo_id, path, name, flags, suggested_diff, present, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (id) DO UPDATE SET path = $3, name = $4, flags = $5, suggested_diff = $6, present = $7, updated_at = now()`,
        [w.id, repo.id, w.path, w.name, JSON.stringify(w.check?.flags ?? []), w.check?.suggestedDiff ?? null, present],
      );
      const markers = w.check?.markers ?? [];
      for (const m of markers) {
        await c.query(`INSERT INTO schedules (workflow_id, cron, tz) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [w.id, m.cron, m.tz]);
      }
      // Markers that were removed (or the file is gone) stop scheduling right away (R4).
      await c.query(
        `DELETE FROM schedules WHERE workflow_id = $1 AND NOT ((cron, tz) IN (SELECT * FROM unnest($2::text[], $3::text[])))`,
        [w.id, markers.map((m) => m.cron), markers.map((m) => m.tz)],
      );
    }
    // Workflows GitHub no longer lists were deleted or renamed.
    await c.query(`UPDATE workflows SET present = false WHERE repo_id = $1 AND NOT (id = ANY($2))`, [repo.id, found.map((w) => w.id)]);
    await c.query(`DELETE FROM schedules WHERE workflow_id IN (SELECT id FROM workflows WHERE repo_id = $1 AND NOT present)`, [repo.id]);
  });
  if (opts.refresh) await afterChange(deps, installationId);
}

/** Re-apply plan limits, notify if something got paused, and rebuild future slots. */
export async function afterChange(deps: Deps, installationId: number): Promise<void> {
  const paused = await applyLimits(deps.db, installationId);
  await sendLimitNotice(deps, installationId, paused);
  await refreshSlots(deps.db, installationId, deps.now());
}

/** Stop everything for an installation (uninstall, suspend) or a set of its repos. */
export async function pauseRepos(deps: Deps, installationId: number, repoIds: number[]): Promise<void> {
  await deps.db.query(`UPDATE repos SET active = false WHERE installation_id = $1 AND id = ANY($2)`, [installationId, repoIds]);
  await refreshSlots(deps.db, installationId, deps.now());
}

export async function setInstallationState(deps: Deps, installationId: number, state: { removed?: boolean; suspended?: boolean }) {
  if (state.removed !== undefined) await deps.db.query('UPDATE installations SET removed = $2 WHERE id = $1', [installationId, state.removed]);
  if (state.suspended !== undefined) await deps.db.query('UPDATE installations SET suspended = $2 WHERE id = $1', [installationId, state.suspended]);
  await refreshSlots(deps.db, installationId, deps.now());
}

/** Daily pass (R3): pick up anything a missed webhook would have told us. */
export async function reconcileAll(deps: Deps): Promise<void> {
  const live = await deps.gh.listInstallations();
  for (const inst of live) {
    try {
      await upsertInstallation(deps, inst);
      await syncInstallation(deps, inst.id);
    } catch (e) {
      console.error(`reconcile failed for installation ${inst.id}`, e);
    }
  }
  const ids = live.map((i) => i.id);
  const { rows } = await deps.db.query('SELECT id FROM installations WHERE NOT removed AND NOT (id = ANY($1))', [ids]);
  for (const r of rows) await setInstallationState(deps, r.id, { removed: true });
}

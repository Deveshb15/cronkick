import { createDb, migrate, type Db } from '../src/db.ts';

/** Fresh schema for a test file. */
export async function freshDb(): Promise<Db> {
  const db = createDb();
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  return db;
}

/** Seed one installation, repo and workflow; returns their ids. */
export async function seed(db: Db, opts: { plan?: 'free' | 'pro'; installationId?: number; repoId?: number; workflowId?: number } = {}) {
  const installationId = opts.installationId ?? 1;
  const repoId = opts.repoId ?? 10;
  const workflowId = opts.workflowId ?? 100;
  await db.query(
    `INSERT INTO installations (id, account_login, account_type, plan, created_at) VALUES ($1, 'acme', 'Organization', $2, '2026-01-01Z') ON CONFLICT DO NOTHING`,
    [installationId, opts.plan ?? 'pro'],
  );
  await db.query(`INSERT INTO repos (id, installation_id, full_name, default_branch) VALUES ($1, $2, 'acme/app', 'main') ON CONFLICT DO NOTHING`, [repoId, installationId]);
  await db.query(`INSERT INTO workflows (id, repo_id, path, name) VALUES ($1, $2, '.github/workflows/nightly.yml', 'nightly') ON CONFLICT DO NOTHING`, [workflowId, repoId]);
  return { installationId, repoId, workflowId };
}

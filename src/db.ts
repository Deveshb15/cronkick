import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { dbUrl } from './config.js';

// Return bigint columns (GitHub ids) as JS numbers; GitHub ids fit in 2^53.
pg.types.setTypeParser(20, Number);

export type Db = pg.Pool;
export const createDb = (url = dbUrl()): Db => new pg.Pool({ connectionString: url, max: 10 });

const MIGRATION_LOCK = 7_406_221; // any constant; shared by every server

/** Apply new migrations in order. An advisory lock makes servers that boot together take turns. */
export async function migrate(db: Db, dir = new URL('../migrations/', import.meta.url)): Promise<string[]> {
  const c = await db.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const applied: string[] = [];
    for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      if (done.has(name)) continue;
      try {
        await c.query('BEGIN');
        await c.query(await readFile(new URL(name, dir), 'utf8'));
        await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await c.query('COMMIT');
        applied.push(name);
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      }
    }
    return applied;
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {});
    c.release();
  }
}

/** Run fn inside a transaction on one client. */
export async function tx<T>(db: Db, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

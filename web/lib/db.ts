import pg from 'pg';

pg.types.setTypeParser(20, Number);

// One pool per server process, reused across requests and hot reloads.
const g = globalThis as unknown as { cronkickPool?: pg.Pool };
export const db = (g.cronkickPool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5 }));

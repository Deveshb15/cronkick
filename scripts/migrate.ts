import { createDb, migrate } from '../src/db.ts';

const db = createDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date');
await db.end();

import { createDb, migrate } from '../src/db.js';

const db = createDb();
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date');
await db.end();

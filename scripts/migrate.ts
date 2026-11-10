import { directDbUrl } from '../src/config.ts';
import { createDb, migrate } from '../src/db.ts';

const db = createDb(directDbUrl());
const applied = await migrate(db);
console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Up to date');
await db.end();

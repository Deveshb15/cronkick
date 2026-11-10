import type { Db } from './db.js';
import type { GitHub } from './github.js';
import type { Mailer } from './mailer.js';

/** Everything with side effects, passed in so tests can swap fakes and the clock. */
export type Deps = { db: Db; gh: GitHub; mailer: Mailer; now: () => Date; baseUrl: string };

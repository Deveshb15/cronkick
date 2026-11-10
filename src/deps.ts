import type { Db } from './db.ts';
import type { GitHub } from './github.ts';
import type { Mailer } from './mailer.ts';

/** Everything with side effects, passed in so tests can swap fakes and the clock. */
export type Deps = { db: Db; gh: GitHub; mailer: Mailer; now: () => Date; baseUrl: string };

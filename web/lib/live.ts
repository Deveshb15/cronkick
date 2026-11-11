// Pure helpers behind the live dashboard pieces (web/components/live.tsx). No React here, so they're unit-tested.

const pad = (n: number) => String(n).padStart(2, '0');
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A cron in plain words for the common shapes; anything else stays as the raw cron. */
export function humanCron(cron: string): string {
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return cron;
  const [m, h, dom, mon, dow] = f;
  const anyDay = dom === '*' && mon === '*';
  const step = /^\*\/(\d+)$/;
  if (anyDay && dow === '*' && h === '*' && step.test(m)) {
    const n = Number(m.match(step)![1]);
    return n === 1 ? 'Every minute' : `Every ${n} minutes`;
  }
  if (anyDay && dow === '*' && /^\d+$/.test(m)) {
    if (h === '*') return m === '0' ? 'Every hour' : `Every hour at :${pad(Number(m))}`;
    if (step.test(h)) return `Every ${h.match(step)![1]} hours${m === '0' ? '' : ` at :${pad(Number(m))}`}`;
  }
  if (anyDay && /^\d+$/.test(m) && /^\d+$/.test(h)) {
    const at = `${pad(Number(h))}:${pad(Number(m))}`;
    if (dow === '*') return `Every day at ${at}`;
    if (dow === '1-5') return `Weekdays at ${at}`;
    if (/^[0-7]$/.test(dow)) return `${DAYS[Number(dow) % 7]}s at ${at}`;
  }
  return cron;
}

/** Start delay as "+0.05 s": two decimals under a second, one under a minute, then "+4 min" or "+1 min 30 s". */
export function fmtDelay(ms: number | null): string {
  if (ms === null) return '—';
  const s = ms / 1000;
  if (s < 60) return `+${s < 1 ? s.toFixed(2) : s.toFixed(1)} s`;
  const r = Math.round(s);
  return `+${Math.floor(r / 60)} min${r % 60 ? ` ${r % 60} s` : ''}`;
}

/** A duration as "42 s" or "1 min 32 s". */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/**
 * How long until a due time, in words, so it can't be read as a clock time: "in 45 s", "in 4 min", "in 2 h 5 min",
 * "in 3 days". "now" at or past zero; never negative.
 */
export function countdown(ms: number): string {
  return ms <= 0 ? 'now' : `in ${fmtSpan(ms)}`;
}

/** How long ago, coarsely: "12 min", "5 h", "3 days". For ages, where minutes past the hour are noise. */
export function fmtAge(ms: number): string {
  const m = Math.max(1, Math.floor(ms / 60_000));
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`;
}

/** A span of time in words, rounded up: "45 s", "4 min", "2 h 5 min", "3 days". */
export function fmtSpan(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} days`;
}

/** The viewer's IANA time zone from the `tz` cookie, if it names a real zone; UTC otherwise. */
export function viewerZone(cookie: string | undefined): string {
  if (!cookie || cookie.length > 64) return 'UTC';
  // Keep the name as given (ICU may canonicalise Asia/Kolkata to Asia/Calcutta); Postgres knows both. Only names, so
  // nothing but a zone ever reaches SQL (as a bound parameter).
  // Area/Location names only: offsets like "+0530" or "-03" mean the opposite sign to Postgres (POSIX) and are refused.
  if (cookie !== 'UTC' && !/^[A-Za-z]+(\/[A-Za-z0-9_+\-]+){1,2}$/.test(cookie)) return 'UTC';
  try { new Intl.DateTimeFormat('en-US', { timeZone: cookie }); return cookie; } catch { return 'UTC'; }
}

/** "1 run", "3 runs"; pass the plural when it isn't just an added s. */
export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

/** The short name of a time zone ("UTC", "IST", "GMT+5:30" when the browser has none), for labelling times. */
export function tzAbbrev(timeZone?: string, at = new Date()): string {
  // The viewer's own locale knows its zone's name best (en-IN says "IST" where en-US says "GMT+5:30").
  const part = new Intl.DateTimeFormat(undefined, { timeZone, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName');
  return part?.value ?? 'UTC';
}

/**
 * Ids in `ids` not seen before; records them in `seen`. On the first look everything is recorded and nothing is new,
 * so a page load or reload never animates.
 */
export function newIds(seen: Set<number>, ids: number[], first: boolean): number[] {
  const fresh = first ? [] : ids.filter((id) => !seen.has(id));
  ids.forEach((id) => seen.add(id));
  return fresh;
}

// Coverage gaps in the history table and strips. Gaps and times are ISO strings, which compare in time order.
type Gap = { start: string; end: string };

/** Whether coverage gap `g` belongs right above row `i` of a newest-first page. Exported for tests. */
export function gapAt(rows: { due: string }[], i: number, g: Gap, newerEdge: string | null): boolean {
  const above = i > 0 ? rows[i - 1].due : newerEdge;
  return rows[i].due <= g.start && (above === null || above > g.start);
}

/**
 * Where to draw each coverage gap in an oldest-first strip: once, before the first run due after the gap started.
 * A gap before the first or after the last shown run isn't drawn (the notice covers it). Exported for tests.
 */
export function gapMarks(runs: { due: string }[], gaps: Gap[]): Set<number> {
  return new Set(gaps.map((g) => runs.findIndex((x) => x.due > g.start)).filter((j) => j > 0));
}


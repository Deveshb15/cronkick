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
    if (step.test(h) && m === '0') return `Every ${h.match(step)![1]} hours`;
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

/** Countdown text for `ms` until a due time: mm:ss under an hour, "3 h 12 min" above. Never negative. */
export function countdown(ms: number): { due: boolean; text: string } {
  if (ms <= 0) return { due: true, text: '00:00' };
  const s = Math.ceil(ms / 1000);
  if (s < 3600) return { due: false, text: `${pad(Math.floor(s / 60))}:${pad(s % 60)}` };
  return { due: false, text: `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` };
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

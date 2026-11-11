import { expect, test } from 'vitest';
import { rowStatus } from '../web/lib/format.ts';
import { countdown, fmtAge, gapAt, gapMarks, plural, tzAbbrev, fmtDelay, fmtDuration, humanCron, newIds } from '../web/lib/live.ts';

test('plain-words cron for common shapes, raw cron otherwise', () => {
  expect(humanCron('*/15 * * * *')).toBe('Every 15 minutes');
  expect(humanCron('*/1 * * * *')).toBe('Every minute');
  expect(humanCron('0 * * * *')).toBe('Every hour');
  expect(humanCron('30 * * * *')).toBe('Every hour at :30');
  expect(humanCron('0 3 * * *')).toBe('Every day at 03:00');
  expect(humanCron('0 9 * * 1-5')).toBe('Weekdays at 09:00');
  expect(humanCron('7 4 1 * *')).toBe('7 4 1 * *');
  expect(humanCron('0 */6 * * *')).toBe('Every 6 hours');
  expect(humanCron('5 */2 * * *')).toBe('Every 2 hours at :05');
  expect(humanCron('0 8 * * 1')).toBe('Mondays at 08:00');
  expect(humanCron('30 18 * * 0')).toBe('Sundays at 18:30');
});

test('durations', () => {
  expect(fmtDuration(9_400)).toBe('9 s');
  expect(fmtDuration(92_000)).toBe('1 min 32 s');
  expect(fmtDuration(40_000)).toBe('40 s'); // the benchmark card's sub-minute median
  expect(fmtDuration(-5)).toBe('0 s');
});

test('start delay formatting', () => {
  expect(fmtDelay(52)).toBe('+0.05 s');
  expect(fmtDelay(1_430)).toBe('+1.4 s');
  expect(fmtDelay(42_990)).toBe('+43.0 s');
  expect(fmtDelay(240_000)).toBe('+4 min');
  expect(fmtDelay(90_000)).toBe('+1 min 30 s');
  expect(fmtDelay(null)).toBe('—');
});

test('countdown in words, never a clock time, never negative', () => {
  expect(countdown(0)).toBe('now');
  expect(countdown(-5_000)).toBe('now');
  expect(countdown(45_000)).toBe('in 45 s');
  expect(countdown(125_000)).toBe('in 3 min');
  expect(countdown(65 * 60_000)).toBe('in 1 h 5 min');
  expect(countdown(2 * 3600_000)).toBe('in 2 h');
  expect(countdown(26 * 3600_000 + 60_000)).toBe('in 26 h 1 min');
  expect(countdown(80 * 3600_000)).toBe('in 3 days');
});

test('plural and time zone names', () => {
  expect(plural(1, 'run')).toBe('1 run');
  expect(plural(3, 'run')).toBe('3 runs');
  expect(plural(2, 'repository', 'repositories')).toBe('2 repositories');
  expect(tzAbbrev('UTC')).toBe('UTC');
  expect(tzAbbrev('Asia/Kolkata')).toMatch(/IST|GMT\+5:30/);
});

test('arrivals: nothing on first look, only ids not seen before after that', () => {
  const seen = new Set<number>();
  expect(newIds(seen, [1, 2], true)).toEqual([]);
  expect(newIds(seen, [1, 2, 3], false)).toEqual([3]);
  expect(newIds(seen, [2, 3], false)).toEqual([]);
  expect(newIds(seen, [2, 3, 4, 5], false)).toEqual([4, 5]);
});

test('a coverage gap is drawn exactly once, even at a page seam or with runs sent inside it', () => {
  const t = (hm: string) => `2026-11-10T${hm}:00.000Z`;
  const gap = { start: t('00:12'), end: t('00:28') };
  const marks = (rows: string[], newerEdge: string | null) => rows.map((_, i) => gapAt(rows.map((r) => ({ due: t(r) })), i, gap, newerEdge));
  // One page spanning the gap, with a run sent during it (planned before): one mark, above the first run before it.
  expect(marks(['00:40', '00:30', '00:20', '00:10', '00:00'], null)).toEqual([false, false, false, true, false]);
  // Page seam: the newer page ends at 00:20 (no run before the start there), the older page starts at 00:10.
  expect(marks(['00:40', '00:30', '00:20'], null)).toEqual([false, false, false]);
  expect(marks(['00:10', '00:00'], t('00:20'))).toEqual([true, false]);
  // The whole gap between two pages: the older page marks it, the newer one doesn't.
  expect(marks(['00:40', '00:30'], null)).toEqual([false, false]);
  expect(marks(['00:10', '00:00'], t('00:30'))).toEqual([true, false]);
  // Gap newer than every run on the newest page: at the top. Older than the page: not here.
  expect(marks(['00:10', '00:00'], null)).toEqual([true, false]);
  expect(marks(['00:40', '00:30'], t('00:50'))).toEqual([false, false]);
  // Strip (oldest first): one divider before the first run after the start, however many runs fall inside.
  expect([...gapMarks(['00:00', '00:10', '00:20', '00:30', '00:40'].map((x) => ({ due: t(x) })), [gap])]).toEqual([2]);
  expect([...gapMarks(['00:20', '00:30'].map((x) => ({ due: t(x) })), [gap])]).toEqual([]); // starts before the strip
});

test('ages are coarse', () => {
  expect(fmtAge(30_000)).toBe('1 min');
  expect(fmtAge(44 * 3600_000 + 36 * 60_000)).toBe('44 h');
  expect(fmtAge(3 * 86_400_000 + 5 * 3600_000)).toBe('3 days');
});

test('row status: current problems first; an old one shows only when nothing is current', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const run = (hAgo: number, tick: string) => ({ tick: tick as never, due: new Date(now.getTime() - hAgo * 3600_000).toISOString() });
  const ok = [run(30, 'ontime'), run(6, 'ontime')];
  expect(rowStatus('active', ok, now).word).toBe('2 of 2 on time');
  // An old miss alone: grey, with its age.
  expect(rowStatus('active', [run(72, 'missed'), ...ok], now)).toMatchObject({ word: '1 not sent · 3 days ago', dot: 'bg-zinc-500', rank: 3 });
  // An old miss and a recent late run: the late run is the current problem.
  expect(rowStatus('active', [run(72, 'missed'), run(1, 'late'), ...ok], now)).toMatchObject({ word: '1 late', rank: 2 });
  expect(rowStatus('active', [run(72, 'missed'), run(2, 'unconfirmed')], now)).toMatchObject({ word: '1 unconfirmed', rank: 2 });
  // Overdue is always current, and a recent miss is red.
  expect(rowStatus('active', [run(30, 'overdue')], now)).toMatchObject({ word: '1 overdue', rank: 1 });
  expect(rowStatus('active', [run(3, 'missed'), run(1, 'late')], now)).toMatchObject({ word: '1 not sent', dot: 'bg-red-500' });
  expect(rowStatus('active', [], now).word).toBe('Waiting for first run');
  expect(rowStatus('needs_fix', ok, now).word).toBe('Needs a fix');
});

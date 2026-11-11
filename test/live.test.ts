import { expect, test } from 'vitest';
import { countdown, fmtDelay, fmtDuration, humanCron, newIds } from '../web/lib/live.ts';

test('plain-words cron for common shapes, raw cron otherwise', () => {
  expect(humanCron('*/15 * * * *')).toBe('Every 15 minutes');
  expect(humanCron('*/1 * * * *')).toBe('Every minute');
  expect(humanCron('0 * * * *')).toBe('Every hour');
  expect(humanCron('30 * * * *')).toBe('Every hour at :30');
  expect(humanCron('0 3 * * *')).toBe('Every day at 03:00');
  expect(humanCron('0 9 * * 1-5')).toBe('Weekdays at 09:00');
  expect(humanCron('7 4 1 * *')).toBe('7 4 1 * *');
  expect(humanCron('0 */6 * * *')).toBe('Every 6 hours');
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

test('countdown: mm:ss under an hour, h m above, due at zero, never negative', () => {
  expect(countdown(125_000)).toEqual({ due: false, text: '02:05' });
  expect(countdown(0)).toEqual({ due: true, text: '00:00' });
  expect(countdown(-5_000)).toEqual({ due: true, text: '00:00' });
  expect(countdown(3 * 3600_000 + 12 * 60_000)).toEqual({ due: false, text: '3 h 12 min' });
});

test('arrivals: nothing on first look, only ids not seen before after that', () => {
  const seen = new Set<number>();
  expect(newIds(seen, [1, 2], true)).toEqual([]);
  expect(newIds(seen, [1, 2, 3], false)).toEqual([3]);
  expect(newIds(seen, [2, 3], false)).toEqual([]);
  expect(newIds(seen, [2, 3, 4, 5], false)).toEqual([4, 5]);
});

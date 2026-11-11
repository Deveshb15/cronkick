import { expect, test } from 'vitest';
import { jitterMs, minIntervalMinutes, nextDue, planSlots } from '../src/slots.ts';

const at = (s: string) => new Date(s);
const utc = (cron: string) => ({ cron, tz: 'UTC' });

test('*/5: deadline is the next slot', () => {
  const s = planSlots(7, [utc('*/5 * * * *')], at('2026-11-10T00:01:00Z'), at('2026-11-10T00:11:00Z'));
  expect(s.map((x) => x.dueAt.toISOString())).toEqual(['2026-11-10T00:05:00.000Z', '2026-11-10T00:10:00.000Z']);
  expect(s[0].deadlineAt.toISOString()).toBe('2026-11-10T00:10:00.000Z');
  expect(s[1].deadlineAt.toISOString()).toBe('2026-11-10T00:15:00.000Z');
});

test('hourly: deadline is due + 5 min', () => {
  const [s] = planSlots(7, [utc('17 * * * *')], at('2026-11-10T00:00:00Z'), at('2026-11-10T00:30:00Z'));
  expect(s.deadlineAt.toISOString()).toBe('2026-11-10T00:22:00.000Z');
});

test('two markers at the same instant make one slot', () => {
  const s = planSlots(7, [utc('0 * * * *'), utc('0 */2 * * *')], at('2026-11-10T00:30:00Z'), at('2026-11-10T02:30:00Z'));
  expect(s.map((x) => x.dueAt.toISOString())).toEqual(['2026-11-10T01:00:00.000Z', '2026-11-10T02:00:00.000Z']);
});

test('DST spring-forward: the missing 02:30 fires once at the first valid time', () => {
  const s = planSlots(7, [{ cron: '30 2 * * *', tz: 'Europe/Berlin' }], at('2026-03-29T00:00:00Z'), at('2026-03-29T23:00:00Z'));
  expect(s.map((x) => x.dueAt.toISOString())).toEqual(['2026-03-29T01:30:00.000Z']); // 03:30 CEST
});

test('DST fall-back: the repeated 02:30 fires exactly once', () => {
  const s = planSlots(7, [{ cron: '30 2 * * *', tz: 'Europe/Berlin' }], at('2026-10-25T00:00:00Z'), at('2026-10-25T23:00:00Z'));
  expect(s).toHaveLength(1);
});

test('minimum interval across markers', () => {
  expect(minIntervalMinutes([utc('*/4 * * * *')])).toBe(4);
  expect(minIntervalMinutes([utc('0 * * * *'), utc('10 * * * *')])).toBe(10);
});

test('jitter: stable, only at :00, at most 15 s', () => {
  const top = at('2026-11-10T03:00:00Z');
  expect(jitterMs(42, top)).toBe(jitterMs(42, top));
  expect(jitterMs(42, at('2026-11-10T03:17:00Z'))).toBe(0);
  for (let id = 1; id < 500; id++) expect(jitterMs(id, top)).toBeLessThanOrEqual(15_000);
  const [s] = planSlots(42, [utc('0 * * * *')], at('2026-11-10T02:30:00Z'), at('2026-11-10T03:30:00Z'));
  expect(s.fireAt.getTime() - s.dueAt.getTime()).toBe(jitterMs(42, top));
});

test('next due: daily cron, DST, and the earliest of several schedules', () => {
  expect(nextDue([utc('0 3 * * *')], at('2026-11-10T14:00:00Z'))?.toISOString()).toBe('2026-11-11T03:00:00.000Z');
  // Berlin noon the day clocks spring forward (Mar 29) is 10:00 UTC, not 11:00.
  expect(nextDue([{ cron: '0 12 * * *', tz: 'Europe/Berlin' }], at('2026-03-28T12:00:00Z'))?.toISOString()).toBe('2026-03-29T10:00:00.000Z');
  expect(nextDue([utc('0 3 * * *'), utc('30 18 * * *')], at('2026-11-10T14:00:00Z'))?.toISOString()).toBe('2026-11-10T18:30:00.000Z');
  expect(nextDue([], at('2026-11-10T14:00:00Z'))).toBeNull();
});

test('DST: a pass started inside the changed hour plans the same as one started before it', () => {
  const berlin = [{ cron: '30 2 * * *', tz: 'Europe/Berlin' }];
  const due = (from: string, until: string) => planSlots(7, berlin, at(from), at(until)).map((x) => x.dueAt.toISOString());
  // Fall-back: 02:30 CEST (00:30Z) was planned; a pass from 01:00Z must not plan 02:30 CET (01:30Z).
  expect(due('2026-10-25T01:00:00Z', '2026-10-25T03:00:00Z')).toEqual([]);
  expect(nextDue(berlin, at('2026-10-25T01:00:00Z'))?.toISOString()).toBe('2026-10-26T01:30:00.000Z');
  // Spring-forward: unchanged whether the pass starts before or inside the skipped hour.
  expect(due('2026-03-29T00:45:00Z', '2026-03-29T02:45:00Z')).toEqual(['2026-03-29T01:30:00.000Z']);
  expect(due('2026-03-29T01:00:00Z', '2026-03-29T03:00:00Z')).toEqual(['2026-03-29T01:30:00.000Z']);
});

import { expect, test } from 'vitest';
import { assignRuns, lateness } from '../src/probe/stats.js';

test('p50 and p95 by nearest rank', () => {
  const s = lateness([60, 120, 180, 600, 2400], 5);
  expect(s).toMatchObject({ p50Sec: 180, p95Sec: 2400, missingShare: 0 });
});

test('12 expected, 9 ran: 25% missing with denominator 12', () => {
  expect(lateness(Array(9).fill(30), 12)).toMatchObject({ expected: 12, ran: 9, missingShare: 0.25 });
});

test('no data: nulls, not zeros', () => {
  expect(lateness([], 0)).toEqual({ expected: 0, ran: 0, missingShare: 0, p50Sec: null, p95Sec: null });
});

test('runs are assigned to the latest free slot, never overstating lateness', () => {
  const at = (s: string) => new Date(`2026-11-10T${s}Z`);
  const a = assignRuns('*/5 * * * *', [{ id: 1, createdAt: at('00:07:00') }, { id: 2, createdAt: at('00:08:00') }]);
  expect(a.map((x) => [x.id, x.dueAt.toISOString().slice(11, 19)])).toEqual([[1, '00:05:00'], [2, '00:00:00']]);
});

test('a run exactly at due maps to that slot', () => {
  const [a] = assignRuns('0 * * * *', [{ id: 1, createdAt: new Date('2026-11-10T03:00:00Z') }]);
  expect(a.dueAt.toISOString()).toBe('2026-11-10T03:00:00.000Z');
});

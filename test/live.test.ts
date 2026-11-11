import { expect, test } from 'vitest';
import { latestRun, nextPlan, rowStatus, evidenceLine } from '../web/lib/format.ts';
import { countdown, fmtAge, gapAt, gapMarks, plural, tzAbbrev, viewerZone, fmtDelay, fmtDuration, humanCron, newIds } from '../web/lib/live.ts';

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

test('viewer zone: a real IANA name, otherwise UTC', () => {
  expect(viewerZone('Asia/Kolkata')).toBe('Asia/Kolkata');
  expect(viewerZone('Mars/Base')).toBe('UTC');
  expect(viewerZone(undefined)).toBe('UTC');
  expect(viewerZone("UTC'; DROP TABLE slots;--")).toBe('UTC');
  expect(viewerZone('+0530')).toBe('UTC');
  expect(viewerZone('-03')).toBe('UTC');
  expect(viewerZone('Etc/GMT+5')).toBe('Etc/GMT+5');
  expect(viewerZone('America/Argentina/Buenos_Aires')).toBe('America/Argentina/Buenos_Aires');
});

test('next runs read as a cadence when steady and under an hour, as a list otherwise', () => {
  const t = (hm: string) => `2026-11-10T${hm}:00.000Z`;
  expect(nextPlan([t('14:15'), t('14:30'), t('14:45'), t('15:00'), t('15:15')])).toEqual({ kind: 'every', next: t('14:15'), minutes: 15 });
  expect(nextPlan([t('14:00'), t('15:00'), t('16:00')])).toMatchObject({ kind: 'list' }); // hourly: list the times
  expect(nextPlan([t('14:00'), t('14:15'), t('15:00')])).toMatchObject({ kind: 'list' }); // irregular (two crons)
  expect(nextPlan([])).toEqual({ kind: 'none' });
});

test('latest run: GitHub result apart from dispatch, never claims a run is going', () => {
  const s = (o: object) => ({ state: 'accepted', display: 'accepted', conclusion: null, runMs: null, runUrl: 'u', due: '2026-11-10T14:15:00.000Z', ...o }) as never;
  expect(latestRun([s({ conclusion: 'success', runMs: 42_000 })])).toMatchObject({ text: 'Passed on GitHub · 42 s', tone: 'ok' });
  expect(latestRun([s({ conclusion: 'failure', runMs: 18_000 })])).toMatchObject({ text: 'Failed on GitHub · 18 s', tone: 'bad' });
  expect(latestRun([s({})])).toMatchObject({ text: 'Sent; GitHub result not reported yet', tone: 'quiet' });
  // A run still sending is skipped for the one before it; an unconfirmed one is quiet, not red.
  expect(latestRun([s({ conclusion: 'success' }), s({ state: 'dispatching', display: 'waiting' })])).toMatchObject({ text: 'Passed on GitHub' });
  expect(latestRun([s({ state: 'unknown', display: 'unknown' })])).toMatchObject({ tone: 'quiet', runUrl: null });
  expect(latestRun([s({ state: 'pending', display: 'pending' })])).toBeNull();
});


test('evidence line: counts, window and median in words; red only when 1 in 10 or more was skipped', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const e = (ran: number, due: number, p50Sec: number | null, fromH = 24, fullDay = true) =>
    ({ measuring: false as const, ran, due, p50Sec, from: new Date(now.getTime() - fromH * 3_600_000).toISOString(), until: now.toISOString(), fullDay });
  expect(evidenceLine(e(3, 23, 480), now)).toEqual({ text: 'GitHub ran it 3 of 23 times in the last 24 h · median 8 min late', bad: true });
  expect(evidenceLine(e(0, 16, null), now)).toEqual({ text: 'GitHub ran it 0 of 16 times in the last 24 h', bad: true });
  expect(evidenceLine(e(1, 1, 42), now)).toEqual({ text: 'GitHub ran it 1 of 1 time in the last 24 h · median 42 s late', bad: false });
  expect(evidenceLine(e(19, 20, 90, 6, false), now)).toEqual({ text: 'GitHub ran it 19 of 20 times in the last 6 h · median 2 min late', bad: false });
  expect(evidenceLine({ measuring: true, since: now.toISOString() }, now)).toEqual({ text: 'Measuring how GitHub runs it…', bad: false });
});

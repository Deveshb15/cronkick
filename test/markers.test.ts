import { expect, test } from 'vitest';
import { parseMarkers } from '../src/markers.js';

const wf = (body: string) => `name: nightly\non:\n${body}\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;

test('one marker defaults to UTC', () => {
  const r = parseMarkers(wf('  workflow_dispatch: # cronkick: "17 * * * *"'));
  expect(r.markers).toEqual([{ cron: '17 * * * *', tz: 'UTC', line: 3 }]);
  expect(r.flags).toEqual([]);
});

test('two markers, one with a timezone', () => {
  const r = parseMarkers(wf('  workflow_dispatch: # cronkick: "17 * * * *"\n  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin'));
  expect(r.markers.map((m) => [m.cron, m.tz])).toEqual([['17 * * * *', 'UTC'], ['0 9 * * 1-5', 'Europe/Berlin']]);
});

test.each([
  ['# cronkick: "61 * * * *"', /not a valid 5-field cron/],
  ['# cronkick: "0 0 0 * * *"', /not a valid 5-field cron/],
  ['# cronkick: "0 * * * *" tz=Mars/Base', /not an IANA timezone/],
  ['# cronkick: 0 * * * *', /write the marker as/],
])('bad marker %s is flagged with its line', (marker, msg) => {
  const r = parseMarkers(wf(`  workflow_dispatch: ${marker}`));
  expect(r.markers).toEqual([]);
  expect(r.flags[0]).toMatchObject({ line: 3, message: expect.stringMatching(msg) });
});

test('markers inside block strings are not comments', () => {
  const text = wf('  workflow_dispatch:') + '      - run: |\n          # cronkick: "1 1 * * *"\n';
  expect(parseMarkers(text).markers).toEqual([]);
});

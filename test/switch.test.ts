import { expect, test } from 'vitest';
import { switchPlan } from '../web/lib/switch.ts';

test('an hourly schedule on Free moves as-is, marker on its own line under workflow_dispatch', () => {
  const p = switchPlan('# cronkick: "0 * * * *"', 15);
  expect(p.before).toBe('on:\n  schedule:\n    - cron: "0 * * * *"');
  expect(p.after).toBe('on:\n  workflow_dispatch:\n  # cronkick: "0 * * * *"');
  expect(p.tooFast).toBe(false);
  expect(p.clamped).toBeNull();
});

test('every 5 minutes on Free is too fast: a 15-minute version is offered, the original stays for Pro', () => {
  const p = switchPlan('# cronkick: "*/5 * * * *"', 15);
  expect(p.tooFast).toBe(true);
  expect(p.after).toBe('on:\n  workflow_dispatch:\n  # cronkick: "*/5 * * * *"');
  expect(p.clamped).toBe('on:\n  workflow_dispatch:\n  # cronkick: "*/15 * * * *"');
});

test('a complex cron faster than the floor gets no automatic rewrite', () => {
  const p = switchPlan('# cronkick: "0,5,10 * * * *"', 15);
  expect(p.tooFast).toBe(true);
  expect(p.clamped).toBeNull();
});

test('timezones and several crons carry over', () => {
  const p = switchPlan('# cronkick: "0 9 * * 1-5" tz=Europe/Berlin\n# cronkick: "30 2 * * *"', 15);
  expect(p.before).toBe('on:\n  schedule:\n    - cron: "0 9 * * 1-5"\n      timezone: Europe/Berlin\n    - cron: "30 2 * * *"');
  expect(p.after).toBe('on:\n  workflow_dispatch:\n  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin\n  # cronkick: "30 2 * * *"');
  expect(p.tooFast).toBe(false);
});

test('Pro floor of 5 minutes accepts every 5 minutes', () => {
  expect(switchPlan('# cronkick: "*/5 * * * *"', 5).tooFast).toBe(false);
});

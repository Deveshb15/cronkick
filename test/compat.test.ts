import { expect, test } from 'vitest';
import { checkWorkflow } from '../src/compat.ts';

const steps = `jobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`;
const msgs = (text: string, floor = 5) => checkWorkflow(text, floor).flags.map((f) => f.message);

test('clean workflow has no flags', () => {
  const r = checkWorkflow(`on:\n  workflow_dispatch: # cronkick: "17 * * * *"\n${steps}`, 15);
  expect(r.flags).toEqual([]);
  expect(r.markers).toHaveLength(1);
});

test('no markers and no schedule: nothing to do, no flags', () => {
  expect(checkWorkflow(`on: push\n${steps}`, 5)).toEqual({ markers: [], flags: [], suggestedDiff: null });
});

test('marker without workflow_dispatch is flagged', () => {
  expect(msgs(`on:\n  push: # cronkick: "17 * * * *"\n${steps}`)).toEqual([expect.stringMatching(/Add `workflow_dispatch:`/)]);
});

test('required input without default is flagged', () => {
  const text = `on:\n  workflow_dispatch: # cronkick: "17 * * * *"\n    inputs:\n      env:\n        required: true\n${steps}`;
  expect(msgs(text)).toEqual([expect.stringMatching(/input "env" is required/)]);
});

test('required input with a default is fine', () => {
  const text = `on:\n  workflow_dispatch: # cronkick: "17 * * * *"\n    inputs:\n      env:\n        required: true\n        default: prod\n${steps}`;
  expect(msgs(text)).toEqual([]);
});

test('github.event.schedule and event_name checks are flagged', () => {
  const text = `on:\n  workflow_dispatch: # cronkick: "17 * * * *"\njobs:\n  a:\n    if: github.event_name == 'schedule'\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo \${{ github.event.schedule }}\n`;
  expect(msgs(text)).toHaveLength(2);
});

test('keeping the native schedule next to a marker is flagged', () => {
  const text = `on:\n  schedule:\n    - cron: "17 * * * *"\n  workflow_dispatch: # cronkick: "17 * * * *"\n${steps}`;
  expect(msgs(text)).toEqual([expect.stringMatching(/Remove the native `schedule:`/)]);
});

test('interval below the plan floor is flagged', () => {
  const text = `on:\n  workflow_dispatch: # cronkick: "*/10 * * * *"\n${steps}`;
  expect(msgs(text, 15)).toEqual([expect.stringMatching(/every 10 min/)]);
  expect(msgs(text, 5)).toEqual([]);
});

test('import carries every cron and its timezone', () => {
  const text = `on:\n  schedule:\n    - cron: "0 9 * * 1-5"\n      timezone: Europe/Berlin\n    - cron: "30 2 * * *"\n${steps}`;
  expect(checkWorkflow(text, 5).suggestedDiff).toBe('# cronkick: "0 9 * * 1-5" tz=Europe/Berlin\n# cronkick: "30 2 * * *"');
});

test('invalid YAML is a flag, not a crash', () => {
  expect(msgs('on: [unclosed\n')).toEqual([expect.stringMatching(/isn't valid YAML/)]);
});

test('a YAML error keeps its position but not the source line it quotes', () => {
  const { flags } = checkWorkflow('on:\n  workflow_dispatch:\njobs:\n  a:\n    steps:\n      - run: [echo PRIVATE_LITERAL,\n', 5);
  expect(flags).toHaveLength(1);
  expect(flags[0].message).toMatch(/isn't valid YAML: .* at line \d+, column \d+$/);
  expect(JSON.stringify(flags)).not.toContain('PRIVATE_LITERAL');
});

test('an unresolved alias error does not store the alias name', () => {
  const { flags } = checkWorkflow('on:\n  workflow_dispatch:\njobs: *PRIVATE_ALIAS\n', 5);
  expect(flags[0].message).toMatch(/isn't valid YAML: Unresolved alias/);
  expect(JSON.stringify(flags)).not.toContain('PRIVATE_ALIAS');
});

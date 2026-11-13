import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { checkWorkflow } from '../src/compat.ts';
import { RECIPES, recipes } from '../src/recipes.ts';

// Fixed slug and URL, so a GITHUB_APP_SLUG or BASE_URL in the shell doesn't change what's checked.
const LIST = recipes('cronkick', 'https://cronkick.xyz');

test('five recipes with unique, URL-safe slugs', () => {
  expect(RECIPES.map((r) => r.slug)).toEqual(['issue-triage', 'nightly-deps', 'docs-drift', 'flaky-tests', 'pr-digest']);
  expect(new Set(RECIPES.map((r) => r.slug)).size).toBe(RECIPES.length);
  for (const r of RECIPES) expect(r.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
});

for (const r of LIST) {
  test(`${r.slug}: valid workflow Cronkick turns on as-is`, () => {
    const doc = parse(r.yaml);
    const check = checkWorkflow(r.yaml, 15);
    expect(check.flags).toEqual([]);
    expect(check.markers).toEqual([expect.objectContaining({ cron: r.defaultCron, tz: r.defaultTz })]);
    expect(Object.keys(doc.on)).toEqual(['workflow_dispatch']);
    expect(r.yaml).not.toMatch(/^\s*schedule:/m);
    expect(doc.concurrency).toEqual({ group: `cronkick-${r.slug}`, 'cancel-in-progress': false });

    // The permissions shown on the recipe page are exactly the ones the workflow asks for.
    expect(Object.entries(doc.permissions).map(([k, v]) => `${k}: ${v}`)).toEqual(Object.keys(r.permissions));
    expect(doc.permissions['id-token']).toBe('write');

    const job = doc.jobs.run;
    expect(job['timeout-minutes']).toBe(30);
    const ids = job.steps.map((s: any) => s.id).filter(Boolean);
    expect(ids.indexOf('check')).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf('check')).toBeLessThan(ids.indexOf('agent'));
    expect(ids.indexOf('agent')).toBeLessThan(ids.indexOf('apply'));

    const agent = job.steps.find((s: any) => s.id === 'agent');
    if (r.engine === 'claude') {
      expect(agent.uses).toBe('anthropics/claude-code-action@v1');
      expect(agent.with).toMatchObject({ allowed_bots: 'cronkick', github_token: '${{ github.token }}', anthropic_api_key: '${{ secrets.ANTHROPIC_API_KEY }}' });
      expect(agent.with.claude_args).toMatch(/--max-turns \d+ --max-budget-usd [\d.]+/);
      expect(agent.with.claude_args).toMatch(/--allowedTools \S+/);
      expect(r.yaml).toMatch(/# Or a Claude subscription \(personal repos, your own usage\): claude_code_oauth_token:/);
      expect(agent.with.claude_code_oauth_token).toBeUndefined();
    } else {
      expect(agent.uses).toBe('openai/codex-action@v1');
      expect(agent.with).toMatchObject({ 'allow-bot-users': 'cronkick[bot]', 'openai-api-key': '${{ secrets.OPENAI_API_KEY }}' });
    }
    // A recipe that reads text strangers wrote can't write code.
    if (['issue-triage', 'pr-digest', 'flaky-tests'].includes(r.slug)) expect(doc.permissions.contents).toBe('read');

    const receipt = job.steps.at(-1);
    expect(receipt).toMatchObject({ name: 'Receipt to Cronkick', if: 'always()', 'continue-on-error': true });
    expect(receipt.run).toContain('audience=$aud');
    expect(receipt.run).toMatch(/\$CRONKICK\/receipts.*\|\| true$/m);
    expect(job.env).toMatchObject({ LABEL: `cronkick:${r.slug}`, CRONKICK: 'https://cronkick.xyz' });
    for (const s of r.secrets) expect(r.yaml).toContain(`secrets.${s}`);
  });
}

test('the bot and base URL come from the App slug and BASE_URL', () => {
  const [triage, , , flaky] = recipes('cronkick-dev', 'https://staging.example/');
  expect(parse(triage.yaml).jobs.run.steps.find((s: any) => s.id === 'agent').with.allowed_bots).toBe('cronkick-dev');
  expect(parse(flaky.yaml).jobs.run.steps.find((s: any) => s.id === 'agent').with['allow-bot-users']).toBe('cronkick-dev[bot]');
  expect(parse(triage.yaml).jobs.run.env.CRONKICK).toBe('https://staging.example');
});

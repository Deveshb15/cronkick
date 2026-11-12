import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';
import { PLANS } from '../../../../src/plans.ts';

export const metadata = docMeta('/docs/plans');

export default function Plans() {
  const { free, pro, team } = PLANS;
  const every = (m: number) => (m === 1 ? 'every minute' : `every ${m} minutes`);
  const paid = (p: typeof pro, who: string) =>
    `For ${who}. $${p.price!.monthly} a month or $${p.price!.yearly} a year. ${p.schedules} schedules, ${every(p.floorMinutes)} or slower, ${p.historyDays} days of history, and email alerts for missed and failed runs.`;
  return (
    <Doc href="/docs/plans">
      <H2 id="plans">Plans</H2>
      <Terms rows={[
        ['Free', `Unlimited repositories, ${free.schedules} schedules, ${every(free.floorMinutes)} or slower, ${free.historyDays} days of history.`],
        ['Pro', paid(pro, 'personal GitHub accounts')],
        ['Team', paid(team, 'GitHub organizations')],
      ]} />
      <p>Each account has one paid plan: an organization upgrades to Team, a personal account to Pro.</p>

      <H2 id="every-minute">Every-minute schedules</H2>
      <p>Each run Cronkick starts is one call to GitHub’s API, and GitHub gives each installation about 5,000 calls an hour. A schedule that runs every minute uses 60 of them, so keep every-minute schedules to about 80 per account. Past that, GitHub starts refusing calls and runs show as <strong>Gave up</strong>.</p>

      <H2 id="what-counts">What counts as a schedule</H2>
      <p>Each marker line is one schedule. A workflow with two marker lines uses two. Two identical lines in one file count once.</p>

      <H2 id="over-the-limit">Going over a limit</H2>
      <p>Over the schedule limit, Cronkick keeps schedules running repository by repository, starting with the repository it has known longest. Within a repository, older schedules come first. The rest pause. If you’ve added an alert address in Settings, we email you. A cron faster than your plan allows is marked <strong>Needs a fix</strong>. Nothing is ever charged for going over.</p>

      <H2 id="billing">Billing</H2>
      <p>Upgrade from <strong>Settings</strong> in your dashboard. Payment goes through Dodo Payments, and the plan switches within seconds of paying. <strong>Manage billing</strong> in Settings changes your card, shows invoices and cancels. After cancelling, the plan runs until the end of the period you paid for, then the account moves to Free. If a renewal payment fails, you keep the plan while Dodo retries. If it still fails, the account moves to Free and schedules over the Free limit pause. See the <a href="/refunds">refund policy</a>.</p>
    </Doc>
  );
}

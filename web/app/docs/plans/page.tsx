import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';
import { PLANS } from '../../../../src/plans.ts';

export const metadata = docMeta('/docs/plans');

export default function Plans() {
  const { free, pro } = PLANS;
  return (
    <Doc href="/docs/plans">
      <H2 id="plans">Plans</H2>
      <Terms rows={[
        ['Free', `Unlimited repositories, ${free.schedules} schedules, every ${free.floorMinutes} minutes or slower, ${free.historyDays} days of history.`],
        ['Pro', `$9 a month or $90 a year per account, activated by hand. ${pro.schedules} schedules, every ${pro.floorMinutes} minutes or slower, ${pro.historyDays} days of history, and email alerts for missed and failed runs.`],
      ]} />

      <H2 id="what-counts">What counts as a schedule</H2>
      <p>Each marker line is one schedule. A workflow with two marker lines uses two. Two identical lines in one file count once.</p>

      <H2 id="over-the-limit">Going over a limit</H2>
      <p>Over the schedule limit, Cronkick keeps schedules running repository by repository, starting with the repository it has known longest. Within a repository, older schedules come first. The rest pause. If you’ve added an alert address in Settings, we email you. A cron faster than your plan allows is marked <strong>Needs a fix</strong>. Nothing is ever charged for going over.</p>

      <H2 id="billing">Billing</H2>
      <p>Request Pro · manual activation: email <a href="mailto:hi@cronkick.xyz?subject=Cronkick%20Pro">hi@cronkick.xyz</a> and we switch your account by hand. There is no card checkout yet. To cancel, email the same address; Pro runs until the end of any period you paid for. See the <a href="/refunds">refund policy</a>.</p>
    </Doc>
  );
}

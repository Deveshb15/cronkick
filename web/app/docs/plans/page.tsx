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
        ['Pro', `$9 a month or $90 a year per account. ${pro.schedules} schedules, every ${pro.floorMinutes} minutes or slower, ${pro.historyDays} days of history, and email alerts for missed and failed runs.`],
      ]} />

      <H2 id="what-counts">What counts as a schedule</H2>
      <p>Each marker line is one schedule. A workflow with two marker lines uses two.</p>

      <H2 id="over-the-limit">Going over a limit</H2>
      <p>Over the schedule limit, the newest schedules pause and we email you. A cron faster than your plan allows is marked <strong>Needs a fix</strong>. Nothing is ever charged for going over.</p>

      <H2 id="billing">Billing</H2>
      <p>Cancel any time; Pro runs until the end of the period you paid for. See the <a href="/refunds">refund policy</a>.</p>
    </Doc>
  );
}

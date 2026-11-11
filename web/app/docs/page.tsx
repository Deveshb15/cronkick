import { Cards, Doc, H2 } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs');

export default function Introduction() {
  return (
    <Doc href="/docs">
      <p>GitHub’s <code>schedule:</code> trigger is best-effort: at busy times runs start late, and some never start. Cronkick replaces it. It triggers your workflow through <code>workflow_dispatch</code> at the scheduled time, so the job still runs on your runners, with your secrets, exactly as before.</p>

      <H2 id="how-it-works">How it works</H2>
      <ol>
        <li>You install the Cronkick GitHub App on the repositories you choose.</li>
        <li>In a workflow file, you add <code>workflow_dispatch:</code> and a comment like <code># cronkick: &quot;0 3 * * *&quot;</code>.</li>
        <li>When you push, Cronkick reads the comment. At each scheduled time it asks GitHub to start the workflow, aiming for within 30 seconds.</li>
        <li>Your dashboard records each planned run: when it was due, when Cronkick sent it, when GitHub started the run, and the result. If Cronkick itself is down, the gap is shown as an outage window.</li>
      </ol>

      <H2 id="next-steps">Next steps</H2>
      <Cards items={[
        { href: '/docs/quickstart', title: 'Quick start', body: 'Install, add one comment, push.' },
        { href: '/docs/marker', title: 'The marker', body: 'Cron syntax, time zones and several schedules.' },
        { href: '/docs/migrate', title: 'Moving from schedule:', body: 'Switch an existing workflow without double runs.' },
        { href: '/docs/statuses', title: 'Statuses', body: 'What each status on your dashboard means.' },
      ]} />
    </Doc>
  );
}

import { Doc, H2, Terms } from '@/components/docs';
import { docMeta } from '@/lib/docs';

export const metadata = docMeta('/docs/security');

export default function Security() {
  return (
    <Doc href="/docs/security">
      <H2 id="permissions">Permissions</H2>
      <Terms rows={[
        ['Actions', 'Read and write: to start workflow runs and read their results.'],
        ['Contents', 'Read: to read workflow files and find markers.'],
        ['Metadata', 'Read: required by GitHub for every app.'],
      ]} />
      <p>Cronkick uses short-lived GitHub App tokens. You never need a personal access token.</p>

      <H2 id="data">What we store</H2>
      <p>Repository and workflow names, your schedules, and the history of each scheduled run. We don’t store your code or your workflow logs. Details in the <a href="/privacy">privacy policy</a>.</p>

      <H2 id="stopping">Stopping</H2>
      <p>Remove a marker line to stop one schedule. Uninstall the GitHub App to stop everything at once; nothing is triggered after that.</p>
      <p>Questions or a security report: <a href="/support">support</a>.</p>
    </Doc>
  );
}

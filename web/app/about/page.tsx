import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'About', description: 'Who runs Cronkick, where it runs, and what happens if it shuts down.' };

// Operator facts only as stated in Terms, Privacy and deploy/README.md. Change them there first.
export default function About() {
  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>About Cronkick</h1>
        <h2>Who runs it</h2>
        <p>Cronkick is operated by Devesh Bhimanpelli (<a target="_blank" rel="noreferrer" href="https://github.com/Deveshb15">github.com/Deveshb15</a>), an individual based in India. The <a href="/terms">terms</a> are governed by the laws of India.</p>
        <h2>How to reach us</h2>
        <p>Email <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a> for support, billing, data requests and security reports. See <a href="/support">support</a>.</p>
        <h2>Where it runs</h2>
        <p>On DigitalOcean in New York, United States. Cloudflare handles DNS and network protection, Resend sends alert emails, and Sentry receives error reports. The <a href="/privacy">privacy policy</a> lists what each one gets.</p>
        <h2>What it can access</h2>
        <p>Read <a href="/docs/security">Permissions and security</a> for what the GitHub App’s permissions allow and which calls Cronkick makes.</p>
        <h2>If Cronkick shuts down</h2>
        <ul>
          <li>We give 30 days’ notice and refund any prepaid period pro rata, as the <a href="/terms">terms</a> say.</li>
          <li>Your workflows keep <code>workflow_dispatch:</code>. Moving each one back to GitHub’s scheduler is one commit; see <a href="/docs/migrate#go-back">Go back to GitHub’s scheduler</a>.</li>
          <li>Uninstalling the GitHub App stops everything at once.</li>
        </ul>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

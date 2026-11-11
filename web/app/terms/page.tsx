import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Terms' };

// Plain-language terms written for a solo operator. Not legal advice; revisit if the business structure changes.
export default function Terms() {
  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Terms of Service</h1>
        <p>Last updated 2026-11-11. Cronkick is operated by Devesh Bhimanpelli, an individual based in India (“we”). Contact: <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>. By installing the Cronkick GitHub App or using cronkick.xyz you agree to these terms.</p>
        <h2>What Cronkick does</h2>
        <p>Cronkick sends <code>workflow_dispatch</code> requests to GitHub for workflows you mark with a <code># cronkick</code> comment, and records what happened to each run it planned. If Cronkick itself is down, the gap is shown as an outage window. We control when the request is sent. GitHub controls whether and when the run starts.</p>
        <h2>What we don’t promise</h2>
        <ul>
          <li>Runner start times, or that GitHub accepts every request. When GitHub’s API fails or refuses a request, the slot shows as “Gave up”, “Refused” or “Unconfirmed”.</li>
          <li>Exactly-once runs. If a request’s outcome is unclear, we mark it unconfirmed rather than send it again.</li>
          <li>Uninterrupted service. We aim for high availability but the service may be unavailable at times.</li>
        </ul>
        <h2>Acceptable use</h2>
        <p>Use Cronkick for software development jobs that GitHub’s terms allow on GitHub Actions. Don’t use it to get around GitHub’s limits, to abuse GitHub’s API, or for anything unlawful. We may suspend accounts that do.</p>
        <h2>Plans, billing and cancellation</h2>
        <ul>
          <li>The Free plan costs nothing. Pro costs $9 per month or $90 per year per GitHub account or organization.</li>
          <li>There is no card checkout yet. Pro is requested by email and activated by hand. To cancel, email us; you keep Pro until the end of any period you paid for.</li>
          <li>At a plan limit, extra schedules pause. If you’ve added an alert address in Settings, we email you. We never charge for going over.</li>
          <li>Refunds follow our <a href="/refunds">refund policy</a>.</li>
        </ul>
        <h2>Your data</h2>
        <p>How we handle data is described in our <a href="/privacy">privacy policy</a>. You can uninstall the GitHub App at any time, which stops all scheduling immediately.</p>
        <h2>Changes and termination</h2>
        <p>We may change these terms; material changes will be announced on this page and, for paying customers, by email at least 14 days before they apply. You may stop using Cronkick at any time. We may end the service with 30 days’ notice and a pro-rata refund of any prepaid period.</p>
        <h2>Liability</h2>
        <p>Cronkick is provided “as is”, without warranties. To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to what you paid us in the 12 months before the claim.</p>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of India. We’ll always try to resolve problems by email first.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

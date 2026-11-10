import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Privacy' };

// Plain-language policy for a solo operator. Not legal advice; keep it in sync with what the code actually stores.
export default function Privacy() {
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Privacy Policy</h1>
        <p>Last updated 2026-11-10. Cronkick is operated by Devesh Bhimanpelli, an individual based in India, who is responsible for your data. Contact: <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>.</p>
        <h2>What we store</h2>
        <ul>
          <li>Your GitHub installation id, account name, and the names and ids of repositories you give the app access to.</li>
          <li>For each workflow: its path and name, the <code># cronkick</code> schedules in it, and any compatibility warnings.</li>
          <li>For each scheduled slot: due time, when we sent it, GitHub’s response, the run link and the job’s result. Deleted after 91 days.</li>
          <li>The alert email address you enter.</li>
          <li>Two cookies: a signed sign-in cookie that lasts one hour, and one that remembers which account you last opened.</li>
        </ul>
        <h2>What we don’t store</h2>
        <ul>
          <li>Your code. We read files under <code>.github/workflows/</code> to find schedules and don’t keep their contents.</li>
          <li>Personal access tokens. We use GitHub App tokens that GitHub issues for one hour at a time.</li>
          <li>Your GitHub sign-in token. At sign-in we ask GitHub which installations you can see, keep that list in the signed cookie, and discard the token.</li>
          <li>Card details. Payments go through Dodo Payments.</li>
        </ul>
        <h2>Why we use it</h2>
        <p>Only to run the service: triggering your workflows, showing their history, sending the alerts you ask for, and billing. We don’t sell data, show ads, or use your data to train models.</p>
        <h2>Who processes data for us</h2>
        <ul>
          <li>GitHub: the API we call on your behalf.</li>
          <li>DigitalOcean: hosting and database (United States).</li>
          <li>Cloudflare: DNS, network protection and email forwarding.</li>
          <li>Resend: sending alert emails.</li>
          <li>Sentry: error reports from our servers, which can include the page or webhook that failed. We don’t send personal data to it on purpose.</li>
          <li>Dodo Payments: payments and invoices, as merchant of record.</li>
        </ul>
        <h2>Your choices</h2>
        <p>Uninstall the GitHub App and we stop all scheduling at once. Email us to get a copy of, correct, or delete everything stored for your account; we do it within 30 days.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

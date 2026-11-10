import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Privacy' };

// Plain-language starting point, not legal advice. Have it reviewed before taking payments.
export default function Privacy() {
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Privacy</h1>
        <p>Last updated 2026-11-10. Cronkick is run by Devesh (<a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>).</p>
        <h2>What we store</h2>
        <ul>
          <li>Your GitHub installation id, account name, and the names and ids of repositories you give the app access to.</li>
          <li>For each workflow: its path and name, the <code># cronkick</code> schedules in it, and any compatibility warnings.</li>
          <li>For each scheduled slot: due time, when we triggered it, GitHub’s response, the run link and its result. Kept for 91 days, then deleted.</li>
          <li>The alert email address you enter.</li>
        </ul>
        <h2>What we don’t store</h2>
        <ul>
          <li>Your code. We read files under <code>.github/workflows/</code> to find schedules and don’t keep their contents.</li>
          <li>Personal access tokens. We use GitHub App tokens that GitHub issues for one hour at a time.</li>
          <li>Your GitHub sign-in token. At sign-in we ask GitHub which installations you can see, keep that list in a signed cookie for one hour, and discard the token.</li>
        </ul>
        <h2>Who processes data for us</h2>
        <p>GitHub (the API we call), DigitalOcean or Amazon Web Services (hosting and database), Resend (alert emails), Cloudflare (DNS and email forwarding), and our payment provider when you subscribe.</p>
        <h2>Deleting your data</h2>
        <p>Uninstall the GitHub App and we stop all scheduling at once. Email us to delete everything stored for your account.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

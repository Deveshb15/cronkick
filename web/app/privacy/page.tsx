import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Privacy' };

// Plain-language policy for a solo operator. Not legal advice; keep it in sync with what the code actually stores.
export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Privacy Policy</h1>
        <p>Last updated 2026-11-11. Cronkick is operated by Devesh Bhimanpelli, an individual based in India, who is responsible for your data. Contact: <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>.</p>
        <h2>What we store</h2>
        <ul>
          <li>Your GitHub installation id, account name, and the names and ids of repositories you give the app access to.</li>
          <li>For each workflow: its path and name, the <code># cronkick</code> lines in it, the crons of a leftover <code>schedule:</code> block (to suggest the switch), and any compatibility warnings. A warning can name a workflow input or give a YAML parser’s error message with its line number.</li>
          <li>For agent recipes: whether each workflow uses an agent action (Claude, Codex or GitHub Agentic Workflows), read from the same file text and used only to count agent workflows; and the receipt a recipe run sends: outcome, an optional link in your repository, an optional short reason, turns, cost, recipe and agent names. Receipts are deleted with the slot history.</li>
          <li>For each scheduled slot: due time, when we sent it, GitHub’s response, the run link and the job’s result. Deleted after 91 days.</li>
          <li>The alert email address you enter.</li>
          <li>Two cookies of our own: a signed sign-in cookie that lasts one hour, and one that remembers which account you last opened. PostHog sets its own cookie to tell visits apart.</li>
          <li>Product analytics: the pages you view, what you click, errors in your browser, and session recordings of the site with form inputs masked. Signed-in activity is linked to your GitHub user id and login.</li>
        </ul>
        <h2>What we don’t store</h2>
        <ul>
          <li>Your code. We read files under <code>.github/workflows/</code> to find schedules and keep only what’s listed above, not the files themselves.</li>
          <li>Personal access tokens. We use GitHub App tokens that GitHub issues for one hour at a time.</li>
          <li>Your GitHub sign-in token. At sign-in we ask GitHub which installations you can see, keep that list in the signed cookie, and discard the token.</li>
          <li>Model API keys or subscription tokens (Anthropic, OpenAI, Claude, ChatGPT). Agent recipes use them from your repository’s secrets on your own runners; we never receive them.</li>
          <li>Card details. Dodo Payments takes payment on its own checkout page; we only keep its customer and subscription ids and the plan you’re on.</li>
        </ul>
        <h2>Why we use it</h2>
        <p>To run the service: triggering your workflows, showing their history, sending the alerts you ask for, and billing. Analytics and recordings are used only to understand how Cronkick is used and to fix what’s confusing or broken. We don’t sell data, show ads, or use your data to train models.</p>
        <h2>Who processes data for us</h2>
        <ul>
          <li>GitHub: the API we call on your behalf.</li>
          <li>DigitalOcean: hosting and database (United States).</li>
          <li>Cloudflare: DNS, network protection and email forwarding.</li>
          <li>Resend: sending alert emails.</li>
          <li>Dodo Payments: checkout, subscriptions and invoices, as the merchant of record for paid plans.</li>
          <li>PostHog: product analytics, session recordings and error reports (United States).</li>
          <li>Sentry: error reports from our servers, which can include the page or webhook that failed. We don’t send personal data to it on purpose.</li>
        </ul>
        <h2>Your choices</h2>
        <p>Uninstall the GitHub App and we stop all scheduling at once. Email us to get a copy of, correct, or delete everything stored for your account; we do it within 30 days.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

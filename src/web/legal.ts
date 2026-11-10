import { html } from 'hono/html';
import { page } from './views.js';

// Plain-language starting point, not legal advice. Have it reviewed before taking payments.
export const privacyPage = (contact: string, login?: string) => page('Privacy · Ontime', html`
<h1>Privacy</h1>
<p>Last updated 2026-11-10. Ontime is run by Devesh (<a href="mailto:${contact}">${contact}</a>).</p>
<h2>What we store</h2>
<ul>
<li>Your GitHub installation id, account name, and the names and ids of repositories you give the app access to.</li>
<li>For each workflow: its path and name, the <code># ontime:</code> schedules in it, and any compatibility warnings.</li>
<li>For each scheduled slot: due time, when we triggered it, GitHub's response, the run link and its conclusion. Kept for 91 days, then deleted.</li>
<li>The alert email address you enter.</li>
</ul>
<h2>What we don't store</h2>
<ul>
<li>Your code. We read workflow files under <code>.github/workflows/</code> to find schedules and don't keep their contents.</li>
<li>Personal access tokens. We use GitHub App tokens that GitHub issues for one hour at a time.</li>
<li>Your GitHub sign-in token. At sign-in we ask GitHub which installations you can see, keep that list in a signed cookie for one hour, and discard the token.</li>
</ul>
<h2>Who processes data for us</h2>
<p>GitHub (the API we call), DigitalOcean or Amazon Web Services (hosting and database), Resend (alert emails), and our payment provider when you subscribe.</p>
<h2>Deleting your data</h2>
<p>Uninstall the GitHub App and we stop all scheduling at once. Email us to delete everything stored for your account.</p>`, login);

export const termsPage = (contact: string, login?: string) => page('Terms · Ontime', html`
<h1>Terms</h1>
<p>Last updated 2026-11-10. Contact: <a href="mailto:${contact}">${contact}</a>.</p>
<h2>What Ontime does</h2>
<p>Ontime sends <code>workflow_dispatch</code> requests to GitHub for workflows you mark with <code># ontime:</code>. We control when the request is sent. GitHub controls whether and when the run starts, and we show you what happened to every slot.</p>
<h2>What we don't promise</h2>
<ul>
<li>Runner start times, or that GitHub accepts every request. When GitHub's API fails, the slot shows as <code>expired</code> or <code>unknown</code>.</li>
<li>Exactly-once runs. We never send the same slot twice ourselves, but if a request's outcome is unclear we mark it <code>unknown</code> rather than retry it.</li>
</ul>
<h2>Fair use</h2>
<p>Use Ontime for software development jobs that GitHub's terms allow on Actions. Don't use it to get around GitHub's limits.</p>
<h2>Plans and billing</h2>
<p>When you reach a plan limit, extra schedules are paused and we email you. We never charge for going over. Paid plans renew monthly or yearly until you cancel.</p>
<h2>Liability</h2>
<p>Ontime is provided as is. Our total liability is limited to what you paid us in the 12 months before a claim.</p>`, login);

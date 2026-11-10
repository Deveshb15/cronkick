import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Terms' };

export default function Terms() {
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Terms</h1>
        <p>Last updated 2026-11-10. Contact: <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>.</p>
        <h2>What Cronkick does</h2>
        <p>Cronkick sends <code>workflow_dispatch</code> requests to GitHub for workflows you mark with <code># cronkick</code>. We control when the request is sent. GitHub controls whether and when the run starts, and we show you what happened to every slot.</p>
        <h2>What we don’t promise</h2>
        <ul>
          <li>Runner start times, or that GitHub accepts every request. When GitHub’s API fails, the slot shows as expired or unknown.</li>
          <li>Exactly-once runs. We never send the same slot twice ourselves, but if a request’s outcome is unclear we mark it unknown rather than retry it.</li>
        </ul>
        <h2>Fair use</h2>
        <p>Use Cronkick for software development jobs that GitHub’s terms allow on Actions. Don’t use it to get around GitHub’s limits.</p>
        <h2>Plans and billing</h2>
        <p>When you reach a plan limit, extra schedules are paused and we email you. We never charge for going over. Paid plans renew monthly or yearly until you cancel.</p>
        <h2>Liability</h2>
        <p>Cronkick is provided as is. Our total liability is limited to what you paid us in the 12 months before a claim.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

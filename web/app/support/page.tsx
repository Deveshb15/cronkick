import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Support' };

export default function Support() {
  return (
    <>
      <SiteHeader signedIn={false} />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Support</h1>
        <p>Email <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a>. A person reads every message and replies within two business days, usually much sooner.</p>
        <h2>Include, if you can</h2>
        <ul>
          <li>Your GitHub account or organization name.</li>
          <li>The repository and workflow file, and the time (with time zone) of the run in question.</li>
        </ul>
        <h2>Quick answers</h2>
        <ul>
          <li><a href="/#how-it-works">How setup works</a>: three steps, about two minutes.</li>
          <li><a href="/#pricing">Plans and limits</a>.</li>
          <li><a href="/lateness">How late GitHub’s own scheduler runs</a>, measured live.</li>
          <li><a href="/refunds">Refunds</a>, <a href="/terms">terms</a> and <a href="/privacy">privacy</a>.</li>
        </ul>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

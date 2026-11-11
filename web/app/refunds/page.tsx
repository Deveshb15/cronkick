import type { Metadata } from 'next';
import { Prose, SiteFooter, SiteHeader } from '@/components/site';

export const metadata: Metadata = { title: 'Refunds' };

export default function Refunds() {
  return (
    <>
      <SiteHeader />
      <main className="px-4 pt-12 pb-24 sm:px-6 lg:px-8"><div className="mx-auto max-w-6xl"><Prose>
        <h1>Refund policy</h1>
        <p>Last updated 2026-11-11. There is no card checkout yet: Pro is requested by email and activated by hand.</p>
        <h2>The short version</h2>
        <ul>
          <li><strong>Any charge, refunded in full within 14 days</strong>, monthly or yearly. No questions asked.</li>
          <li>After 14 days a charge isn’t refundable, but you can cancel at any time and keep Pro until the end of the period you paid for.</li>
          <li>If Cronkick has an outage that is our fault and you lose scheduled runs because of it, email us and we’ll credit or refund that month.</li>
        </ul>
        <h2>How to ask</h2>
        <p>Email <a href="mailto:hi@cronkick.xyz">hi@cronkick.xyz</a> with your GitHub account or organization name. We refund to the way you paid.</p>
        <h2>Free plan</h2>
        <p>The Free plan is free; there’s nothing to refund.</p>
      </Prose></div></main>
      <SiteFooter />
    </>
  );
}

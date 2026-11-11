import Link from 'next/link';
import type { ReactNode } from 'react';
import { GitHubMark } from './icons';
import { Lockup } from './logo';
import { ButtonLink } from './ui';
import { installUrl } from '@/lib/format';
import { getSession } from '@/lib/session';
import { SiteMenu } from './site-menu';

export const container = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8';

export function Logo({ className = 'h-6' }: { className?: string }) {
  return <Link href="/" aria-label="Homepage" className="flex shrink-0 items-center"><Lockup className={className} /></Link>;
}

/** Reads the session itself, so every public page shows Dashboard to a signed-in visitor. */
export async function SiteHeader() {
  const signedIn = !!(await getSession());
  const link = 'text-sm/6 font-medium text-zinc-400 hover:text-white';
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-ink/80 backdrop-blur">
      <div className={`${container} flex items-center justify-between gap-x-6 py-3.5`}>
        <div className="flex flex-1 items-center"><Logo /></div>
        <nav className="flex items-center gap-x-8 max-md:hidden">
          <Link href="/#how-it-works" className={link}>How it works</Link>
          <Link href="/#pricing" className={link}>Pricing</Link>
          <Link href="/docs" className={link}>Docs</Link>
          <Link href="/lateness" className={link}>GitHub lateness</Link>
        </nav>
        <div className="flex flex-1 items-center justify-end gap-x-2">
          {signedIn ? (
            <ButtonLink href="/dashboard" prefetch={false} size="sm">Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" prefetch={false} size="sm" variant="ghost">Sign in</ButtonLink>
              <ButtonLink href={installUrl()} size="sm" className="pl-2"><GitHubMark className="size-4" />Install</ButtonLink>
            </>
          )}
          <SiteMenu signedIn={signedIn} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const link = 'hover:text-white';
  return (
    <footer className="overflow-hidden border-t border-white/5">
      <div className={`${container} flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between`}>
        <p className="text-sm/6 text-zinc-500">© 2026 Cronkick. Operated by Devesh Bhimanpelli, India.</p>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-base/6 font-normal text-zinc-400 sm:text-sm/6">
          <Link href="/lateness" className={link}>GitHub lateness</Link>
          <Link href="/privacy" className={link}>Privacy</Link>
          <Link href="/terms" className={link}>Terms</Link>
          <Link href="/docs" className={link}>Docs</Link>
          <Link href="/docs/security" className={link}>Security</Link>
          <Link href="/about" className={link}>About</Link>
          <Link href="/refunds" className={link}>Refunds</Link>
          <Link href="/support" className={link}>Support</Link>
          <a href="mailto:hi@cronkick.xyz" className={link}>hi@cronkick.xyz</a>
        </nav>
      </div>
      {/* fal-style sign-off: the lockup at full width, cut by the page edge */}
      <div className={`${container} pb-0`}><Lockup className="-mb-[3%] h-auto w-full text-white/[0.06] [&_path:first-child]:fill-white/[0.06]" /></div>
    </footer>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[65ch] text-base/7 text-zinc-300 sm:text-sm/6 [&_h1]:text-4xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-white [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-white [&_a]:underline [&_code]:font-mono [&_code]:text-zinc-200">{children}</div>;
}

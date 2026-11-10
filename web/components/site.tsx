import Link from 'next/link';
import type { ReactNode } from 'react';
import { ButtonLink } from './ui';
import { installUrl } from '@/lib/format';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link href="/" aria-label="Homepage" className={`flex items-center gap-x-2 ${className}`}>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-500 font-mono text-sm/none font-semibold text-white">ck</span>
      <span className="text-base/6 font-semibold tracking-tight">Cronkick</span>
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-x-6 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-1 items-center"><Logo /></div>
        <nav className="flex items-center gap-x-8 text-sm/6 font-medium text-zinc-600 max-md:hidden dark:text-zinc-400">
          <Link href="/#how-it-works" className="hover:text-zinc-950 dark:hover:text-white">How it works</Link>
          <Link href="/#pricing" className="hover:text-zinc-950 dark:hover:text-white">Pricing</Link>
          <Link href="/lateness" className="hover:text-zinc-950 dark:hover:text-white">GitHub lateness</Link>
        </nav>
        <div className="flex flex-1 items-center justify-end gap-x-2">
          {signedIn ? (
            <ButtonLink href="/dashboard" prefetch={false} size="sm" variant="secondary">Dashboard</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/login" prefetch={false} size="sm" variant="ghost">Sign in</ButtonLink>
              <ButtonLink href={installUrl()} size="sm" variant="secondary">Install</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-zinc-950/5 dark:border-white/10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <Logo />
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-base/6 font-normal text-zinc-600 sm:text-sm/6 dark:text-zinc-400">
          <Link href="/lateness" className="hover:text-zinc-950 dark:hover:text-white">GitHub lateness</Link>
          <Link href="/privacy" className="hover:text-zinc-950 dark:hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-zinc-950 dark:hover:text-white">Terms</Link>
          <a href="mailto:hi@cronkick.xyz" className="hover:text-zinc-950 dark:hover:text-white">hi@cronkick.xyz</a>
        </nav>
      </div>
    </footer>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[65ch] text-base/7 text-zinc-700 sm:text-sm/6 dark:text-zinc-300 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-zinc-950 dark:[&_h1]:text-white [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-zinc-950 dark:[&_h2]:text-white [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-zinc-950 [&_a]:underline dark:[&_a]:text-white">{children}</div>;
}

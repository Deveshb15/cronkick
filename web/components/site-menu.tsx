'use client';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/** The header nav below md: a disclosure button and a panel under the header. Escape or a click outside closes it. */
export function SiteMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus(); } };
    const click = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', key);
    document.addEventListener('click', click);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('click', click); };
  }, [open]);
  const link = 'block rounded-lg px-3 py-2.5 text-base/6 font-medium text-zinc-300 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-brand-500';
  return (
    // No `relative` here: the panel positions against the header capsule, so it drops down at the capsule's width.
    <div ref={root} className="lg:hidden">
      <button ref={button} type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(!open)}
        className="grid size-9 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500">
        {open ? <XMarkIcon aria-hidden="true" className="size-5 fill-current" /> : <Bars3Icon aria-hidden="true" className="size-5 fill-current" />}
        <span className="sr-only">Menu</span>
      </button>
      <nav id="site-menu" hidden={!open} onClick={(e) => { if ((e.target as Element).closest('a')) setOpen(false); }}
        className="absolute inset-x-0 top-full mt-2 rounded-[1.25rem] bg-zinc-900 p-2 inset-ring inset-ring-white/10">
        <Link href="/#how-it-works" className={link}>How it works</Link>
        <Link href="/#pricing" className={link}>Pricing</Link>
        <Link href="/recipes" className={link}>Recipes</Link>
        <Link href="/docs" className={link}>Docs</Link>
        <Link href="/docs/security" className={link}>Security</Link>
        <Link href="/lateness" className={link}>GitHub lateness</Link>
        <Link href={signedIn ? '/dashboard' : '/login'} prefetch={false} className={link}>{signedIn ? 'Dashboard' : 'Sign in'}</Link>
      </nav>
    </div>
  );
}

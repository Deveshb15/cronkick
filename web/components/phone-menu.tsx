'use client';
import { Bars3Icon } from '@heroicons/react/16/solid';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The dashboard menu on phones: a disclosure next to (not around) the logo link. It closes when a link inside it
 * navigates, and on Escape, handing focus back to the button that opened it.
 */
export function PhoneMenu({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  const path = usePathname();
  useEffect(() => { if (box.current) box.current.open = false; }, [path]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      // The account list inside the menu closes first; the next Escape closes the menu.
      if (e.key !== 'Escape' || !box.current?.open || box.current.querySelector('#accounts')) return;
      box.current.open = false;
      box.current.querySelector('summary')?.focus();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  return (
    <details ref={box} className="group static">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-x-2 rounded-lg px-2 text-sm/6 font-medium text-zinc-300 [&::-webkit-details-marker]:hidden">
        {label}
        <Bars3Icon aria-hidden="true" className="size-5 shrink-0 fill-current" />
        <span className="sr-only">Menu</span>
      </summary>
      <div className="absolute inset-x-0 top-full z-30 h-[calc(100dvh-3.75rem)] overflow-y-auto border-b border-white/10 bg-zinc-950 px-4 py-4 shadow-2xl">{children}</div>
    </details>
  );
}

'use client';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DOCS, PAGES } from '@/lib/docs';

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-8 text-sm/6">
      {DOCS.map((g) => (
        <div key={g.group}>
          <h2 className="font-medium text-white">{g.group}</h2>
          <ul role="list" className="mt-2 border-l border-white/10">
            {g.items.map((i) => {
              const on = pathname === i.href;
              return (
                <li key={i.href}>
                  <Link href={i.href} aria-current={on ? 'page' : undefined}
                    className={`-ml-px block border-l py-1 pl-4 transition-colors ${on ? 'border-brand-500 font-medium text-brand-400' : 'border-transparent text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}>
                    {i.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Phones: the sidebar folds into a menu above the page. Keyed by path so it closes after you pick a page. */
export function MobileDocsNav() {
  const pathname = usePathname();
  const current = PAGES.find((p) => p.href === pathname);
  return (
    <details key={pathname} className="group mb-8 rounded-xl bg-white/[0.03] inset-ring inset-ring-white/10 lg:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm/6 [&::-webkit-details-marker]:hidden">
        <span><span className="text-zinc-500">{current?.group} /</span> <span className="font-medium text-white">{current?.title}</span></span>
        <ChevronDownIcon aria-hidden="true" className="size-4 fill-zinc-500 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-white/5 px-4 py-5"><DocsNav /></div>
    </details>
  );
}

/** "On this page": the page's h2s, with the one you're reading highlighted. */
export function Toc() {
  const pathname = usePathname();
  const [items, setItems] = useState<{ id: string; text: string }[]>([]);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const hs = [...document.querySelectorAll<HTMLElement>('article h2[id]')];
    setItems(hs.map((h) => ({ id: h.id, text: h.textContent ?? '' })));
    setActive(hs[0]?.id ?? null);
    const obs = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: '-80px 0px -70% 0px' });
    hs.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [pathname]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="On this page" className="text-sm/6">
      <h2 className="font-medium text-white">On this page</h2>
      <ul role="list" className="mt-3 space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className={`block transition-colors ${active === i.id ? 'text-brand-400' : 'text-zinc-500 hover:text-zinc-300'}`}>{i.text}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PrevNext() {
  const pathname = usePathname();
  const i = PAGES.findIndex((p) => p.href === pathname);
  if (i < 0) return null;
  const prev = PAGES[i - 1];
  const next = PAGES[i + 1];
  const card = 'group flex flex-col gap-1 rounded-xl p-4 inset-ring inset-ring-white/10 transition hover:bg-white/[0.03] hover:inset-ring-white/20';
  return (
    <nav aria-label="Previous and next page" className="mt-16 grid gap-4 border-t border-white/5 pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className={card}>
          <span className="flex items-center gap-1 text-xs/5 text-zinc-500"><ChevronLeftIcon aria-hidden="true" className="size-3.5 fill-current" />Previous</span>
          <span className="text-sm/6 font-medium text-white group-hover:text-brand-400">{prev.title}</span>
        </Link>
      ) : <span />}
      {next && (
        <Link href={next.href} className={`${card} sm:items-end sm:text-right`}>
          <span className="flex items-center gap-1 text-xs/5 text-zinc-500">Next<ChevronRightIcon aria-hidden="true" className="size-3.5 fill-current" /></span>
          <span className="text-sm/6 font-medium text-white group-hover:text-brand-400">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  return <button type="button" onClick={copy} className="rounded-md px-2 py-0.5 text-xs/5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200">{copied ? 'Copied ✓' : 'Copy'}</button>;
}

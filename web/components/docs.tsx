import { LinkIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { page } from '@/lib/docs';
import { CopyButton } from './docs-nav';

const prose = [
  'text-[0.9375rem]/7 text-zinc-300',
  '[&_p]:mt-4 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-2 [&_li]:pl-1 [&_li]:marker:text-zinc-600',
  '[&_a:not(.plain)]:font-medium [&_a:not(.plain)]:text-white [&_a:not(.plain)]:underline [&_a:not(.plain)]:decoration-brand-500/50 [&_a:not(.plain)]:underline-offset-4 [&_a:not(.plain):hover]:decoration-brand-500',
  '[&_:not(pre)>code]:rounded-md [&_:not(pre)>code]:bg-white/5 [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.8125rem] [&_:not(pre)>code]:text-zinc-200 [&_:not(pre)>code]:inset-ring [&_:not(pre)>code]:inset-ring-white/10',
  '[&_strong]:font-semibold [&_strong]:text-white',
].join(' ');

/** One docs page: group eyebrow, title and lead from lib/docs.ts, then the content. */
export function Doc({ href, children }: { href: string; children: ReactNode }) {
  const p = page(href);
  return (
    <article>
      <p className="font-mono text-xs/5 tracking-wider text-brand-400 uppercase">{p.group}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-pretty text-white sm:text-4xl">{p.title}</h1>
      <p className="mt-4 text-lg/8 text-pretty text-zinc-400">{p.description}</p>
      <div className={`mt-10 border-t border-white/5 pt-2 ${prose}`}>{children}</div>
    </article>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="group/h mt-12 scroll-mt-24 text-xl/8 font-semibold tracking-tight text-white">
      <a href={`#${id}`} className="plain inline-flex items-center gap-2">
        {children}
        <LinkIcon aria-hidden="true" className="size-4 fill-zinc-600 opacity-0 transition group-hover/h:opacity-100" />
      </a>
    </h2>
  );
}

export function Code({ title, children }: { title?: string; children: string }) {
  return (
    <div className="relative mt-6 overflow-hidden rounded-xl bg-zinc-950 inset-ring inset-ring-white/10">
      {title ? (
        <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] py-1.5 pr-2 pl-4">
          <span className="font-mono text-xs/5 text-zinc-500">{title}</span>
          <CopyButton text={children} />
        </div>
      ) : <div className="absolute top-2.5 right-2"><CopyButton text={children} /></div>}
      <pre className={`overflow-x-auto p-4 font-mono text-[0.8125rem]/6 text-zinc-200 ${title ? '' : 'pr-16'}`}><code>{children}</code></pre>
    </div>
  );
}

export function Callout({ tone = 'note', title, children }: { tone?: 'note' | 'warn'; title: string; children: ReactNode }) {
  const t = tone === 'warn' ? 'bg-orange-400/[0.06] inset-ring-orange-400/20 [&>p:first-child]:text-orange-300' : 'bg-brand-500/[0.05] inset-ring-brand-500/20 [&>p:first-child]:text-brand-400';
  return (
    <div className={`mt-6 rounded-xl px-4 py-3 text-sm/6 inset-ring ${t}`}>
      <p className="font-medium">{title}</p>
      <div className="text-zinc-300 [&>p]:mt-1">{children}</div>
    </div>
  );
}

/** A two-column reference table (term, meaning). */
export function Terms({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl inset-ring inset-ring-white/10">
      <table className="w-full text-left text-sm/6">
        <tbody className="divide-y divide-white/5">
          {rows.map(([k, v], i) => (
            <tr key={i} className="block sm:table-row">
              <th scope="row" className="block px-4 pt-3 text-left align-top font-medium text-white sm:table-cell sm:w-44 sm:py-3 sm:pr-4">{k}</th>
              <td className="block px-4 pt-1 pb-3 text-zinc-400 sm:table-cell sm:py-3 sm:pl-0">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Cards({ items }: { items: { href: string; title: string; body: string }[] }) {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <Link key={c.href} href={c.href} className="plain group rounded-xl p-4 inset-ring inset-ring-white/10 transition hover:bg-white/[0.03] hover:inset-ring-white/20">
          <p className="mt-0! text-sm/6 font-medium text-white group-hover:text-brand-400">{c.title} →</p>
          <p className="mt-1! text-sm/6 text-zinc-400">{c.body}</p>
        </Link>
      ))}
    </div>
  );
}

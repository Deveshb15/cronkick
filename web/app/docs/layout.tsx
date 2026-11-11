import type { ReactNode } from 'react';
import { DocsNav, MobileDocsNav, PrevNext, Toc } from '@/components/docs-nav';
import { container, SiteFooter, SiteHeader } from '@/components/site';

// Sidebar | page | "On this page", like most developer docs. The two side columns stick under the header.
export default function DocsLayout({ children }: { children: ReactNode }) {
  const side = 'sticky top-16 h-[calc(100dvh-4rem)] overflow-y-auto';
  return (
    <>
      <SiteHeader />
      <div className={`${container} lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-10 xl:grid-cols-[13rem_minmax(0,1fr)_11rem]`}>
        <aside className={`${side} border-r border-white/5 py-10 pr-4 max-lg:hidden`}><DocsNav /></aside>
        <main className="min-w-0 pt-8 pb-24 lg:pt-12">
          <MobileDocsNav />
          <div className="mx-auto max-w-3xl">{children}<PrevNext /></div>
        </main>
        <aside className={`${side} py-12 max-xl:hidden`}><Toc /></aside>
      </div>
      <SiteFooter />
    </>
  );
}

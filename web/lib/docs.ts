import type { Metadata } from 'next';

/** Every docs page, in sidebar order. The sidebar, page headers, titles and prev/next links all read from here. */
export const DOCS = [
  { group: 'Getting started', items: [
    { href: '/docs', title: 'Introduction', description: 'Cronkick triggers your GitHub Actions workflows on schedule, on your own runners.' },
    { href: '/docs/quickstart', title: 'Quick start', description: 'Install the app, add one comment, push. Setup takes a few minutes; the first run comes at its next scheduled time.' },
  ] },
  { group: 'Guides', items: [
    { href: '/docs/marker', title: 'The marker', description: 'The one-line comment that tells Cronkick when to run a workflow.' },
    { href: '/docs/migrate', title: 'Moving from schedule:', description: 'Switch an existing scheduled workflow over without running it twice, and how to switch back.' },
  ] },
  { group: 'Reference', items: [
    { href: '/docs/checks', title: 'Compatibility checks', description: 'What Cronkick checks before it turns a workflow on, and how to fix each one.' },
    { href: '/docs/timing', title: 'Timing and retries', description: 'How fast runs are sent, what happens when GitHub or Cronkick fails, and why unclear sends aren’t repeated.' },
    { href: '/docs/statuses', title: 'Statuses', description: 'What each status on your dashboard means.' },
  ] },
  { group: 'Account', items: [
    { href: '/docs/plans', title: 'Plans and limits', description: 'What Free, Pro and Team include, how billing works, and what happens when you go over a limit.' },
    { href: '/docs/security', title: 'Permissions and security', description: 'What the GitHub App’s permissions allow, which calls Cronkick makes, what it stores, and how to stop it.' },
  ] },
];

export const PAGES = DOCS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })));
export const page = (href: string) => PAGES.find((p) => p.href === href)!;

export function docMeta(href: string): Metadata {
  const p = page(href);
  return { title: href === '/docs' ? 'Docs' : `${p.title} · Docs`, description: p.description };
}

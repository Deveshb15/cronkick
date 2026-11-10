import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Cronkick: scheduled GitHub Actions that run on time', template: '%s · Cronkick' },
  description: "GitHub's schedule: trigger is best-effort. Cronkick triggers your workflows on time from a comment in your workflow file, and shows you every run.",
  metadataBase: new URL(process.env.BASE_URL ?? 'https://cronkick.xyz'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="bg-white antialiased dark:bg-zinc-950">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
      </head>
      <body className="font-sans text-zinc-950 dark:text-white">
        <div className="isolate">{children}</div>
      </body>
    </html>
  );
}

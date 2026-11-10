import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Cronkick: scheduled GitHub Actions that run on time', template: '%s · Cronkick' },
  description: "GitHub's schedule trigger delays and drops runs. Cronkick fires your workflows on time from one comment in your workflow file, and records every run.",
  metadataBase: new URL(process.env.BASE_URL ?? 'https://cronkick.xyz'),
  icons: { icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }], apple: '/apple-touch-icon.png' },
  manifest: '/site.webmanifest',
};

export const viewport = { themeColor: '#09090b' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="scheme-only-dark bg-ink antialiased">
      <head>
        <link rel="preconnect" href="https://rsms.me/" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" />
      </head>
      <body className="font-sans text-white">
        <div className="isolate">{children}</div>
      </body>
    </html>
  );
}

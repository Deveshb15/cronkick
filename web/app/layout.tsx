import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Cronkick: cron for GitHub Actions', template: '%s · Cronkick' },
  description: "GitHub's schedule trigger can delay and drop runs. Cronkick sends your workflows within seconds of their scheduled time, from one comment in the workflow file, and shows what happened to each run.",
  metadataBase: new URL(process.env.BASE_URL ?? 'https://cronkick.xyz'),
  // Static share image (brand lockup + pitch), 1200×630. No page sets its own openGraph, so this applies site-wide.
  openGraph: { type: 'website', siteName: 'Cronkick', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Cronkick: cron for GitHub Actions, from one comment in your workflow file' }] },
  twitter: { card: 'summary_large_image' }, // title, description and image are filled from openGraph
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
        {/* During a deploy the two servers briefly run different builds; a page from one can ask the other for a script
            it doesn't have. Then the page would sit there without JavaScript, so reload it once (at most every 30 s). */}
        <script dangerouslySetInnerHTML={{ __html: `addEventListener('error',function(e){var t=e.target;if(!t||t.tagName!=='SCRIPT'||(t.src||'').indexOf('/_next/static/')<0)return;try{var k='ck-reload',l=+sessionStorage.getItem(k)||0;if(Date.now()-l<30000)return;sessionStorage.setItem(k,Date.now())}catch(x){}location.reload()},true)` }} />
      </head>
      <body className="font-sans text-white">
        <div className="isolate">{children}</div>
      </body>
    </html>
  );
}

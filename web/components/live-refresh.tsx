'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Status = 'connecting' | 'live' | 'reconnecting';

/**
 * Keeps the dashboard current without reloading: the server pushes a message over Server-Sent Events when this
 * installation's data changes, and we re-render the server components in place (router.refresh keeps scroll and state).
 */
export function LiveRefresh({ installationId }: { installationId: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('connecting');

  // Tell the server the viewer's time zone, so daily cells are the viewer's days. Refresh once when it changes.
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || document.cookie.split('; ').includes(`tz=${tz}`)) return;
    document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  useEffect(() => {
    let es: EventSource | null = null;
    let stale = false;
    let queued: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let backoff = 1000;

    // A burst of changes (one slot firing in several repos) becomes one re-render. Hidden tabs catch up when shown.
    const refresh = () => {
      if (document.visibilityState !== 'visible') { stale = true; return; }
      stale = false;
      clearTimeout(queued);
      queued = setTimeout(() => router.refresh(), 300);
    };
    const connect = () => {
      es = new EventSource(`/dashboard/${installationId}/events`);
      es.onopen = () => { setStatus('live'); backoff = 1000; };
      es.onmessage = refresh;
      es.onerror = () => {
        if (es?.readyState !== EventSource.CLOSED) { setStatus('reconnecting'); return; } // the browser retries by itself
        // Refused (signed out, or the server is restarting): re-render, which sends a signed-out user to sign in, then retry.
        setStatus('reconnecting');
        es.close();
        router.refresh();
        retry = setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      };
    };
    const onVisible = () => { if (document.visibilityState === 'visible' && stale) refresh(); };
    // Relative times ("next in 4m") are rendered on the server, so re-render once a minute even when nothing changed.
    const minute = setInterval(refresh, 60_000);

    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es?.close();
      clearTimeout(queued);
      clearTimeout(retry);
      clearInterval(minute);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [installationId, router]);

  const live = status === 'live';
  return (
    <p className="flex items-center gap-x-1.5 rounded-full py-0.5 pr-2.5 pl-2 text-xs/5 font-medium text-zinc-300 inset-ring inset-ring-white/10"
      title={live ? 'This page updates on its own as runs happen' : 'Lost the connection for live updates; trying again'}>
      {/* The page's connection, not the account's health: green only means new runs will show up without a reload. */}
      <span aria-hidden="true" className={`size-1.5 rounded-full ${live ? 'bg-emerald-400' : status === 'connecting' ? 'bg-zinc-500' : 'bg-orange-400'}`} />
      {live ? 'Live' : status === 'connecting' ? 'Connecting…' : 'Reconnecting…'}
    </p>
  );
}

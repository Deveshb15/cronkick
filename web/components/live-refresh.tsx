'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Re-renders the dashboard every few seconds while the tab is visible, so pushes and runs show up without a reload. */
// ponytail: polling; switch to SSE or Postgres LISTEN/NOTIFY once many people keep dashboards open at once.
export function LiveRefresh() {
  const router = useRouter();
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      router.refresh();
      setAt(Date.now());
    };
    const timer = window.setInterval(tick, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); clearInterval(clock); document.removeEventListener('visibilitychange', tick); };
  }, [router]);

  const ago = at === null ? null : Math.max(0, Math.round((now - at) / 1000));
  return (
    <p className="flex items-center gap-x-2 font-mono text-xs/5 text-zinc-500" title="This page updates on its own">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
      </span>
      Live{ago !== null && <span className="text-zinc-600">· updated {ago}s ago</span>}
    </p>
  );
}

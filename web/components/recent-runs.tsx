'use client';
import Link from 'next/link';
import type { ActivityItem } from '@/lib/data';
import { fmtDelay } from '@/lib/live';
import { Time, useArrivals } from './live';
import { COLOR } from './live-strip';
import { SLOT_LABEL } from './ui';

/** The latest runs Cronkick sent (or should have), newest first; a run arriving live slides in once. */
export function RecentRuns({ installationId, items, className = '' }: { installationId: number; items: ActivityItem[]; className?: string }) {
  const fresh = useArrivals(items.map((i) => i.id));
  return (
    <section aria-labelledby="recent" className={`tile p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 id="recent" className="text-sm/6 font-semibold">Latest runs</h2>
        <span className="flex items-center gap-2 text-xs/5 text-zinc-400"><span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-emerald-400" />live</span>
      </div>
      {items.length ? (
        <ol role="list" className="mt-3 -mx-2">
          {items.slice(0, 5).map((i) => (
            <li key={i.id} className={fresh.has(i.id) ? 'animate-rise-sm row-flash rounded-lg' : ''}>
              <Link href={`/dashboard/${installationId}/workflows/${i.workflowId}?before=${encodeURIComponent(new Date(Date.parse(i.due) + 1).toISOString())}#slot-${i.id}`}
                className="grid grid-cols-[0.5rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-2 text-[13px]/5 hover:bg-white/[0.04]">
                <span aria-hidden="true" className={`h-4 w-1.5 rounded-full ${COLOR[i.tick]}`} />
                <span className="min-w-0 truncate"><span className="font-medium">{i.workflow}</span> <span className="text-zinc-500">· {SLOT_LABEL[i.display]}{i.sendDelayMs !== null ? ` ${fmtDelay(i.sendDelayMs)}` : ''}</span></span>
                <Time iso={i.due} className="font-mono text-xs text-zinc-500 tabular-nums" />
              </Link>
            </li>
          ))}
        </ol>
      ) : <p className="mt-3 text-sm/6 text-zinc-400">Nothing sent yet.</p>}
    </section>
  );
}

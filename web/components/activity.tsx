'use client';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { useEffect, useRef, useState } from 'react';
import type { ActivityItem } from '@/lib/data';
import { fmtDelay, newIds } from '@/lib/live';
import { JobResult, SLOT_ICON, SLOT_LABEL, SLOT_TONE, slotHelp, tones } from './ui';
import { Time, useArrivals } from './live';

const ok = (s: string) => s === 'accepted' || s === 'fired';
// Same tone and icon as the slot's pill: unconfirmed is amber, not a red miss.
const tone = (i: ActivityItem) => tones[SLOT_TONE[i.display] ?? 'zinc'];
const Icon = ({ i, className }: { i: ActivityItem; className: string }) => {
  const I = SLOT_ICON[i.display];
  return I ? <I aria-hidden="true" className={`${className} fill-current`} /> : null;
};
const sent = (i: ActivityItem) => fmtDelay(i.sendDelayMs);
const short = (repo: string) => repo.split('/')[1] ?? repo;

/** Newest dispatches across the account. Rows that arrive while the page is open flash once. */
export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const fresh = useArrivals(items.map((i) => i.id));
  if (!items.length) return <p className="rounded-2xl px-4 py-6 text-sm/6 text-zinc-500 ring-1 ring-white/10 ring-inset">Dispatches show up here as they happen.</p>;
  return (
    <ul role="list" className="divide-y divide-white/5 rounded-2xl text-sm/6 ring-1 ring-white/10 ring-inset">
      {items.map((i) => (
        <li key={i.id} className={`flex items-center gap-x-3 px-4 py-2.5 max-sm:flex-wrap max-sm:gap-y-0.5 ${fresh.has(i.id) ? 'row-flash' : ''}`}>
          <span title={slotHelp(i.display, i.retrying)} className={`grid size-5 shrink-0 place-items-center rounded-full ${tone(i)}`}>
            <Icon i={i} className="size-3.5" />
          </span>
          <Time iso={i.due} className="w-12 shrink-0 font-mono text-xs/5 text-zinc-500" />
          <span className="min-w-0 truncate max-sm:flex-1">{i.workflow} <span className="text-zinc-500">· {short(i.repo)}</span></span>
          <span className={`shrink-0 rounded-sm px-1 font-mono text-xs/5 ${ok(i.state) ? 'text-emerald-300' : tone(i)}`}>{ok(i.state) ? sent(i) : SLOT_LABEL[i.display]}</span>
          {/* Below sm the job result gets its own line, under the time, instead of being cut. */}
          <span className="shrink-0 text-xs/5 max-sm:order-last max-sm:w-full max-sm:pl-8 sm:ml-auto"><JobResult conclusion={i.conclusion} display={i.display} /></span>
          {i.runUrl && <a href={i.runUrl} className="shrink-0 font-mono text-xs/5 text-zinc-400 hover:text-white">run ↗</a>}
        </li>
      ))}
    </ul>
  );
}

type Toast = { id: number; item: ActivityItem };

/** A toast for each dispatch that happens while the page is open. Successes fade after 6 s; problems stay until closed. */
export function DispatchToasts({ items }: { items: ActivityItem[] }) {
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const key = items.map((i) => i.id).join(',');
  useEffect(() => {
    const fresh = newIds(seen.current, items.map((i) => i.id), first.current);
    first.current = false;
    if (!fresh.length) return;
    const add = items.filter((i) => fresh.includes(i.id)).map((item) => ({ id: item.id, item }));
    setToasts((t) => [...add, ...t].slice(0, 3));
    add.filter((t) => ok(t.item.state)).forEach((t) => setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id)), 6000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const close = (id: number) => setToasts((all) => all.filter((x) => x.id !== id));
  return (
    <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-40 flex w-80 flex-col gap-2 sm:right-6 sm:bottom-6">
      {toasts.map(({ id, item }) => (
        <div key={id} className="pointer-events-auto flex animate-pop items-start gap-x-3 rounded-xl bg-zinc-900/95 py-3 pr-3 pl-3.5 shadow-2xl ring-1 shadow-black/50 ring-white/10 backdrop-blur">
          <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${tone(item)}`}>
            <Icon i={item} className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm/5 font-medium">{ok(item.state) ? `Sent ${item.workflow}` : `${SLOT_LABEL[item.display]}: ${item.workflow}`}</p>
            <p className="truncate font-mono text-[0.6875rem]/5 text-zinc-500">{short(item.repo)} · {ok(item.state) ? sent(item) : slotHelp(item.display, item.retrying)}</p>
          </div>
          <button type="button" onClick={() => close(id)} className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-white"><XMarkIcon aria-hidden="true" className="size-4 fill-current" /><span className="sr-only">Dismiss</span></button>
        </div>
      ))}
    </div>
  );
}

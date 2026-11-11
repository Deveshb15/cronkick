'use client';
import { ChevronRightIcon, XMarkIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ActivityItem, ExceptionItem } from '@/lib/data';
import { fmtDelay, newIds } from '@/lib/live';
import { JobFailedPill, LatePill, SLOT_ICON, SLOT_LABEL, SLOT_TONE, SlotPill, slotHelp, tones } from './ui';
import { Time, useArrivals } from './live';

const ok = (s: string) => s === 'accepted' || s === 'fired';
// Same tone and icon as the slot's pill: unconfirmed is amber, not a red miss.
const tone = (i: ActivityItem) => tones[SLOT_TONE[i.display] ?? 'zinc'];
const Icon = ({ i, className }: { i: ActivityItem; className: string }) => {
  const I = SLOT_ICON[i.display];
  return I ? <I aria-hidden="true" className={`${className} fill-current`} /> : null;
};
const short = (repo: string) => repo.split('/')[1] ?? repo;

const detail = (i: ExceptionItem) => ({
  overdue: i.retrying ? 'GitHub returned errors; retrying' : 'not sent yet',
  missed: i.display === 'rejected' ? 'GitHub refused the trigger' : 'not sent before its deadline',
  unconfirmed: 'sent, but GitHub didn’t confirm it',
  failed: 'the GitHub run failed',
  late: `sent ${fmtDelay(i.sendDelayMs)}`,
}[i.reason]);

/**
 * Runs of the last 24 h that need a look, most serious first. Each opens its workflow's history, filtered to that kind.
 * Shown only when there is something in it.
 */
export function NeedsAttention({ installationId, items, more }: { installationId: number; items: ExceptionItem[]; more: number }) {
  const fresh = useArrivals(items.map((i) => i.id));
  return (
    <ul role="list" className="divide-y divide-white/5 rounded-xl text-sm/6 inset-ring inset-ring-white/10">
      {items.map((i, n) => (
        // Phones show three, so the schedules start on the first screen; the rest are counted below.
        <li key={i.id} className={`${fresh.has(i.id) ? 'row-flash' : ''} ${n >= 3 ? 'max-sm:hidden' : ''}`}>
          <Link href={`/dashboard/${installationId}/workflows/${i.workflowId}?before=${encodeURIComponent(new Date(Date.parse(i.due) + 1).toISOString())}#slot-${i.id}`}
            className="group grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition hover:bg-white/[0.03] max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-y-1">
            <span className="max-sm:order-2 max-sm:justify-self-end">
              {i.reason === 'failed' ? <JobFailedPill /> : i.reason === 'late' ? <LatePill /> : <SlotPill state={i.display} retrying={i.retrying} />}
            </span>
            <span className="min-w-0 max-sm:order-1">
              <span className="font-medium">{i.workflow}</span> <span className="text-zinc-400">· {short(i.repo)}</span>
              <span className="block truncate text-[13px]/5 text-zinc-400"><Time iso={i.due} /> · {detail(i)}</span>
            </span>
            <ChevronRightIcon aria-hidden="true" className="size-4 fill-zinc-500 transition group-hover:translate-x-0.5 group-hover:fill-zinc-300 max-sm:hidden" />
          </Link>
        </li>
      ))}
      {more > 0 && <li className="px-4 py-2.5 text-[13px]/5 text-zinc-400 max-sm:hidden">and {more} more in the last 24 h. Open a schedule below to see its history.</li>}
      {more + Math.max(0, items.length - 3) > 0 && items.length > 3 && <li className="px-4 py-2.5 text-[13px]/5 text-zinc-400 sm:hidden">and {more + items.length - 3} more in the last 24 h.</li>}
    </ul>
  );
}

type Toast = { id: number; item: ActivityItem };

/** A toast for each problem that happens while the page is open; it stays until closed. Successes show in the strips only. */
export function DispatchToasts({ items }: { items: ActivityItem[] }) {
  const seen = useRef(new Set<number>());
  const first = useRef(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const key = items.map((i) => i.id).join(',');
  useEffect(() => {
    const fresh = newIds(seen.current, items.map((i) => i.id), first.current);
    first.current = false;
    if (!fresh.length) return;
    // A late send is a problem too, but a small one: the strip and Needs attention already show it.
    const add = items.filter((i) => fresh.includes(i.id) && !ok(i.state)).map((item) => ({ id: item.id, item }));
    if (!add.length) return;
    setToasts((t) => [...add, ...t].slice(0, 3));
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
            <p className="truncate text-sm/5 font-medium">{SLOT_LABEL[item.display]}: {item.workflow}</p>
            <p className="text-[13px]/5 text-pretty text-zinc-400">{short(item.repo)} · {slotHelp(item.display, item.retrying)}</p>
          </div>
          <button type="button" onClick={() => close(id)} className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-white"><XMarkIcon aria-hidden="true" className="size-4 fill-current" /><span className="sr-only">Dismiss</span></button>
        </div>
      ))}
    </div>
  );
}

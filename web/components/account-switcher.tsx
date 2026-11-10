'use client';
import { ChevronUpDownIcon, PlusIcon } from '@heroicons/react/16/solid';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Health } from '@/lib/data';

export type Account = { id: number; login: string; plan: string; schedules: number; health: Health };

const DOT: Record<Health, string> = { on_time: 'bg-emerald-400', late: 'bg-orange-300', missed: 'bg-red-500', no_runs: 'bg-zinc-600' };
const WORD: Record<Health, string> = { on_time: 'all on time', late: 'late runs', missed: 'missed runs', no_runs: 'no runs yet' };
const avatar = (login: string) => `https://github.com/${login}.png?size=48`;

/** The GitHub account this dashboard is scoped to, with every other account one click away. Remembers the choice. */
export function AccountSwitcher({ current, accounts, installUrl }: { current: Account; accounts: Account[]; installUrl: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.cookie = `cronkick_last=${current.id}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [current.id]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <p className="px-2.5 font-mono text-[0.6875rem]/5 tracking-wider text-zinc-500 uppercase">GitHub account</p>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="mt-1.5 flex w-full items-center gap-x-2.5 rounded-lg bg-white/5 px-2.5 py-2 text-left inset-ring inset-ring-white/10 transition hover:bg-white/10">
        <img src={avatar(current.login)} alt="" className="size-6 shrink-0 rounded-md outline-1 -outline-offset-1 outline-white/10" />
        <span className="min-w-0 flex-1 truncate text-sm/6 font-medium">{current.login}</span>
        <span className="rounded-sm bg-white/10 px-1.5 font-mono text-[0.625rem]/5 text-zinc-400 uppercase">{current.plan}</span>
        <ChevronUpDownIcon aria-hidden="true" className="size-4 shrink-0 fill-zinc-500" />
      </button>
      {open && (
        <div role="menu" className="absolute inset-x-0 top-full z-30 mt-1.5 animate-pop rounded-xl bg-zinc-900 p-1.5 shadow-2xl ring-1 shadow-black/60 ring-white/10">
          {accounts.map((a) => (
            <Link key={a.id} role="menuitem" href={`/dashboard/${a.id}`} onClick={() => setOpen(false)}
              className={`flex items-center gap-x-2.5 rounded-lg px-2.5 py-2 text-sm/5 transition ${a.id === current.id ? 'bg-white/5' : 'hover:bg-white/5'}`}>
              <img src={avatar(a.login)} alt="" className="size-6 shrink-0 rounded-md outline-1 -outline-offset-1 outline-white/10" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.login}</span>
                <span className="flex items-center gap-x-1.5 text-xs/4 text-zinc-400"><span className={`size-1.5 rounded-full ${DOT[a.health]}`} />{a.schedules} schedule{a.schedules === 1 ? '' : 's'} · {WORD[a.health]}</span>
              </span>
              <span className="font-mono text-[0.625rem]/5 text-zinc-500 uppercase">{a.plan}</span>
            </Link>
          ))}
          <a href={installUrl} className="mt-1 flex items-center gap-x-2 border-t border-white/5 px-2.5 pt-2 pb-1 text-xs/5 text-zinc-400 hover:text-white">
            <PlusIcon aria-hidden="true" className="size-3.5 fill-current" />Add a GitHub account or org ↗
          </a>
        </div>
      )}
    </div>
  );
}

'use client';
import { CheckCircleIcon, CheckIcon, Square2StackIcon } from '@heroicons/react/16/solid';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, SLOT_LABEL } from './ui';

// Hero demo: the marker types itself in, Cronkick syncs it, slots fire one by one,
// then a real countdown to the next */15 slot. Slot data is illustrative.
const MARKER = '# cronkick: "*/15 * * * *"';
const N = 36;
const SLOT = 15 * 60_000;
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
const pad = (n: number) => String(n).padStart(2, '0');

export function MarkerCard() {
  const [typed, setTyped] = useState(0);
  const [filled, setFilled] = useState(0);
  const [now, setNow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTyped(MARKER.length);
      setFilled(N);
      return () => clearInterval(clock);
    }
    const timers: number[] = [];
    let t = 1100;
    for (let i = 1; i <= MARKER.length; i++) {
      timers.push(window.setTimeout(() => setTyped(i), t));
      t += i % 6 === 0 ? 90 : 42;
    }
    t += 500;
    for (let i = 1; i <= N; i++) {
      timers.push(window.setTimeout(() => setFilled(i), t));
      t += 32;
    }
    return () => { timers.forEach(clearTimeout); clearInterval(clock); };
  }, []);

  const done = typed === MARKER.length;
  const live = filled === N;
  const last = now === null ? 0 : Math.floor(now / SLOT) * SLOT;
  const left = now === null ? null : Math.ceil((last + SLOT - now) / 1000);
  const copy = () => navigator.clipboard.writeText(MARKER).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <div className="relative mx-auto max-w-3xl">
      <div aria-hidden="true" className="absolute inset-x-10 -bottom-10 h-56 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="relative rounded-2xl bg-zinc-950/85 text-left shadow-2xl shadow-black/60 inset-ring inset-ring-white/10 backdrop-blur-xl">
        <div aria-hidden="true" className="absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-brand-300/60 to-transparent" />
        <div className="flex items-center gap-x-3 border-b border-white/5 px-4 py-3">
          <div aria-hidden="true" className="flex gap-x-1.5"><span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" /></div>
          <p className="truncate font-mono text-xs/5 text-zinc-500">.github/workflows/sync.yml</p>
          <p className="ml-auto flex shrink-0 items-center gap-x-2 font-mono text-xs/5 text-zinc-400">
            <span className="relative flex size-2">
              <span className={`absolute inline-flex size-full rounded-full bg-emerald-400 opacity-60 ${live ? 'animate-ping' : 'hidden'}`} />
              <span className={`relative inline-flex size-2 rounded-full ${live ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            </span>
            {live ? <>next kick in <span className="text-brand-400 tabular-nums">{left === null ? '--:--' : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`}</span></> : done ? 'syncing…' : 'waiting for push'}
          </p>
        </div>

        <div className="overflow-x-auto py-4 font-mono whitespace-pre text-[0.8125rem]/7 text-zinc-300 sm:text-sm/7">
          <Line n={1}><K>name</K>: sync</Line>
          <Line n={2}><K>on</K>:</Line>
          <Line n={3}>  <K>workflow_dispatch</K>:</Line>
          <div className={`relative flex items-center transition-colors duration-500 ${done ? 'bg-brand-500/10 shadow-[inset_2px_0_0_var(--color-brand-500)]' : ''}`}>
            <span aria-hidden="true" className="w-12 shrink-0 pr-4 text-right text-zinc-700 select-none">4</span>
            <span className={done ? 'text-brand-400' : 'text-zinc-500'}>  {MARKER.slice(0, typed)}</span>
            {!done && <span aria-hidden="true" className="ml-px inline-block h-4 w-[2px] animate-caret bg-brand-400" />}
            <button
              type="button"
              onClick={copy}
              className="mr-3 ml-auto flex items-center gap-x-1 rounded-md bg-white/5 px-2 py-0.5 font-sans text-xs/5 text-zinc-300 inset-ring inset-ring-white/10 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              {copied ? <CheckIcon aria-hidden="true" className="size-3.5 fill-emerald-400" /> : <Square2StackIcon aria-hidden="true" className="size-3.5 fill-zinc-400" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <Line n={5}><K>jobs</K>:</Line>
          <Line n={6}>  <K>sync</K>: <span className="text-zinc-600">…</span></Line>
        </div>

        <div className="border-t border-white/5 px-4 pt-3 pb-4">
          <div className="flex items-center justify-between font-mono text-xs/5 text-zinc-500">
            <span className="flex items-center gap-x-2">Last {N} slots <Badge>Example</Badge></span>
            <span className={live ? 'text-emerald-400' : ''}>{filled} of {N} on time</span>
          </div>
          <div role="img" aria-label={`Example: ${N} slots, all sent on time`} className="mt-2.5 flex h-7 gap-[3px]">
            {Array.from({ length: N }, (_, i) => (
              <span
                key={i}
                data-tip={now === null ? undefined : `${hhmm(last - (N - 1 - i) * SLOT)} UTC · +${(((i * 7) % 19) / 10 + 0.4).toFixed(1)}s`}
                className={`tip flex-1 origin-bottom rounded-[2px] transition duration-300 hover:scale-y-125 hover:brightness-125 ${i < filled ? 'scale-y-100 bg-ontime' : 'scale-y-50 bg-white/10'}`}
              />
            ))}
          </div>
        </div>
      </div>

      {live && (
        <div key={last} className="absolute -right-4 -bottom-7 flex animate-pop items-center gap-x-3 rounded-xl bg-zinc-900/90 py-2.5 pr-4 pl-3 shadow-xl shadow-black/50 inset-ring inset-ring-white/10 backdrop-blur max-sm:hidden">
          <CheckCircleIcon aria-hidden="true" className="size-5 fill-emerald-400" />
          <div className="text-left">
            <p className="text-xs/5 font-medium">{SLOT_LABEL.fired} sync.yml</p>
            <p className="font-mono text-[0.6875rem]/4 text-zinc-500">{hhmm(last)} UTC · +1.8 s · example</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Line({ n, children }: { n: number; children: ReactNode }) {
  return <div className="flex"><span aria-hidden="true" className="w-12 shrink-0 pr-4 text-right text-zinc-700 select-none">{n}</span><span>{children}</span></div>;
}
function K({ children }: { children: ReactNode }) {
  return <span className="text-violet-300">{children}</span>;
}

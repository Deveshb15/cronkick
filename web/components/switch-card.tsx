'use client';
import { ChevronRightIcon } from '@heroicons/react/16/solid';
import { useState, useTransition } from 'react';

export type Hide = (workflowId: number, hidden: boolean) => Promise<void>;
export type Candidate = {
  id: number; name: string; path: string; repo: string; editUrl: string; cadence: string;
  before: string; after: string; clamped: string | null; tooFast: boolean;
};

const body = (block: string) => block.split('\n').slice(1); // drop the shared `on:` line

function Diff({ before, after }: { before: string; after: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-black/60 py-3 font-mono text-[0.8125rem]/6 inset-ring inset-ring-white/10">
      <span className="block px-4 text-zinc-500">  on:</span>
      {body(before).map((l, i) => <span key={`b${i}`} className="block bg-red-500/10 px-4 text-red-300">- {l}</span>)}
      {body(after).map((l, i) => <span key={`a${i}`} className="block bg-emerald-500/10 px-4 text-emerald-300">+ {l}</span>)}
    </pre>
  );
}

function CandidateRow({ c, open, plan, floor, hide }: { c: Candidate; open: boolean; plan: string; floor: number; hide: Hide }) {
  const [useClamped, setUseClamped] = useState(true);
  const [hiding, startHide] = useTransition();
  const [copied, setCopied] = useState(false);
  const after = c.tooFast && c.clamped && useClamped ? c.clamped : c.after;
  const copy = () => navigator.clipboard.writeText(body(after).join('\n')).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const chip = (on: boolean) => `rounded-md px-2 py-1 transition ${on ? 'bg-white/10 font-medium text-white' : 'text-zinc-400 hover:text-white'}`;
  return (
    <details open={open} className="group/c rounded-xl bg-zinc-950/80 inset-ring inset-ring-white/10">
      <summary className="flex cursor-pointer list-none items-center gap-x-3 px-4 py-3 text-sm/6 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 fill-zinc-500 transition group-open/c:rotate-90" />
        <span className="font-medium">{c.name}</span>
        <span className="min-w-0 truncate font-mono text-xs/5 text-zinc-500">{c.repo.split('/')[1]} · {c.path.split('/').pop()}</span>
        {c.tooFast
          ? <span className="ml-auto shrink-0 rounded-md bg-orange-400/10 px-1.5 py-0.5 text-xs/5 font-medium text-orange-300 inset-ring inset-ring-orange-400/20">{plan === 'free' ? 'Too fast for Free' : 'Too fast for your plan'}</span>
          : <span className="ml-auto shrink-0 font-mono text-xs/5 text-zinc-500">{c.cadence}</span>}
      </summary>
      <div className="grid gap-5 border-t border-white/5 p-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs/5 text-zinc-400">In <span className="font-mono text-zinc-300">{c.path}</span>, swap the <code className="font-mono">schedule:</code> lines for these:</p>
            {c.tooFast && c.clamped && (
              <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[0.6875rem]/5">
                <button type="button" onClick={() => setUseClamped(true)} className={chip(useClamped)}>Every {floor} min · fits {plan === 'free' ? 'Free' : 'your plan'}</button>
                <button type="button" onClick={() => setUseClamped(false)} className={chip(!useClamped)}>Keep it · {plan === 'free' ? 'needs Pro' : 'too fast'}</button>
              </div>
            )}
          </div>
          <div className="mt-3"><Diff before={c.before} after={after} /></div>
          <p className="mt-2 text-xs/5 text-zinc-500">Keep your other triggers (push, pull_request…) as they are. Removing <code className="font-mono">schedule:</code> stops GitHub running it a second time, late.</p>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={copy} className="rounded-lg bg-brand-500 px-3 py-2 text-sm/6 font-semibold text-ink transition hover:bg-brand-400">{copied ? 'Copied ✓' : 'Copy these lines'}</button>
          <a href={c.editUrl} className="rounded-lg bg-white/5 px-3 py-2 text-center text-sm/6 inset-ring inset-ring-white/10 transition hover:bg-white/10">Edit file on GitHub ↗</a>
          <button type="button" disabled={hiding} onClick={() => startHide(() => hide(c.id, true))} className="text-left text-xs/5 text-zinc-500 hover:text-zinc-300 disabled:opacity-50 lg:order-last lg:mt-auto">
            {hiding ? 'Hiding…' : 'Keep it on GitHub · hide from this list'}
          </button>
          {c.tooFast && (
            <p className="mt-1 text-xs/5 text-pretty text-zinc-400">
              {c.clamped
                ? useClamped ? `GitHub ran this faster than ${plan === 'free' ? 'Free' : 'your plan'} allows, so these lines use every ${floor} min.` : `As written, Cronkick will flag this workflow instead of running it${plan === 'free' ? '. Pro runs every 5 min.' : '.'}`
                : `This schedule is faster than every ${floor} min. Pick a slower cron${plan === 'free' ? ', or get Pro for every 5 min' : ''}.`}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

/** Workflows still on GitHub's `schedule:`, folded into one section so they never crowd out the real schedules. */
export function SwitchSection({ candidates, hidden, plan, floor, hide }: {
  candidates: Candidate[]; hidden: { id: number; name: string; repo: string }[]; plan: string; floor: number; hide: Hide;
}) {
  const [showing, startShow] = useTransition();
  if (!candidates.length && !hidden.length) return null;
  const n = candidates.length;
  const hiddenList = hidden.length > 0 && (
    <details className="group/h text-xs/5 text-zinc-500">
      <summary className="cursor-pointer list-none hover:text-zinc-300 [&::-webkit-details-marker]:hidden">{hidden.length} kept on GitHub · show</summary>
      <ul role="list" className="mt-2 space-y-1">
        {hidden.map((h) => (
          <li key={h.id} className="flex items-center gap-x-3">
            <span className="text-zinc-400">{h.name} <span className="font-mono text-zinc-600">· {h.repo.split('/')[1]}</span></span>
            <button type="button" disabled={showing} onClick={() => startShow(() => hide(h.id, false))} className="text-brand-400 hover:text-brand-300 disabled:opacity-50">Show again</button>
          </li>
        ))}
      </ul>
    </details>
  );
  if (!n) return <div className="px-1">{hiddenList}</div>;
  return (
    <details className="group rounded-2xl bg-brand-500/[0.05] inset-ring inset-ring-brand-500/20">
      <summary className="flex cursor-pointer list-none items-center gap-x-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 fill-brand-400 transition group-open:rotate-90" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm/6 font-medium">{n} workflow{n === 1 ? '' : 's'} still run{n === 1 ? 's' : ''} on GitHub’s schedule</span>
          <span className="block text-xs/5 text-zinc-400">GitHub’s <code className="font-mono text-zinc-300">schedule:</code> often starts late or skips runs. Moving one over is two small edits.</span>
        </span>
        <span className="shrink-0 rounded-lg bg-brand-500 px-3 py-1.5 text-xs/5 font-semibold text-ink group-open:hidden">Review</span>
      </summary>
      <div className="space-y-2 px-5 pb-5">
        {candidates.map((c, i) => <CandidateRow key={c.id} c={c} open={i === 0} plan={plan} floor={floor} hide={hide} />)}
        {hiddenList && <div className="pt-2">{hiddenList}</div>}
      </div>
    </details>
  );
}

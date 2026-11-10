'use client';
import { CheckIcon, Square2StackIcon } from '@heroicons/react/16/solid';
import { useState } from 'react';

/** The thing to copy, shown as a command chip (like `npm install x` on other dev-tool sites). */
export function CopyCommand({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
      className={`group inline-flex min-w-0 items-center gap-x-3 rounded-lg bg-white/5 py-2.5 pr-3 pl-3.5 font-mono text-sm/6 text-zinc-300 inset-ring inset-ring-white/10 hover:bg-white/10 hover:text-white sm:py-2 sm:text-[0.8125rem]/6 ${className}`}
    >
      <span className="min-w-0 truncate"><span className="text-zinc-500">$ </span>{text}</span>
      {copied ? <CheckIcon aria-hidden="true" className="size-4 shrink-0 fill-emerald-400" /> : <Square2StackIcon aria-hidden="true" className="size-4 shrink-0 fill-zinc-500 group-hover:fill-zinc-300" />}
      <span className="sr-only">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

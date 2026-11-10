'use client';
import { useState } from 'react';

/** A code block with a copy button; the only client-side code in the dashboard. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-lg bg-zinc-950 ring-1 ring-white/10 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-white/10 py-1.5 pr-1.5 pl-4">
        <p className="font-mono text-sm/6 text-zinc-400 sm:text-xs/6">{label ?? 'workflow.yml'}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          className="rounded-md px-2 py-1 text-sm/5 font-medium text-zinc-300 hover:bg-white/10 hover:text-white sm:text-xs/5"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm/6 text-zinc-100 sm:text-[0.8125rem]/6"><code>{code}</code></pre>
    </div>
  );
}

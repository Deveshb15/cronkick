'use client';
import { useState } from 'react';

/** A code block with a copy button. */
export function CopyBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl bg-zinc-900 inset-ring inset-ring-white/10">
      <div className="flex items-center justify-between border-b border-white/5 py-1.5 pr-1.5 pl-4">
        <p className="min-w-0 truncate font-mono text-sm/6 text-zinc-500 sm:text-xs/6">{label ?? 'workflow.yml'}</p>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
          className="shrink-0 rounded-md px-2 py-1 text-sm/5 font-medium text-zinc-400 hover:bg-white/10 hover:text-white sm:text-xs/5"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm/6 text-zinc-200 sm:text-[0.8125rem]/6"><code>{code}</code></pre>
    </div>
  );
}

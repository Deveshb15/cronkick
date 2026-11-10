import type { ReactNode } from 'react';
import { Eyebrow } from './ui';

/** Linear-style section opener: big heading on the left, the explanation on the right. */
export function SplitHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="grid gap-x-12 gap-y-6 lg:grid-cols-2 lg:items-end">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 max-w-[20ch] text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h2>
      </div>
      {children && <div className="max-w-[48ch] text-lg text-pretty text-zinc-400 lg:justify-self-end">{children}</div>}
    </div>
  );
}

/** Bento card: a piece of real UI on top, the point underneath. */
export function BentoCard({ title, body, visual, className = '' }: { title: string; body: string; visual: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl bg-zinc-900/50 inset-ring inset-ring-white/10 ${className}`}>
      <div className="relative flex-1 p-6 [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">{visual}</div>
      <div className="p-6 pt-2">
        <h3 className="text-base/7 font-semibold">{title}</h3>
        <p className="mt-1 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">{body}</p>
      </div>
    </div>
  );
}

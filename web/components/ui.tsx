import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const base = 'inline-flex items-center justify-center gap-x-1.5 rounded-lg text-base/6 font-medium whitespace-nowrap sm:text-sm/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';
const sizes = { md: 'px-3.5 py-2.5 sm:py-2', sm: 'px-2.5 py-1.5 sm:py-1' };
const variants = {
  // One per page.
  primary: 'bg-brand-500 text-ink hover:bg-brand-400',
  secondary: 'bg-white/5 text-white inset-ring inset-ring-white/10 hover:bg-white/10',
  ghost: 'text-zinc-400 hover:bg-white/5 hover:text-white',
};
type Style = { variant?: keyof typeof variants; size?: keyof typeof sizes };
const cls = ({ variant = 'secondary', size = 'md' }: Style, extra = '') => `${base} ${sizes[size]} ${variants[variant]} ${extra}`;

export function ButtonLink({ variant, size, className, ...props }: Style & ComponentProps<typeof Link>) {
  return <Link {...props} className={cls({ variant, size }, className)} />;
}
export function Button({ variant, size, className, ...props }: Style & ComponentProps<'button'>) {
  return <button {...props} className={cls({ variant, size }, className)} />;
}

const tones = {
  green: 'bg-emerald-400/10 text-emerald-300 inset-ring-emerald-400/20',
  amber: 'bg-brand-500/10 text-brand-300 inset-ring-brand-500/20',
  red: 'bg-red-500/10 text-red-300 inset-ring-red-500/20',
  blue: 'bg-sky-400/10 text-sky-300 inset-ring-sky-400/20',
  zinc: 'bg-white/5 text-zinc-400 inset-ring-white/10',
};
export type Tone = keyof typeof tones;
export function Badge({ tone = 'zinc', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-sm/5 font-medium whitespace-nowrap inset-ring sm:text-xs/5 ${tones[tone]}`}>{children}</span>;
}

export const STATUS = {
  active: { label: 'Active', tone: 'green' },
  limited: { label: 'Paused: plan limit', tone: 'amber' },
  needs_fix: { label: 'Needs a fix', tone: 'red' },
  ready: { label: 'Ready to switch', tone: 'blue' },
  none: { label: 'Not scheduled', tone: 'zinc' },
} as const;

export const SLOT_TONE: Record<string, Tone> = {
  accepted: 'green', fired: 'green', unknown: 'red', expired: 'red', skipped: 'zinc', pending: 'zinc', dispatching: 'blue',
};

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-[0.875em] text-zinc-200">{children}</code>;
}

/** Monospace uppercase label above section headings. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-sm/6 font-medium tracking-wide text-brand-400 uppercase sm:text-xs/6">{children}</p>;
}

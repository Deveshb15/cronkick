import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const base = 'inline-flex items-center justify-center gap-x-1.5 rounded-lg text-base/6 font-medium sm:text-sm/6 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500';
const sizes = { md: 'px-3.5 py-2.5 sm:py-2', sm: 'px-2.5 py-1.5 sm:py-1' };
const variants = {
  primary: 'bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200',
  secondary: 'text-zinc-950 ring-1 ring-zinc-950/10 hover:bg-zinc-950/2.5 dark:text-white dark:ring-white/15 dark:hover:bg-white/5',
  ghost: 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/5 dark:hover:text-white',
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
  green: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-700 dark:text-red-400',
  blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  zinc: 'bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-400',
};
export function Badge({ tone = 'zinc', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-sm/5 font-medium whitespace-nowrap sm:text-xs/5 ${tones[tone]}`}>{children}</span>;
}

export const STATUS = {
  active: { label: 'Active', tone: 'green' },
  limited: { label: 'Paused: plan limit', tone: 'amber' },
  needs_fix: { label: 'Needs a fix', tone: 'red' },
  ready: { label: 'Ready to switch', tone: 'blue' },
  none: { label: 'Not scheduled', tone: 'zinc' },
} as const;

export const SLOT_TONE: Record<string, keyof typeof tones> = {
  accepted: 'green', fired: 'green', unknown: 'red', expired: 'red', skipped: 'zinc', pending: 'zinc', dispatching: 'blue',
};

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-zinc-950/5 px-1 py-0.5 font-mono text-[0.875em] dark:bg-white/10">{children}</code>;
}

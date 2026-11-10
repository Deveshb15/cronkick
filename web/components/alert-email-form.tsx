'use client';
import { useActionState } from 'react';
import type { SaveState } from '@/app/dashboard/[installationId]/settings/actions';
import { Button } from './ui';

/** Alert email with inline saving / saved / error, keeping what was typed when it fails. */
export function AlertEmailForm({ action, initial }: { action: (prev: SaveState, form: FormData) => Promise<SaveState>; initial: string }) {
  const [state, submit, pending] = useActionState(action, { ok: false, error: null, email: initial });
  return (
    <form action={submit} className="flex max-w-md flex-wrap items-start gap-3">
      <label htmlFor="email" className="sr-only">Alert email</label>
      <input id="email" name="email" type="email" required defaultValue={state.email} placeholder="you@company.com" aria-describedby="email-status"
        className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-base/6 text-white inset-ring inset-ring-white/10 placeholder:text-zinc-500 focus:outline-2 focus:-outline-offset-1 focus:outline-brand-500 sm:py-1.5 sm:text-sm/6" />
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Saving…' : 'Save'}</Button>
      <p id="email-status" aria-live="polite" className={`w-full text-sm/6 ${state.error ? 'text-red-300' : 'text-emerald-300'}`}>
        {state.error ?? (state.ok && !pending ? 'Saved.' : '')}
      </p>
    </form>
  );
}

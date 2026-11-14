'use client';

/** A switch that saves as soon as it flips: the form posts to a server action, which re-renders the page with the result. */
export function SubmitToggle({ action, on, label, disabled = false }: { action: () => Promise<void>; on: boolean; label: string; disabled?: boolean }) {
  return (
    <form action={action}>
      <div className="group relative inline-flex w-11 shrink-0 rounded-full bg-white/5 p-0.5 inset-ring inset-ring-white/10 outline-offset-2 outline-brand-500 transition-colors duration-200 ease-in-out has-checked:bg-brand-500 has-focus-visible:outline-2 has-disabled:opacity-50 sm:w-9">
        <span className="aspect-square w-1/2 rounded-full bg-white shadow-xs ring-1 ring-zinc-900/5 transition-transform duration-200 ease-in-out group-has-checked:translate-x-full" />
        <input type="checkbox" name="on" aria-label={label} defaultChecked={on} disabled={disabled}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="absolute inset-0 size-full cursor-pointer appearance-none focus:outline-hidden disabled:cursor-not-allowed" />
      </div>
    </form>
  );
}

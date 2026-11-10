import type { ReactNode } from 'react';

/** A product window: title bar with a URL tab, hairline border, light from the top. Used for every product shot. */
export function AppFrame({ url, children, className = '' }: { url: string; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-zinc-950 shadow-2xl shadow-black/60 inset-ring inset-ring-white/10 ${className}`}>
      <div className="flex items-center gap-x-3 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <div aria-hidden="true" className="flex gap-x-1.5">
          <span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" /><span className="size-2.5 rounded-full bg-white/10" />
        </div>
        <p className="mx-auto rounded-md bg-white/5 px-3 py-0.5 font-mono text-xs/5 text-zinc-500">{url}</p>
        <div aria-hidden="true" className="w-11" />
      </div>
      {children}
    </div>
  );
}

/** A floating card layered over a product shot. */
export function FloatCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-zinc-900/90 p-4 shadow-xl shadow-black/50 inset-ring inset-ring-white/10 backdrop-blur ${className}`}>{children}</div>;
}

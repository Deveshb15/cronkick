import { Symbol } from '@/components/logo';
import { ButtonLink } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <Symbol className="mx-auto size-10" />
        <p className="mt-8 font-mono text-sm/6 text-zinc-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing here, or not yours to see.</h1>
        <div className="mt-8"><ButtonLink href="/dashboard">Back to dashboard</ButtonLink></div>
      </div>
    </main>
  );
}

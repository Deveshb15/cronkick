import { Symbol } from '@/components/logo';
import { ButtonLink } from '@/components/ui';
import { getSession } from '@/lib/session';

// Also shown for a dashboard page that isn't yours, so offer the dashboard only to someone signed in.
export default async function NotFound() {
  const signedIn = !!(await getSession());
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="text-center">
        <Symbol className="mx-auto size-10" />
        <p className="mt-8 font-mono text-sm/6 text-zinc-500">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nothing here, or not yours to see.</h1>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {signedIn && <ButtonLink href="/dashboard" prefetch={false} variant="primary">Dashboard</ButtonLink>}
          <ButtonLink href="/">Home</ButtonLink>
          <ButtonLink href="/docs">Docs</ButtonLink>
        </div>
      </div>
    </main>
  );
}

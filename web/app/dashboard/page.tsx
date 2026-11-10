import { redirect } from 'next/navigation';
import { Logo } from '@/components/site';
import { ButtonLink } from '@/components/ui';
import { db } from '@/lib/db';
import { installationsFor } from '@/lib/data';
import { installUrl } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect('/login?next=/dashboard');
  const installs = await installationsFor(db, s.installs);
  if (installs.length) redirect(`/dashboard/${installs[0].id}`);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <Logo />
        <h1 className="mt-8 text-2xl font-semibold tracking-tight">Install Cronkick on GitHub</h1>
        <p className="mt-3 text-base/7 text-pretty text-zinc-600 sm:text-sm/6 dark:text-zinc-400">
          You’re signed in as {s.login}, but the app isn’t installed on any account you can access yet. Install it, choose your repositories, and you’ll land back here.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <ButtonLink href={installUrl()} variant="primary">Install the GitHub App</ButtonLink>
          <ButtonLink href="/login?next=/dashboard" prefetch={false} variant="ghost">I just installed it</ButtonLink>
        </div>
      </div>
    </main>
  );
}

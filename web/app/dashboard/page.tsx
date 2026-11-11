import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GitHubMark } from '@/components/icons';
import { Logo } from '@/components/site';
import { ButtonLink, VERDICT_DOT, VERDICT_WORD } from '@/components/ui';
import { db } from '@/lib/db';
import { accountHealth, installationsFor } from '@/lib/data';
import { installUrl } from '@/lib/format';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accounts' };

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect('/login?next=/dashboard');
  const installs = await installationsFor(db, s.installs);
  const last = Number((await cookies()).get('cronkick_last')?.value);
  if (installs.some((i) => i.id === last)) redirect(`/dashboard/${last}`);
  if (installs.length === 1) redirect(`/dashboard/${installs[0].id}`);

  const health = await accountHealth(db, installs.map((i) => i.id), new Date());
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-16">
      <div aria-hidden="true" className="time-grid absolute inset-0 -z-10" />
      <div aria-hidden="true" className="hero-glow absolute inset-0 -z-10" />
      <div className="w-full max-w-md">
        <Logo className="h-6" />
        {installs.length ? (
          <>
            <h1 className="mt-10 text-2xl font-semibold tracking-tight">Choose a GitHub account</h1>
            <p className="mt-2 text-sm/6 text-zinc-400">Signed in as {s.login}.</p>
            <ul role="list" className="mt-6 space-y-2">
              {installs.map((i) => {
                const h = health.get(i.id)!;
                return (
                  <li key={i.id}>
                    <Link href={`/dashboard/${i.id}`} className="flex items-center gap-x-3 rounded-xl bg-zinc-950/80 px-4 py-3 inset-ring inset-ring-white/10 transition hover:-translate-y-0.5 hover:inset-ring-brand-500/40">
                      <img src={`https://github.com/${i.account_login}.png?size=64`} alt="" className="size-8 rounded-lg outline-1 -outline-offset-1 outline-white/10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm/6 font-medium">{i.account_login}</span>
                        <span className="flex items-center gap-x-1.5 text-xs/5 text-zinc-400"><span className={`size-1.5 rounded-full ${VERDICT_DOT[h.health]}`} />{i.account_type === 'Organization' ? 'Organization' : 'Personal'} · {h.schedules} schedules · {VERDICT_WORD[h.health]}</span>
                      </span>
                      <span className="font-mono text-[0.625rem] text-zinc-500 uppercase">{i.plan}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <a href={installUrl()} className="mt-4 inline-block text-xs/5 text-zinc-400 hover:text-white">+ Install on another GitHub account ↗</a>
          </>
        ) : (
          <>
            <h1 className="mt-10 text-2xl font-semibold tracking-tight">Install Cronkick on GitHub</h1>
            <p className="mt-3 text-base/7 text-pretty text-zinc-400 sm:text-sm/6">
              You’re signed in as {s.login}, but the app isn’t installed on an account you can access yet. Install it, choose your repositories, and you’ll land back here.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href={installUrl()} variant="primary" size="lg" className="btn-glow"><GitHubMark className="size-4" />Install with GitHub</ButtonLink>
              <ButtonLink href="/login?next=/dashboard" prefetch={false} variant="ghost" size="lg">I just installed it</ButtonLink>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

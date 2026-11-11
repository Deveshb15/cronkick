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
import { plural } from '@/lib/live';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Accounts' };

// Accounts with problems first.
const RANK: Record<string, number> = { needs_fix: 0, behind: 1, missed: 1, unconfirmed: 2, late: 2, in_progress: 3, on_time: 3, no_runs: 4, quiet: 4, nothing_scheduled: 5 };

export default async function Dashboard() {
  const s = await getSession();
  if (!s) redirect('/login?next=/dashboard');
  const installs = await installationsFor(db, s.installs);
  const last = Number((await cookies()).get('cronkick_last')?.value);
  if (installs.some((i) => i.id === last)) redirect(`/dashboard/${last}`);
  if (installs.length === 1) redirect(`/dashboard/${installs[0].id}`);

  const health = await accountHealth(db, installs.map((i) => i.id), new Date());
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-16">
      <div className="w-full max-w-md">
        <Logo className="h-6" />
        {installs.length ? (
          <>
            <h1 className="mt-10 text-2xl font-semibold tracking-tight">Choose a GitHub account</h1>
            <p className="mt-2 text-sm/6 text-zinc-400">Signed in as {s.login}.</p>
            <ul role="list" className="mt-6 divide-y divide-white/5 overflow-hidden rounded-xl inset-ring inset-ring-white/10">
              {[...installs].sort((a, b) => RANK[health.get(a.id)!.health] - RANK[health.get(b.id)!.health]).map((i) => {
                const h = health.get(i.id)!;
                return (
                  <li key={i.id}>
                    <Link href={`/dashboard/${i.id}`} className="flex items-center gap-x-3 px-4 py-3 transition hover:bg-white/[0.03]">
                      <img src={`https://github.com/${i.account_login}.png?size=64`} alt="" className="size-8 rounded-lg outline-1 -outline-offset-1 outline-white/10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm/6 font-medium">{i.account_login}</span>
                        <span className="flex items-center gap-x-1.5 text-xs/5 text-zinc-400"><span className={`size-1.5 rounded-full ${VERDICT_DOT[h.health]}`} />{i.account_type === 'Organization' ? 'Organization' : 'Personal'} · {plural(h.schedules, 'schedule')} · {VERDICT_WORD[h.health]}</span>
                      </span>
                      <span className="text-xs/5 text-zinc-400">{i.plan === 'pro' ? 'Pro' : 'Free'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <a href={installUrl()} className="mt-2 inline-flex min-h-11 items-center text-[13px]/5 text-zinc-400 hover:text-white">+ Install on another GitHub account ↗</a>
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

import { notFound, redirect } from 'next/navigation';
import { getSession } from './session';

/**
 * Only installations GitHub says this user can access. If one is missing (for example they installed
 * the app after signing in), refresh the list from GitHub once before giving up.
 */
export async function requireInstallation(id: number, path: string) {
  const s = await getSession();
  const login = `/login?next=${encodeURIComponent(path)}`;
  if (!s) redirect(login);
  if (!s.installs.includes(id)) {
    if (Date.now() - s.iat > 60_000) redirect(login);
    notFound();
  }
  return s;
}

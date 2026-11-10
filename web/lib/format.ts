export const appSlug = () => process.env.GITHUB_APP_SLUG ?? 'cronkick';
export const installUrl = () => `https://github.com/apps/${appSlug()}/installations/new`;
/** Where the account owner picks which repos the app can see. */
export const manageReposUrl = (i: { id: number; account_type: string; account_login: string }) =>
  i.account_type === 'Organization'
    ? `https://github.com/organizations/${i.account_login}/settings/installations/${i.id}`
    : `https://github.com/settings/installations/${i.id}`;

export function relTime(d: Date | null, now = new Date()): string {
  if (!d) return '—';
  const s = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  const v = abs < 60 ? `${abs}s` : abs < 3600 ? `${Math.round(abs / 60)}m` : abs < 86400 ? `${Math.round(abs / 3600)}h` : `${Math.round(abs / 86400)}d`;
  return s >= 0 ? `in ${v}` : `${v} ago`;
}

export const utc = (d: Date | null) => (d ? d.toISOString().replace('T', ' ').slice(0, 19) : '—');

export function pct(n: number, d: number): string {
  return d ? `${Math.floor((n / d) * 1000) / 10}%` : '—';
}

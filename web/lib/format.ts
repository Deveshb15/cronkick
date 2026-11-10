export const appSlug = () => process.env.GITHUB_APP_SLUG ?? 'cronkick';
export const installUrl = () => `https://github.com/apps/${appSlug()}/installations/new`;
/** Where the account owner picks which repos the app can see. */
export const manageReposUrl = (i: { id: number; account_type: string; account_login: string }) =>
  i.account_type === 'Organization'
    ? `https://github.com/organizations/${i.account_login}/settings/installations/${i.id}`
    : `https://github.com/settings/installations/${i.id}`;


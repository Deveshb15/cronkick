// Public project key: it ships in every browser bundle, so it lives in code. Env vars point dev at another project.
export const POSTHOG_TOKEN = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN || 'phc_AZu9sStBtCoLJgHVfsPk2QsifmsUkHLNm2Z9oW9oh4tn';
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

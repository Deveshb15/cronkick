# Security

## Reporting a vulnerability

Email **hi@cronkick.xyz** with the details and, if you can, the steps to reproduce. Please don't open a public issue for a security problem. You'll get a reply within 2 working days. Once it's fixed, you'll be credited in the fix's release notes unless you'd rather not be.

In scope:

- the hosted service at cronkick.xyz: the dashboard, sign-in, webhooks and the API it calls on GitHub;
- this repository's code, including the deploy scripts.

## What the hosted app can access

Cronkick is a GitHub App with these repository permissions, on the repositories you choose:

| Permission | Why |
|---|---|
| Checks: read | Rescue: read GitHub's own error message on a failed job (optional; Rescue works without it) |
| Contents: read | Read workflow files to find `# cronkick:` markers |
| Actions: read and write | Start workflows (`workflow_dispatch`) at their scheduled time; read runs |
| Metadata: read | Required by GitHub for every app |

Rescue reads the metadata of failed workflow runs in those repositories, including runs Cronkick didn't start (job and step names, results, runner labels, times), to tell when GitHub's infrastructure broke a run. It stores only its verdict, the job names and the one GitHub error string that matched (at most 300 characters); it never downloads or stores logs. It can be turned off per account in Settings.

[cronkick.xyz/docs/security](https://cronkick.xyz/docs/security) lists every GitHub API call Cronkick makes and what each permission would allow.

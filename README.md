<!-- The app icon reads on light and dark backgrounds, so it needs no <picture>: those follow the OS theme, not
     GitHub's, and showed the white wordmark on GitHub's light theme. The name is real text, coloured by GitHub. -->
<p align="center">
  <a href="https://cronkick.xyz"><img alt="" src="brand/cronkick-app-icon.svg" width="72" height="72"></a>
</p>

<h1 align="center">Cronkick</h1>

<p align="center"><strong>On-time cron for GitHub Actions.</strong><br>One comment in your workflow file, and your scheduled jobs start within seconds of their time.</p>

<p align="center">
  <a href="https://cronkick.xyz">Website</a> ·
  <a href="https://cronkick.xyz/docs">Docs</a> ·
  <a href="https://cronkick.xyz/lateness">Measured: GitHub vs Cronkick</a> ·
  <a href="#self-hosting">Self-hosting</a>
</p>

<p align="center">
  <a href="https://github.com/Deveshb15/cronkick/actions/workflows/ci.yml"><img alt="CI/CD" src="https://github.com/Deveshb15/cronkick/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
</p>

## Why

GitHub's `schedule:` trigger is best effort. Scheduled runs start late, sometimes by most of an hour, and at busy times some never start at all. GitHub's own docs say so.

Cronkick is a GitHub App that runs your schedule for you. It sends GitHub a `workflow_dispatch` at the scheduled time, so the run is created within seconds. Your jobs still run on GitHub, on your own runners, with your secrets. Nothing moves.

We measure both side by side in a public repository and publish the numbers live: **[cronkick.xyz/lateness](https://cronkick.xyz/lateness)**.

## How it works

Add `workflow_dispatch:` and a `# cronkick:` comment, then push:

```yaml
on:
  workflow_dispatch: # cronkick: "*/15 * * * *"
  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin
```

- **One comment per schedule.** Standard 5-field cron, in UTC or any IANA time zone (`tz=`). A workflow can have several.
- **The repo is the source of truth.** Cronkick reads the file on every push to the default branch. Edit the comment to change the schedule; delete it to stop.
- **It checks before it switches.** A workflow that would break when dispatched is flagged on the dashboard, not run. Examples: required inputs, `github.event.schedule`, or a leftover `schedule:` block that would run it twice.
- **It retries honestly.** If GitHub errors, Cronkick retries until a deadline, then records the run as not sent rather than running it late. A timeout with an unknown outcome is never resent, so a run can't happen twice.
- **You can see every run.** For each planned run the dashboard shows when it was due, when Cronkick sent it, when GitHub started it, and the job's result. It updates live.

## Use it

Install the GitHub App from **[cronkick.xyz](https://cronkick.xyz)** and pick your repositories.

| | Free | Pro |
|---|---|---|
| Schedules | 10 | 50 |
| Fastest schedule | every 15 min | every 5 min |
| History | 7 days | 90 days |
| Email alerts | — | yes |

Plans and prices: [cronkick.xyz/docs/plans](https://cronkick.xyz/docs/plans).

## Self-hosting

Cronkick is MIT-licensed, so you can run it on your own infrastructure. You create your own GitHub App and run the two processes on your own servers. Nothing talks to cronkick.xyz.

### What you need

- **Node 22+** and **Postgres 17**
- **A public HTTPS URL**, so GitHub can deliver webhooks and users can sign in (e.g. `https://cron.example.com`)
- **Your own GitHub App**, created under *Settings → Developer settings → GitHub Apps*:

  | Setting | Value |
  |---|---|
  | Callback URL | `https://<your-host>/callback` |
  | Webhook URL | `https://<your-host>/webhooks` |
  | Webhook secret | `openssl rand -hex 32` |
  | Repository permissions | Actions: **Read and write** · Checks: **Read-only** · Contents: **Read-only** · Metadata: Read-only |
  | Subscribe to events | **Push**, **Workflow run** |

  Then generate a client secret and a private key.

### Configure

Copy [`.env.example`](.env.example) to `.env` and fill it in:

| Variable | What |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BASE_URL` | Your public URL, e.g. `https://cron.example.com` |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG` | From your app's settings page |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | For sign-in |
| `GITHUB_PRIVATE_KEY_FILE` (or `GITHUB_PRIVATE_KEY`) | The app's private key: a file path, or the PEM on one line with `\n` |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret you set on the app |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | `openssl rand -base64 32`. Must be the same at build time and at run time, and on every server |
| `RESEND_API_KEY`, `MAIL_FROM` | Optional. Email alerts via [Resend]; without a key, emails are logged instead |
| `CONTACT_EMAIL` | Shown on the privacy and terms pages |
| `PROBE_REPOS`, `PROBE_TOKEN` | Optional. Repositories for your own `/lateness` page; see [`probe/`](probe/README.md) |

### Run

```bash
npm ci
npm run migrate              # create or update the schema (the worker also does this on start)
npx next build web           # build the web app (needs the env above)

npm start                    # the worker: scheduler, webhooks, health check on :3001
npx next start web -p 3000   # the web app on :3000; put HTTPS in front of it
```

The web app serves everything on one port and forwards `/webhooks` and `/healthz` to the worker. Run both processes under a supervisor; [`deploy/`](deploy/) has the systemd units and the release script we use. [`deploy/README.md`](deploy/README.md) walks through our production setup: two servers behind a load balancer, managed Postgres, and CI/CD over Tailscale. It's one way to do it, not a requirement.

### Plans when self-hosting

Every installation starts on the Free limits. To give an installation the Pro limits:

```bash
npm run plan:set -- <account login or installation id> pro
```

The limits themselves live in [`src/plans.ts`](src/plans.ts).

## Development

```bash
npm install
createdb cronkick_test   # the tests reset this database's schema
npm test                 # TEST_DATABASE_URL overrides postgres://localhost/cronkick_test
npm run typecheck
```

Tests run against a real Postgres, not mocks.

| Path | What |
|---|---|
| `src/markers.ts`, `src/compat.ts` | Read `# cronkick:` markers; flag workflows that aren't safe to switch |
| `src/slots.ts` | Cron math: due times, deadlines, jitter, minimum interval |
| `src/maintenance.ts`, `src/dispatcher.ts` | Plan runs ahead of time; claim them with `FOR UPDATE SKIP LOCKED` and send |
| `src/sync.ts`, `src/webhooks.ts`, `src/runs.ts` | Keep schedules in step with GitHub; link runs to planned slots |
| `src/schedule-watch.ts` | What GitHub's own scheduler did for workflows not moved yet |
| `src/plans.ts`, `src/alerts.ts` | Free/Pro limits; email alerts |
| `src/probe/`, `probe/` | The probe repositories behind `/lateness` |
| `web/` | The site and dashboard (Next.js) |
| `migrations/` | Plain SQL migrations, applied in order |
| `deploy/` | systemd units, the release script and the production guide |

Design notes and the build plans are in [`docs/`](docs/), and the product spec is [`PRD.md`](PRD.md).

## Contributing

Issues and pull requests are welcome. For anything bigger than a small fix, open an issue first so we can agree on the approach. Please run `npm test` and `npm run typecheck` before sending a PR.

Found a security problem? Please don't open an issue. See [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 Devesh Bhimanpelli

[Resend]: https://resend.com

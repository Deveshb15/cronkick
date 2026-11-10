# Ontime

On-time cron for GitHub Actions. A GitHub App that triggers `workflow_dispatch` on schedule from `# ontime:` comments in your workflow files. Spec: `PRD.md`. Build plan: `docs/plans/2026-11-10-001-feat-ontime-v1-plan.md`.

```yaml
on:
  workflow_dispatch: # ontime: "17 * * * *"
  # ontime: "0 9 * * 1-5" tz=Europe/Berlin
```

## Develop

Needs Node 22+ and Postgres 17.

```bash
npm install
createdb ontime_test            # tests reset this database's schema
npm test                        # TEST_DATABASE_URL overrides postgres://localhost/ontime_test
npm run typecheck
cp .env.example .env            # then fill it in
npm run migrate && npm start    # migrations also run on start
```

## Layout

| Path | What |
|---|---|
| `src/markers.ts`, `src/compat.ts` | Read `# ontime:` markers; flag workflows that aren't safe to switch |
| `src/slots.ts` | Cron math: due times, deadlines, jitter, minimum interval |
| `src/maintenance.ts`, `src/dispatcher.ts` | Create slots ahead of time; claim with `SKIP LOCKED` and fire |
| `src/sync.ts`, `src/webhooks.ts`, `src/runs.ts` | Keep schedules in step with GitHub; link runs to slots |
| `src/plans.ts`, `src/alerts.ts` | Free/Pro limits; email alerts |
| `src/web/` | Sign-in, dashboard, slot history, `/lateness` |
| `src/probe/`, `probe/` | Probe repos and the public lateness numbers |
| `deploy/` | Caddy, systemd, step-by-step deploy guide |

Billing is a stub: `npm run plan:set -- <login|installation id> pro`.

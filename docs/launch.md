# Launch drafts

## Show HN

**Title:** Show HN: Cronkick – GitHub Actions cron from one comment in the workflow file

GitHub's `schedule:` trigger is best-effort. In our measurements runs start minutes to an hour late at busy times, and some never start. GitHub's docs say so too: scheduled runs can be delayed or dropped under load.

Cronkick is a GitHub App that fixes this without moving your jobs anywhere. You add `workflow_dispatch:` and one comment to the workflow:

```yaml
on:
  workflow_dispatch:
  # cronkick: "0 3 * * *" tz=Europe/Berlin
```

Cronkick reads the comment when you push. At the scheduled time it calls GitHub's `workflow_dispatch` API, and your job runs on your own runners as before.

How it works:

- Each schedule becomes rows in Postgres, one per planned due time, planned up to 2 hours ahead. If Cronkick itself is down for longer, it records the gap as one outage window instead of inventing rows. Two workers claim them with `FOR UPDATE SKIP LOCKED`; the target is to send each one within 30 seconds of its time.
- If GitHub errors, it retries until a deadline, then gives up rather than run late. If GitHub refuses the request, it records that and stops. If the outcome is unclear (a timeout), it doesn't resend.
- Before it turns a workflow on, it checks for things that break when dispatched, like `github.event.schedule`, required inputs and a leftover `schedule:` block.
- The dashboard updates live (Postgres LISTEN/NOTIFY, then server-sent events). For each planned run it shows when it was due, when Cronkick sent it, when GitHub started the run, and the job result.
- There's a public page with what we've measured of GitHub's own scheduler, sample sizes included: https://cronkick.xyz/lateness

Free: unlimited repos, 3 schedules, every 15 min or slower. Pro is $5/month for personal accounts (50 schedules, every 5 min, email alerts); Team is $19/month for organizations (200 schedules, every minute).

I'd love feedback, especially from anyone who has worked around this with an external cron server or Lambda.

https://cronkick.xyz

## X thread

1/ GitHub Actions cron is best-effort. Scheduled runs start late, and at busy times some don't start at all.

I built Cronkick to send them within 30 seconds of their scheduled time. Same workflows, same runners, one comment line. 🧵

2/ Add `workflow_dispatch:` and a marker:

  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin

Push. At 09:00 Cronkick sends the trigger; the target is within 30 seconds.

3/ No PATs. It's a GitHub App with short-lived tokens, Actions write and Contents read. Your jobs never leave GitHub.

4/ It's honest about what happened. Each planned run shows: due → sent → GitHub started the run → job passed or failed. If Cronkick itself was down, the gap shows as an outage window. If GitHub was down, it says "Gave up" instead of quietly running 40 minutes late.

5/ It checks your workflow before turning it on: leftover `schedule:` (double runs), `github.event.schedule` (empty when dispatched), required inputs.

6/ Free covers 3 schedules on unlimited repos. Pro is $5/mo for personal accounts, Team $19/mo for orgs (every-minute schedules).

→ https://cronkick.xyz

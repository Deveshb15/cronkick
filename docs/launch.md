# Launch drafts

## Show HN

**Title:** Show HN: Cronkick – GitHub Actions cron that actually runs on time

GitHub's `schedule:` trigger is best-effort. In our measurements runs start minutes to an hour late at busy times, and some never start. GitHub's docs say so too: scheduled runs can be delayed or dropped under load.

Cronkick is a GitHub App that fixes this without moving your jobs anywhere. You add `workflow_dispatch:` and one comment to the workflow:

```yaml
on:
  workflow_dispatch:
  # cronkick: "0 3 * * *" tz=Europe/Berlin
```

Cronkick reads the comment when you push. At the scheduled time it calls GitHub's `workflow_dispatch` API, and your job runs on your own runners as before.

How it works:

- Each schedule becomes rows in Postgres, one per due time. Two workers claim them with `FOR UPDATE SKIP LOCKED` and send each one within 30 seconds; typically it's under a second.
- If GitHub errors, it retries until a deadline, then gives up rather than run late. If the outcome is unclear (a timeout), it never resends, so a run never happens twice.
- Before it turns a workflow on, it checks for things that break when dispatched, like `github.event.schedule`, required inputs and a leftover `schedule:` block.
- The dashboard updates live (Postgres LISTEN/NOTIFY, then server-sent events). For each slot it shows when it was due, when Cronkick sent it, when GitHub started the runner, and the job result.
- There's a public page comparing GitHub's lateness with ours: https://cronkick.xyz/lateness

Free: unlimited repos, 10 schedules, every 15 min or slower. Pro is $9/month for 5-minute schedules and email alerts.

I'd love feedback, especially from anyone who has worked around this with an external cron server or Lambda.

https://cronkick.xyz

## X thread

1/ GitHub Actions cron is best-effort. Scheduled runs start late, and at busy times some don't start at all.

I built Cronkick to make them run on time. Same workflows, same runners, one comment line. 🧵

2/ Add `workflow_dispatch:` and a marker:

  # cronkick: "0 9 * * 1-5" tz=Europe/Berlin

Push. Cronkick triggers the run at 09:00, usually within a second.

3/ No PATs. It's a GitHub App with short-lived tokens, Actions write and Contents read. Your code never leaves GitHub.

4/ It's honest about what happened. Every slot shows: due → sent → runner started → job passed or failed. If GitHub was down, it says "Gave up" instead of quietly running 40 minutes late.

5/ It checks your workflow before turning it on: leftover `schedule:` (double runs), `github.event.schedule` (empty when dispatched), required inputs.

6/ The free plan is generous: unlimited repos, 10 schedules, every 15 min. Pro is $9/mo.

→ https://cronkick.xyz

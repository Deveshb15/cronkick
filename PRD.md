# Cronkick (was Ontime): on-time cron for GitHub Actions

> Renamed 2026-11-10. Product name **Cronkick**, domain **cronkick.xyz**, workflow marker `# cronkick: "<cron>"`. The rest of this spec still says Ontime and `# ontime:`; read them as Cronkick.

Product spec v0.2 · 2026-11-10 · Owner: Devesh
Sources: `../research/round10-opus-critique.md` §3–4, `../research/round10-gpt-critique.md` §1, §4, and the round-11 competitor research (`../research/round11-opus.md`, `../research/round11-gpt.md`). Facts marked **[V]** were verified on 2026-11-10. **[G]** marks a guess or hypothesis.

v0.2 changes:
- An honest competitor landscape (§2.1).
- Timezones and multiple crons per workflow are now in v1.
- Free tier: 15-minute interval. Pro: annual option, no slot cap.
- The 30 s target is consistent throughout, and a slot's retry deadline stops at the next slot.
- Launch leads with the GitHub Marketplace.

---

## 1. One-liner

**Keep your cron in your repo. Ontime triggers your GitHub Actions workflows on schedule, so you're not relying on GitHub's best-effort scheduler.**

You install a GitHub App and change one line in the workflow file. You get a per-workflow history of every scheduled slot. The price is impulse-level.

## 2. Problem

- **GitHub's `schedule:` trigger is best-effort by design.** GitHub's own docs say scheduled runs can be delayed or dropped under load, that the minimum interval is 5 minutes, and that schedules in public repos switch off after 60 days without activity [V].
- **It got much worse in late 2026.**
  - The canonical thread is community #206019, "Scheduled (cron) workflows stopped firing… since 2026-08-26" (20 upvotes, confirmed across public, private and Free accounts) [V].
  - The community/community forum had **27 threads matching "scheduled workflows"** from 10-25 to 11-10, against 2–7 per quarter earlier (note: the search terms differ between periods) [V, round 10; not re-counted in round 11].
  - **Four threads were opened on 2026-11-09 alone** [V, round 10].
  - In one report, a 30-minute schedule got **4 runs out of 62 expected slots** (#212195; one user's observation) [V].
- **GitHub promised a fix and hasn't shipped it.**
  - Its 2025-12-11 roadmap listed "updates to schedule reliability" for Q1 2026. Timezones shipped on 2026-03-19, but no reliability fix has been announced [V, round 11].
  - None of 50 status incidents from 09-04 to 11-09 mention schedules or cron [V, round 10].
  - GitHub's docs still warn that scheduled runs can be delayed or dropped [V, round 11].
- **Everyone ends up with the same workaround.** Nearly every thread title says "`workflow_dispatch` works" [V]. People build DIY dispatchers: a Raspberry Pi cron repo created 11-05, and ghacron, self-hosted with 0 stars [V].
- **Existing schedulers make you do the plumbing.** Every hosted cron aimed at this pain needs a PAT and a request you build yourself. None reads your workflow file, and none knows whether the run succeeded [V, round 11].

**The gap:**
- The design itself isn't new. ghacron (self-hosted) and cronium (Cybozu, internal only) already use the "install an App, add a comment" design.
- **What nobody sells is the hosted version, with all four of these:**
  - no PAT;
  - the schedule lives in the repo and stays in sync;
  - Ontime fires the run itself;
  - a record of every slot, matched to its run's result.
- "On time" is not the pitch, because every competitor claims it. The pitch is no setup plus that record.

### 2.1 Competitive landscape (round 11, 2026-11-10)

| Product | What it does | GitHub auth | Reads the workflow file? | Knows the run result? | Price |
|---|---|---|---|---|---|
| **ghacron** | Self-hosted Go dispatcher, `# ghacron:` comments, timezones and multiple crons. 0★, last push 2026-07-14 | GitHub App | Yes | No | Free (you host it) [V] |
| **cronium** (Cybozu) | Same design, internal use only (2025 article) | GitHub App | Yes | Unknown | Not for sale [V] |
| **crond.io** | GitHub App that finds `schedule:` blocks and tracks run conclusions. **Monitoring only; it never fires a run** | GitHub App | Yes | Yes | Pro $29/mo (GitHub monitoring is paid only) [V] |
| **Depot CI** | Runs Actions YAML on its own scheduler, aiming for "within one minute". No SLA | Depot's App | Yes (`.depot/workflows/`) | Yes (it runs the job) | $20/mo + compute. **You have to move your CI to Depot** [V] |
| **Crontap** | Hosted HTTP cron, a migration guide and a setup skill for coding agents | PAT | No | No (heartbeats only) | $2.99–19.99/mo [V] |
| **CronEngine** | Hosted cron, GitHub Actions guide (2026-10-20) | PAT | No | No | €5.99–24.99/mo [V] |
| **SteadyCron** | Cron plus heartbeats, GitHub guide | PAT | No | Via heartbeats | ~$12/mo [V] |
| **RunLater** | HTTP scheduler, GitHub Actions post (2026-11-09) | PAT | No | No | $15/mo, no free tier [V] |
| **Runhooks** | HTTP scheduler, GitHub Actions post | PAT | No | No | $19/mo [V] |
| **cronjob.de** | Hosted cron with a GitHub guide | PAT | No | No (heartbeat add-on) | €1.49/mo [V] |
| cron-job.org, FastCron, EasyCron, QStash, cloud schedulers | Generic HTTP cron | You build the request | No | No | $0–8/mo [V] |
| Healthchecks, Cronitor, Better Stack, Sentry Crons | Alert when a ping doesn't arrive | n/a | No | Only if you add a ping | $0–20/mo [V] |

- **GitHub Marketplace:** a search for "schedule" apps returned 14 apps, and none triggers workflows on a schedule. The slot is empty [V].
- **Closest threat:** crond.io. It already has the App, reads the workflow files and tracks run results. Adding "fire the run" would make it a direct competitor [G].

## 3. Who it's for

| Segment | Example jobs | Will pay? |
|---|---|---|
| **Primary:** small teams and indie devs with private repos running dev jobs on a schedule | nightly builds and tests, dependency bumps, report generation, data syncs, release checks, scheduled deploys | Yes, if it's under $10 and saves them from building a PAT dispatcher [G] |
| Secondary: OSS maintainers whose schedules get switched off after 60 days | nightly releases, stale-issue bots | Free tier |
| **Not a target:** people using Actions as a free production cron (Supabase keep-alives, scrapers) | keep-alive pings | Rarely pay. The GitHub terms limit Actions to software-development use (#212445) [V]. Don't market to them. |

## 4. Goals and non-goals

**Goals**
1. Send the first trigger attempt for each opted-in slot within 30 s of its due time (p99), whenever GitHub's API accepts requests.
2. Never fire the same slot twice.
3. Make every slot visible, including missed and unknown outcomes.
4. Self-serve from install to first on-time run in **under 5 minutes**, with no PAT and no dashboard config beyond install.
5. Earn the first dollars within 14 days of launch.

**Non-goals for v1**
- Guaranteeing when the runner starts. GitHub controls queues and runners. We control the trigger and we report what happened.
- Running customer code. We never run anyone's jobs; we only trigger their workflow.
- Auto re-running failed jobs, Slack/Discord alerts, GHES/GitLab/Forgejo, an unlimited plan.
- Timezones and multiple crons per workflow are **in** v1 (§6.1). GitHub's native scheduler supports both, so leaving them out would make Ontime a step backwards.

## 5. How it works (user flow)

1. **Install** the GitHub App on selected repos.
   - Permissions: `actions: write`, `contents: read`, `metadata: read`.
   - Webhooks: `installation`, `installation_repositories`, `push`, `workflow_run`.
2. **Ontime scans `.github/workflows/*.yml`** on the default branch and shows a per-workflow diff:

   ```yaml
   on:
     # schedule:              # ← remove (or keep — see §7 D1)
     #   - cron: "17 * * * *"
     workflow_dispatch: # ontime: "17 * * * *"
     # ontime: "0 9 * * 1-5" tz=Europe/Berlin   ← optional extra cron, optional timezone
   ```

   This is the one-line switch: add `workflow_dispatch:` with an `# ontime: "<cron>"` comment and remove the native `schedule:` block.
   - You can add more `# ontime:` lines, one per cron.
   - `tz=<IANA name>` is optional and defaults to UTC.
   - The "import from schedule" step carries over every native cron entry and its `timezone:`.
3. **A compatibility check runs before anything is turned on.** It flags workflows that:
   - read `github.event.schedule`;
   - branch on `github.event_name == 'schedule'`;
   - have required `workflow_dispatch` inputs; or
   - have a cron more frequent than the plan allows;
   - have a cron or timezone the import can't carry over exactly (for example, an unknown IANA name).

   Flagged workflows are never turned on silently. The message says exactly which line to fix.
4. **Activation happens on the next push to the default branch** (and on install). From then on, Ontime triggers each slot.
5. **Each workflow gets a status page** showing the last N slots: due time, our trigger time, GitHub's response, run link, run conclusion, and state (`fired`, `accepted`, `unknown`, `expired`, `skipped`).
6. **Email alerts** (paid) go out when a trigger fails, a slot expires, or a triggered run fails.

## 6. Functional requirements (v1)

### 6.1 GitHub App and config
- R1. Verify every webhook signature (`X-Hub-Signature-256`). Reject anything unsigned.
- R2. Use only short-lived installation tokens. Never store a PAT. Encrypt the App private key at rest.
- R3. Parse workflow files on install, on every push to the default branch, and in a daily reconciliation pass. Extract every `# ontime: "<5-field cron>" [tz=<IANA>]` marker in the file.
  - Each marker is one schedule.
  - The timezone defaults to UTC. Daylight saving: a time that doesn't exist that day (spring forward) fires once at the first valid time after the gap, and a time that occurs twice (fall back) fires once.
  - Slots are stored as UTC instants.
- R4. Pause scheduling right away when an installation is removed, a repo is taken out of the installation, the user opts out, or a workflow file is deleted or renamed.

### 6.2 Scheduler (the core)
- R5. Store slots in Postgres with a unique key `(installation_id, repo_id, workflow_id, due_at)`. If two crons on the same workflow fall on the same instant, that's one slot and one trigger. A worker takes a slot with a lease (`SELECT … FOR UPDATE SKIP LOCKED`) before triggering. Two workers can never fire the same slot.
- R6. Call `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches` with `ref` set to the default branch, aiming for **≤ 30 s after due time**. Handle both response shapes: the newer one returns the run ID and URL, the older one returns a bare 204 [V].
- R7. Retry only on explicit throttling or 5xx responses, with backoff, until the **slot deadline**: due + 5 min, or the next slot's due time if that comes first. After the deadline the slot is `expired`: we alert and never fire it late. A slot never retries into the next one.
- R8. A timeout or ambiguous response marks the slot `unknown`. Alert the user, and do **not** blindly fire it again. The slot key stops our workers racing each other, but it can't guarantee GitHub runs the workflow exactly once, so say that clearly before the user turns a workflow on.
- R9. Minimum interval: **15 min** on Free, **5 min** on paid (matching GitHub's floor).
- R10. Respect GitHub API rate limits per installation, and spread out the `0 * * * *` peak (small jitter within the first ~20 s, plus queueing).

### 6.3 Visibility and alerts
- R11. Show a per-workflow slot history (last 20 slots on Free, 90 days on paid). Display the full count of slots, including `unknown` and `expired`.
- R12. Match each fired slot to its run via the returned run ID or the `workflow_run` webhook, and store the conclusion.
- R13. Paid plans get email when a slot is `unknown` or `expired`, or when a triggered run fails.

### 6.4 Billing
- R14. Use a merchant of record that pays out to India (Polar or Dodo Payments; to be confirmed), billed per GitHub installation account.
- R15. When a plan limit is hit, pause the extra schedules and send an email. Disclose this before purchase. No surprise charges for going over.

### 6.5 Public "GitHub cron lateness" page (build first, before the app)
- R16. Run 4–6 probe repos (public, private, new, old) with `*/5` and hourly schedules. Each run records the scheduled time and the actual start time.
- R17. Publish a public page with p50/p95 lateness and the share of slots that never ran over the last 7 days, including the denominator. This is the Depot-style benchmark, the asset for the HN and X launch, and **the kill gate (§11)**.

## 7. Decisions to make (with recommendations)

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | What happens to the native `schedule:` block | (a) Remove it: no duplicates, no fallback. (b) Keep it as a backup and cancel GitHub's late runs through the `workflow_run` webhook. | **(a) for v1.** With (b), GitHub's late native run may already have done its side effects before we can cancel it (GPT critique §2). Offer (b) later as an opt-in. |
| D2 | Where the cron lives | (a) `# ontime:` comments under `workflow_dispatch`. (b) Read the existing `on.schedule` cron. | **(a)**, since D1 removes `schedule:`. One comment per cron, each with an optional `tz=`. Also offer an "import from your existing schedule" button that writes the diff, carrying over every cron and its timezone. |
| D3 | Pricing | (a) One paid plan at $9. (b) Free + Pro $6 + Team $19. | **Free + Pro at $9/mo or $90/yr per account** (50 schedules, 5-min interval, alerts, 90-day history). $9 sits between the generic crons ($0–8) and the GitHub-targeted ones ($12–29) [V, round 11]. Add Team $19 only once auto re-run exists. |
| D4 | Free tier | yes / no | **Yes:** 1 repo, 3 schedules, every 15 minutes or slower. Hourly was the stingiest free tier on the market [V, round 11]. The Free tier drives installs and Marketplace ranking. |
| D5 | Name and domain | Ontime / slotcron / cronbeat… | Open. Check that the domain and the GitHub App name are free. |

## 8. Pricing (proposed, per D3)

| Plan | Price | Limits |
|---|---|---|
| Free | $0 | 1 repo · 3 schedules · every 15 min or slower · last 20 slots |
| Pro | **$9/mo or $90/yr** per GitHub account or org | 50 schedules · 5-minute interval · email alerts · 90-day history |

The limit is schedules, not slots. 50 schedules at 5 minutes is at most about 432k slots/mo, or about 600 dispatches an hour per installation. That's well under GitHub's 5,000 requests an hour per installation [G: check this against GitHub's current rate-limit docs before launch].
| Team (later) | $19/mo | Unlimited schedules · one auto re-run when GitHub's own infrastructure fails the job · Slack/Discord |

Expected margin at 20 paying accounts: about $180 MRR minus about $25–40/mo in infrastructure, email and backups [G].

## 9. Tech stack

- **Language:** TypeScript on Node 22.
- **Web and webhooks:** Hono or Next.js route handlers. Pick whichever ships faster.
- **GitHub:** `@octokit/app` and `@octokit/webhooks`.
- **Scheduling:**
  - `cron-parser` for cron expressions;
  - a Postgres slot table plus a 1-second worker loop that takes slots with `SKIP LOCKED` (no Redis);
  - pg-boss is optional, but a plain loop is enough at this scale.
- **Database:** Postgres 17.
- **Email:** Resend.
- **Payments:** Polar or Dodo, per R14.
- **Single process:** one Node process runs the web server and the worker. Two processes run only once uptime requires it.

## 10. Infrastructure on DigitalOcean (with `doctl`)

**Where it runs:** DO droplets, paid by the existing credit until 2027-02-27. After that it's about $12–27/mo, cheap enough to keep or to move to any VPS unchanged.
- **Region:** `nyc3` or `sfo3`, close to GitHub's API. Not `blr1`.
- **Credentials:** `doctl` is already logged in as team LoveGPT, with 2 of 15 droplets used.

> Never mention credits in public copy. Every command below creates resources and costs money, or credit. Ask before running.

### 10.1 Check balance and credit before anything else
```bash
doctl account get
doctl balance get                 # month-to-date usage; should stay $0 billed while credit lasts
doctl billing-history list | head
doctl compute size list | grep -E '^s-1vcpu-2gb|^s-2vcpu-2gb'   # s-1vcpu-2gb = $12/mo [V]
```

### 10.2 Option A (recommended for v1): one droplet, Postgres on the same box, about $12/mo
```bash
# SSH keys on account: "dev_new", "Devesh Macbook"  [V]
doctl compute ssh-key list

doctl compute droplet create ontime-1 \
  --region nyc3 --size s-1vcpu-2gb --image ubuntu-24-04-x64 \
  --ssh-keys "$(doctl compute ssh-key list --format ID --no-header | paste -sd, -)" \
  --enable-monitoring --enable-backups --tag-name ontime --wait

doctl compute reserved-ip create --region nyc3
doctl compute reserved-ip-action assign <RESERVED_IP> <DROPLET_ID>

# Firewall: SSH from my IP only; 80/443 open for webhooks + site
doctl compute firewall create --name ontime-fw --tag-names ontime \
  --inbound-rules "protocol:tcp,ports:22,address:<MY_IP>/32 protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:53,address:0.0.0.0/0,address:::/0"

doctl compute ssh ontime-1        # then: Caddy (auto-TLS) → Node app (systemd) + Postgres 17
```

### 10.3 Option B: managed Postgres, about $12 + $15/mo
Use this when losing the database becomes the main risk, for example once there are paying customers.
```bash
doctl databases create ontime-db --engine pg --version 17 \
  --size db-s-1vcpu-1gb --region nyc3 --num-nodes 1          # slug + v17 available [V]
doctl databases firewalls append <DB_ID> --rule droplet:<DROPLET_ID>
doctl databases connection <DB_ID> --format URI               # → DATABASE_URL
doctl databases backups list <DB_ID>
```

### 10.4 DNS (if the domain uses DO nameservers)
```bash
doctl compute domain create ontime.dev
doctl compute domain records create ontime.dev --record-type A --record-name @   --record-data <RESERVED_IP>
doctl compute domain records create ontime.dev --record-type A --record-name api --record-data <RESERVED_IP>
```

### 10.5 Day-to-day operations
```bash
doctl compute droplet list --tag-name ontime
doctl monitoring alert create --type v1/insights/droplet/cpu --compare GreaterThan \
  --value 80 --window 5m --entities <DROPLET_ID> --emails <EMAIL> --description "ontime cpu"
doctl compute droplet-action snapshot <DROPLET_ID> --snapshot-name ontime-pre-launch --wait
doctl balance get                                  # weekly: confirm credit still covers it
```

### 10.6 Teardown, if the kill test fails
```bash
doctl compute droplet delete ontime-1
doctl compute reserved-ip delete <RESERVED_IP>
doctl compute firewall delete <FW_ID>
doctl databases delete <DB_ID>        # Option B only
```

### 10.7 Probe repos (R16)
These run on GitHub Actions, not DO, so they cost no DO credit. A small DO-side collector reads each probe run's `run_started_at` against its due slot. It's a few lines inside the same app.

## 11. Launch plan and 14-day kill test

| Day | Step | Gate or kill condition |
|---|---|---|
| 0–2 | Probe repos plus the lateness page, before any app code | **Kill:** 72 h of probes show p95 lateness under 10 min and 0 dropped slots, meaning GitHub fixed it. |
| 3–9 | Build v1 (§6) | **Kill:** scope slips past day 10. Ship the free version without billing and stop. |
| 10 | **Launch, Marketplace first.**<br>1. **GitHub Marketplace listing** (free plan; billing on our site). No app there triggers workflows on a schedule, so this is the main channel [V, round 11].<br>2. X thread with the lateness chart and the one-line diff.<br>3. Show HN linking the live lateness page. Past HN posts on this topic got 2–4 points [V], so it's a bonus, not a gate.<br>4. SEO pages ("github actions schedule not running", "workflow_dispatch vs schedule"). About 10 vendors already compete for these terms, so expect slow results. | Write the copy for dev jobs. Don't promise "never miss" or "on the minute". Lead with "no PAT" and "every slot accounted for". |
| 10+ | Answer relevant community threads: the free DIY fix first, then a disclosed one-line mention of Ontime. No bulk replies. | Follow the forum's rules. Devesh decides whether to do this. |
| 24 | Review | **Continue** at ≥100 installs and ≥5 paying accounts. **Stop selling** at <40 installs or 0 paying accounts: keep the free tier up, spend ≤1 h/week. In between: one more week, then decide again. |

Delivery gate, from GPT §4:
- Measure at least **1,000 real slots**.
- At least 99% of first trigger attempts must go out within 30 s of the due time.
- Any duplicate fire, silent missing slot or cross-tenant leak blocks sales until it's fixed.

## 12. Success metrics

- **Activation:** install → first on-time slot in under 5 min, with no hands-on help.
- **Delivery:** p99 trigger time ≤ 30 s after due, 0 duplicates, all `unknown` and `expired` slots shown.
- **Business:**
  - Month-3 MRR is **$80–350, base case ~$90–150** [G].
  - $3k MRR would need about 334 subscriptions. That's not the plan; this is a fast credibility and audience build.

## 13. Risks

| Risk | Mitigation |
|---|---|
| GitHub fixes the scheduler, and the acute pain goes away | Chronic problems remain (top-of-hour delays, 60-day auto-disable, no visibility). The day 0–2 gate catches an early fix. GitHub promised a fix for Q1 2026 and hasn't delivered [V]. |
| **crond.io adds firing.** It already has the App, reads the workflow files and tracks run results; monitoring only, $29 | Ship first and claim the Marketplace listing. Price at $9, under its $29. Make the slot record exact for every due slot (crond.io tracks multiple crons at the tightest interval, not each slot) [V/G]. |
| Someone hosts ghacron, or a PAT-based cron (Crontap, RunLater, CronEngine) adds a GitHub App | Speed and the Marketplace listing. RunLater's 11-09 post and Crontap's agent skill show they're watching [V]. The cron logic is easy to copy; trust in the permissions and reliable operations are the moat [G]. |
| Depot CI's built-in scheduler | Different buyer: Depot requires moving your CI. Ontime keeps GitHub-hosted runners and existing workflows. |
| Duplicate or side-effect runs | D1(a), unique slot keys, no blind re-fire, and an `unknown` state |
| `event_name` and `github.event.schedule` behave differently | A compatibility check before activation, plus docs |
| GitHub App token or API incidents (one on 10-27 returned 404s on 1.24% of requests [V]) | Retry until the deadline, show slot states, publish the full slot count |
| Terms of service: Actions used as a production cron | Market for dev jobs only |
| A load spike at the top of the hour | Jitter, queueing, plan caps |
| Low willingness to pay | Free tier for reach, $9 Pro, 14-day kill gate |

## 14. Later (not v1)

- Team tier: one auto re-run when a job fails because of GitHub's own infrastructure (match the error signature and the `runner_id: 0` hint; cap at one re-run).
- Slack and Discord alerts.
- A one-click PR that applies the diff (needs `contents: write`).
- An opt-in native-schedule fallback that cancels late duplicate runs (D1b).
- GHES, GitLab, Forgejo.

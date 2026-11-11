# Cronkick trust review (round 12 synthesis)

Date: 2026-11-11. Two independent reviews (GPT-6.1 Sol, Opus 5.5), each followed by a critique of the other. Sources, screenshots and evidence:

- `../research/round12-brief.md`
- `../research/round12-gpt.md`, `../research/round12-opus.md` (reviews; screenshots in `../research/round12-shots/{gpt,opus}/`)
- `../research/round12-gpt-critique.md`, `../research/round12-opus-critique.md` (cross-critiques with merged build lists)

## Verdict

The visual system and the docs are good; don't redesign. What makes Cronkick read as "vibe-coded" is not the look. It is **claims the product can't back up** and **a dashboard that can say green when it isn't**. A skeptical team lead finds three of these in five minutes: an unsupported 95% headline, product mockups with numbers that don't add up and old status names, and permission copy that understates `actions: write`. The fix is honesty and correct states, not more polish.

Both reviewers also confirmed: no new hosted competitor since round 11; crond.io still only monitors; the GitHub scheduled-workflow pain is still live (new community threads on 2026-11-09, no staff reply).

## What to keep

The amber slot-tile identity, the docs site, the dashboard layout, the "Gave up" / "Unconfirmed" / never-resend semantics, the compatibility checks, the marker syntax, the two-plan offer.

## Decisions on the points where the reviewers disagreed

| Topic | Decision |
|---|---|
| Hero "LIVE · GitHub missed 95%" pill | Remove now. `/lateness` stays but shows its real sample (repo count, window, freshness, collector health). |
| Cronkick row on `/lateness` | Not this round. Needs matched expected-slot denominators. Later. |
| Speed claim | "Within seconds" / "first attempt within 30 s". Drop "on the minute", "under a second", "never late". |
| Checkout | Copy says "Request Pro, activated by hand" everywhere, legal pages match. A hosted payment link is an owner action (needs a payment account), listed below. No billing integration this round. |
| Outage gaps beyond the 2 h horizon | Record them. After an outage, create the missed occasions from the last planned due time (capped at 7 days) and settle them as expired with a "Cronkick was unavailable" note. Never dispatch them. Alerts fire as for any expired slot. |
| Sparse (daily/weekly) schedules shown as "waiting for push" | Fix this round. It is a first-run conversion bug. |
| Open source | Owner's business call. Not a fix. Publishing the exact API surface covers the trust need. |
| Motion | Remove pulses that imply health or liveness we can't prove. Leave decorative motion alone this round. |
| Operator identity | A short "Who runs this" block (name, where it runs, what happens if it shuts down), linked from footer and security docs. |

## Build list for this cycle (code)

**P0: correctness and honesty**

1. **Honest slot states and verdicts.** Overdue (past due, not yet sent) is its own state and blocks any "all on time" verdict; counts reconcile. A definite GitHub refusal (non-retryable 4xx) is "Rejected", not "Unconfirmed". On-time is scored from the successful send, not the claim. Unconfirmed is amber, not red. (both)
2. **Sparse schedules recognized as configured**, with next due time computed from the cron, not from materialized rows. Zero repositories leads to repository selection. (GPT; Opus for zero repos)
3. **No silent gaps after an outage** (decision above). (GPT)
4. **Claims match behaviour.** Landing, docs, support, terms, privacy, refunds, `docs/launch.md`: remove absolutes, "Most teams", "run charts", unconditional limit-email promises; manual Pro activation; quick-start time that doesn't imply a daily job runs in two minutes. (both)
5. **Lateness honesty.** Remove hero pill; `/lateness` and the dashboard benchmark card show sample size, window, freshness; a probe fetch failure is not counted as a GitHub miss; short medians in seconds, not "0 min". (both)
6. **Permission truth.** `/docs/security` explains what Contents: read and Actions: write *allow*, what Cronkick actually *calls* (the endpoints in `src/github.ts`), and what it can't touch (secrets, pushing code). A one-line link next to install CTAs. Fix "reads only the workflow files". (both; Opus for the actions-scope detail)
7. **Product visuals match the product.** Landing mockups use current status names and nav, numbers that add up, and an "Example" label; delete vignettes that can't be kept accurate cheaply. (both)

**P1: before a launch post**

8. **Navigation and recovery:** phone menu, public 404 with Home/Docs, real session state on public pages (`signedIn={false}` hard-coded today). (both)
9. **Keyboard and phone evidence:** history rows expandable with a real button, visible Copy on the marker, readable job result on phones, `/lateness` overflow cue. (both)
10. **History and quota truth:** recent failures from now-paused or needs-a-fix workflows stay in overview counts; "Load older" past the 500-row cap; limit email works once an address is saved; docs say where to set it. (GPT; both for the email)
11. **Trust surfaces:** operator block, `security.txt`, an "If Cronkick goes down" FAQ plus a copyable restore-native-schedule procedure in `/docs/migrate`, rename dashboard "Live" to "Live updates", Open Graph image. (both)

## Owner actions (not code; listed for Devesh)

- GitHub App settings: upload `brand/cronkick-app-icon.svg`, write a real description with the permission line, add support/privacy/security links.
- Status page (Better Stack or UptimeRobot) on `/healthz` and `/healthz/dispatch` at `status.cronkick.xyz`; then link it from the footer.
- DMARC record; confirm production `MAIL_FROM` domain.
- A hosted payment link (Dodo/Polar) for $9/mo, then swap it in for the "Request Pro" mailto.
- Add an older public probe repo so `/lateness` isn't one new private repo.
- Later: move the App to an org; free Marketplace listing.

## Not this round

Run charts, Team tier, Slack/Discord, auto re-runs, SOC 2 / trust center, new domain or logo, visual redesign, job-level runner timing, billing webhooks, Cronkick-vs-GitHub comparison row, a public demo dashboard, open-sourcing.

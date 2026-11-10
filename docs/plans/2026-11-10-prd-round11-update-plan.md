# Update PRD with round-11 competitor research

Created: 2026-11-10
Execution: knowledge-work

**Target:** `PRD.md`. **Sources:** `../research/round11-opus.md` and `../research/round11-gpt.md`.

## Goal

Bring `PRD.md` (v0.1) up to date with the round-11 competitor research and fix the inconsistencies found earlier. The result is v0.2. Only the PRD changes; the research files stay as they are.

## Decisions already made

| # | Change | Decision |
|---|---|---|
| C1 | The "nobody does this" claim in §2 | Replace it with an honest landscape: ghacron and cronium (same design, not hosted), crond.io (App monitoring only), hosted crons that need a PAT (Crontap, CronEngine, SteadyCron, RunLater, Runhooks, cronjob.de) and Depot CI (requires moving your CI). The new gap: **hosted + no PAT + synced with the repo + a record of every slot with its run result.** |
| C2 | Timezones and multiple crons per workflow | **Both go into v1.** An optional IANA timezone in the marker, e.g. `# ontime: "0 9 * * *" tz=Europe/Berlin`, defaulting to UTC. Multiple `# ontime:` lines per workflow are allowed. Each cron counts as one schedule. The import step carries over the native `timezone:` and every cron entry faithfully. Remove both from the non-goals. |
| C3 | Pro: 50 schedules vs 30k slots/mo | **Drop the 30k-slot cap.** The limit is 50 schedules at a 5-minute minimum, which is at most about 432k slots/mo, or about 600 dispatches/hour per install, well under GitHub's 5,000/hour installation limit. |
| C4 | Free tier and annual billing | Free: **15-minute minimum**, 3 schedules, 1 repo. Pro: $9/mo **or $90/yr**. Update R9, D3, D4 and §8 to match. |
| C5 | Competitive risks | Add crond.io (top threat), Crontap and the other hosted crons, Depot CI, and "someone hosts ghacron" to §13. |
| C6 | Launch plan | Lead with the **GitHub Marketplace listing**: a search for "schedule" apps found no app that triggers workflows. Show HN becomes secondary, and "Show HN ≥100 points" is no longer a way to pass the continue gate. |
| C7 | 60 s goal vs 30 s target | Goal 1 becomes "first trigger attempt ≤ 30 s after due (p99)", matching R6, §11 and §12. |
| C8 | 5-min retry deadline vs 5-min interval | Slot deadline = **the earlier of due + 5 min and the next slot's due time**. A slot never retries into the next one. |
| C9 | Wording on facts | Mark which facts the round-11 research re-checked. Change "GitHub hasn't acknowledged it" to the confirmed fact: the Dec-2025 roadmap promised "schedule reliability" for Q1 2026, and no fix has been announced. Note that the round-10 forum thread counts were not reproduced in round 11. |

## Steps (in order, all inside `PRD.md`)

1. **Header:** bump to v0.2 and add round-11 to the sources.
2. **§2 Problem:** apply C9 wording. Replace "The gap" with the C1 positioning and add a new §2.1 "Competitive landscape" table: product, what it does, auth, reads repo?, knows run result?, price.
3. **§4 Goals and non-goals:** apply C7. Remove timezones and multiple crons from the non-goals (C2).
4. **§5 Flow and §6.1:** marker syntax with optional `tz=`, multiple markers, and import that keeps the native timezone and all crons (C2). Add to the compatibility check: refuse anything the import can't carry over exactly, with a clear message.
5. **§6.2:** R7 deadline per C8. R9 intervals per C4.
6. **§7 Decisions:** update D2 (multiple markers and timezone), D3 (annual plan) and D4 (15-minute Free).
7. **§8 Pricing:** apply C3 and C4.
8. **§11 Launch:** apply C6 to the day-10 row and the day-24 gate.
9. **§13 Risks:** apply C5. **§14 Later:** remove timezones.
10. **Consistency pass:** search the PRD for `60 s`, `hourly`, `30k`, `timezone`, `multiple crons`, `≥100 points` and `nobody`. Every remaining mention must match the decisions above.

## Done when

- No section contradicts another on interval, latency, limits, timezones or the launch gate.
- Every new competitor fact is marked [V] or [G], as in round-11.
- Nothing outside `PRD.md` changed.

## Out of scope

- Cutting paid history to 30 days (an Opus suggestion that wasn't in the agreed list).
- Re-checking the research claims, and any code, infrastructure or billing work.

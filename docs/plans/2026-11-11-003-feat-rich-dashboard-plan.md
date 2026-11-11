---
title: "feat: Rich, interactive dashboard that holds up when an account is sparse"
type: feat
status: active
date: 2026-11-11
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
origin: ../research/round14-ui/ (brief, critique-gpt, critique-opus, cross-gpt, cross-opus)
---

# feat: Rich, interactive dashboard for sparse accounts

## Summary

Make the dashboard show its value when an account has one to three schedules:
- what runs next;
- an inspectable track record of recent runs;
- daily history you can click into;
- the latest GitHub run result.

The workflow page gets range-scoped analysis: facts, a send-delay distribution, and daily cells. Accounts with four or more schedules keep the compact round-13 layout. Two data bugs are fixed on the way: strips ignore plan retention, and the workflow page fetches every workflow's strip.

---

## Problem Frame

The owner's real account has one 15-minute schedule, and the overview reads as empty: a status line, one thin row, and black space. Nothing shows that Cronkick is working, and nothing invites interaction. GPT-6.1 Sol and Opus 5.5 each critiqued a mockup and then each other's critique. Both rejected decorative sparklines and an overview latency chart, and both converged on time-based evidence (upcoming runs, recent runs, daily history) plus analysis on the workflow page. Evidence: `../research/round14-ui/`.

---

## Requirements

- **R1. Density modes**, counted by displayed workflows, including those that need a fix or are paused:
  - 0: the setup or migration state;
  - 1: a spotlight card;
  - 2–3: medium cards with the strip visible;
  - 4 or more: the round-13 compact rows.
  - Workflows that need a fix or are paused always render compact, with their reason.
- **R2. Spotlight card:**
  - identity, cadence and cron;
  - the next run (R3);
  - 24 h facts: on time n/N, plus median send delay and its sample size;
  - an interactive strip of the latest 96 recorded slots, labelled with its real first and last time, with an inspector;
  - daily cells (R5);
  - the latest GitHub run line (R4).
- **R3. Next runs:**
  - Cadence under 60 min: "Next 15:00 · in 9 min · then every 15 min".
  - Slower or irregular cadence: the next five dated times.
  - A workflow with no due slot yet reads "Awaiting first run", with its next times.
- **R4. Latest GitHub run:**
  - When there is one: "Passed · 42 s · scheduled 14:15 · View run".
  - When a run was sent but GitHub has reported nothing: "Sent; GitHub result not reported".
  - Never imply that a job is "running".
- **R5. Daily cells:**
  - Seven calendar days on Free, thirty on Pro, ending today in the viewer's time zone.
  - Today is labelled "so far".
  - Colour shows the worst dispatch state that day.
  - A separate mark shows GitHub run failures, and a separate edge shows coverage gaps.
  - Days before the first retained record read as "no records".
  - Selecting a day shows its counts. Opening it goes to that workflow's history bounded to exactly that day.
- **R6. Account facts at 2+ workflows:** shown once above the cards (24 h on time n/N, median, GitHub outcomes). Cards don't repeat them.
- **R7. Benchmark:** a collapsed text disclosure below the operational content.
  - The summary line gives both probe cohorts' median lateness and never-ran share.
  - Expanded, it gives the sample bounds and the age of the last check, and says what each side measures.
  - No chart and no head-to-head claim.
  - It is hidden when there is no live probe sample.
- **R8. Workflow page analysis:**
  - A range toggle: 24 h and 7 d (default 7 d), plus 30 d and 90 d on Pro.
  - Range facts: on time n/N, p50/p95 send delay with sample count, GitHub outcomes.
  - A send-delay distribution: 60 half-second bins from 0 to 30 s, with the >30 s count and the maximum shown separately, plus a note on the top-of-hour offset.
  - Daily cells over the range, with exact-day selection.
- **R9. History day bounds:** `?day=YYYY-MM-DD`, in the viewer's zone, bounds the history. Filters, counts and paging honour it, and it is clipped to plan retention.
- **R10. Fixes:**
  - `recentSlots` respects plan retention.
  - The workflow page reads only its own workflow's strip.
- **R11. Accessibility:**
  - every chart has a text equivalent;
  - selectable charts get one tab stop with arrow keys, plus 44 px Previous/Next buttons on phones;
  - selection survives live refresh;
  - zinc-400 is the minimum for text.

---

## Key Technical Decisions

- **KTD1. No latency chart on the overview.** The overview stays operational: a status strip and daily cells. Latency distribution lives on the workflow page. Rationale: deliberate top-of-hour jitter (0–15 s, `jitterMs` in `src/slots.ts`) makes a per-run latency chart look faulty. Both reviewers agreed.
- **KTD2. Medium cards keep the strip visible.** An "Inspect activity" accordion would give a 3-schedule account less to see than a 4-schedule one (Opus's cross-critique; adopted over GPT's accordion).
- **KTD3. Exact-day history uses `from`/`until` bounds, not a `before` cursor.** A cursor alone shows older runs for an empty day (GPT's cross-critique).
- **KTD4. Viewer zone comes from a cookie.** A `tz` cookie holds an IANA name set by the client and validated on the server through `Intl`. Without it, the zone falls back to UTC, labelled. Daily buckets are computed in SQL with `AT TIME ZONE`.
- **KTD5. Next runs come from repeated `nextDue` calls,** each starting from the previous result. This reuses the DST and merge rules and exports no new API.
- **KTD6. The distribution is aggregated in SQL** (`width_bucket` on milliseconds, with exactly 30 s kept in the last in-range bin). That returns 60 counts plus the late count and the maximum, never thousands of points.
- **KTD7. No caching, no new index, no new dependency.** Charts are server-rendered SVG inside small client wrappers for selection.

---

## High-Level Technical Design

```mermaid
flowchart TB
  P[overview page] -->|count displayed workflows| M{density}
  M -->|0| S[setup / migration]
  M -->|1| SP[spotlight card]
  M -->|2-3| MC[medium cards + account facts]
  M -->|4+| CR[compact rows (round 13)]
  SP & MC --> D1[recentSlots 96 · retention-bounded]
  SP & MC --> D2[nextRuns via nextDue x5]
  SP & MC --> D3[dailyCells(tz, 7|30 days)]
  SP & MC --> D4[latest GitHub run from D1]
  W[workflow page ?range ?day] --> A1[rangeFacts + delayBins]
  W --> D3
  W --> H[workflowHistory(from/until day bounds)]
```

---

## Implementation Units

### U1. Data foundations: retention, next runs, viewer zone

**Goal:** fix the two bugs and add the shared helpers.
**Requirements:** R3, R10, KTD4, KTD5
**Files:** `web/lib/data.ts`, `web/lib/live.ts`, `web/components/live-refresh.tsx` (sets the cookie), `web/app/dashboard/[installationId]/workflows/[workflowId]/page.tsx`, `test/dashboard.test.ts`, `test/live.test.ts`

**Approach:**
1. `recentSlots` gains a retention lower bound from the installation's plan, and an optional workflow filter.
2. Add `nextRuns(schedules, now, n)` by calling `nextDue` repeatedly. Add `cadenceMinutes` from the gap between the first two runs.
3. Add `viewerZone(cookieValue)`: it validates the name with `Intl.DateTimeFormat` and falls back to UTC.
4. The live-refresh client writes `tz=<Intl resolved zone>` on mount if it is missing or different, then refreshes once.

**Test scenarios:**
- A Free account's daily workflow with 30 days of slots: `recentSlots` returns only the last 7 days.
- On Pro, the same workflow returns up to 96 slots.
- `nextRuns('*/15', 14:07)` gives 14:15, 14:30, 14:45, 15:00, 15:15, and the cadence is 15.
- `nextRuns` for a Berlin daily schedule across the fall-back night gives no duplicate.
- `viewerZone('Asia/Kolkata')` gives that zone; `viewerZone('Mars/Base')` and `viewerZone(undefined)` give UTC.

**Verification:** tests pass. The workflow page query count falls to one strip query.

### U2. Daily cells

**Goal:** a per-workflow daily aggregate in the viewer's zone, and a cell component.
**Requirements:** R5, R11, KTD4
**Dependencies:** U1
**Files:** `web/lib/data.ts` (`dailyCells`), `web/components/daily-cells.tsx` (new), `web/app/globals.css`, `test/dashboard.test.ts`

**Approach:**
- One grouped query per set of workflow ids: `date_trunc('day', due_at AT TIME ZONE $tz)`. Per day it counts:
  - due, on time, late, unconfirmed, not sent (refused or gave up), overdue;
  - GitHub failures.
- Coverage gaps are intersected with each day on the server.
- Days are clipped to retention. Days before the first record are flagged `none`.
- The component is a fixed-height row of cells, one tab stop, arrow keys and Previous/Next buttons. The inspector shows the counts and an "Open this day" link to `?day=`. There is a text disclosure listing every day.

**Test scenarios:**
- Slots across a UTC midnight bucket by the given zone. One at 23:30 UTC belongs to the next day in Asia/Kolkata.
- A day with one late run and 95 on time has worst state `late`, with counts 95 and 1.
- A day with a GitHub failure but all dispatches on time reads `ontime` with `failed: 1`.
- A day overlapping a coverage gap is flagged `gap`, with zero runs invented.
- A Free account asking for 30 days gets 7. Days before the first slot are `none`.

**Verification:** tests pass. The spotlight shows 7 cells for `solo`.

### U3. Overview density modes and cards

**Goal:** the spotlight card and medium cards; compact rows at 4 or more.
**Requirements:** R1–R4, R6, R11, KTD1, KTD2
**Dependencies:** U1, U2
**Files:**
- `web/app/dashboard/[installationId]/page.tsx`
- `web/components/schedule-card.tsx` (new)
- `web/components/live-strip.tsx` (inspector reused)
- `web/lib/format.ts` (`nextLine`, `latestRunLine`)
- `test/live.test.ts`

**Approach:**
- The page counts displayed workflows and picks the mode.
- The card composes, in order:
  1. identity;
  2. the next line or next-5 list;
  3. 24 h facts (spotlight only);
  4. the interactive strip with its inspector (round-13 `LiveStrip` interactive mode, with bounds labelled);
  5. daily cells;
  6. the latest GitHub run line.
- At 2 or 3 workflows, the account facts line sits once above the cards.
- Needs-fix and paused workflows render as compact rows inside the card list.

**Test scenarios:**
- `nextLine` for a 15-minute cadence gives "then every 15 min". For an hourly or daily cadence it gives a five-item dated list. With no next time it gives "Not scheduled".
- `latestRunLine` for a success with duration gives "Passed · 42 s". For an accepted run with no conclusion it gives "Sent; GitHub result not reported". For a run never sent it reports the dispatch state, not a GitHub line.
- Density: 1 displayed workflow gives a spotlight. 3 give medium cards. 4 give compact rows. 1 active plus 1 needing a fix count as 2.

**Verification:** `dash-solo` shows the spotlight with every element. `dash-umbrella` does too, with its gap edge. `dash-acme` and `dash-globex` keep compact rows.

### U4. Benchmark disclosure

**Goal:** replace the benchmark line with an honest, collapsed text disclosure.
**Requirements:** R7
**Dependencies:** U3
**Files:** `web/app/dashboard/[installationId]/page.tsx`, `web/lib/format.ts` (`benchmarkSummary`), `test/live.test.ts`

**Approach:**
- Use `probeReport`'s schedules that have expected runs.
- The summary line reads, for example: "GitHub's own schedule in our probe repos · every 5 min: median 2.6 min late, 7.6% never ran · hourly: 8.9 min, 2.1%".
- The expanded body uses `probeSample` and says what Cronkick measures (time to GitHub accepting the request) and what GitHub's figure measures (scheduled time to run creation).

**Test scenarios:**
- A report with both cohorts gives a summary with both.
- A cohort with no data is omitted.
- A report with no live repos gives null, and the section is hidden.

**Verification:** the overview shows the disclosure below the cards, collapsed.

### U5. Workflow page analysis and day-bounded history

**Goal:** range facts, a distribution and daily cells on the workflow page, with exact-day history.
**Requirements:** R8, R9, R11, KTD3, KTD6
**Dependencies:** U1, U2
**Files:**
- `web/lib/data.ts` (`rangeFacts`, `delayBins`, and `workflowHistory` `from`/`until`)
- `web/app/dashboard/[installationId]/workflows/[workflowId]/page.tsx`
- `web/components/delay-distribution.tsx` (new)
- `test/dashboard.test.ts`

**Approach:**
- `?range=` is validated against the plan; the default is 7 d.
- `rangeFacts` returns:
  - on time n/N;
  - p50/p95 of `fired_at − due_at` over accepted sends, with the sample count;
  - GitHub outcomes: passed, failed, other, not reported.
- `delayBins` returns 60 counts over 0–30 000 ms, with 30 000 ms itself in bin 60, plus the count above 30 s and the maximum.
- `?day=` is converted to `[from, until)` in the viewer's zone and intersected with retention. `workflowHistory` applies those bounds to the page, the filter counts and the edges.
- History links keep `range` and `day`. Changing the range clears `day`.

**Test scenarios:**
- `delayBins`: delays of 0, 499, 500, 29 999 and 30 000 ms fall in bins 1, 1, 2, 60 and 60. A delay of 30 001 ms counts as late, and the maximum is reported.
- `rangeFacts` over 7 d with 3 accepted runs at 1 s, 2 s and 50 s gives p50 2 s, n = 3 and on time 2 of 3.
- History with `day`:
  - only that day's rows;
  - filter counts limited to the day;
  - `hasOlder` false when the day ends at the oldest row;
  - an empty day gives an empty page, not older runs.
- A `day` outside retention or malformed is ignored.
- A Pro-only range on Free falls back to 7 d.

**Verification:** `dash-solo-wf` shows the range toggle, the facts, a distribution with the jitter note, and daily cells. Opening a day shows only that day's runs.

---

## Scope Boundaries

- No latency chart on the overview, no account-wide daily chart at 4 or more workflows, and no headline sparklines.
- No new dependencies, caching or indexes.

### Deferred to Follow-Up Work

- A daily p50/p95 trend of GitHub run duration on the workflow page.
- An account-level daily chart for large accounts.
- Caching of closed days.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Day bucketing in the wrong zone before the cookie is set | Fall back to UTC and label it. The client sets the cookie and refreshes once |
| Strip and facts windows disagree | Every element names its window: "latest 96 recorded", "24 h" or "7 d" |
| Query cost at 90 days on Pro | Bounded aggregates on `(workflow_id, due_at)`; returns counts, not rows. Check the query plan before adding an index |

---

## Verification Contract

- `npm test`, `npm run typecheck` and `npx tsc -p web --noEmit --incremental false` pass.
- Run `research/round14-ui/serve.sh`, then `run.sh after`. Compare against `before/` at 1440 and 390 px for every dashboard account.
- Both reviewers check the after screenshots and the live server for keyboard and phone behaviour. Repeat until neither has a P0 or P1.

## Definition of Done

- U1–U5 shipped with their tests.
- The `solo` overview reads as alive and truthful at both widths.
- Both reviewers say ship.

---
title: "feat: Dashboard redesign (Overview, Workflow detail, First run)"
type: feat
status: completed
date: 2026-11-10
---

# feat: Dashboard redesign (Overview, Workflow detail, First run)

## Summary

Rebuild the logged-in dashboard to match the approved mockup `docs/design/2026-11-10-dashboard-mockup.html`, applying the merged rules from the two UI/UX reviews. No new charts and no new stored data. Live updates already arrive over SSE; this work makes them visible as motion that happens only when real data arrives.

---

## Problem Frame

The current dashboard is hard to read and doesn't look like the product the landing page sells. The reviews (`docs/design/2026-11-10-dashboard-review-opus.md`, `docs/design/2026-11-10-dashboard-review-gpt.md`) found:
- GitHub-scheduled workflows take over the page.
- Grey ticks read as failures.
- Status words overstate what we know.
- Times freeze between refreshes.
- Nothing responds to the mouse.

The founder approved a mockup with three screens and asked for exactly that, without extra charts.

---

## Requirements

- R1. **Overview:**
  - A one-line verdict ("All 2 schedules on time" or the problem) and a live "Next kick" countdown.
  - Four stats:
    - On time as *x of y*, with a breakdown tooltip.
    - Runs in 24 h, with an on time / late / missed line.
    - Median start delay.
    - Job results.
- R2. **Schedule rows:**
  - The whole row is a link, and the schedule is written in plain words before the raw cron.
  - The strip shows real slots only, with a dashed "before tracking" track and an outlined "next" tick.
  - Every tick has a hover tooltip, and each row shows *x of y* on time plus a next countdown.
- R3. **GitHub-scheduled workflows:**
  - They sit in one collapsed section; each opens to a plan-aware before/after of the `on:` block, with Copy and "Edit file on GitHub".
  - A cron faster than the plan floor is never handed over silently. The user picks between the plan-floor version and Pro.
- R4. **Activity and benchmark:** an activity feed of recent dispatches, and the public benchmark as a card instead of a nav item.
- R5. **Workflow detail:**
  - A health pill derived from the last 24 h, plus links to the workflow file and to its runs on GitHub.
  - A next-kick card and a 24-hour strip; clicking a tick jumps to its history row.
  - A history table that separates "Cronkick" (sent or started) from "GitHub job" (the result). Rows expand to show each step; the table filters by All / Late / Missed / Failed jobs.
- R6. **First run:**
  - Cadence presets rewrite the marker line, and the marker sits on its own line under `workflow_dispatch:` (one canonical placement everywhere).
  - Step 3 says it is watching N repositories, then switches to "Found X · first kick in mm:ss" the moment a schedule appears, without a reload.
- R7. **Shell:**
  - An account switcher with per-account health, and nav with counts.
  - A plan meter (n / limit schedules) with the Pro nudge, and "Signed in as … · Sign out".
  - `/dashboard` remembers the last account.
- R8. **Settings:**
  - Restyled in the same language: plan and usage with a Free/Pro comparison, alerts with inline saving / saved / error, and repository access.
  - The upgrade action is labelled for what it does today (it opens an email).
- R9. **Motion only on real data arrival:**
  - New ticks, counters, feed rows and toasts animate only when a slot id appears that the page hasn't seen.
  - Nothing animates on first paint after load or on routine refreshes.
  - Everything respects reduced motion.
- R10. **Times are absolute in the data and relative in the browser:**
  - Countdowns and "ago" values tick in the client.
  - Local time is shown, with UTC on hover.
- R11. **Honest status words:**
  - `fired` = Sent, `accepted` = Started, `unknown` = Unconfirmed, `expired` = Gave up, `skipped` = Skipped.
  - The job result is shown separately and only when GitHub reported it.

---

## Scope Boundaries

- No new charts beyond the approved mockup (the founder rejected the chart exploration).
- No new stored data: runner start time and job duration are not collected.
- No "Keep on GitHub · hide" control; it would need a database flag.
- No billing or checkout; Pro stays a mailto.
- `/lateness` keeps its current page; only its entry point moves into an Overview card.

### Deferred to Follow-Up Work

- Persist dismissing a GitHub-scheduled workflow ("Keep it on GitHub"): a `workflows.dismissed_at` column.
- Mobile-specific strip density (24 ticks under `sm`) beyond the responsive stacking in this plan.

---

## Context & Research

### Relevant Code and Patterns

- **Live updates:** `web/components/live-refresh.tsx` (SSE, then `router.refresh()`), `web/lib/changes.ts`, `web/app/dashboard/[installationId]/events/route.ts`, `migrations/002_notify.sql`.
- **Data layer:** `web/lib/data.ts`, specifically `overview`, `recentTicks`, `workflowHistory`, `dailyRuns`, `toTick` and `workflowStatus`. Tests live in `test/dashboard.test.ts` (time is fixed via `NOW`, slots are seeded with `slot()`).
- **Marker logic:**
  - `src/compat.ts`: `importFromSchedule` builds `suggested_diff` from `schedule:` crons, and `minIntervalMinutes` gives the gap between crons.
  - `src/markers.ts`: `validCron`.
- **Plan limits:** `src/plans.ts` `PLANS`, which already feeds the settings page and the header.
- **Visual language:** `web/app/globals.css` provides `rise`, `pop`, `time-grid`, `hero-glow`, `.tip` tooltips, `btn-glow` and reduced-motion handling. `web/components/marker-card.tsx` is the client-component pattern for the countdown and typed marker.
- **UI primitives:** `web/components/ui.tsx` (`Badge`, `SlotPill`, `ButtonLink` with the `lg` size), `web/components/slot-strip.tsx` (`tips` prop) and `web/components/dash-nav.tsx`.
- **Benchmark data:** `src/probe/collector.ts` `probeReport`, already used by `web/app/page.tsx`.

### Institutional Learnings

- There is no `docs/solutions/` folder yet.
- Session learning: an entrance animation that ends with `filter: blur(0px)` (fill `both`) broke compositing of nearby layers. Keep animations at `backwards` fill (`--animate-rise`).

---

## Key Technical Decisions

- **Server components stay the source of truth; client islands diff by slot id.** `router.refresh()` already re-renders in place. Client components (strip, counters, feed, toasts) keep a `useRef` set of the slot ids they have already shown, and animate only ids that are new after the first mount. This needs no client data fetching and no second channel next to SSE.
- **Ticks carry slot detail, not a bare enum.** `recentTicks` returns, per slot, the id, due time, state, delay, run URL and conclusion. That feeds tooltips, the click-to-row jump and stable keys. The existing `Tick` colour mapping stays as a pure function, so the tests keep their meaning.
- **"Before tracking" is drawn, not faked.** The strip stops left-padding with `idle` ticks. It renders the real slots right-aligned, a dashed track for the empty span, and one outlined "next" tick from the next pending slot.
- **The plan-aware switch is computed at display time.** A small pure helper takes the `suggested_diff` marker lines and the plan floor. It returns the "after" block, plus a clamped variant when a simple `*/N` minute cron is faster than the floor. A complex cron that is too fast gets the warning and the Pro option, with no rewrite. Sync and storage don't change.
- **Plain-words cron uses a small local formatter.** It covers the common shapes (`*/N`, hourly at :MM, daily at HH:MM, weekdays) and falls back to the raw cron. No new dependency.
- **Times reach the client as ISO strings.** A shared client `<Time>` / `<Countdown>` renders local time (UTC in `title`) and ticks every second; the countdown says "Due now" at zero and never goes negative. This replaces server-side `relTime` in dashboard views.
- **One status vocabulary lives in `ui.tsx`.** `SLOT_LABEL` and the pill tones get the honest words (R11), and the job result becomes a separate small component, so every page says the same thing.
- **Last account goes in a cookie.** `/dashboard` reads a `cronkick_last` cookie, falling back to the first account. A picker page appears only when there is more than one account and no cookie.

---

## Open Questions

### Resolved During Planning

- "Keep on GitHub · hide": dropped this round, as noted under Scope Boundaries.
- History filters: built, as query parameters (`?filter=late|missed|failed`).
- Benchmark card numbers: use `probeReport` when it has samples. Otherwise show "Collecting data" and no invented number.

### Deferred to Implementation

- The exact median start-delay query (`percentile_cont` vs. computing in JS over ≤ 500 rows): pick whichever stays inside one round trip.
- Whether the account-health query for the switcher is cheap enough per page view at current scale. If it isn't, show plan and count only.
- The toast stacking cap and auto-dismiss timing, after watching real updates.

---

## High-Level Technical Design

How a dispatch becomes visible motion. This is the shape only, not the implementation.

```mermaid
sequenceDiagram
  participant W as Worker (dispatcher)
  participant PG as Postgres (slots + NOTIFY)
  participant WS as Web server (LISTEN + SSE)
  participant B as Browser (LiveRefresh)
  participant RSC as Server components
  participant UI as Client islands (strip, counters, feed, toasts)
  W->>PG: UPDATE slot state (pending → accepted)
  PG-->>WS: NOTIFY cronkick_changes (installation id)
  WS-->>B: SSE "change"
  B->>RSC: router.refresh()
  RSC-->>UI: new props (slots with ids)
  UI->>UI: diff ids vs seenRef; animate only unseen (skip first mount)
```

Page composition (component → data):

| Screen | Server data (`web/lib/data.ts`) | Client islands |
|---|---|---|
| Overview | `overview` (+ verdict, stats, next kick), slot details per workflow, `activity`, `probeReport` | `Countdown`, `LiveStrip`, `Counter`, `ActivityFeed`, `DispatchToasts`, switch diff with Copy and cadence choice |
| Workflow detail | `workflowHistory` (+ health, detail slots, filter) | `Countdown`, `LiveStrip` (click-to-row), `HistoryTable` row expand, `Time` |
| First run | `overview` repos count and found schedules | `CadencePicker`, `Countdown` |
| Shell | `installationsFor` + account health, plan usage | `AccountSwitcher` popover |

---

## Implementation Units

### U1. Data layer for the new screens

**Goal:** Return everything the mockup shows from tested server functions, without new tables.

**Requirements:** R1, R2, R4, R5, R7, R11

**Dependencies:** None

**Files:**
- Modify: `web/lib/data.ts`
- Test: `test/dashboard.test.ts`

**Approach:**
- `recentTicks` → per-workflow slot details (id, due, state, delay ms, run url, conclusion), newest last. Stop padding with `idle`.
- Overview totals add:
  - On-time *x of y* with a late / missed / unconfirmed breakdown.
  - Median start delay over due, fired or accepted slots in 24 h.
  - Job passed and failed counts from `conclusion`.
  - A verdict code: `all_on_time`, `late`, `missed`, `needs_fix` or `nothing_scheduled`.
  - The next kick: the soonest pending slot across the installation, its workflow and repo, and how many share that time.
- `activity(db, installationId, now, limit)`: the latest due, non-pending slots across the installation, joined to the workflow and repo names.
- `workflowHistory` adds:
  - A 24 h health code.
  - A `filter` argument (late / missed / failed) applied in SQL.
  - Detail slots for the 96-slot strip.
- `accountHealth(db, installationIds, now)`: per account, active schedules and any missed or late runs in 24 h, for the switcher dots.
- All 24 h windows use `due_at <= now`. That fix already shipped; keep it covered.

**Patterns to follow:** existing `overview` single-query aggregates; parameterized SQL only; `due_at <= $2` bounds.

**Test scenarios:**
- Happy path: 3 accepted slots within 30 s and 1 fired at +45 s, giving on time 3 of 4, late 1, and verdict `late`.
- Happy path: the median start delay over slots with first attempts of 0.05 / 0.06 / 0.04 s is 0.05 s.
- Happy path: job results with conclusions success / success / failure / null count as 2 passed, 1 failed, and the null isn't counted.
- Edge case: no due slots gives verdict `nothing_scheduled`, an on-time denominator of 0, and a median of null rather than 0.
- Edge case: a future pending slot is excluded from every 24 h count but becomes the next kick.
- Edge case: two workflows due at the same next minute make the next kick report a count of 2.
- Edge case: the activity feed excludes pending and future slots and is ordered newest first.
- Filter: `filter=missed` returns only unknown and expired slots; `failed` returns only `conclusion = 'failure'`.
- Isolation: activity and the strip for installation 2 never include installation 1's slots. This mirrors the existing history isolation test.
- Account health: one missed slot in installation 2 marks only installation 2.

**Verification:** the dashboard tests pass with the new scenarios, and the existing ones still pass after updating them for the new shapes.

---

### U2. Shared client primitives for time and arrival motion

**Goal:** Reusable client pieces that keep times live and animate only real arrivals.

**Requirements:** R9, R10

**Dependencies:** U1 (data shapes)

**Files:**
- Create: `web/components/live.tsx` (`Time`, `Countdown`, `Counter`, `useArrivals` hook)
- Create: `web/components/live-strip.tsx`
- Create: `web/components/dispatch-toasts.tsx`
- Modify: `web/components/slot-strip.tsx` (static strip for non-live uses) and `web/app/globals.css` (tick arrival and outline styles)
- Test: `test/live.test.ts` (pure helpers only)

**Approach:**
- `useArrivals(ids)` returns the ids that were not present on the previous render, and nothing on first mount.
- `LiveStrip`:
  - Keyed by slot id.
  - New ticks grow in with the existing `pop`/grow easing and a one-time ring.
  - Draws the dashed pre-tracking track and the outlined next tick.
  - Tooltips use the existing `.tip` (time, delay, run, result).
  - Optional `onSelect(slotId)` for detail-page click-to-row.
- `Countdown`: counts to the ISO target; "Due now" at zero, never negative; `tabular-nums`.
- `Time`: local "HH:MM" or "today / Nov 8 HH:MM", with UTC in `title`. Both use `suppressHydrationWarning` on the text node.
- `Counter`: re-keys the number on change for a short rise, and only after mount.
- `DispatchToasts`: fed the activity list. It toasts unseen ids after mount, caps the stack, auto-dismisses successes, keeps failures until closed, and announces them in an `aria-live` region.
- Format helpers (relative wording, delay formatting `+0.05 s`, plain-words cron) live as pure functions so they can be tested.

**Execution note:** write the pure helpers (plain-words cron, delay formatting, the arrival diff) test-first.

**Patterns to follow:** `web/components/marker-card.tsx` (client countdown, reduced-motion check); `.tip` CSS; `--animate-pop`.

**Test scenarios:**
- Plain-words cron:
  - `*/15 * * * *` → "Every 15 minutes".
  - `0 * * * *` → "Every hour".
  - `0 3 * * *` → "Every day at 03:00".
  - `0 9 * * 1-5` → "Weekdays at 09:00".
  - `7 4 1 * *` falls back to the raw cron.
- Delay formatting: 52 ms → "+0.05 s"; 42 990 ms → "+43.0 s"; null → "—".
- Arrival diff:
  - The first call with [1, 2] gives none.
  - The next call with [1, 2, 3] gives [3].
  - Going back to [2, 3] gives none.
- Countdown math: a target in the past gives the "due" state; 125 s gives "02:05".

**Verification:** the helper tests pass. In the browser, a slot changing state on the dev database grows one new tick and fires one toast, and reloading the page animates nothing.

---

### U3. Shell: account switcher, nav, plan meter, remembered account

**Goal:** A sidebar that carries scope, health and usage, as in the mockup.

**Requirements:** R7, R4 (lateness out of the nav)

**Dependencies:** U1

**Files:**
- Modify: `web/app/dashboard/[installationId]/layout.tsx`, `web/components/dash-nav.tsx`, `web/app/dashboard/page.tsx`
- Create: `web/components/account-switcher.tsx`
- Test: `test/dashboard.test.ts` (account health, from U1)

**Approach:**
- The switcher button shows avatar, login and plan chip. Its popover lists each account with a health dot and "+ Add a GitHub account or org ↗". It closes on outside click and Escape, and works with arrow keys.
- Nav: Overview (with active-schedule count) and Settings. The "GitHub lateness" and "Choose repositories" nav items go; repository access moves to Settings and the first-run step.
- Plan meter: n / limit schedules with a bar; a "Get Pro" line on Free.
- Footer: "Signed in as …" and "Sign out".
- The layout sets the `cronkick_last` cookie for the current account. `/dashboard` redirects to it when it's still in the session; with several accounts and no cookie it shows a small picker.
- `LiveRefresh` keeps its place.

**Patterns to follow:** existing `DashNav` avatar handling; `requireInstallation` for access; the mobile `details` menu pattern.

**Test scenarios:**
- Integration (`test/dashboard.test.ts`): account health returns a missed flag only for the account that has a missed slot.
- Test expectation for the UI shell itself: none. It's presentational and is verified in the browser.

**Verification:** switching accounts lands on the right overview; the meter shows 2 / 10 for the dev account; `/dashboard` returns to the last account.

---

### U4. Overview page

**Goal:** Build the approved Overview screen on the U1 data and U2 primitives.

**Requirements:** R1, R2, R3, R4, R9

**Dependencies:** U1, U2, U3

**Files:**
- Modify: `web/app/dashboard/[installationId]/page.tsx`
- Create: `web/lib/switch.ts` (plan-aware before/after helper)
- Create: `web/components/switch-card.tsx` (collapsed GitHub-scheduled section, cadence choice, Copy, Edit on GitHub)
- Test: `test/switch.test.ts`

**Approach:**
- **Status band:** `time-grid` + `hero-glow`; the verdict sentence with a dot colour by verdict; the next-kick card with `Countdown` and a progress bar.
- **Stats:**
  - On time as *x of y*; hovering shows the late / missed / unconfirmed breakdown and the definition of the measurement.
  - Runs in 24 h, the start delay median and job results.
  - Each value uses `Counter`.
- **Your schedules:**
  - One row per active, paused or needs-fix workflow; the whole row is a `Link` with a hover state and a chevron.
  - Plain-words cron, then the raw cron; `LiveStrip`; *x of y* plus a `Countdown`.
  - Needs-fix rows show the flag message; paused rows are dimmed with the limit reason.
- **GitHub-scheduled section:** a `details` element, collapsed, with a count and a one-line why. Each candidate expands to the before/after `on:` block from `switch.ts`. A floor conflict shows the "Every 15 min · Free / Every 5 min · Pro" choice, and Copy copies the chosen after-block. "Edit file on GitHub ↗" links to the workflow file on its default branch.
- **Activity feed** with `DispatchToasts`.
- **Benchmark card** from `probeReport`, or "Collecting data".
- `none` workflows drop out of the page.

**Patterns to follow:** current `WorkflowRowView` grouping and ordering (`ORDER`); `CopyBlock`; the landing page's `reveal`/`rise` (initial load only).

**Test scenarios (`test/switch.test.ts`):**
- Happy path: the marker `# cronkick: "0 * * * *"` on Free gives an after-block with `workflow_dispatch:` and the marker on its own line, and no conflict.
- Floor conflict: `*/5 * * * *` on Free gives a conflict, a clamped variant `*/15 * * * *` and an unclamped Pro variant.
- Complex cron faster than the floor (`0,5,10 * * * *`): a conflict, no clamped variant, and the Pro option only.
- Timezone preserved: `tz=Europe/Berlin` stays on the after-line in both variants.
- Several crons: all of them carry over, each on its own marker line.

**Verification:** the dev account shows 2 schedules on time with live strips. The probe-a every-5 workflow shows the conflict choice. A dispatch on dev animates exactly one new tick per affected row, one feed row and one toast.

---

### U5. Workflow detail page

**Goal:** Build the approved detail screen with honest statuses and an inspectable history.

**Requirements:** R5, R10, R11

**Dependencies:** U1, U2

**Files:**
- Modify: `web/app/dashboard/[installationId]/workflows/[workflowId]/page.tsx`, `web/components/ui.tsx` (status vocabulary + `JobResult`)
- Create: `web/components/history-table.tsx`
- Test: `test/dashboard.test.ts` (filters and health, from U1)

**Approach:**
- **Header:** name and health pill; plain-words schedule, raw cron and path; "Workflow file ↗" and "Runs on GitHub ↗".
- **Next-kick card** with `Countdown` and a 96-slot `LiveStrip` (`h-12`). Clicking a tick scrolls to its row and flashes it.
- **History:**
  - Filter chips are links with `?filter=`.
  - Columns: Scheduled (`Time`), Started after, Cronkick (Sent / Started / Unconfirmed / Gave up / Skipped), GitHub job (result, or "Not reported yet"), Run ↗.
  - Each row expands to show each step: due → sent (+delay) → GitHub response → run linked (by id or "by time" with its caveat) → job result.
- **Paused, needs-fix and removed-file states** each get their own card in place of the next-kick card.
- The right rail and `RunsChart` daily chart are removed, since the mockup doesn't have them.
- History copy names the plan window (Free: 7 days).

**Patterns to follow:** existing `SlotPill` / `SLOT_TONE` (renamed labels), `workflowHistory` window logic.

**Test scenarios:**
- Covered in U1: filter results and 24 h health.
- Test expectation for presentation: none beyond U1. Status wording is checked once with a small test that `SLOT_LABEL` maps each state to its honest word, in `test/dashboard.test.ts`.

**Verification:** clicking a tick focuses its row; filters change the rows and keep the URL shareable; an `accepted` slot reads "Started" and a `fired` one reads "Sent".

---

### U6. First-run screen

**Goal:** Setup that reacts live and never hands over a broken line.

**Requirements:** R6, R9

**Dependencies:** U2, U4

**Files:**
- Modify: `web/app/dashboard/[installationId]/page.tsx` (first-run branch)
- Create: `web/components/first-run.tsx`

**Approach:**
- Three steps:
  1. "Cronkick can see N repositories", with "Add more on GitHub ↗".
  2. The marker card (landing `MarkerCard` look) with cadence presets: every 15 min, hourly, daily 03:00, and "Every 5 min · Pro" disabled on Free. Changing the preset rewrites the marker line and its plain-words caption. Copy is always visible, including on touch.
  3. "Watching N repositories for a push…"
- When live updates bring the first schedule, step 3 switches to "Found <workflow> in <repo> · first kick in mm:ss" with a link to the schedule.
- If GitHub-scheduled workflows exist, a link offers to move one instead.

**Patterns to follow:** `web/components/marker-card.tsx`; the canonical marker placement from R6.

**Test scenarios:**
- Test expectation: none. It's presentational and reuses the U2 helpers (cron wording, countdown), which are tested there.

**Verification:** on an account with no schedules, pushing a marker to a probe repo flips step 3 within seconds without a reload.

---

### U7. Settings restyle

**Goal:** Settings in the same visual language, with inline feedback.

**Requirements:** R8

**Dependencies:** U3

**Files:**
- Modify: `web/app/dashboard/[installationId]/settings/page.tsx`
- Create: `web/components/alert-email-form.tsx` (client, `useActionState`)

**Approach:**
- **Plan and usage card:** the meter, Free vs Pro rows (schedules, fastest, history, alerts), and "Request Pro by email · $9/month".
- **Alerts card:** the email field with inline saving / saved / error. It states which emails Free gets (plan-limit only) and which Pro gets.
- **Repository access card** with "Manage on GitHub ↗", and an uninstall note.
- Existing server-side email validation and the `setAlertEmail` write stay.

**Patterns to follow:** existing settings action and validation; `btn-glow` on the single primary action.

**Test scenarios:**
- Error path: an invalid email returns an inline error and keeps the typed value. This is covered by the existing validation path; add a case if it isn't already tested.
- Happy path: a valid email saves and shows "Saved" without a URL parameter.

**Verification:** saving shows inline confirmation; a live refresh during editing doesn't wipe the input.

---

## System-Wide Impact

- **Interaction graph:**
  - Only dashboard routes and `web/lib/data.ts` change.
  - The worker, sync and SSE pipeline are untouched.
  - `recentTicks` changes shape, so every caller (overview, detail) updates in the same change.
- **State lifecycle risks:**
  - A refresh must not reset client state: the open `details`, the selected cadence, the email being typed, scroll position.
  - Keyed components and `router.refresh()` preserve these. Verify each one in the browser.
- **API surface parity:** `/lateness` stays public and unchanged; only the dashboard entry point moves.
- **Unchanged invariants:**
  - Access checks (`requireInstallation`) on every page and on the SSE route.
  - Plan limits from `src/plans.ts`.
  - The 24 h counts exclude future slots.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Arrival animations fire on every `router.refresh()` | `useArrivals` compares slot ids against a ref and skips the first mount; it has its own test. |
| Hydration mismatches from local-time rendering | ISO values from the server; the client formats them, with `suppressHydrationWarning` on the time text only. |
| Heavier overview queries on every live refresh | Keep aggregates in single queries bounded by `due_at`; check with `EXPLAIN` on the dev database if a refresh feels slow. |
| Plan-aware clamping gives a wrong cron | Clamp only the simple `*/N` minute form; anything else gets warn + Pro, with no rewrite; covered in `test/switch.test.ts`. |
| Compositing glitches from lingering filters | Keep `backwards` fill on entrance animations (session learning). |

---

## Sources & Research

- Approved mockup: `docs/design/2026-11-10-dashboard-mockup.html`
- Reviews: `docs/design/2026-11-10-dashboard-review-opus.md`, `docs/design/2026-11-10-dashboard-review-gpt.md`
- No external research: strong local patterns. The live pipeline was built and verified in production today (commit `94e771b`).

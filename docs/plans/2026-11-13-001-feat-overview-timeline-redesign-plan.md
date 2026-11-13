---
title: "feat: Overview redesign — state-gated hero, 24 h timeline, up-next"
type: feat
status: active
date: 2026-11-13
---

# feat: Overview redesign — state-gated hero, 24 h timeline, up-next

## Summary

Replace the plain overview header with a layout chosen by account state: a countdown hero when it is honest, a fixed 24 h swimlane timeline for small accounts, an up-next queue, and a stat row that leads with what went wrong. Problem states lose the hero so failures always sit on top. Built from mockup direction C with B's hero, after a second-opinion review against every real state.

---

## Problem Frame

The overview reads as small grey text on black; nothing is visual until runs exist, and even then only thin strips. The redesign must stay honest: no charts without backing data, no reassuring pooled percentages that hide a missed weekly job, and no layout that breaks at 15 schedules or on a phone.

---

## Requirements

- R1. No repos / no schedules keeps the existing setup guide unchanged.
- R2. Waiting for first run: verdict headline, countdown hero, the existing run log in the card.
- R3. Healthy with ≤6 active schedules: headline, stat row, compact countdown hero, 24 h timeline, up-next queue, then the existing schedule cards.
- R4. Problem state (needs attention items, a workflow that needs a fix, or plan-limited): no hero; attention list and problem rows directly under the headline.
- R5. 7+ active schedules: no timeline; existing compact rows plus the up-next queue.
- R6. Phone width: timeline is replaced by the up-next queue.
- R7. Quiet (nothing due in 24 h, e.g. weekly job): "Nothing due today · next <time>" headline line plus the countdown; no empty charts or zero stats.
- R8. Stat row leads with "Not on time" count; on-time % never shows "0%" when nothing was due.
- R9. Timeline shows coverage gaps as hatched bands across all lanes.
- R10. Cut from the mockups: heatmap, sparkline, gauge, 60-day tile, Kick now / Pause, terminal styling, drag-to-pan, animated mesh.

---

## Scope Boundaries

- No new actions (manual dispatch, pause). No schema changes.
- Workflow detail page, settings and first-run guide are untouched.
- Zoom levels on the timeline are out (fixed window).

### Deferred to Follow-Up Work

- Timeline zoom (6 h / 7 d) if users ask.
- Per-schedule on-time % (instead of pooled) in the stat row.

---

## Key Technical Decisions

- **Time-bounded slot query instead of `recentSlots`**: `recentSlots` takes a count, so 48 slots spans 4 h of a 5-min job and months of a weekly job. The timeline needs every slot in a fixed window. A new query bounded by `[from, now]`, clamped to plan retention, with a per-workflow row cap as a safety net.
- **Fixed window: 18 h past + 6 h ahead**: fits a day of history and the next few runs; future pills come from the existing next-due logic with a time bound rather than a fixed count of 5.
- **Layout decision is a pure function**: which sections render (hero, timeline, attention-first, quiet) is computed from counts and statuses in one exported helper, so every state in R1–R7 is unit-testable without rendering.
- **Hero = the uncommitted countdown dial, minus its runway**: the runway duplicates the timeline; the dial plus big digits stays, on a static amber glow (no animated mesh).
- **Pills are not individual tab stops**: a 5-min job is ~288 pills. Each lane links to its workflow page and carries a text summary; pills get hover tooltips only. Keyboard and screen-reader users get the same facts from the lane summary and the schedule cards below.
- **Timeline hides by container width, not viewport**: container query, so the sidebar layout and phone both fall back to up-next.

---

## High-Level Technical Design

State → sections (authoritative mapping for U2):

| State | Hero | Stats | Timeline | Up next | Attention first |
|---|---|---|---|---|---|
| First run (setup guide) | — | — | — | — | — |
| Waiting for first run | yes | — | — | — | — |
| Healthy, ≤6 active | yes | yes | yes (wide only) | yes | — |
| Healthy, 7+ active | yes | yes | — | yes | — |
| Problem | — | yes | ≤6: yes | yes | yes |
| Quiet (nothing due 24 h) | yes | — | ≤6: yes | yes | — |

---

## Implementation Units

### U1. Time-bounded slot query

**Goal:** Return every due slot per workflow in a time window.
**Requirements:** R3, R9
**Dependencies:** none
**Files:** `web/lib/data.ts`, `test/dashboard.test.ts`
**Approach:** Same row shape and `slotView` mapping as `recentSlots`; window start clamped by `retainedFrom`; per-workflow cap (~400) so a 1-min job can't blow up the page. Extend `nextRuns` with an optional `until` bound.
**Patterns to follow:** `recentSlots` lateral join and index use.
**Test scenarios:**
- Slots inside the window return in due order; slots before `from` and after `now` are excluded.
- Free plan: window start clamps to 7-day retention (window shorter than retention → unchanged).
- Two workflows in different repos of the same installation both return; another installation's slots never do.
- `nextRuns` with `until` stops at the bound and still respects `n`.
**Verification:** Tests pass; overview renders with the new query.

### U2. Overview layout helper and stats

**Goal:** One pure function deciding sections; stats that can't show a misleading 0%.
**Requirements:** R2–R8
**Dependencies:** none
**Files:** `web/lib/format.ts`, `test/live.test.ts`
**Approach:** Input: active count, has problems, has needs_fix/limited, due count in 24 h, any runs ever. Output: `{ hero, stats, timeline, upNext, attentionFirst }`. Timeline cap of 6 lives here.
**Test scenarios:**
- Waiting for first run → hero only.
- Healthy 3 schedules → hero, stats, timeline, up-next.
- Healthy 7 schedules → no timeline.
- Any attention item → no hero, attention first.
- needs_fix workflow with no other problems → no hero.
- Quiet (due = 0, runs before) → hero, no stats.
- Stat percentage: due = 0 → no percentage; 99.6% floors to 99%, not 100%.
**Verification:** Every row of the state table is covered by a test.

### U3. Countdown hero

**Goal:** Compact hero: dial, big countdown, workflow, local time, static glow.
**Requirements:** R2, R3, R7
**Dependencies:** none
**Files:** `web/components/next-kick.tsx`
**Approach:** Remove the runway section from the uncommitted component; keep dial and labels. Returns nothing when no future run.
**Test expectation:** none -- presentational; covered by layout tests in U2.

### U4. 24 h timeline

**Goal:** Swimlanes per schedule across 18 h past / 6 h ahead with now line and gap bands.
**Requirements:** R3, R6, R9
**Dependencies:** U1
**Files:** `web/components/day-timeline.tsx`, `web/app/globals.css`
**Approach:** Client component; positions from the window; past pills coloured by tick (reuse strip colour tokens), future pills outlined; gap bands hatched across all lanes; hour labels; hidden under a container width threshold. Lane label links to the workflow page and carries an aria summary.
**Patterns to follow:** `live-strip.tsx` tick colours and summary text; `.tip` tooltips.
**Test expectation:** none -- presentational; data correctness covered by U1.

### U5. Up-next queue

**Goal:** Next 4 runs across schedules with live countdowns and an interval progress bar.
**Requirements:** R3, R5, R6
**Dependencies:** none
**Files:** `web/components/up-next.tsx`
**Approach:** Client component fed by `upcoming` per workflow; drops past runs as time passes.
**Test expectation:** none -- presentational.

### U6. Wire the overview

**Goal:** Render sections per U2 in page order.
**Requirements:** R1–R8, R10
**Dependencies:** U1–U5
**Files:** `web/app/dashboard/[installationId]/page.tsx`
**Approach:** Replace the uncommitted stat row with the U2-driven layout; problem rows ahead of cards when attention-first; quiet line in the header.
**Test expectation:** none -- composition; logic lives in U2.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Very fast schedules (1–5 min) render hundreds of pills | Per-workflow cap in U1; pills are plain spans, no per-pill handlers |
| Timeline query adds load to every overview load | Only runs when the layout shows the timeline (≤6 active) |
| Pooled stats hide a missed weekly run | Lead with "Not on time" count; per-schedule % deferred |

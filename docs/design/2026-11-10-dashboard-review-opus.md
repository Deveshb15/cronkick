# Cronkick dashboard: UI/UX review

2026-11-10. Reviewed the three live screenshots (overview with active workflows, scrolled overview, empty state) and the code in `web/app/dashboard/**`, `web/components/*`, `web/lib/data.ts`, against the redesigned landing page (`web/app/page.tsx`, `web/components/marker-card.tsx`, `web/app/globals.css`).

**Bottom line:** the landing page promises "on time, every time, and you can see it". The dashboard currently shows **27.2% on time** for a schedule that has never been late, buries the two working workflows under four "Ready to switch" essays, and has none of the landing page's motion, tooltips, or countdown. Fix the headline number first: as long as it's wrong, nothing else on the page will be trusted.

---

## 0. A data bug that looks like a design problem (fix before anything else)

**"On time (≤ 30 s) 27.2%" and "Runs, last 24 h 22" are wrong.** The strip shows 3 green ticks per workflow and nothing red or orange, so the real figure is 6 of 6 = 100%.

Cause: in `overview()` (`web/lib/data.ts:830-838`) the `due` count filters only `due_at > now - 24h`. It has no `due_at <= now` bound, so it also counts the **future `pending` slots** the scheduler creates two hours ahead (`HORIZON_MS = 2h`, `src/maintenance.ts:4`). For two `*/15` workflows that is 2 × 8 = 16 future slots, plus 6 that have run: 22. 6 / 22 = 27.27%, and `pct()` floors it to 27.2%. The per-row "27.2% on time" is the same bug: 3 / 11.

Fix: add `AND due_at <= $2` to the `due`, `on_time` and `problems` filters. Also leave out `pending` and `dispatching` slots whose deadline hasn't passed, so a slot that is firing right now doesn't count as "not on time" for a few seconds. Write one test for "future pending slots don't count toward due".

When there are under ~10 runs, show the ratio and not a percentage ("6 of 6 on time"). A percentage over 3 samples looks fake even when it's correct.

---

## 1. Comprehension test (first-time user, quoting the UI)

| # | UI text / element | What a first-time user thinks | Problem |
|---|---|---|---|
| 1 | **"On time (≤ 30 s) 27.2%"** | "Cronkick fails 3 out of 4 times. It's worse than GitHub." | Wrong (see §0). It's also the most prominent number on the page, and it contradicts the green-only strip right below it. |
| 2 | **"Runs, last 24 h 22"** | "22 runs happened." | Only 6 have happened; the other 16 are scheduled for the next 2 h. "Runs" is also ambiguous: are these GitHub Actions runs or Cronkick triggers? |
| 3 | **"first trigger after due time"** (under On time) | Unclear. "First trigger" suggests there are several triggers. | Internal language. Users want "started within 30 s of the scheduled time". |
| 4 | **"Next run in 10m" / "nothing missed in 24 h"** | The subtitle doesn't belong with "Next run". Next run of *what*? | Two unrelated facts share a card. The number also stays frozen between server refreshes ("in 10m" for a full minute), and it doesn't say which workflow is next. |
| 5 | **Strip of ~45 grey ticks + 3 green** | "45 runs didn't happen." | Grey means `idle`: left padding for slots from before the schedule existed, plus pending and skipped slots (`recentTicks` pads with `'idle'`). The legend lists only on time, late and missed, so grey is never explained. The `SlotStrip` aria-label even says "45 not run". On the landing page grey means "not yet filled", so the same colour means two different things. |
| 6 | **"Last 48 slots"** | "What's a slot?" | Jargon. Users think in "scheduled times" or "runs". |
| 7 | Ticks have **no hover tooltip** on the dashboard | "Which tick is which time? Can I click it?" | `SlotStrip` supports `tips` but the dashboard doesn't pass them. The landing page shows `03:00 UTC · +1.2s` on hover, so users try it here and get nothing. |
| 8 | **"Ready to switch"** (blue badge) | "Switch what? Switch to what? Is something ready for me?" Or: "Is it waiting for me to approve something?" | It means "this workflow uses GitHub's `schedule:`, which Cronkick doesn't run; you could move it". Blue suggests a positive, finished state when it's really an optional suggestion. |
| 9 | **"Uses GitHub's `schedule:`. To switch, remove that block, add `workflow_dispatch:` under `on:`, and paste these lines below it. Faster than every 15 minutes won't run on your plan."**, repeated 4 times | A wall of instructions describing three edits, next to a copy block that holds one of them. | Repeated on every row, so the active workflows are pushed off-screen (screenshot 2 is almost all of this). The 15-minute warning shows on the **hourly** workflow, where it doesn't apply. |
| 10 | Copy block for `every-5.yml` contains **`# cronkick: "*/5 * * * *"`** | "Paste this and it works." | It won't on Free. The minimum is every 15 minutes, so the line we suggest would be flagged or paused right away. We hand the user a line that fails. |
| 11 | **Three different marker placements**: empty state `workflow_dispatch: # cronkick: "0 3 * * *"` (same line), switch text "paste these lines **below** it", landing page marker on its own line under `workflow_dispatch:` | "Which one is right? Does placement matter?" | Users copy whatever they see last. Pick one canonical form and use it everywhere. |
| 12 | **"probe hourly"** appears twice, under two repos, with an identical block | "Is this duplicated? Is it a bug?" | Without repo context on the card, two identical cards look like a rendering bug. |
| 13 | **"cronkick" Active** with **"\*/15 \* \* \* \*"** under it | Readable to devs, not to everyone. | Raw cron with no human-readable version ("every 15 minutes"). |
| 14 | **"Deveshb15 · Free · up to 10 schedules, every 15 min or slower"** as the page subtitle | Plan limits as the first sentence on a monitoring page. | It reads like a disclaimer. It should be a usage meter (2 / 10) in the sidebar or the Settings page. |
| 15 | **"Choose repositories"** appears 3 times (header button, sidebar, getting-started link) | "Is this the main action?" | It sends you off to GitHub. It's a rare action that takes up the most prominent button slot. |
| 16 | Sidebar **"GitHub lateness"** | "Is this about my workflows?" | It's the public marketing page. Clicking it leaves the dashboard shell (different header), so it feels like being logged out. |
| 17 | **"Live · updated 0s ago"** with an always-pinging dot | Fine, but the constant ping plus the counter add noise. | The counter resets every 5 s, so the eye keeps getting pulled to the top-right corner. |
| 18 | Empty state: **"up to 3 schedules"** in the subtitle vs **"10 schedules"** in the plan | "What's my limit?" | The screenshot is stale, but it shows the plan copy is hand-assembled in several places. Use one source. |
| 19 | Empty state stats row: **0 / 0 / — / —** with "first trigger after due time" and **"nothing missed in 24 h"** | "Nothing missed" sounds like praise for doing nothing. | Four dead cards above the only thing that matters (the setup steps). |
| 20 | Detail page table: **"Triggered +1.2s"**, **"GitHub said 204"**, pills **"Ran"** vs **"Triggered"** | "204?" "What's the difference between Ran and Triggered?" | `fired` = we sent the dispatch; `accepted` = GitHub created the run. "Ran" overstates it: the job may not have finished or passed. HTTP codes are for power users and belong in a tooltip. |
| 21 | Detail page: **"by time"** next to "View run" | Cryptic. | It's a matching-confidence caveat. It should be an icon with a tooltip. |
| 22 | Detail page **"Due (UTC)"** timestamps | Users have to convert to local time in their heads. | Show local time by default and UTC on hover. Cron is UTC, so keep UTC visible in the schedule description. |

---

## 2. Top 10 problems, ranked by user impact

1. **The headline on-time number is false.**
   *Where:* Overview stat "On time (≤ 30 s)", per-row "27.2% on time", "Runs, last 24 h".
   *Why it hurts:* reliability is the whole product. A new user's first impression is that Cronkick works a quarter of the time.
   *Fix:* §0. Then show "6 of 6 on time" while n < 10, and a % with a "last 24 h" caption after that.

2. **"Ready to switch" workflows take over the page.**
   *Where:* Overview, repo sections (screenshots 1–2: ~80% of the scroll height).
   *Why it hurts:* the user's real schedules are hard to find, and setup text pushes the monitoring view down.
   *Fix:* move them out of the main list into a separate **"On GitHub's schedule"** group, collapsed by default to one line per workflow (`hourly.yml · 0 * * * * · Move to Cronkick →`). Show the instructions only after a click (inline expand or a side sheet). Add **"Keep on GitHub"** to dismiss one. This needs a `dismissed` flag on `workflows`; the probe repos are the obvious first users.

3. **Grey ticks look like failures.**
   *Where:* `SlotStrip` on the overview and detail pages.
   *Why it hurts:* a brand-new workflow shows a wall of grey that reads as "not run", so the most reassuring view looks alarming.
   *Fix:* render only real past slots, right-aligned. Fill the empty space before the first slot with a faint dashed baseline (`border-b border-dashed border-white/10`) labelled "started tracking 45 min ago". Add a hollow **"next" tick** on the right with a countdown. Give skipped slots their own hatched style. Put every visible style in the legend.

4. **Ticks have no tooltips and can't be clicked.**
   *Where:* both strips.
   *Why it hurts:* the landing page taught users to hover, and the dashboard doesn't respond. The strip is the product's signature visual, and here it's decoration.
   *Fix:* pass `tips` (`14:15 UTC · started +1.4s · run #482 ✓`). On the detail page, clicking a tick scrolls to and highlights its table row. `recentTicks` needs to return `{state, due, delayMs, runUrl}` instead of a bare `Tick`.

5. **The copy-paste suggestion fails on the user's plan.**
   *Where:* Ready-to-switch copy blocks for crons faster than the plan floor.
   *Why it hurts:* we tell users to paste a line that won't work, so their first contact with Cronkick fails.
   *Fix:* clamp the suggested cron to the plan floor (`*/5` → `*/15` on Free) and show a one-line note: "GitHub had this every 5 min. Free runs every 15 min at most. Pro runs every 5." Show the floor warning only when the original cron is faster than the floor.

6. **The switch instructions describe three edits but show one line.**
   *Where:* Ready-to-switch paragraph + `CopyBlock`.
   *Why it hurts:* users have to rebuild the YAML in their heads. This is where most people will make a mistake.
   *Fix:* show a real **before/after diff** of the `on:` block. The `schedule:` cron is known, so the diff can be built client-side: red `- schedule:` / `-   - cron: "*/5 * * * *"`, green `+ workflow_dispatch:` / `+   # cronkick: "*/15 * * * *"`. Copy the "after" block. Add an **"Edit on GitHub ↗"** button that deep-links to `github.com/{repo}/edit/{branch}/{path}`. Use one canonical marker placement everywhere (the landing page's own-line form).

7. **Nothing on the page feels live.**
   *Where:* the whole dashboard. `LiveRefresh` re-renders the server tree every 5 s with no transitions.
   *Why it hurts:* the founder wants it to feel as alive as the hero card. Right now the "Live" dot is the only motion, and time strings go stale between refreshes.
   *Fix:* §5. Client-side countdowns, new ticks animating in, counters rolling, and a dispatch toast that reuses the landing page's floating card.

8. **The overview has no single answer to "is everything OK?".**
   *Where:* the stats row. Four equal-weight cards, one of them wrong, one with an unrelated subtitle.
   *Why it hurts:* users scan for a verdict and get four numbers to interpret.
   *Fix:* a **status line** above the stats: `● All 2 schedules on time · next kick nightly.yml in 09:42`. It turns red when something needs attention: `● 1 missed run in the last 24 h · cronkick-probe-a / cronkick`, linking to it. The stats then support the verdict.

9. **The empty state isn't connected to the live state.**
   *Where:* `GettingStarted`.
   *Why it hurts:* after pushing, the user doesn't know whether Cronkick saw it. Step 3 "Push to your default branch" is never ticked off, and the card just disappears once something is active. The empty stats row sits on top as dead weight.
   *Fix:* §4 (first run). A live checklist where step 3 waits with a spinner ("Watching 2 repositories for a push…"), ticks off when a marker is detected, then turns into the new workflow's row with a countdown to its first kick. Hide the stats row until there is one active schedule.

10. **Navigation and chrome are unfocused.**
    *Where:* sidebar (Accounts list, "GitHub lateness" leaving the shell, "Choose repositories" repeated), page header.
    *Why it hurts:* it looks like a template. There are no plan usage, no counts and no attention badges, which is the information a sidebar should carry.
    *Fix:* §3. Account switcher dropdown, nav with counts (`Schedules 2`, `Needs attention 1`, `On GitHub's schedule 4`), a plan meter at the bottom, and "GitHub lateness" moved out of primary nav (a "How late is GitHub?" card on the overview instead).

Smaller items worth fixing in the same pass: the detail-page status pill shows the *last slot's* state ("Ran"), not the workflow's health. "by time" should be an icon. The runs table has no filter (All / Late / Missed). Timestamps are UTC only. `<img>` avatars from github.com have no fallback.

---

## 3. Information architecture

### Routes

```
/dashboard                          → last-used account (cookie), else picker if >1, else install prompt
/dashboard/:inst                    → Overview (health + schedules)
/dashboard/:inst?view=attention     → same page, filtered (query param, not a new route)
/dashboard/:inst/switch             → "On GitHub's schedule": migration inbox
/dashboard/:inst/workflows/:wf      → Workflow detail
/dashboard/:inst/settings           → Plan & usage · Alerts · Repositories · Danger zone
```

### Sidebar

```
┌──────────────────────────┐
│ [▣] cronkick             │
│ ┌──────────────────────┐ │
│ │ (av) Deveshb15  FREE ▾│ │  ← account switcher (popover lists installs + "Add account ↗")
│ └──────────────────────┘ │
│                          │
│ ▦ Overview               │
│ ◷ Schedules          2   │  ← count of active
│ ⚠ Needs attention    1   │  ← red badge; hidden when 0
│ ⇄ Switch from GitHub 4   │  ← amber dot; hidden when 0 or all dismissed
│ ⚙ Settings               │
│                          │
│ ──────────────────────── │
│ Schedules  ▓▓░░░░░░░░ 2/10│  ← plan meter, amber fill
│ Free · every 15 min min  │
│ Upgrade to Pro →         │
│ ──────────────────────── │
│ (av) Deveshb15  Sign out │
└──────────────────────────┘
```

"Schedules" and "Overview" can be one page at first (Overview = status + the schedule list). Keep "Schedules" in the nav only once the list needs its own page. **Minimum viable nav: Overview, Switch from GitHub (n), Settings.**

### What lives where

| Page | Owns | Doesn't own |
|---|---|---|
| **Overview** | Verdict line, 4 KPIs, live activity feed (last ~8 dispatches across all workflows), **active / paused / needs-fix** schedules with strips, a one-line banner "4 workflows still use GitHub's `schedule:` → Review" | Setup instructions, per-run tables, plan text |
| **Switch from GitHub** | Every `ready` workflow as a collapsed card: before/after diff, Edit on GitHub, Keep on GitHub (dismiss), "Dismissed (n)" disclosure at the bottom | Monitoring |
| **Workflow detail** | Schedule in plain words, countdown, 96-slot strip + upcoming, delay chart, daily chart, runs table, state glossary | Plan upsell (except an inline note when paused by the limit) |
| **Settings** | Plan & usage meter, upgrade, alert email (with a test-send button), repositories (count + Manage on GitHub), uninstall | — |

### Separating "ready to switch" from active

- **Active, paused (limit) and needs-fix workflows are *your schedules*.** They appear on the overview, grouped by repo, sorted needs-fix → paused → active (keep the current `ORDER`).
- **Ready workflows are *suggestions*.** They never appear as rows among active ones. The overview gets one dismissible banner, the sidebar a count, and the inbox page holds the rest.
- **`none` workflows** ("2 other workflows without a schedule") are noise on the overview. Drop that line, or show it only inside the repo's disclosure.

### First run → live

```
State A  no installs            → /dashboard install prompt (exists)
State B  installed, 0 markers   → Overview shows the First-run hero (checklist) INSTEAD of stats + list.
                                   If ready workflows exist, step 2 offers "Or move one of your 4 existing schedules →".
State C  marker detected,        → Checklist step 3 ticks, the hero collapses into a "Your first kick is in 04:12"
         0 slots run yet           card with the workflow row under it. Stats row appears with "—" + "after first run".
State D  ≥1 slot run             → Normal overview. A one-time toast: "First kick sent: nightly.yml started +1.4s".
```

---

## 4. Per-page redesign spec

Shared visual language, borrowed from the landing page so both feel like one product:

- **Page background:** `hero-glow` at the top of `<main>`, at 50% strength (add `hero-glow-soft` with 7% mix). Add `time-grid` behind the overview's status band only, not the whole page.
- **Cards:** `rounded-2xl bg-zinc-950/70 inset-ring inset-ring-white/10`, with the landing card's top hairline (`absolute inset-x-12 top-0 h-px bg-linear-to-r from-transparent via-brand-300/40 to-transparent`). Reserve the amber hairline for the one card that matters on each page.
- **Numbers:** `font-mono tabular-nums` for times, countdowns and deltas. Inter for counts.
- **Entrances:** `animate-rise` with a staggered `style={{animationDelay}}` on first load only (not on every 5 s refresh; see §5). `reveal` for below-the-fold sections.
- **Reduced motion:** already handled globally in `globals.css`. Countdowns still tick; only animations stop.

### 4.1 Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ● All 2 schedules on time                         ● Live      [Edit on GH]  │ ← status band (time-grid + glow)
│  Next kick  nightly.yml · cronkick-probe-a   in 09:42  (mm:ss, amber)        │
├──────────────────────────────────────────────────────────────────────────────┤
│ ON TIME (24 H)    │ RUNS (24 H)       │ MISSED (24 H)   │ AVG START DELAY     │
│ 6 of 6            │ 6                 │ 0               │ +1.6 s              │
│ ▁▁▁▁▁▂▂▂ spark    │ 6 on time · 0 late│ —               │ p95 +3.1 s          │
├──────────────────────────────────────────────────────────────────────────────┤
│ ⇄ 4 workflows still use GitHub's schedule:, which runs late.  Review →   ✕   │ ← banner, amber/10
├──────────────────────────────────────────────────────────────────────────────┤
│ Schedules                         [All 2] [Needs attention 0]   ▪on ▪late ▪miss ▫next
│                                                                              │
│ cronkick-probe-a ↗                                                           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ● cronkick               - - - - - - - - - ▮▮▮ ▯  6 of 6 on time         │ │
│ │   every 15 min · */15 * * * *                      next in 09:42         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ cronkick-probe-b ↗                                                           │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ ● cronkick               - - - - - - - - - ▮▮▮ ▯  6 of 6 on time         │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ Activity                                                       View all →    │
│ ✓ 14:15  cronkick · probe-a   started +1.4 s   run #482 ↗                    │
│ ✓ 14:15  cronkick · probe-b   started +1.9 s   run #219 ↗                    │
│ ✓ 14:00  …                                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Components**

- `StatusBand`: verdict sentence + `NextKick` countdown (client component; takes an ISO string and ticks every second, the same logic as `MarkerCard`'s `left`). Dot colour: emerald when everything is on time, orange for late, red for missed or needs-fix, zinc when there's nothing scheduled.
- `Stat` v2: label `text-xs uppercase font-mono text-zinc-500 tracking-wide`, value `text-3xl font-semibold`, optional 24-bucket sparkline (hourly on-time counts; reuse `RunsChart` with `height="h-6"` and no labels).
- `ScheduleRow`: the whole row is a `<Link>` (not just the name) with `hover:bg-white/[0.03] hover:inset-ring-white/15 transition`, plus a chevron that slides 2px on hover. A health dot comes before the name. The human cron ("every 15 min") goes first, with raw cron in `text-zinc-500 font-mono`.
- `SlotStrip` v2: right-aligned real slots with `tips`, a dashed pre-history baseline, and a hollow next tick (`inset-ring inset-ring-brand-500/60 bg-transparent`) with `animate-twinkle`. On hover the tick scales up (already in the CSS).
- `ActivityFeed`: last 8 slots across the installation, newest first, with new items sliding in (§5). Each row links to its run.
- `SwitchBanner`: `rounded-xl bg-brand-500/[0.06] inset-ring inset-ring-brand-500/20`; ✕ dismisses for 7 days (cookie).

**States**

- *Loading:* `loading.tsx` with skeleton bars. The strip skeleton is 48 `bg-white/5` ticks with a left-to-right `shimmer`, and the stat values are `h-8 w-20 rounded bg-white/5`.
- *Empty:* §4.5.
- *Error* (DB down, installation removed): an inline card, not a raw `<main className="p-8">`: "We can't reach your schedules right now. Cronkick keeps triggering in the background; this page will retry." Add an amber Retry button, and keep the last good data when possible.
- *Live update:* §5.
- *Needs attention:* the row gets `inset-ring-red-500/30` and a one-line reason under it ("`*/5` is faster than your plan allows: Free runs every 15 min at most"). The status band turns red and links to it.
- *Paused (limit):* the row is dimmed to `opacity-60`, with the badge "Paused · plan limit" and the inline action "Upgrade" or "Which ones are running?".

### 4.2 Workflow detail

```
← cronkick-probe-a
cronkick  ● Healthy                                   [Edit on GitHub ↗] [Actions ↗]
every 15 minutes · */15 * * * * UTC · .github/workflows/cronkick.yml

┌─ amber hairline ───────────────────────────────────────────────────────────────┐
│ NEXT KICK  14:30 your time (09:00 UTC)        in 09:42  ▕▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▕ │ ← progress bar fills toward due
│ Last 96 scheduled times                       ▪on time ▪late ▪missed ▨skipped ▫next
│ - - - - - - - - - - - - - - - ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ ▯                 │ (h-12, tooltips, click → row)
├────────────────────────────────────────────┬───────────────────────────────────┤
│ Start delay, last 7 days                   │ Runs per day, last 14 days        │
│ ·  · ·· ·  ·  ·· ·   ·   ····  ← dot plot  │ ▆▆▆▆▆▆▆▇▇▇▇▇▇▇ (stacked, existing)│
│ ─────────────── 30 s on-time line (dashed) │                                   │
│ p50 +1.4 s · p95 +3.1 s · max +6.0 s       │                                   │
└────────────────────────────────────────────┴───────────────────────────────────┘

History                                  [All] [Late] [Missed]      Showing 7 days (Free)
 Scheduled ▾          Started     Status        Run          Result
 14:15 today          +1.4 s      ✓ Started     #482 ↗       ✓ success
 14:00 today          +1.9 s      ✓ Started     #481 ↗       ✕ failure
 13:45 today          —           ⚠ Unconfirmed —            —        ▸ (expand: GitHub said 502, we didn't resend because…)
```

**Components and interactions**

- **Header health pill:** derived from the last 24 h (Healthy / Late runs / Missed runs / Paused / Needs a fix), not from the last slot's state.
- **Next-kick card:** client countdown plus a thin progress bar (`h-0.5 bg-brand-500` whose width is `elapsed / interval`) that fills toward the due time. When it reaches 0, show "Kicking…" with a pulsing dot, then switch to "Started +1.4 s ✓" when the next refresh brings the slot (§5).
- **Strip:** as on the overview, but `h-12`. Click a tick → `scrollIntoView` its row and flash it with `bg-brand-500/10` fading over 1.2 s.
- **Start-delay dot plot:** new and small. An SVG of 0–60 s on the x axis, one dot per slot with jittered y, and a dashed line at 30 s labelled "on time". It answers the question that matters most to this product's buyer ("how close to the minute?") better than the daily bar chart. Hover a dot to get the same tooltip as the tick.
- **History table:** local time by default with UTC in `title` (and an Intl relative "today/yesterday"). Status pills renamed (§6). "GitHub said" moves into an expandable row detail. "by time" becomes a `LinkIcon` with a tooltip. Add filter chips. Keep `MAX_ROWS` but add "Load older".
- **State glossary:** shown as tooltips on the pills, with a "What do these mean?" popover. Drop the always-visible sidebar paragraph.
- **Right rail:** remove it; everything moves into the header and cards. That frees width for the strip, which is the hero of this page.

**States:** loading (skeleton of the strip + chart), no runs yet ("First kick in 04:12", with a large countdown in the strip area plus a ghost strip), paused (an amber card replaces the next-kick card: "Paused: you're using 10 of 10 schedules on Free"), needs fix (a red card with the flag messages and Edit on GitHub), workflow deleted from the repo (`present = false`: "This file was removed from cronkick-probe-a on Nov 9. History is kept for 7 days").

### 4.3 Settings

```
Settings

┌ Plan ──────────────────────────────────────────────────────────────────────────┐
│ Free                                              [Upgrade to Pro · $9/mo] glow │
│ Schedules   ▓▓░░░░░░░░  2 of 10                                                 │
│ Fastest     every 15 min        (Pro: every 5 min)                              │
│ History     7 days              (Pro: 90 days)                                  │
│ Alerts      plan-limit only     (Pro: missed & failed runs)                     │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Alerts ────────────────────────────────────────────────────────────────────────┐
│ Email   [ you@company.com            ]  [Save]   Send test →                    │
│ ✓ Saved (inline, fades after 2 s; no ?saved=1 URL param left behind)            │
│ ☐ Missed run   ☐ Failed run   ☑ Plan limit reached   ← Pro toggles show 🔒 Pro  │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Repositories ──────────────────────────────────────────────────────────────────┐
│ 2 repositories · cronkick-probe-a, cronkick-probe-b      [Manage on GitHub ↗]   │
└────────────────────────────────────────────────────────────────────────────────┘
┌ Danger zone (red hairline) ────────────────────────────────────────────────────┐
│ Uninstall Cronkick: stops every schedule immediately.     [Uninstall on GitHub ↗]│
└────────────────────────────────────────────────────────────────────────────────┘
```

- Use the Pro card's `border-spin` treatment on the upgrade button's container *only* on Free. It's the one place a glow is earned.
- The form should use `useActionState` so success and error show inline without a redirect, and the button shows "Saving…".
- Error: an inline red message under the field with `aria-describedby`. Keep the current text, but say "That doesn't look like an email address." (see §6).

### 4.4 Account picker

There is no picker today: `/dashboard` redirects to `installs[0]` (alphabetical). That's wrong for anyone with a personal account plus an org.

- **Default:** remember the last-visited installation in a cookie, then redirect there.
- **Switcher (sidebar top):** a button with avatar, login, plan chip and ▾. The popover lists each install with its avatar, plan, active-schedule count and a health dot (`● 2 on time` / `● 1 missed`), plus "Add a GitHub account or org ↗" (install URL). Support ⌘K / Ctrl+K later; for now arrow keys and Enter.
- **Picker page** (only when more than one install and no cookie): a centred grid of account cards (`max-w-2xl`), each a card with avatar, login, "Organization"/"Personal", plan, `2 schedules · all on time`, `hover:inset-ring-brand-500/40 hover:-translate-y-0.5 transition`. Use the same `hero-glow` + `time-grid` backdrop as the install-prompt page.
- **No-install state** (exists): keep it, but give the primary button the GitHub mark and `btn-glow`, matching the landing CTA "Install with GitHub".

### 4.5 Empty / first run

Replace the stats row + `GettingStarted` card with one **first-run hero** that reuses `MarkerCard`'s look and fills with real data:

```
┌─ time-grid + hero-glow ────────────────────────────────────────────────────────┐
│  Let's schedule your first workflow                                             │
│  Three steps. This page updates by itself.                                      │
│                                                                                 │
│  ✓ Installed on 2 repositories                     Add repositories ↗           │
│                                                                                 │
│  ② Add one line to a workflow                                                   │
│     ┌ .github/workflows/nightly.yml ────────────────────── ● waiting for push ┐ │
│     │ 1 name: nightly                                                          │ │
│     │ 2 on:                                                                    │ │
│     │ 3   workflow_dispatch:                                                   │ │
│     │ 4   # cronkick: "0 3 * * *"        ← amber row, types in, [Copy]         │ │
│     │ 5 jobs: …                                                                │ │
│     └──────────────────────────────────────────────────────────────────────────┘ │
│     Already on GitHub's schedule? Move one of your 4 →                           │
│                                                                                 │
│  ③ Push to your default branch                                                  │
│     ◌ Watching cronkick-probe-a and cronkick-probe-b for a push…  (spinner)     │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Step ② **is** the marker card: same chrome, the typed-in marker, a Copy button that's visible on mobile (on the landing page it only shows on hover, so touch users can't see it). Add a cron picker beside it (chips: `every 15 min`, `hourly`, `daily 03:00`, `custom`). Picking one rewrites line 4 live, and plan-floor chips are disabled with a "Pro" tag.
- Step ③ polls. When a marker shows up, it ticks with `animate-pop`, the card header dot turns emerald ("synced"), and the copy changes to "Found nightly.yml in cronkick-probe-a. First kick in 04:12". Below it, the real `ScheduleRow` rises in. Once the first slot fires: a toast, then the hero collapses into the normal overview.
- If a marker is found but has flags, step ③ turns red with the flag message and Edit on GitHub. It never just disappears.
- Hide the stats row entirely in this state.

### 4.6 GitHub lateness (`/lateness`)

Keep it public, but link to it from the overview as a card ("GitHub's own `schedule:` ran a p95 of 11.4 min late this week →") instead of from the nav. Inside the dashboard shell, open it with the dashboard sidebar, or at least a "← Back to dashboard" link when signed in. On the page itself, add the `SlotStrip`/`TimelineCompare` visuals so the numbers aren't just a table.

---

## 5. Real-time UX

Keep the 5 s `router.refresh()` polling (a fine ponytail choice for now), but make the result **diff visually** instead of re-painting:

1. **Stable keys.** Ticks, activity rows and table rows must render with `key={slot.id}`, not the array index (`SlotStrip` uses `key={i}` today, so every refresh reuses DOM nodes positionally and nothing can animate). Mark a slot as new client-side by comparing against a `useRef(Set<id>)` of IDs already seen. Only new IDs get the entrance class, and nothing animates on first mount.
2. **New tick arrives:** the strip shifts left by one with `transition-transform duration-500` (on the container, translate by one tick width then reset). The new tick grows from `scale-y-0` to full with `origin-bottom` and the landing page's `pop` easing, then a single emerald `ring` pulse fades over 800 ms. A late tick pulses orange and a missed one red.
3. **Countdown → dispatch:** `NextKick` hits 00:00, shows "kicking…" with a pinging amber dot, and as soon as the slot leaves `pending` (next poll; ≤5 s) the dispatch toast appears.
4. **Dispatch toast:** reuse the landing page's floating card exactly (`animate-pop`, bottom-right, `bg-zinc-900/90 backdrop-blur inset-ring`): ✓ "Started nightly.yml" / `14:15 UTC · +1.4 s · run #482 ↗`. Stack at most 3 and auto-dismiss after 6 s; hovering pauses the timer. Missed runs get a red toast that stays until dismissed. Announce through an `aria-live="polite"` region (missed: `assertive`).
5. **Counters:** numbers animate between old and new values (a 400 ms count-up with `requestAnimationFrame`, or the cheap version: key the `<dd>` on its value and apply `animate-rise` with a smaller `translateY`). Percentages never animate downward on the first render.
6. **Activity feed:** new rows slide in from the top (`grid-rows-[0fr]` → `[1fr]` transition) with a brief `bg-white/5` highlight.
7. **Live indicator:** a static emerald dot labelled "Live". The ping plays once per successful refresh, not forever. Drop the "updated 0s ago" counter and put it in the `title`. If two refreshes in a row fail or take more than 15 s, the dot turns amber with "Reconnecting…". If the tab was hidden and comes back, show "Updated just now" for 2 s.
8. **No layout shift:** reserve space for badges, toasts and table rows. Keep `tabular-nums` on every changing number.

**Relative-time rules**

- All relative times are rendered **client-side** from ISO strings and ticked every second (or every 30 s for "ago" values over 1 h), so they never freeze between refreshes. Wrap the server-rendered value in `<time dateTime>` and use `suppressHydrationWarning`.
- Future, under 1 h: a countdown, `mm:ss` (amber, mono). Future, over 1 h: "in 3 h 12 min". Future, another day: "tomorrow 03:00".
- Past: "just now" (<10 s), "42 s ago", "14 min ago", "today 03:00", "Nov 8 03:00".
- Absolute timestamps use the viewer's local time with a short tz ("14:15 IST"), with UTC in a tooltip. Cron expressions always say "UTC" (or their tz) explicitly, because that's where confusion happens.
- Delays always use a sign and one decimal: `+1.4 s`. Anything over 30 s is orange.

---

## 6. Copy rewrites (the 10 that matter most)

| # | Where | Before | After |
|---|---|---|---|
| 1 | Workflow badge | **Ready to switch** | **On GitHub's schedule** (zinc badge) + row action **Move to Cronkick →** |
| 2 | Switch instructions | Uses GitHub's `schedule:`. To switch, remove that block, add `workflow_dispatch:` under `on:`, and paste these lines below it. Faster than every 15 minutes won't run on your plan. | GitHub runs this with `schedule:`, which is often late or skipped. Replace the highlighted lines and Cronkick will start it on time. *(diff below)* — and, only when it applies: *GitHub had this every 5 min; Free runs every 15 min at most, so we've set it to 15.* |
| 3 | Stat label + sub | **On time (≤ 30 s)** / first trigger after due time | **On time** / started within 30 s of schedule |
| 4 | Stat label | **Runs, last 24 h** | **Runs, last 24 h** with the sub **6 on time · 0 late · 0 missed** (and count only past slots) |
| 5 | Stat label + sub | **Next run** / nothing missed in 24 h | **Next kick** / nightly.yml · in 09:42 *(missed count moves to its own stat)* |
| 6 | Strip caption | **Last 48 slots** | **Last 48 scheduled times** · hover a tick for details |
| 7 | Per-row metric | **27.2% on time** / next in 10m | **6 of 6 on time** / next in 09:42 |
| 8 | Paused row | Paused because your plan's limit is reached. Upgrade, or remove another schedule, to turn it on. | Not running: you're using all 10 schedules on Free. Remove a `# cronkick` line elsewhere, or **upgrade to Pro** for 50. |
| 9 | Slot status pills | **Triggered** (fired) / **Ran** (accepted) / **Unknown** / **Expired** | **Sent** / **Started** / **Unconfirmed** / **Gave up** — with tooltips: *Sent: we asked GitHub to start it.* *Started: GitHub created the run.* *Unconfirmed: we sent it but couldn't confirm GitHub got it, so we didn't resend.* *Gave up: GitHub kept failing until the deadline, so we skipped it rather than run late.* |
| 10 | Empty-state step 3 | Push to your default branch / Cronkick reads the file on push. The workflow turns Active here, and every run gets a tick. | Push to your default branch / **Watching 2 repositories for a push…** This page updates by itself. |

Runner-up strings:

- Header button "Choose repositories" → **Add repositories ↗** (secondary, moved to the switcher and Settings).
- Page subtitle "Deveshb15 · Free · up to 10 schedules, every 15 min or slower" → removed (moved to the plan meter).
- Table header "Triggered" → **Started after**; "GitHub said" → **GitHub response** (in the expanded row).
- Settings error "That email address looks wrong." → **That doesn't look like an email address.**
- "No runs yet. The first one is due in 4m." → **First kick in 04:12.**
- Sidebar "GitHub lateness" → out of nav; the overview card reads **How late is GitHub's own scheduler? →**

---

*Not covered:* mobile layouts were inferred from the code (`details`-based menu), not seen in screenshots. I didn't render the redesigned pages. Item §0 is a backend query fix: it's the one exception to "no backend", because the UI can't be honest without it.

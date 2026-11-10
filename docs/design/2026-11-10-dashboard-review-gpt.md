# Cronkick dashboard design review

Date: 2026-11-10. Scope: the three supplied screenshots and the requested dashboard, component, data, landing-page and lateness source files. Workflow detail, settings, account selection and lateness findings are source-based; the screenshots show overview and onboarding. No live browser session was used.

**Verdict:** Cronkick needs to make its evidence understandable before making it more spectacular. The landing page demonstrates a clear sequence—edit, push, trigger, inspect. The dashboard scatters those steps among monitoring rows, unexplained numbers and repeated migration instructions. Carry the landing page’s amber light, time grid and tactile ticks into a working instrument: clear states, inspectable events and restrained motion driven by real changes.

## 1. Comprehension test

The following covers the confusing product elements visible in the supplied screenshots; browser chrome is outside scope.

| Exact UI text or visible element | What a first-time user cannot safely infer |
| --- | --- |
| “Accounts” and “Deveshb15” above navigation; “Deveshb15” again beside “Sign out” | The top identity is the GitHub installation being managed; the bottom identity is the signed-in person. For a personal installation they look like duplicate account controls. Label the switcher “GitHub account” and the footer “Signed in as …”. |
| “Workflows” | The page includes monitored workflows, migration candidates, plan limits and installation instructions. It does not say whether all listed workflows are actually scheduled by Cronkick. |
| “Deveshb15 · Free · up to 10 schedules, every 15 min or slower” | A schedule is not necessarily a workflow. Multiple marker comments consume multiple schedules. Lead with the account; place quota and frequency in a compact usage control with an explanation. |
| “up to 3 schedules” and “of 3 on your plan” in the empty screenshot | These conflict with the other screenshot and today’s source, which specify 10 Free schedules. Treat the empty image as an older state, not proof of the current live entitlement. All new designs must use the current 10/50 limits. |
| “Choose repositories” in both sidebar and header | Both leave Cronkick for GitHub permissions, rather than choosing a filter or adding a schedule. Show an external-link indicator consistently and call it “Manage repository access ↗”. |
| “Live · updated 0s ago” | Live can mean scheduler health, a persistent connection, or page freshness. Source refreshes every five seconds and stamps the refresh request, not confirmed completion. Green currently overstates what is known. |
| “Active schedules” / “2” / “of 10 on your plan” | Does active mean configured, successfully dispatching, or currently running? It means enabled schedules, not workflow health. |
| “Runs, last 24 h” / “22” | Reads as 22 GitHub executions. Source counts slots other than skipped, including future ones because the count lacks an upper due-time bound. This label is unsupported by that query. |
| “On time (≤ 30 s)” / “27.2%” / “first trigger after due time” | Is 30 seconds measured to the API request, GitHub acceptance, runner start or completion? Source measures first attempt relative to due time for fired/accepted slots. The denominator also includes future slots. Six divided by 22 truncates to 27.2%, but the screenshots alone cannot establish those underlying counts. |
| “Next run” / “in 10m” | Which workflow? Which timezone? It is the next scheduled slot, not a promise that a runner starts then. It needs a workflow link and exact due timestamp. |
| “nothing missed in 24 h” beside “27.2%” | These can coexist, but the page does not explain why. Late, pending, future and unconfirmed are different things. Zero unknown/expired records is not evidence that every job ran successfully. |
| “By repository” | Migration instructions inside repository one push repository two’s live status below the fold. Grouping defeats cross-repository monitoring when candidates dominate the page. |
| “Actions ↗” | Opens the repository Actions index, not the adjacent workflow’s run or its setup file. Say “Repository Actions ↗”. |
| Repeated workflow name “cronkick” | Repository grouping supplies context, but links and notifications must retain owner/repo identity because names repeat across repositories. |
| “Active” | Says configuration is enabled, not that the latest slot fired or that its GitHub job passed. Separate configuration status from last outcome. |
| “*/15 * * * *” | Requires cron literacy and omits UTC. Add “Every 15 minutes · UTC”, keeping the expression secondary and copyable. |
| “Last 48 slots” | What is a slot? Which direction is newest? How much time does 48 cover? These strips show at most 48 past due occasions, padded to 48 positions; an hourly workflow and a quarter-hourly workflow cover different durations. |
| Grey ticks versus green ticks; legend “on time”, “late”, “missed” | Grey has no legend entry. Source uses it for left padding, pending, dispatching and skipped. No history and a real unresolved event look identical. Dashboard calls do not supply tick tooltips, unlike marketing. |
| “27.2% on time” on each row | No denominator or period appears on the row. A mostly-grey strip with three green bars cannot explain this number, especially with a different time window. |
| “next in 10m” on each row | The approximate time is useful, but neither the exact due time nor whether multiple schedules exist is visible. The same space becomes “missed” on problem rows, hiding the next due time when it matters most. |
| “Ready to switch” on “probe every 5 min” | Sounds prevalidated and one click away. The Free plan cannot support this cadence. Source readiness means a suggested diff exists; it does not guarantee plan eligibility. |
| Repeated “Uses GitHub’s schedule:. To switch, remove that block, add workflow_dispatch: under on:, and paste these lines below it.” | Every candidate repeats the same lesson. “Below it” is an unsafe editing instruction without indentation and surrounding YAML. It is unclear whether the snippet is a replacement or a complete file. |
| “Faster than every 15 minutes won’t run on your plan.” above `# cronkick: "*/5 * * * *"` | The page warns against the exact configuration it invites the user to copy. Explain the incompatibility before the action, with explicit cadence choices; never silently change the cron. |
| Repeated workflow paths and “Copy” | It is unclear whether Copy copies a marker, a patch or a complete workflow. Copying does not apply it. Button labels must name the artifact. |
| “Schedule your first workflow” beneath four empty metrics | The main action is below a zero-value scorecard. “—” could mean unavailable, broken or unconfigured. First setup should lead the page; metrics should appear when there is real history. |
| “App installed on 2 repositories” | Confirms access, not discovery or schedule validity. Show those as separate checkpoints. |
| “Add a # cronkick comment to a workflow” / “Put it next to workflow_dispatch:” | “Next to” is spatially vague. Show the exact valid `on:` block, indentation and timezone, preserving existing jobs. |
| “.github/workflows/nightly.yml” and the full starter containing `jobs:` | Looks like the file the user should replace, even when they already have a workflow. Present this as an optional new-file example; default to editing the selected existing trigger block. |
| “Push to your default branch” | Does not name the branch or selected repository, or show whether the push has been detected. |
| “Cronkick reads the file on push. The workflow turns Active here, and every run gets a tick.” | Activation and first dispatch are separate milestones. There may be hours until the first slot. A tick records a scheduled occasion, not necessarily a confirmed execution. |
| “GitHub lateness” | Appears equivalent to account navigation, but opens public probe data outside the dashboard shell. Label it as a public benchmark and retain an obvious return path. |

**Source-level extension:** detail labels “Ran”, “Triggered”, “GitHub said”, “Result” and “by time” blur configuration, dispatch evidence and job outcome. A linked run is not necessarily completed. An `unknown` record can be an ambiguous timeout or an explicit rejection; its explanation must use available response evidence. The UI must not call both situations a confirmed miss.

## 2. Top 10 problems, ranked by user impact

| Rank | Where | Why it hurts | Concrete fix |
| --- | --- | --- | --- |
| 1 | Overview statistics, `overview()` in `web/lib/data.ts` | “Runs” counts scheduled records, including future slots. On-time coverage can look catastrophically low before anything has failed. This undermines the product’s central promise. | Count only due slots in the selected elapsed window. Label them “Scheduled slots”; show the on-time fraction, unresolved count and an explicit first-attempt definition. Never render a percentage for no elapsed evidence. |
| 2 | `SlotStrip`, `toTick`, workflow history pills | Grey conflates nonexistent history with unresolved/skipped slots; unknown becomes missed; green can be mistaken for job success. Users cannot investigate what happened. | Preserve actual slot identity and state in the presentation. Use distinct empty padding, pending, dispatching, dispatched, run-linked, unconfirmed, expired and skipped treatments; offer timestamped inspection. Separate timing from execution result. |
| 3 | Overview “Ready to switch” rows | A Free user is handed a five-minute marker that cannot activate. “Ready” is false confidence at the highest-friction moment. | Use “Uses GitHub scheduling”; show “5-minute schedule requires Pro” before copying. Offer explicit “Use every 15 minutes” or “Request Pro”; preview any cadence change. |
| 4 | First-run card and migration snippets | The user can copy a comment without knowing its correct placement, or replace an existing workflow with a toy file. No visible feedback closes the setup loop. | A selected-workflow guide shows before/after trigger blocks, preserves jobs, names the default branch, links to the file and waits for observed configuration. Distinguish saved config from first due slot. |
| 5 | Overview hierarchy | Repeated setup blocks bury running workflows and errors. Watching current schedules becomes a documentation-reading exercise. | Put an attention summary and monitored workflows first. Move candidates into a counted collapsed section; expand one migration guide at a time. |
| 6 | `LiveRefresh` and relative times | “Live” reports request initiation as freshness and gives no stale/error state. Relative due times are server-rendered and update only on refresh. Users cannot tell a stalled UI from scheduler trouble. | Show last successful data refresh; retain existing content during refresh; mark stale data; use client-relative clocks based on absolute timestamps. Do not equate freshness with service health. |
| 7 | Workflow detail | A raw table and daily volume bars do not quickly answer “Was my workflow triggered on time, and did the job pass?” The latest slot pill beside the title masquerades as workflow status. | Separate enabled configuration, latest dispatch timing, linked GitHub run and job result. Put a next-slot card and inspectable timeline above the table. Add axes, counts, date-window labels and slot expansion. |
| 8 | Settings | “Upgrade to Pro, $9/month” opens email, not checkout. Retention is absent; alert capability is easy to overread on Free. | Show the complete current entitlement and usage. Label the action “Request Pro by email”; explain activation is manual. Put alert eligibility beside the input, with visible saving/saved/error feedback. |
| 9 | Shell and account entry | `/dashboard` redirects to the alphabetically first installation; the purported picker is actually a no-install screen. Public navigation exits the operational context without explanation. | Show a picker for multiple installations and direct-entry for one. Keep account scope persistent; make the public benchmark a secondary outbound destination with “Back to dashboard”. |
| 10 | Shared visual language and accessibility | The dashboard lacks the landing page’s focal object and tick interaction, while small muted labels and colour-only strips make reading harder. Decoration alone will not fix it. | Reuse amber edging, a faint time grid and one functional countdown card. Give rows hover/focus states, touch-accessible tick inspection, visible text outcomes and reduced-motion alternatives. Avoid perpetual sweeps behind data. |

## 3. Information architecture

Use two account-scoped destinations: **Overview** and **Settings**. Workflow detail remains nested under Overview; avoid adding separate Runs, Analytics or Repositories pages before they earn their own tasks.

```text
/dashboard                         account selection / install if none
/dashboard/:installation          Overview
  Needs attention                 configuration + dispatch issues
  Monitored workflows             active and paused; filterable
  Uses GitHub scheduling (N)       migration candidates, collapsed
  Other workflows (N)             no schedule, collapsed
/dashboard/:installation/workflows/:workflow
  configuration + next slot + timeline + slot history
/dashboard/:installation/settings
  plan and usage / email alerts / GitHub repository access
/lateness                         public benchmark, clearly separate
```

“Needs attention” is a compact linked summary, not another copy of each workflow’s instructions. Monitored rows group by repository by default; an account-wide problem filter must still find issues across repositories. Keep next due visible even if the row has a problem. Mixed workflows with some active and some paused schedules need “1 active · 1 paused”; a single “Active” badge hides partial activation.

Candidates are not paused Cronkick workflows. Name their source, show plan compatibility, and give them an inline conversion guide; do not send them into an empty history screen. Workflows with no schedule get a lightweight “Add schedule” guide. Search and repository filtering apply to each section and report filtered counts.

First-run progression: **installation accessible → repositories discovered → workflow selected → valid marker detected → schedule enabled → first slot due → dispatch evidence → optional linked run/result**. Each checkpoint must reflect observed data. Once enabled, replace the large setup card with “First trigger due …”; after the first outcome, reveal normal monitoring. If the first slot fails, retain its failure and next action rather than celebrating activation. If all previously active schedules break or pause, show the affected workflows; do not return to “Schedule your first workflow” just because `anyActive` is false.

## 4. Per-page redesign spec

### Shared shell and visual system

Retain ink `#09090B`, Inter for reading, JetBrains Mono for cron/timestamps and amber `#FFB020` for primary actions and selection. Emerald means confirmed positive evidence, orange means late/warning, red means failure, blue means an in-flight action; all need text or shape companions.

Use a `w-60` desktop sidebar at `lg`, content `max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6`, and `gap-6` between working sections. At small widths use an account/menu button and a labelled collapsible navigation; close it after selection. Give links `aria-current`, visible focus rings and touch targets of at least 44px. Account scope belongs above primary navigation; signed-in identity belongs below it.

Cards: `rounded-2xl bg-zinc-900/50 border border-white/10 p-5 sm:p-6`. Use `text-zinc-300` for essential secondary information and reserve `text-zinc-500` for decoration. Prefer 14px dashboard body text and 12px minimum metadata. Use a faint masked `time-grid` behind the top 180px and a thin amber top edge on the next-slot card. Keep data sections visually still. Reuse the landing page’s `hero-glow`, tooltip styling and existing buttons rather than introducing a competing design system.

### Overview

```text
[GitHub account v]     Overview             [Manage repository access ↗]
                      Updated 3s ago · auto-refresh every 5s
[On-time attempts: x/y] [Due slots: y] [Needs attention: n]
[NEXT SCHEDULED TRIGGER: repo / workflow · 09:15 UTC · 02:14]
[Needs attention: 1 unconfirmed dispatch, 1 invalid marker →]
[Monitored workflows (N)] [Search…] [Repository v] [Status v]
repo / workflow | cadence + zone | recent slots | next due | outcome
[Uses GitHub scheduling (N)                         Expand]
[Other workflows (N)                               Expand]
```

**Components:** three compact evidence cards; next-slot countdown card; issue links; dense workflow rows; timeline inspector; collapsible candidate list. Show quota as “2 / 10 schedules” beside account/plan, not as a health metric. Stats default to “Past 24 hours”; do not silently mix periods. Show on-time as a rounded percentage plus `x of y due slots` and explicit unresolved count. Do not fabricate a corrected value for the supplied screenshot.

Rows use `grid gap-3 xl:grid-cols-[minmax(12rem,1fr)_minmax(10rem,1fr)_9rem]`; cadence sits under identity, outcomes and next due stay visible on the right. On mobile stack these fields and show 24 recent slots with access to full detail. Avoid 48 tiny interactive targets across a phone screen. Each strip labels its actual date range and “Newest →”; padding is a dotted empty track, not fake slots. A single roving focus target with arrow-key selection makes dense strips usable without 48 tab stops. Tap selects a tick; a larger inspector below offers “View slot”.

**States:** initial load uses fixed-size skeleton cards and rows; no fake green ticks. No schedules leads to the onboarding view. No search matches offers “Clear filters”. Read failure keeps previous data labelled stale, or shows a retry panel if no data exists. Live changes update the affected keyed row without reordering the list under the pointer; filtering into “Needs attention” is user-controlled. New workflow discovery can announce “1 workflow added” and offer to reveal it.

**Interactions:** row background `hover:bg-white/[0.03]`, amber focus ring and a visible detail link; no nested clickable row with competing anchors. Tick hover/focus raises height gently and shows due time, first-attempt delay, dispatch state and run result. Clicking opens detail with that slot selected. Countdown updates in place; it does not predict a successful dispatch.

### Workflow detail

```text
[← Overview]  owner/repo / workflow              [Workflow file ↗]
[Enabled · 1 active schedule]  Every 15 minutes · UTC
[NEXT DUE 09:15 UTC · 02:14] [Latest attempt +1.8s · Run linked]
[Recent scheduled slots — actual date range                 ]
[Selected slot: due → first attempt → response → linked run ]
[Past 7 days v] [On-time / late / expired / unconfirmed chart]
[Slot history] [Outcome filter v]
Due time | First attempt delay | Dispatch evidence | Job result | Run
```

**Components:** explicit configuration status; human-readable schedule list with raw cron disclosure and per-schedule paused badge; countdown; existing strip; selected-slot evidence panel; existing stacked chart with labelled count scale; history table. Put the schedule metadata above the history, not only in a narrow right rail. Display run conclusions separately from dispatch status: “Dispatched on time · Job failed” is a legitimate combined result.

Default chart to seven days for Free; label 90-day retention for Pro and offer only windows actually available to this view. The current hardcoded “last 14 days” alongside seven-day Free retention is confusing. Add UTC date labels, integer y-axis ticks, selected-day counts and a zero-data baseline. Start with these enhancements to `RunsChart`; a new chart dependency is unnecessary. A compact first-attempt-delay plot with a 30-second reference can follow only if every point has real delay evidence; missing delays remain unknown.

Each history row expands to the response details and event timestamps. Replace a dash with a reason: “Awaiting run link”, “No confirmation”, “Not attempted” or “Result not received”, as evidence allows. Surface “Matched by time” beside inferred run links with the warning that a manual run could match. Keep raw HTTP status and response note in details, not as the primary explanation. A job conclusion such as cancelled is not automatically equivalent to a failed job.

**States:** skeleton reserves chart and table geometry. Enabled with no due slots shows the next due time and “History starts after the first scheduled time”. Invalid/paused config retains prior history with the relevant warning. A route/read error offers retry and Overview, not a blank chart. With 500 rows shown, explicitly say “Showing newest 500 slots” and state the summary window; do not imply the visible rows represent all retained history. New rows appear above the table only when the user is at the top; otherwise show “2 new slots” to avoid moving the row being inspected.

**Interactions:** chart day selection filters the history; tick selection and row expansion share selection; tooltips work by keyboard and touch. Highlight a changed row for 600ms, then settle. Keep job-result updates visually distinct from first dispatch arrival.

### Settings

```text
Settings · GitHub account: Deveshb15
[Plan & usage: Free / 2 of 10 schedules / 15-minute minimum]
[7-day history]                 [Request Pro by email · $9/month]
[Alert email]
[you@company.com________________] [Save email]
Free: plan-limit emails. Pro: also missed-run and failed-run alerts.
[Repository access] [Manage on GitHub ↗]
Uninstalling on GitHub stops all schedules for this account.
```

**Components:** three clearly bounded cards, `max-w-3xl`, labelled email input and inline feedback. Plan comparison lists Free: unlimited repos, 10 schedules, 15-minute minimum, seven days; Pro: unlimited repos, 50 schedules, five-minute minimum, email alerts, 90 days, $9/month per GitHub account/organization. Explain that each enabled cron expression uses a schedule, rather than counting repositories or workflow files. Do not introduce billing-portal or test-email controls that do not exist.

**States:** load skeleton; missing email shows an empty field with explanatory helper text; submitting disables only the save button and says “Saving…”; success says “Alert email saved” in a polite live region; invalid input uses an associated field error; server/network failure preserves the entered value and permits retry. Background refresh must preserve dirty input and focus. Show Pro capability accurately, without implying that Free users receive missed-run alerts after saving an address.

**Interactions:** clear focus and hover, no celebratory animation for routine saves. Pro action opens an email request and explicitly explains manual activation. Repository access remains an external GitHub operation; do not add an in-dashboard destructive uninstall button.

### Account picker

The current `/dashboard` page is not a picker: it redirects whenever any installation exists. Introduce selection only for multiple installations; one can continue directly. The persistent sidebar switcher always lets a user change scope.

```text
[Cronkick]
Choose a GitHub account
Signed in as Deveshb15
[avatar Personal account     Free      Open →]
[avatar Organization         Pro       Open →]
[Install on another GitHub account ↗]
[Sign out]
```

**Components:** `max-w-xl mx-auto`, account cards with avatar, login, personal/organization type and plan. Make the whole card one focusable link. Keep installation labels distinct from the authenticated person. A menu search is unnecessary for a small list; enable it only if account volume makes it useful.

**States:** stable card skeletons; no installations shows “Install Cronkick on GitHub” with the signed-in identity and primary install action; “I just installed it” becomes “Refresh GitHub access” and actually rechecks access. Removed/unavailable installation shows a reason and a link to choose another; failure to retrieve accounts must not masquerade as zero installations. Pending organization approval should be shown only if known, not guessed.

**Interactions:** amber border on hover/focus, 120ms background transition. No animated tick histories or usage counts that the current account-list data does not supply.

### Empty / first-run

```text
Schedule your first workflow
[✓ GitHub access] → [2 Choose workflow] → [3 Push change] → [4 First slot]
[Repository v] [Workflow v]   default branch: main
[Trigger block: before | after]
Every 15 minutes · UTC       [Copy trigger block] [Open file on GitHub ↗]
Keep your existing jobs. Remove schedule: to avoid duplicate triggers.
[Waiting for a valid marker on main…]
[Detected ✓] → [Enabled ✓] → [First trigger due at 09:15 UTC · 02:14]
```

**Components:** one setup card borrowing the landing marker card’s code highlighting, amber changed-line band and soft edge light. Use a real file path and default branch when selected. Default to a compatible existing GitHub-scheduled workflow; if none exists, offer an explicitly labelled “Create an example workflow”. Display the minimal trigger edit first; keep a complete new-file example behind a disclosure. Explain that cron defaults to UTC; timezone syntax can be an expandable example rather than a new configuration form.

**States:** no repository access → GitHub access action; discovery pending → “Looking for workflow files…” only when known; zero workflows → new-file guide; incompatible five-minute candidate → explicit upgrade or cadence-change choice; marker invalid → exact file/line/message with an edit link; detected but paused → plan explanation; enabled → countdown; first dispatch → real evidence card; first error → persistent explanation and next action. A delayed detection message says “Still waiting for the change” and offers refresh/help, rather than claiming the push failed.

**Interactions:** copy all final text immediately; never type the actual copyable configuration letter by letter. A short changed-line reveal can introduce the guide once. When detection is observed, mark that step complete without collapsing the content while the user is reading. Offer “View workflow” when enabled; a small first-dispatch toast can celebrate the first real event. Simulated ticks must never appear as live account history.

### Public GitHub-lateness page

Keep this public and separate from account evidence. Its heading should read “GitHub scheduler benchmark”; add “Our probe repositories · Past 7 days · UTC · Updated [time]” and a signed-in “Back to dashboard” link. The existing explanation of its one-hour missing threshold is valuable; keep it beside the metric.

Use a labelled delay comparison chart by cadence with separate p50/p95 values and sample counts; retain the table as the precise accessible equivalent. “Never ran” should become “No run found within 1 hour”; an absent observed run is the claim supported by the method. Explain that this measures scheduled minute → GitHub run creation, whereas Cronkick’s dashboard measures due time → first dispatch attempt. Do not put the two percentages side by side as equivalent measurements. Keep a collecting state, a read-error state distinct from zero samples, and a freshness label; the current page says live measurement without a client refresh mechanism.

## 5. Real-time UX

**Update the instrument, not the whole scene.** Keep existing content, scroll, focus, input values and expanded inspectors while fetching. The current `router.refresh()` does not prove a full-page flash occurs; this is a required behavior to preserve, not an observed flash diagnosis.

- **Freshness:** header says “Updated 3s ago · refreshes every 5s”. Advance that timestamp only when fresh data has arrived. On initial loading say “Checking for updates…”. After 15 seconds without a successful visible-tab refresh show “Updates delayed”; after 60 seconds show “Data may be stale · Retry”. These describe the view, not the scheduler. Pause refresh work in hidden tabs and recheck on return.
- **Slot arrival:** key events by stable slot ID. Newest is rightmost in a strip; slide a genuinely new slot in over 180–220ms, then briefly brighten its outline. Pending → dispatching → final evidence recolours the same tick; do not append three ticks for one slot. Historical padding never animates as an event.
- **Counters:** update integer counts with a 150ms crossfade; do not roll percentages through invented intermediate values. Keep the denominator visible. Batch changes from one refresh into one transition.
- **Notifications:** show a small four-second “Dispatched owner/repo · workflow · first attempt +1.8s” toast for the viewed workflow, plus the first successful dispatch during onboarding. Do not toast every account-wide recurring dispatch. Aggregate background activity; keep problems in a persistent attention region. Do not announce job success when only dispatch is known.
- **History:** preserve the selected slot and table position. With older rows in view, show “N new slots” instead of inserting rows above the reader. Allow users to reveal them deliberately.
- **Accessibility:** only meaningful event changes enter an `aria-live="polite"` summary; do not announce every countdown second. Focus does not jump to new rows or toasts. With reduced motion, update immediately and retain a static outline to identify the change. Tick details must be available outside CSS hover pseudo-elements.

**Time handling:** store and render the absolute timestamp as the source of truth; relative labels recompute locally. Default to clearly labelled UTC throughout schedule setup. A Local/UTC display toggle may change rendered dates, never the cron timezone. Every relative time has an exact-date tooltip and a touch-accessible details equivalent; label times with their zone and include the date across day boundaries.

Show “in 10m” in rows, `02:14` in the next-slot card’s final five minutes, and an exact due time alongside it. At zero say “Due now · awaiting dispatch”; never decrement indefinitely into a negative countdown or fake the next slot’s success. Only show “Triggering…” when the observed state is dispatching. If updates are stale, keep the due time visible and suppress a confident live countdown. Use “No upcoming slot available” with a configuration/refresh explanation instead of an unexplained dash. “Last slot” means due time; “Last dispatch” means dispatch time; “Last run” requires a linked GitHub run.

**Evidence vocabulary:** pending = waiting/retrying before deadline; dispatching = request in progress; fired = GitHub accepted the dispatch, run not yet linked; accepted = GitHub run linked, not proof of completion; unknown = dispatch unconfirmed or rejected, with the recorded response explaining which; expired = stopped retrying at deadline; skipped = no dispatch, with a reason when available. Timing is first-attempt delay, not successful-response delay or runner start. A missing timestamp is “Timing unavailable”, never green on-time evidence. The existing strip’s null-delay treatment and overview aggregation disagree on this case; the redesigned display needs one explicit rule.

For the scorecard, use due times in `(now − 24h, now]`, excluding intentionally skipped slots and future slots. Show on-time confirmed dispatches over those eligible due slots, plus the counts still pending/dispatching, late, expired and unconfirmed so the fraction is auditable. State that unresolved slots remain in the denominator; do not silently drop ambiguous outcomes to improve the percentage. A matching period filter should let users inspect that exact set. No elapsed slots means “Waiting for first scheduled slot”, not 0% or an implied 100%.

## 6. Copy rewrites

| Before | After |
| --- | --- |
| “Ready to switch” | “Uses GitHub scheduling” · add “Requires Pro at this cadence” when applicable. |
| “Runs, last 24 h” | “Scheduled slots · past 24 hours” with helper “Due occasions, not completed GitHub jobs.” |
| “On time (≤ 30 s)” / “first trigger after due time” | “First attempt within 30s” · “x of y due slots. Measures Cronkick’s dispatch attempt, not runner start.” |
| “nothing missed in 24 h” | “0 expired · 0 unconfirmed dispatches” only when those counts are known; show pending and late separately. |
| “Last 48 slots” | “Recent scheduled slots · newest →” with actual date range and “Each tick is one due time.” |
| “Uses GitHub’s schedule:. To switch, remove that block, add workflow_dispatch: under on:, and paste these lines below it.” | “Replace this file’s schedule: trigger with the highlighted workflow_dispatch: block. Keep your existing jobs. Removing schedule: prevents duplicate triggers.” |
| “Faster than every 15 minutes won’t run on your plan.” | “This runs every 5 minutes. Free supports every 15 minutes or slower. Choose a 15-minute schedule or request Pro to keep this cadence.” |
| “Copy” | “Copy trigger block” for setup; “Copy marker” for a comment-only snippet; “Copy example workflow” for a complete new file. |
| “Cronkick reads the file on push. The workflow turns Active here, and every run gets a tick.” | “Push the change to [default branch]. Once Cronkick detects a valid marker, we’ll show the next due time. Each tick records what happened at one scheduled time.” |
| “Upgrade to Pro, $9/month” | “Request Pro by email · $9/month” · helper: “We’ll arrange activation by email.” |

Skipped implementation, tests, builds and live-browser interaction; this is a read-only design review plus the requested report file.
Risk: the screenshots do not establish actual run counts or current production behavior; metric and timing findings are grounded in the checked-in source and need confirmation against real records before publishing corrected numbers.

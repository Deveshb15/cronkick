---
title: "feat: Agent recipes with run receipts"
type: feat
status: active
date: 2026-11-14
origin: ../research/round16-agent-jobs.md (engineer prompt)
---

# feat: Agent recipes with run receipts

## Summary

Ship five copy-paste GitHub Actions workflows ("agent recipes") that run Claude Code or Codex in the user's own Actions, fired by Cronkick, with a token-free precheck for dedupe, turn and time caps, and a per-run receipt that Cronkick verifies (Actions OIDC) and shows on the history row. No new GitHub App permissions.

---

## Problem Frame

About 2,400 public workflows already run claude-code-action on GitHub's best-effort cron. Scheduled agents burn people three ways: missed runs, duplicate PRs, and a green check that did nothing. Cronkick already fires on time and never twice; recipes plus receipts point that at agent jobs (see origin: §1, §5).

---

## Requirements

- R1. Five recipes as data (`issue-triage`, `nightly-deps`, `docs-drift`, `flaky-tests`, `pr-digest`), each one marker, no `schedule:`, concurrency group, 30-min timeout, bot allow-list built from `GITHUB_APP_SLUG`, API key by default with the subscription token only as a comment.
- R2. Each recipe: precheck before the agent (key, run, reason), outputs tagged `cronkick:<slug>` with body marker, drafts only, receipt step that never fails the job.
- R3. Least privilege; recipes reading stranger-written text get `contents: read` and a tool allow-list.
- R4. `POST /receipts`: verify RS256 OIDC (iss, aud, exp/nbf ±60 s, cached JWKS), cap 2 KB, whitelist fields, store once on the slot Cronkick dispatched in that repo. 204 / 400 / 401 / 404.
- R5. Receipt visible as one line in the history row.
- R6. `workflows.agent` set during sync, no UI.
- R7. `/recipes`, `/recipes/[slug]` (repo picker, deep link, copy button), `/docs/recipes`, security and privacy updates. No "Claude Code" in page or feature names.
- R8. Never see, store or proxy model credentials; dispatch semantics unchanged.

---

## Key Technical Decisions

- **The agent never writes to GitHub or Slack.** A deterministic `apply` step does every write (PR, labels, comments, issue, Slack). Guarantees tagging, branch naming and draft status, and keeps agent tools to read/edit. Stronger than prompting the agent to tag.
- **Dedupe per recipe shape.** PR recipes: wait while a labelled PR is open, skip if `cronkick/<slug>/<key>` exists. Triage: the handled label excludes issues (the "wait on open labelled issue" rule would block forever). Digest: an Actions cache entry keyed by date marks "posted" (needs `actions: read`). Flaky-tests: today's marker in the one rolling issue.
- **JWKS source injected through `webApp` options** rather than `Deps`, so no other caller changes. Unknown kid refetches at most once a minute so random kids can't make Cronkick hammer GitHub. A JWKS outage returns 503, not 401.
- **Receipt URL check resolves `..` and compares case-insensitively** against the repo's stored `full_name`.
- **`/receipts` needs a Next rewrite** to the worker, like `/webhooks`; only the Next app is public.
- **Receipt changes notify the live dashboard** (`slots_notify` trigger gains `receipt`).
- **Migration number 011.** The parallel Rescue branch uses `012_rescue.sql`; the runner orders by filename and the two touch different columns.

---

## Implementation Units

### U1. Recipes as data

**Goal:** `RECIPES` with the five workflows built from one template.
**Requirements:** R1, R2, R3, R8
**Dependencies:** none
**Files:** `src/recipes.ts`, `test/recipes.test.ts`
**Approach:** Shared header, receipt step and draft-PR apply step; per-recipe `check`/`agent`/`apply` steps. All `${{ }}` values pass through `env`, never inline in scripts.
**Patterns to follow:** `src/compat.ts#checkWorkflow` as the acceptance gate.
**Test scenarios:**
- Each recipe parses; `checkWorkflow(yaml, 15)` gives 0 flags and exactly 1 marker matching `defaultCron`/`defaultTz`; `on` is only `workflow_dispatch`.
- Concurrency group, `timeout-minutes: 30`, step order check < agent < apply, receipt last with `if: always()` and `continue-on-error`.
- Claude: `allowed_bots`, `github_token`, API key, `--max-turns`/`--max-budget-usd`, `--allowedTools`; OAuth token only in a comment. Codex: `allow-bot-users: <slug>[bot]`.
- Page permissions equal the YAML `permissions:`; stranger-text recipes are `contents: read`.
- Custom slug and base URL flow into the bot allow-list and `CRONKICK`.
- Slugs unique and URL-safe.
**Verification:** recipe tests pass.

### U2. Receipts backend

**Goal:** verified, capped, once-only receipts on slots.
**Requirements:** R4, R8
**Dependencies:** none
**Files:** `migrations/011_receipts.sql`, `src/receipts.ts`, `src/web/app.ts`, `web/next.config.ts`, `test/receipts.test.ts`
**Approach:** node:crypto only. Size check before reading; token verified before the body is parsed; slot lookup joins active repo and non-removed installation; `UPDATE … WHERE receipt IS NULL`.
**Test scenarios:**
- Valid token + matching slot → 204, stored whitelisted fields; second POST → 204, unchanged.
- Wrong aud, wrong iss, expired beyond skew, nbf in the future, unknown kid, other key, tampered claims, malformed, missing header → 401, nothing stored. Expiry inside the 60 s skew → 204.
- Another installation's run id, a manual run, an inactive repo, a removed installation → 404.
- Oversize, bad outcome, other-repo URL, `..` traversal, `javascript:` URL, negative cost, non-number turns, wrong `v`, bad recipe name, invalid JSON → 400.
- Unknown kid refetch is rate-limited to once a minute.
**Verification:** receipts tests pass; migration applies on a fresh schema.

### U3. Receipt in history

**Goal:** "Opened PR · $0.84 · 22 turns", "Skipped: <reason>", "No changes", or nothing.
**Requirements:** R5
**Dependencies:** U2
**Files:** `web/lib/data.ts`, `web/lib/live.ts`, `web/components/history-table.tsx`, `test/dashboard.test.ts`, `test/receipts.test.ts`
**Approach:** `receipt` on `SlotView` (history already selects `*`); pure `receiptLine` in `live.ts`.
**Test scenarios:** history row with a receipt carries it, one without is null; `receiptLine` texts for pr, skipped with reason, noop with 1 turn, null.
**Verification:** dashboard and receipts tests pass.

### U4. Agent counter

**Goal:** `workflows.agent` = claude | codex | gh-aw | null.
**Requirements:** R6
**Dependencies:** U2 (migration)
**Files:** `src/sync.ts`, `test/sync.test.ts`
**Test scenarios:** claude, codex and gh-aw lock files detected on install; removing the action clears it on the next push.
**Verification:** sync tests pass.

### U5. Web pages and docs

**Goal:** public recipe pages and docs.
**Requirements:** R7, R8
**Dependencies:** U1
**Files:** `web/app/recipes/page.tsx`, `web/app/recipes/[slug]/page.tsx`, `web/components/add-to-repo.tsx`, `web/app/docs/recipes/page.tsx`, `web/lib/docs.ts`, `web/components/docs.tsx`, `web/app/docs/security/page.tsx`, `web/app/privacy/page.tsx`
**Approach:** Next 16 async `params`. Signed in: repos from the session's installations only. Security/privacy additions are standalone paragraphs so they merge cleanly with the Rescue branch's edits to the same pages.
**Test expectation:** none -- server pages and copy; covered by the web type check.
**Verification:** web type check passes.

---

## Scope Boundaries

- Not building: setup-PR flow or any permission change, Slack/Discord alerts, Cronkick-side budgets, hosted runners, credential storage, recipe editor, Jules import, auto re-runs, new plans, marketplace.

### Deferred to Follow-Up Work

- gh-aw markers read from the `.md` sibling (stretch). Needs one compiled lock file checked against `checkWorkflow` first.
- Rescue re-runs must exclude workflows with receipts or `workflows.agent` set (lives on the Rescue branch).
- A site header or footer link to `/recipes`.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Action input names or `execution_file` shape differ upstream | Live check on a scratch repo before announcing; receipt step tolerates missing stats |
| `value=` deep link unsupported or URL too long | Copy button always shown |
| Parallel Rescue branch edits the same pages | Non-adjacent hunks; simulate its rebase onto this branch before pushing |
| Shared local test DB (tests drop the schema) | Run this branch's tests on a separate database |

---

## Operational Notes

- Ship = push to main; CI type-checks, tests, builds, runs migrations at boot and deploys both droplets.
- `BASE_URL` is the OIDC audience and must match what recipes embed.

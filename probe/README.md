# Probe repos (PRD R16)

The public `/lateness` page runs the same workflow two ways in one repository and compares them:

- **GitHub's own `schedule:`**: `every-5.yml` (every 5 min) and `hourly.yml` (top of the hour, GitHub's busiest minute).
- **Its Cronkick twin**: `cronkick-5.yml` and `cronkick-hourly.yml`. These have the same job and the same cron, triggered by Cronkick through `workflow_dispatch`.

Both sides are measured the same way, from GitHub's own run list. Lateness is the time from the scheduled minute until GitHub *created* the run, so runner queue time isn't counted. A twin counts only runs the Cronkick app dispatched (`triggering_actor` is `<app slug>[bot]`), so clicking "Run workflow" by hand never counts. Each pair is compared over the same hours, from the later of the two sides' first runs to the last complete check, less an hour.

## Set up a probe repo

1. **Create the repo and make it public.** Public repos run Actions for free, and anyone can open the runs. The page links to them.
2. **Copy all four files** from `workflows/` into the repo's `.github/workflows/`. Keep the file names: the collector looks for these exact paths.
3. **Install the Cronkick app on the repo, on Pro.** The every-5-minutes twin is faster than Free allows, so on Free Cronkick flags it instead of running it. Until billing exists, set the probe installation's `plan` to `pro` in the database once.
4. **Server config:** set `PROBE_REPOS=owner/a,owner/b,...`. `PROBE_TOKEN` is a fine-grained token with **Actions: read** on those repos. Public repos work without it, but the token raises the rate limit.

The collector polls every 5 minutes.

## Keep it honest

- **Changing a repo's visibility restarts its sample.** Runs from before the change are dropped, so the numbers shown were always measured under the visibility shown.
- **Keep the repo active.** GitHub turns off scheduled workflows in public repos after 60 days without commits, so push an empty commit monthly. While a workflow is turned off, the page shows its pair as paused instead of counting misses. Turning it back on starts that workflow's sample over.
- **Mind young repos.** A single young repo is GitHub's worst case. More repos, including older ones, give a fairer picture. The page shows how many repos are measured, their visibility and the sample's start date.

## Cost

Public repos are free. In a private repo every run is billed as at least 1 minute. A `*/5` workflow costs about 8,640 minutes a month, so a private repo with both every-5 workflows needs about 17,000 minutes a month.

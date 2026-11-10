# Probe repos (PRD R16)

These measure GitHub's own scheduler for the public `/lateness` page. They don't use Ontime.

1. Create 4–6 repos: public and private, one brand new and one older. Example names: `ontime-probe-pub-new`, `ontime-probe-priv-old`.
2. Copy `workflows/every-5.yml` and `workflows/hourly.yml` into each repo's `.github/workflows/`. Keep the file names: the collector looks for these exact paths.
3. Create a fine-grained token with **Actions: read** on just those repos.
4. Set `PROBE_REPOS=owner/a,owner/b,...` and `PROBE_TOKEN=...` on the server.

The collector polls every 5 minutes. Lateness = when GitHub *created* the run minus the scheduled minute, so runner queue time isn't counted. A slot with no run after an hour counts as never ran.

Public repos switch their schedules off after 60 days without activity. Push an empty commit monthly, or re-enable them, to keep them running.

Cost: public repos are free. In private repos every run is billed as at least 1 minute, so `*/5` costs about 8,640 minutes a month per repo, more than GitHub Free's 2,000. Put only `hourly.yml` (about 720 minutes a month) in private probes, or budget for it.

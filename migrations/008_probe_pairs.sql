-- Cronkick twins next to the GitHub probes (/lateness compares each pair).
-- sample_from: when a probe repo's visibility last changed. Runs before it are dropped, so every published number
-- was measured under the visibility the page shows.
ALTER TABLE probe_health ADD COLUMN sample_from timestamptz;
-- Each probe workflow's state on GitHub. A workflow GitHub turned off (60 days without commits) is paused on the
-- page, never counted as runs GitHub skipped.
CREATE TABLE probe_workflows (
  repo       text NOT NULL,
  path       text NOT NULL,
  state      text NOT NULL,
  checked_at timestamptz NOT NULL,
  PRIMARY KEY (repo, path)
);

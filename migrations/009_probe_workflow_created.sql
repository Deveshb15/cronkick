-- When each probe workflow file was added (from GitHub's workflow list). A pair is measured from an hour after both
-- were added, so a side that never starts running is counted as not running, not left out of the window.
ALTER TABLE probe_workflows ADD COLUMN created_at timestamptz;

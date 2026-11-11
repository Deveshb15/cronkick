-- Workflows a user still runs on GitHub's own `schedule:` (candidates to move to Cronkick): what GitHub's scheduler
-- actually did for them, so the dashboard can show it for that workflow. Rows belong to the workflow and go with it.
-- schedule_watch.since is when measuring began (or restarted after the crons changed); last_complete_at only advances
-- after a read of GitHub's run list that reached it, so a lost webhook never reads as a skipped run.
CREATE TABLE schedule_watch (
  workflow_id      bigint PRIMARY KEY REFERENCES workflows(id) ON DELETE CASCADE,
  crons            text NOT NULL,
  since            timestamptz NOT NULL,
  last_complete_at timestamptz,
  last_error       text,
  last_error_at    timestamptz
);
CREATE TABLE schedule_runs (
  run_id      bigint PRIMARY KEY,
  workflow_id bigint NOT NULL REFERENCES schedule_watch(workflow_id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL
);
CREATE INDEX schedule_runs_workflow ON schedule_runs (workflow_id, created_at);

-- Cronkick Rescue: notice when GitHub's infrastructure (not the user's code) broke a run. v1a only reports (shadow).
-- checks_read: the installation granted Checks: read, so GitHub's own error annotations can be read.
ALTER TABLE installations
  ADD COLUMN rescue_mode text NOT NULL DEFAULT 'shadow' CHECK (rescue_mode IN ('off', 'shadow', 'rerun')),
  ADD COLUMN checks_read boolean NOT NULL DEFAULT false;

-- Per-workflow opt-in to re-runs (v1c) and why it can't be turned on (environments, reusable workflows, ...).
ALTER TABLE workflows
  ADD COLUMN rescue_rerun boolean NOT NULL DEFAULT false,
  ADD COLUMN rescue_blockers jsonb NOT NULL DEFAULT '[]';

-- One row per failed run attempt. workflow_id has no FK: runs of workflows Cronkick doesn't schedule are kept too.
-- jobs[].matched holds only the GitHub string that matched a rule; never other annotation text or logs.
CREATE TABLE rescue_runs (
  id               bigserial PRIMARY KEY,
  installation_id  bigint NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  repo_id          bigint NOT NULL,
  workflow_id      bigint NOT NULL,
  workflow_name    text NOT NULL,
  run_id           bigint NOT NULL,
  run_attempt      int NOT NULL,
  run_url          text NOT NULL,
  event            text NOT NULL,
  head_sha         text NOT NULL,
  head_branch      text,
  run_conclusion   text NOT NULL,
  completed_at     timestamptz NOT NULL,
  slot_id          bigint,
  state            text NOT NULL DEFAULT 'queued'
                   CHECK (state IN ('queued', 'classified', 'rerun_waiting', 'rerun_requested', 'rerun_unknown', 'rerun_rejected',
                                    'rerun_vanished', 'rerun_started', 'done', 'error')),
  verdict          text CHECK (verdict IN ('github_broke', 'probably_github', 'mixed', 'user', 'billing', 'self_hosted', 'not_started')),
  jobs             jsonb,
  would_rerun      boolean,
  skip_reason      text,
  next_check_at    timestamptz NOT NULL,
  attempts         int NOT NULL DEFAULT 0,
  lease_until      timestamptz,
  rerun_at         timestamptz,
  rerun_note       text,
  retry_conclusion text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, run_attempt)
);
CREATE INDEX rescue_runs_due ON rescue_runs (next_check_at) WHERE state IN ('queued', 'rerun_waiting', 'rerun_requested');
CREATE INDEX rescue_runs_installation ON rescue_runs (installation_id, completed_at DESC);
-- Circuit breakers count recent re-runs, per installation and platform-wide.
CREATE INDEX rescue_runs_reruns ON rescue_runs (rerun_at) WHERE rerun_at IS NOT NULL;

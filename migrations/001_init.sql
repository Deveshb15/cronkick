CREATE TABLE installations (
  id            bigint PRIMARY KEY,               -- GitHub installation id
  account_login text NOT NULL,
  account_type  text NOT NULL,                    -- User | Organization
  plan          text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  alert_email   text,
  suspended     boolean NOT NULL DEFAULT false,
  removed       boolean NOT NULL DEFAULT false,
  limit_email_sent_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE repos (
  id              bigint PRIMARY KEY,             -- GitHub repo id
  installation_id bigint NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
  full_name       text NOT NULL,
  default_branch  text NOT NULL,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workflows (
  id             bigint PRIMARY KEY,              -- GitHub workflow id
  repo_id        bigint NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  path           text NOT NULL,
  name           text NOT NULL,
  flags          jsonb NOT NULL DEFAULT '[]',     -- compatibility problems; non-empty = never activated
  suggested_diff text,
  present        boolean NOT NULL DEFAULT true,   -- false once the file is gone
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE schedules (
  id          bigserial PRIMARY KEY,
  workflow_id bigint NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  cron        text NOT NULL,
  tz          text NOT NULL DEFAULT 'UTC',
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused_limit')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, cron, tz)
);

CREATE TABLE slots (
  id              bigserial PRIMARY KEY,
  installation_id bigint NOT NULL,
  repo_id         bigint NOT NULL,
  workflow_id     bigint NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  due_at          timestamptz NOT NULL,
  fire_at         timestamptz NOT NULL,           -- due_at + top-of-hour jitter
  deadline_at     timestamptz NOT NULL,
  state           text NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending', 'dispatching', 'fired', 'accepted', 'unknown', 'expired', 'skipped')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL,
  lease_until     timestamptz,
  first_attempt_at timestamptz,
  fired_at        timestamptz,
  response_status int,
  response_note   text,
  run_id          bigint,
  run_url         text,
  matched_by      text CHECK (matched_by IN ('run_id', 'time')),
  conclusion      text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, repo_id, workflow_id, due_at)
);
CREATE INDEX slots_due ON slots (next_attempt_at) WHERE state = 'pending';
CREATE INDEX slots_workflow ON slots (workflow_id, due_at DESC);

CREATE TABLE alerts_sent (
  key     text PRIMARY KEY,                       -- e.g. "expired:<slot id>"
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE probe_runs (
  run_id     bigint PRIMARY KEY,
  repo       text NOT NULL,
  workflow   text NOT NULL,
  cron       text NOT NULL,
  due_at     timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  UNIQUE (repo, workflow, due_at)
);

-- GitHub refusing a trigger (a non-retryable 4xx) is its own state. Existing rows are not reclassified:
-- an old `unknown` with a 4xx may have been a retry that later timed out.
ALTER TABLE slots DROP CONSTRAINT slots_state_check;
ALTER TABLE slots ADD CONSTRAINT slots_state_check
  CHECK (state IN ('pending', 'dispatching', 'fired', 'accepted', 'unknown', 'rejected', 'expired', 'skipped'));

-- How far ahead slots have been planned. One row; NULL until the first planning pass after this deploy.
CREATE TABLE planner (
  id            boolean PRIMARY KEY DEFAULT true CHECK (id),
  planned_until timestamptz
);
INSERT INTO planner DEFAULT VALUES;

-- A stretch Cronkick wasn't planning, so no slots exist for it: (started_at, ended_at].
CREATE TABLE coverage_gaps (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now()
);

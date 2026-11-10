-- When GitHub actually started the job's runner and when the job finished, from workflow_run webhooks.
ALTER TABLE slots ADD COLUMN run_started_at timestamptz, ADD COLUMN run_completed_at timestamptz;
-- "Keep it on GitHub": hide a workflow that still uses schedule: from the move-it-over list.
ALTER TABLE workflows ADD COLUMN dismissed_at timestamptz;
-- Runner and finish times change what the dashboard shows, so they notify too.
DROP TRIGGER slots_notify ON slots;
CREATE TRIGGER slots_notify AFTER UPDATE OF state, first_attempt_at, run_id, conclusion, run_started_at, run_completed_at ON slots
  FOR EACH ROW EXECUTE FUNCTION notify_installation();

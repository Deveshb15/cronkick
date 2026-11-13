-- Agent recipes. The receipt a recipe's last step posts about its run (src/receipts.ts), first one wins.
ALTER TABLE slots ADD COLUMN receipt jsonb, ADD COLUMN receipt_at timestamptz;
-- Receipts and workflow_run webhooks both find their slot by run id.
CREATE INDEX slots_run ON slots (run_id) WHERE run_id IS NOT NULL;
-- Which agent action a workflow file uses, from the text sync already reads. For sizing only; no UI.
ALTER TABLE workflows ADD COLUMN agent text CHECK (agent IN ('claude', 'codex', 'gh-aw'));
-- A receipt changes the history row, so it notifies the live dashboard too.
DROP TRIGGER slots_notify ON slots;
CREATE TRIGGER slots_notify AFTER UPDATE OF state, first_attempt_at, run_id, conclusion, run_started_at, run_completed_at, receipt ON slots
  FOR EACH ROW EXECUTE FUNCTION notify_installation();

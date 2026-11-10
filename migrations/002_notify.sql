-- Live dashboard: tell every web server which installation changed (channel cronkick_changes, payload = installation id).
-- Postgres folds identical notifications sent in one transaction, so a batch of row changes sends one message.
CREATE FUNCTION notify_installation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  r record;
  inst bigint;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; ELSE r := NEW; END IF;
  IF TG_TABLE_NAME = 'installations' THEN
    inst := r.id;
  ELSIF TG_TABLE_NAME IN ('repos', 'slots') THEN
    inst := r.installation_id;
  ELSIF TG_TABLE_NAME = 'workflows' THEN
    SELECT installation_id INTO inst FROM repos WHERE id = r.repo_id;
  ELSIF TG_TABLE_NAME = 'schedules' THEN
    SELECT p.installation_id INTO inst FROM workflows w JOIN repos p ON p.id = w.repo_id WHERE w.id = r.workflow_id;
  END IF;
  IF inst IS NOT NULL THEN PERFORM pg_notify('cronkick_changes', inst::text); END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER installations_notify AFTER UPDATE ON installations FOR EACH ROW EXECUTE FUNCTION notify_installation();
CREATE TRIGGER repos_notify AFTER INSERT OR UPDATE OR DELETE ON repos FOR EACH ROW EXECUTE FUNCTION notify_installation();
CREATE TRIGGER workflows_notify AFTER INSERT OR UPDATE OR DELETE ON workflows FOR EACH ROW EXECUTE FUNCTION notify_installation();
CREATE TRIGGER schedules_notify AFTER INSERT OR UPDATE OR DELETE ON schedules FOR EACH ROW EXECUTE FUNCTION notify_installation();
-- Slots: only outcome changes. New future slots and pruning old ones don't change what the dashboard shows.
CREATE TRIGGER slots_notify AFTER UPDATE OF state, first_attempt_at, run_id, conclusion ON slots FOR EACH ROW EXECUTE FUNCTION notify_installation();

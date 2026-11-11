-- Before a repo's first complete check, paging stops at the newest run stored *before* that first attempt.
-- It is saved once, so runs imported by a partial attempt can never move it (and so never fake a complete check).
-- NULL on a row means there was nothing stored then: page to the end. Rows from before this column page to the end too.
ALTER TABLE probe_health ADD COLUMN bootstrap_at timestamptz;

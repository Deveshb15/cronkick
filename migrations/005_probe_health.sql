-- One row per probe repo, so /lateness can say how fresh and complete its sample is.
-- last_success_at only advances when every page of a check succeeded and paging ended before the cap;
-- slots after it (minus the grace hour) aren't counted, so a failed or partial check never reads as a GitHub miss.
CREATE TABLE probe_health (
  repo            text PRIMARY KEY,
  private         boolean,
  last_attempt_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_error      text,
  last_error_at   timestamptz
);

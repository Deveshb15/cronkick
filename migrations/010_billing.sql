-- Self-serve billing through Dodo Payments. Team is the organizations' paid plan; Pro stays the personal one.
ALTER TABLE installations DROP CONSTRAINT installations_plan_check;
ALTER TABLE installations ADD CONSTRAINT installations_plan_check CHECK (plan IN ('free', 'pro', 'team'));

-- The Dodo subscription behind a paid plan. An installation without one (a comp set by scripts/set-plan.ts) is never
-- touched by billing. paid_through: what the customer has paid for; a cancelled subscription keeps its plan until then.
ALTER TABLE installations
  ADD COLUMN dodo_customer_id     text,
  ADD COLUMN dodo_subscription_id text,
  ADD COLUMN subscription_status  text,
  ADD COLUMN paid_through         timestamptz,
  ADD COLUMN billing_updated_at   timestamptz; -- timestamp of the last applied event, so an older one can't undo a newer

CREATE UNIQUE INDEX installations_dodo_subscription ON installations (dodo_subscription_id) WHERE dodo_subscription_id IS NOT NULL;

-- Each Dodo webhook delivery once (its webhook-id), so a retried delivery is a no-op.
CREATE TABLE billing_events (
  webhook_id  text PRIMARY KEY,
  type        text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

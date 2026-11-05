-- CERTIS membership history supplement. Apply AFTER billing/migrations/001.
-- All changes remain TEST-ONLY and require independently reconciled events.
BEGIN;
CREATE TABLE IF NOT EXISTS certis_billing.membership_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES certis_billing.accounts(id),
 stripe_event_id text NOT NULL UNIQUE REFERENCES certis_billing.stripe_events(event_id),
 stripe_subscription_id text NOT NULL,
 previous_tier text,
 next_tier text NOT NULL REFERENCES certis_billing.plans(tier),
 previous_state text,
 next_state text NOT NULL,
 stripe_created bigint NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS immutable_membership_history ON certis_billing.membership_history;
CREATE TRIGGER immutable_membership_history BEFORE UPDATE OR DELETE
 ON certis_billing.membership_history FOR EACH ROW EXECUTE FUNCTION certis_billing.block_history_change();

-- Reconciliation worker must FIRST independently fetch the subscription using
-- authenticated sk_test_ credentials; this function NEVER contacts Stripe.
-- The signed event journal is evidence of receipt, not of an invoice payment.
CREATE OR REPLACE FUNCTION certis_billing.apply_verified_subscription(
 p_account uuid,p_event_id text,p_subscription_id text,p_price_id text,
 p_state text,p_period_end timestamptz
) RETURNS text LANGUAGE plpgsql SET search_path=certis_billing,pg_temp AS $$
DECLARE
 a accounts%ROWTYPE; m memberships%ROWTYPE; plan_row plans%ROWTYPE;
 e stripe_events%ROWTYPE; existed boolean; prior membership_history%ROWTYPE;
BEGIN
 SELECT * INTO a FROM accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND OR a.stripe_customer_id IS NULL OR
  p_subscription_id IS NULL OR p_subscription_id !~ '^sub_[A-Za-z0-9]+$' OR
  p_state NOT IN ('pending','active','past_due','canceled','unpaid','paused','incomplete') THEN
  RAISE EXCEPTION 'MEMBERSHIP_RECONCILIATION_DENIED';
 END IF;
 SELECT * INTO e FROM stripe_events WHERE event_id=p_event_id AND livemode=false
  AND processing_state='held' AND event_type IN
  ('customer.subscription.created','customer.subscription.updated','customer.subscription.deleted');
 IF NOT FOUND THEN RAISE EXCEPTION 'SIGNED_SUBSCRIPTION_EVENT_REQUIRED'; END IF;
 SELECT * INTO plan_row FROM plans WHERE stripe_test_price_id=p_price_id AND enabled=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'APPROVED_TEST_PRICE_REQUIRED'; END IF;
 IF p_state='active' AND (p_period_end IS NULL OR p_period_end<=now()) THEN
  RAISE EXCEPTION 'CURRENT_BILLING_PERIOD_REQUIRED';
 END IF;
 SELECT * INTO prior FROM membership_history WHERE stripe_event_id=p_event_id;
 IF FOUND THEN
  IF prior.account_id<>p_account OR prior.stripe_subscription_id<>p_subscription_id OR
     prior.next_tier<>plan_row.tier OR prior.next_state<>p_state THEN
   RAISE EXCEPTION 'MEMBERSHIP_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN 'already_recorded';
 END IF;
 SELECT * INTO m FROM memberships WHERE account_id=p_account FOR UPDATE;
 existed:=FOUND;
 IF existed AND e.stripe_created<=m.last_event_created THEN RETURN 'older_event_held'; END IF;
 IF existed AND m.stripe_subscription_id IS NOT NULL AND m.stripe_subscription_id<>p_subscription_id
  AND m.state NOT IN ('canceled','incomplete') THEN RAISE EXCEPTION 'SUBSCRIPTION_IDENTITY_CONFLICT'; END IF;
 INSERT INTO memberships(account_id,stripe_subscription_id,tier,state,current_period_end,last_event_created,last_event_id)
 VALUES(p_account,p_subscription_id,plan_row.tier,p_state,p_period_end,e.stripe_created,p_event_id)
 ON CONFLICT(account_id) DO UPDATE SET
 stripe_subscription_id=EXCLUDED.stripe_subscription_id,tier=EXCLUDED.tier,
 state=EXCLUDED.state,current_period_end=EXCLUDED.current_period_end,
 last_event_created=EXCLUDED.last_event_created,last_event_id=EXCLUDED.last_event_id,
 updated_at=now();
 INSERT INTO membership_history(account_id,stripe_event_id,stripe_subscription_id,
  previous_tier,next_tier,previous_state,next_state,stripe_created)
 VALUES(p_account,p_event_id,p_subscription_id,
  CASE WHEN existed THEN m.tier ELSE NULL END,plan_row.tier,
  CASE WHEN existed THEN m.state ELSE NULL END,p_state,e.stripe_created);
 RETURN 'applied_test_state';
END $$;
REVOKE ALL ON certis_billing.membership_history FROM PUBLIC;
REVOKE ALL ON SEQUENCE certis_billing.membership_history_id_seq FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION certis_billing.apply_verified_subscription(uuid,text,text,text,text,timestamptz) FROM PUBLIC;
COMMIT;

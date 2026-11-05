-- CERTIS billing v1. PostgreSQL 15+; TEST MODE ONLY until separately qualified.
-- Run in a dedicated CERTIS billing database, NOT the Render session Redis.
-- Deploy with a migration owner. NO table drops or destructive rollback.
BEGIN;
CREATE SCHEMA IF NOT EXISTS certis_billing;
REVOKE ALL ON SCHEMA certis_billing FROM PUBLIC;

CREATE TABLE IF NOT EXISTS certis_billing.accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 principal_sha256 char(64) NOT NULL UNIQUE CHECK (principal_sha256 ~ '^[a-f0-9]{64}$'),
 stripe_customer_id text UNIQUE CHECK (stripe_customer_id IS NULL OR stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
 financial_hold boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS certis_billing.plans (
 tier text PRIMARY KEY CHECK(tier IN ('certis','gold','platinum')),
 price_cents integer NOT NULL CHECK(price_cents > 0),
 currency text NOT NULL DEFAULT 'usd' CHECK(currency='usd'),
 interval text NOT NULL DEFAULT 'month' CHECK(interval='month'),
 stripe_test_price_id text UNIQUE,
 credits_per_cycle integer CHECK(credits_per_cycle BETWEEN 0 AND 10000),
 enabled boolean NOT NULL DEFAULT false,
 CHECK (NOT enabled OR (stripe_test_price_id IS NOT NULL AND credits_per_cycle IS NOT NULL))
);
INSERT INTO certis_billing.plans(tier,price_cents) VALUES
 ('certis',14900),('gold',24900),('platinum',44900)
ON CONFLICT (tier) DO NOTHING;

CREATE TABLE IF NOT EXISTS certis_billing.memberships (
 account_id uuid PRIMARY KEY REFERENCES certis_billing.accounts(id),
 stripe_subscription_id text UNIQUE,
 tier text REFERENCES certis_billing.plans(tier),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','active','past_due','canceled','unpaid','paused','incomplete')),
 current_period_end timestamptz,
 last_event_created bigint NOT NULL DEFAULT 0 CHECK(last_event_created>=0),
 last_event_id text,
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Event receipt is independent of granting credits. No raw Stripe payload/PII.
CREATE TABLE IF NOT EXISTS certis_billing.stripe_events (
 event_id text PRIMARY KEY CHECK(event_id ~ '^evt_[A-Za-z0-9]+$'),
 event_type text NOT NULL,
 payload_sha256 char(64) NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 stripe_created bigint NOT NULL CHECK(stripe_created>0),
 livemode boolean NOT NULL DEFAULT false CHECK(livemode=false),
 processing_state text NOT NULL CHECK(processing_state IN ('applied','held','ignored')),
 reason_code text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS certis_billing.credit_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES certis_billing.accounts(id),
 source_kind text NOT NULL CHECK(source_kind IN ('subscription_invoice','one_time_invoice')),
 source_key text NOT NULL UNIQUE,
 units_total integer NOT NULL CHECK(units_total>0),
 units_available integer NOT NULL CHECK(units_available>=0),
 units_reserved integer NOT NULL DEFAULT 0 CHECK(units_reserved>=0),
 units_consumed integer NOT NULL DEFAULT 0 CHECK(units_consumed>=0),
 units_revoked integer NOT NULL DEFAULT 0 CHECK(units_revoked>=0),
 state text NOT NULL DEFAULT 'valid' CHECK(state IN ('valid','reversed','disputed')),
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,account_id),
 CHECK(units_available+units_reserved+units_consumed+units_revoked=units_total)
);
CREATE INDEX IF NOT EXISTS credit_grants_account_fifo
 ON certis_billing.credit_grants(account_id,created_at,id)
 WHERE state='valid' AND units_available>0;

CREATE TABLE IF NOT EXISTS certis_billing.reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES certis_billing.accounts(id),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 units integer NOT NULL CHECK(units>0 AND units<=1000),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','consumed','released')),
 report_sha256 char(64) CHECK(report_sha256 IS NULL OR report_sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 UNIQUE(account_id,request_key),
 UNIQUE(id,account_id)
);
CREATE TABLE IF NOT EXISTS certis_billing.allocations (
 reservation_id uuid NOT NULL,
 account_id uuid NOT NULL,
 grant_id uuid NOT NULL,
 units integer NOT NULL CHECK(units>0),
 PRIMARY KEY(reservation_id,grant_id),
 FOREIGN KEY(reservation_id,account_id) REFERENCES certis_billing.reservations(id,account_id),
 FOREIGN KEY(grant_id,account_id) REFERENCES certis_billing.credit_grants(id,account_id)
);

CREATE TABLE IF NOT EXISTS certis_billing.credit_ledger (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES certis_billing.accounts(id),
 grant_id uuid NOT NULL REFERENCES certis_billing.credit_grants(id),
 reservation_id uuid REFERENCES certis_billing.reservations(id),
 operation text NOT NULL CHECK(operation IN ('grant','reserve','consume','release','revoke')),
 units integer NOT NULL CHECK(units>0),
 operation_key text NOT NULL UNIQUE,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS credit_ledger_account_idx ON certis_billing.credit_ledger(account_id,id);
CREATE TABLE IF NOT EXISTS certis_billing.adjustments (
 adjustment_key text PRIMARY KEY,
 account_id uuid NOT NULL REFERENCES certis_billing.accounts(id),
 grant_id uuid NOT NULL REFERENCES certis_billing.credit_grants(id),
 reason text NOT NULL CHECK(reason IN ('refund','dispute','cancellation_reconciliation','dispute_reversed')),
 consumed_at_adjustment integer NOT NULL CHECK(consumed_at_adjustment>=0),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
-- Append-only: corrections must be new transactions, not rewritten history.
CREATE OR REPLACE FUNCTION certis_billing.block_history_change() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'IMMUTABLE_BILLING_HISTORY'; END $$;
DROP TRIGGER IF EXISTS immutable_credit_ledger ON certis_billing.credit_ledger;
CREATE TRIGGER immutable_credit_ledger BEFORE UPDATE OR DELETE ON certis_billing.credit_ledger
FOR EACH ROW EXECUTE FUNCTION certis_billing.block_history_change();
DROP TRIGGER IF EXISTS immutable_adjustments ON certis_billing.adjustments;
CREATE TRIGGER immutable_adjustments BEFORE UPDATE OR DELETE ON certis_billing.adjustments
FOR EACH ROW EXECUTE FUNCTION certis_billing.block_history_change();
DROP TRIGGER IF EXISTS immutable_stripe_events ON certis_billing.stripe_events;
CREATE TRIGGER immutable_stripe_events BEFORE UPDATE OR DELETE ON certis_billing.stripe_events
FOR EACH ROW EXECUTE FUNCTION certis_billing.block_history_change();

CREATE OR REPLACE VIEW certis_billing.wallet_balances AS
SELECT a.id AS account_id,
 COALESCE(SUM(g.units_available) FILTER (WHERE g.state='valid' AND (g.expires_at IS NULL OR g.expires_at>now())),0)::bigint AS available,
 COALESCE(SUM(g.units_reserved),0)::bigint AS reserved,
 COALESCE(SUM(g.units_consumed),0)::bigint AS consumed,
 COALESCE(SUM(g.units_revoked),0)::bigint AS revoked,
 a.financial_hold
FROM certis_billing.accounts a LEFT JOIN certis_billing.credit_grants g ON g.account_id=a.id
GROUP BY a.id,a.financial_hold;

-- Every mutating operation MUST lock the account row first. Credit transitions
-- are a single PostgreSQL transaction; Redis never decides credit balances.
CREATE OR REPLACE FUNCTION certis_billing.grant_credits(
 p_account uuid,p_source_kind text,p_source_key text,p_units integer,p_expires_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path=certis_billing,pg_temp AS $$
DECLARE g uuid; a uuid;
BEGIN
 SELECT id INTO a FROM accounts WHERE id=p_account FOR UPDATE;
 IF a IS NULL OR p_units IS NULL OR p_units<1 OR p_units>10000 OR p_source_kind NOT IN ('subscription_invoice','one_time_invoice')
 OR p_source_key IS NULL OR length(p_source_key)<8 THEN RAISE EXCEPTION 'GRANT_INVALID'; END IF;
 SELECT id INTO g FROM credit_grants WHERE source_key=p_source_key;
 IF g IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM credit_grants WHERE id=g AND account_id=p_account AND units_total=p_units AND source_kind=p_source_kind AND expires_at IS NOT DISTINCT FROM p_expires_at)
  THEN RAISE EXCEPTION 'GRANT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN g;
 END IF;
 INSERT INTO credit_grants(account_id,source_kind,source_key,units_total,units_available,expires_at)
 VALUES(p_account,p_source_kind,p_source_key,p_units,p_units,p_expires_at) RETURNING id INTO g;
 INSERT INTO credit_ledger(account_id,grant_id,operation,units,operation_key)
 VALUES(p_account,g,'grant',p_units,'grant:'||p_source_key);
 RETURN g;
END $$;

CREATE OR REPLACE FUNCTION certis_billing.reserve_credits(
 p_account uuid,p_request_key text,p_units integer
) RETURNS uuid LANGUAGE plpgsql SET search_path=certis_billing,pg_temp AS $$
DECLARE a accounts%ROWTYPE; r reservations%ROWTYPE; g credit_grants%ROWTYPE; left_units integer; take_units integer;
BEGIN
 SELECT * INTO a FROM accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND OR a.financial_hold OR p_units IS NULL OR p_units<1 OR p_units>1000
 OR p_request_key IS NULL OR length(p_request_key) NOT BETWEEN 8 AND 160
 THEN RAISE EXCEPTION 'RESERVATION_DENIED'; END IF;
 SELECT * INTO r FROM reservations WHERE account_id=p_account AND request_key=p_request_key;
 IF FOUND THEN
  IF r.units<>p_units THEN RAISE EXCEPTION 'RESERVATION_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN r.id;
 END IF;
 IF (SELECT COALESCE(SUM(units_available),0) FROM credit_grants WHERE account_id=p_account AND state='valid'
  AND (expires_at IS NULL OR expires_at>now()))<p_units THEN RAISE EXCEPTION 'CREDITS_INSUFFICIENT'; END IF;
 INSERT INTO reservations(account_id,request_key,units) VALUES(p_account,p_request_key,p_units) RETURNING * INTO r;
 left_units:=p_units;
 FOR g IN SELECT * FROM credit_grants WHERE account_id=p_account AND state='valid' AND units_available>0
  AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at,id FOR UPDATE LOOP
  take_units:=LEAST(left_units,g.units_available);
  UPDATE credit_grants SET units_available=units_available-take_units,units_reserved=units_reserved+take_units WHERE id=g.id;
  INSERT INTO allocations(reservation_id,account_id,grant_id,units) VALUES(r.id,p_account,g.id,take_units);
  INSERT INTO credit_ledger(account_id,grant_id,reservation_id,operation,units,operation_key)
  VALUES(p_account,g.id,r.id,'reserve',take_units,'reserve:'||r.id||':'||g.id);
  left_units:=left_units-take_units; EXIT WHEN left_units=0;
 END LOOP;
 IF left_units<>0 THEN RAISE EXCEPTION 'RESERVATION_INCOMPLETE'; END IF;
 RETURN r.id;
END $$;

CREATE OR REPLACE FUNCTION certis_billing.finish_credits(
 p_account uuid,p_request_key text,p_action text,p_report_sha256 text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path=certis_billing,pg_temp AS $$
DECLARE a uuid; r reservations%ROWTYPE; x allocations%ROWTYPE; next_state text;
BEGIN
 SELECT id INTO a FROM accounts WHERE id=p_account FOR UPDATE;
 IF a IS NULL OR p_action NOT IN ('consume','release') THEN RAISE EXCEPTION 'FINISH_INVALID'; END IF;
 SELECT * INTO r FROM reservations WHERE account_id=p_account AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RESERVATION_UNKNOWN'; END IF;
 next_state:=CASE WHEN p_action='consume' THEN 'consumed' ELSE 'released' END;
 IF r.state=next_state THEN
  IF p_action='consume' AND r.report_sha256 IS DISTINCT FROM p_report_sha256 THEN RAISE EXCEPTION 'REPORT_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN next_state;
 END IF;
 IF r.state<>'reserved' THEN RAISE EXCEPTION 'RESERVATION_TERMINAL'; END IF;
 IF p_action='consume' AND (p_report_sha256 IS NULL OR p_report_sha256 !~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'VERIFIED_REPORT_REQUIRED'; END IF;
 FOR x IN SELECT * FROM allocations WHERE reservation_id=r.id ORDER BY grant_id LOOP
  IF p_action='consume' THEN
   UPDATE credit_grants SET units_reserved=units_reserved-x.units,units_consumed=units_consumed+x.units WHERE id=x.grant_id;
  ELSE
   UPDATE credit_grants SET units_reserved=units_reserved-x.units,units_available=units_available+x.units WHERE id=x.grant_id;
  END IF;
  INSERT INTO credit_ledger(account_id,grant_id,reservation_id,operation,units,operation_key)
  VALUES(p_account,x.grant_id,r.id,p_action,x.units,p_action||':'||r.id||':'||x.grant_id);
 END LOOP;
 UPDATE reservations SET state=next_state,report_sha256=CASE WHEN p_action='consume' THEN p_report_sha256 ELSE NULL END,
 finished_at=now() WHERE id=r.id;
 RETURN next_state;
END $$;

-- Refund/dispute bookkeeping revokes unused credits, releases in-flight work
-- first, and holds the account if already-consumed units require human review.
CREATE OR REPLACE FUNCTION certis_billing.reverse_grant(
 p_account uuid,p_source_key text,p_adjustment_key text,p_reason text
) RETURNS text LANGUAGE plpgsql SET search_path=certis_billing,pg_temp AS $$
DECLARE a accounts%ROWTYPE;g credit_grants%ROWTYPE;r record; to_revoke integer;
BEGIN
 SELECT * INTO a FROM accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND OR p_reason NOT IN ('refund','dispute','cancellation_reconciliation') OR length(COALESCE(p_adjustment_key,''))<8
 THEN RAISE EXCEPTION 'REVERSAL_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM adjustments WHERE adjustment_key=p_adjustment_key AND account_id=p_account AND reason=p_reason)
 THEN RETURN 'already_recorded'; END IF;
 IF EXISTS(SELECT 1 FROM adjustments WHERE adjustment_key=p_adjustment_key) THEN RAISE EXCEPTION 'REVERSAL_IDEMPOTENCY_CONFLICT'; END IF;
 SELECT * INTO g FROM credit_grants WHERE account_id=p_account AND source_key=p_source_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRANT_UNKNOWN'; END IF;
 FOR r IN SELECT DISTINCT res.request_key FROM reservations res JOIN allocations al ON al.reservation_id=res.id
  WHERE al.grant_id=g.id AND res.state='reserved' LOOP
  PERFORM finish_credits(p_account,r.request_key,'release');
 END LOOP;
 SELECT * INTO g FROM credit_grants WHERE id=g.id;
 to_revoke:=g.units_available;
 UPDATE credit_grants SET units_available=0,units_revoked=units_revoked+to_revoke,
 state=CASE WHEN p_reason='dispute' THEN 'disputed' ELSE 'reversed' END WHERE id=g.id;
 IF to_revoke>0 THEN
 INSERT INTO credit_ledger(account_id,grant_id,operation,units,operation_key)
 VALUES(p_account,g.id,'revoke',to_revoke,'revoke:'||p_adjustment_key);
 END IF;
 IF g.units_consumed>0 OR p_reason='dispute' THEN
  UPDATE accounts SET financial_hold=true WHERE id=p_account;
 END IF;
 INSERT INTO adjustments(adjustment_key,account_id,grant_id,reason,consumed_at_adjustment)
 VALUES(p_adjustment_key,p_account,g.id,p_reason,g.units_consumed);
 RETURN 'reversed';
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA certis_billing FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA certis_billing FROM PUBLIC;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA certis_billing FROM PUBLIC;
COMMIT;

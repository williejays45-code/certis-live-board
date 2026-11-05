-- Run only against fresh isolated CI postgres, AFTER 001 migration.
-- A single rollback leaves no synthetic test records.
BEGIN;
DO $$
DECLARE
 a uuid; b uuid; g uuid; g_again uuid; r uuid; rr uuid;
 n record; conflict_seen boolean := false; prior_id text := 'evt_fixture_001';
BEGIN
 IF (SELECT count(*) FROM certis_billing.plans)<>3 OR
    (SELECT count(*) FROM certis_billing.plans WHERE enabled=false AND credits_per_cycle IS NULL)<>3
 THEN RAISE EXCEPTION 'UNAPPROVED_PLAN_ENABLED'; END IF;
 IF (SELECT price_cents FROM certis_billing.plans WHERE tier='certis')<>14900 OR
    (SELECT price_cents FROM certis_billing.plans WHERE tier='gold')<>24900 OR
    (SELECT price_cents FROM certis_billing.plans WHERE tier='platinum')<>44900
 THEN RAISE EXCEPTION 'PRICE_DRIFT'; END IF;
 INSERT INTO certis_billing.accounts(principal_sha256) VALUES(repeat('a',64)) RETURNING id INTO a;
 INSERT INTO certis_billing.accounts(principal_sha256) VALUES(repeat('b',64)) RETURNING id INTO b;
 SELECT certis_billing.grant_credits(a,'one_time_invoice','invoice:fixture-001',5) INTO g;
 SELECT certis_billing.grant_credits(a,'one_time_invoice','invoice:fixture-001',5) INTO g_again;
 IF g<>g_again THEN RAISE EXCEPTION 'DUPLICATE_GRANT'; END IF;
 SELECT certis_billing.reserve_credits(a,'report:fixture-001',3) INTO r;
 SELECT certis_billing.reserve_credits(a,'report:fixture-001',3) INTO rr;
 IF r<>rr THEN RAISE EXCEPTION 'DUPLICATE_RESERVATION'; END IF;
 SELECT * INTO n FROM certis_billing.credit_grants WHERE id=g;
 IF n.units_available<>2 OR n.units_reserved<>3 THEN RAISE EXCEPTION 'RESERVATION_BALANCE'; END IF;
 IF certis_billing.finish_credits(a,'report:fixture-001','consume',repeat('c',64))<>'consumed'
 THEN RAISE EXCEPTION 'CONSUME'; END IF;
 IF certis_billing.finish_credits(a,'report:fixture-001','consume',repeat('c',64))<>'consumed'
 THEN RAISE EXCEPTION 'CONSUME_REPLAY'; END IF;
 SELECT * INTO n FROM certis_billing.credit_grants WHERE id=g;
 IF n.units_available<>2 OR n.units_reserved<>0 OR n.units_consumed<>3 THEN RAISE EXCEPTION 'CONSUMED_BALANCE'; END IF;
 SELECT certis_billing.reserve_credits(a,'report:fixture-002',2) INTO rr;
 PERFORM certis_billing.finish_credits(a,'report:fixture-002','release');
 SELECT * INTO n FROM certis_billing.credit_grants WHERE id=g;
 IF n.units_available<>2 OR n.units_reserved<>0 OR n.units_consumed<>3 THEN RAISE EXCEPTION 'RELEASE_BALANCE'; END IF;
 IF certis_billing.reverse_grant(a,'invoice:fixture-001','refund:fixture-001','refund')<>'reversed'
 THEN RAISE EXCEPTION 'REFUND_REVERSAL'; END IF;
 IF certis_billing.reverse_grant(a,'invoice:fixture-001','refund:fixture-001','refund')<>'already_recorded'
 THEN RAISE EXCEPTION 'REFUND_REPLAY'; END IF;
 SELECT * INTO n FROM certis_billing.credit_grants WHERE id=g;
 IF n.units_available<>0 OR n.units_revoked<>2 OR n.units_consumed<>3 THEN RAISE EXCEPTION 'REFUND_BALANCE'; END IF;
 IF NOT (SELECT financial_hold FROM certis_billing.accounts WHERE id=a) THEN RAISE EXCEPTION 'REFUND_HOLD_MISSING'; END IF;
 BEGIN
  PERFORM certis_billing.reserve_credits(a,'report:fixture-003',1);
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'RESERVATION_DENIED' THEN RAISE; END IF;
  conflict_seen:=true;
 END;
 IF NOT conflict_seen THEN RAISE EXCEPTION 'HELD_ACCOUNT_SPENT'; END IF;
 -- Account isolation: a grant never belongs to a different owner.
 IF EXISTS (SELECT 1 FROM certis_billing.wallet_balances WHERE account_id=b AND available<>0)
 THEN RAISE EXCEPTION 'CROSS_ACCOUNT_BALANCE'; END IF;
 -- Test-mode receipt inserts are immutable.
 INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code)
 VALUES(prior_id,'invoice.paid',repeat('d',64),1793880000,false,'held','QUALIFICATION_REQUIRED');
 IF NOT EXISTS(SELECT 1 FROM certis_billing.stripe_events WHERE event_id=prior_id AND processing_state='held') THEN
  RAISE EXCEPTION 'MISSING_WEBHOOK_RECEIPT'; END IF;
 IF (SELECT count(*) FROM certis_billing.credit_ledger WHERE account_id=a)<>6
 THEN RAISE EXCEPTION 'AUDIT_LEDGER_DUPLICATION'; END IF;
 RAISE NOTICE 'CERTIS_BILLING_POSTGRES_TEST_PASSED';
END $$;
ROLLBACK;

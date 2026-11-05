BEGIN;
DO $$
DECLARE a uuid; r text; h integer; ref text := 'evt_created001';
BEGIN
 INSERT INTO certis_billing.accounts(principal_sha256,stripe_customer_id)
 VALUES(repeat('e',64),'cus_fixture001') RETURNING id INTO a;
 INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code)
 VALUES(ref,'customer.subscription.created',repeat('f',64),1793880000,false,'held','ACCOUNT_PLAN_AND_SUBSCRIPTION_RECONCILIATION_REQUIRED');
 BEGIN
  PERFORM certis_billing.apply_verified_subscription(a,ref,'sub_fixture001','price_fixture001','active','2026-12-05T00:00:00Z');
  RAISE EXCEPTION 'UNQUALIFIED_PLAN_ACCEPTED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'APPROVED_TEST_PRICE_REQUIRED' THEN RAISE; END IF;
 END;
 UPDATE certis_billing.plans SET stripe_test_price_id='price_fixture001',credits_per_cycle=2,enabled=true
 WHERE tier='certis';
 SELECT certis_billing.apply_verified_subscription(a,ref,'sub_fixture001','price_fixture001','active','2026-12-05T00:00:00Z') INTO r;
 IF r<>'applied_test_state' THEN RAISE EXCEPTION 'INITIAL_MEMBERSHIP_FAILED'; END IF;
 SELECT certis_billing.apply_verified_subscription(a,ref,'sub_fixture001','price_fixture001','active','2026-12-05T00:00:00Z') INTO r;
 IF r<>'already_recorded' THEN RAISE EXCEPTION 'MEMBERSHIP_REPLAY_FAILED'; END IF;
 UPDATE certis_billing.plans SET stripe_test_price_id='price_fixture002',credits_per_cycle=5,enabled=true WHERE tier='gold';
 INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code)
 VALUES('evt_updated001','customer.subscription.updated',repeat('1',64),1793880010,false,'held','ACCOUNT_PLAN_AND_SUBSCRIPTION_RECONCILIATION_REQUIRED');
 SELECT certis_billing.apply_verified_subscription(a,'evt_updated001','sub_fixture001','price_fixture002','active','2026-12-05T00:00:00Z') INTO r;
 IF r<>'applied_test_state' OR (SELECT tier FROM certis_billing.memberships WHERE account_id=a)<>'gold'
 THEN RAISE EXCEPTION 'TIER_CHANGE_FAILED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM certis_billing.membership_history WHERE stripe_event_id='evt_updated001'
  AND previous_tier='certis' AND next_tier='gold') THEN RAISE EXCEPTION 'HISTORY_MISSING'; END IF;
 INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code)
 VALUES('evt_older001','customer.subscription.updated',repeat('2',64),1793880005,false,'held','ACCOUNT_PLAN_AND_SUBSCRIPTION_RECONCILIATION_REQUIRED');
 SELECT certis_billing.apply_verified_subscription(a,'evt_older001','sub_fixture001','price_fixture001','active','2026-12-05T00:00:00Z') INTO r;
 IF r<>'older_event_held' OR (SELECT tier FROM certis_billing.memberships WHERE account_id=a)<>'gold'
 THEN RAISE EXCEPTION 'OUT_OF_ORDER_APPLIED'; END IF;
 INSERT INTO certis_billing.stripe_events(event_id,event_type,payload_sha256,stripe_created,livemode,processing_state,reason_code)
 VALUES('evt_deleted001','customer.subscription.deleted',repeat('3',64),1793880020,false,'held','ACCOUNT_PLAN_AND_SUBSCRIPTION_RECONCILIATION_REQUIRED');
 SELECT certis_billing.apply_verified_subscription(a,'evt_deleted001','sub_fixture001','price_fixture002','canceled',NULL) INTO r;
 IF r<>'applied_test_state' OR (SELECT state FROM certis_billing.memberships WHERE account_id=a)<>'canceled'
 THEN RAISE EXCEPTION 'CANCELLATION_HISTORY_FAILED'; END IF;
 SELECT count(*) INTO h FROM certis_billing.membership_history WHERE account_id=a;
 IF h<>3 THEN RAISE EXCEPTION 'TIER_HISTORY_DUPLICATED'; END IF;
 BEGIN
  DELETE FROM certis_billing.membership_history WHERE account_id=a;
  RAISE EXCEPTION 'IMMUTABLE_HISTORY_DELETED';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'IMMUTABLE_BILLING_HISTORY' THEN RAISE; END IF;
 END;
 RAISE NOTICE 'CERTIS_MEMBERSHIP_HISTORY_PASSED';
END $$;
ROLLBACK;

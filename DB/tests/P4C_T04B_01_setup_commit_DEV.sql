-- P4-C Test 04B / Step 1: committed synthetic audit evidence.
-- Intended DEV database only. NO provider or recovery calls.
-- Run once, then Step 2 in a NEW database connection, then guarded cleanup.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $test$
DECLARE
  v_org constant varchar := 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b';
  v_intent constant varchar := 'P4CT04B-INTENT-20261017';
  v_case constant varchar := 'P4CT04B-CASE-20261017';
  v_ref constant varchar := 'P4CT04B-CAPTURE-20261017';
  source_case poynt_collect_financial_exceptions%ROWTYPE;
  source_intent payment_intents%ROWTYPE;
  new_intent payment_intents%ROWTYPE;
  new_case poynt_collect_financial_exceptions%ROWTYPE;
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id=v_intent)
     OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case)
     OR EXISTS (SELECT 1 FROM financial_exception_events WHERE financial_exception_id=v_case)
  THEN RAISE EXCEPTION 'P4C T04B STOP: synthetic IDs already exist. Do not rerun setup'; END IF;
  SELECT * INTO source_case FROM poynt_collect_financial_exceptions
  WHERE organization_id=v_org AND payment_intent_id IS NOT NULL
    AND commerce_transaction_id IS NULL AND case_status='OPEN'
  ORDER BY opened_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T04B STOP: safe source exception unavailable'; END IF;
  SELECT * INTO source_intent FROM payment_intents
  WHERE payment_intent_id=source_case.payment_intent_id AND organization_id=v_org;
  IF NOT FOUND OR source_intent.customer_user_id IS NULL
  THEN RAISE EXCEPTION 'P4C T04B STOP: source intent/customer unavailable'; END IF;
  SELECT * INTO new_intent FROM jsonb_populate_record(NULL::payment_intents,
    to_jsonb(source_intent) || jsonb_build_object(
      'payment_intent_id',v_intent,'idempotency_key','P4CT04B-IDEMP-20261017',
      'provider_reference_id',v_ref,'commerce_transaction_id',NULL,
      'finalized_subscription_id',NULL,'status','PROCESSING',
      'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
  INSERT INTO payment_intents SELECT (new_intent).*;
  SELECT * INTO new_case FROM jsonb_populate_record(NULL::poynt_collect_financial_exceptions,
    to_jsonb(source_case) || jsonb_build_object(
      'financial_exception_id',v_case,'payment_intent_id',v_intent,
      'commerce_transaction_id',NULL,'provider_reference_id',v_ref,
      'provider_transaction_id',v_ref,'case_status','OPEN',
      'fulfillment_outcome','UNFULFILLED','related_payment_intent_id',NULL,
      'related_subscription_id',NULL,'opened_at',clock_timestamp(),
      'updated_at',clock_timestamp(),'resolved_at',NULL));
  INSERT INTO poynt_collect_financial_exceptions SELECT (new_case).*;
  IF NOT payment_actor_is_authorized(v_intent,source_intent.customer_user_id)
  THEN RAISE EXCEPTION 'P4C T04B STOP: synthetic intent actor not authorized'; END IF;
  IF (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='OPENED') <> 1
  THEN RAISE EXCEPTION 'P4C T04B FAIL: opening event absent'; END IF;
  PERFORM financial_exception_record_recovery_failure(v_org,v_intent,NULL,
     source_intent.customer_user_id,'FRA_P4CT04B_01');
  PERFORM financial_exception_record_recovery_failure(v_org,v_intent,NULL,
     source_intent.customer_user_id,'FRA_P4CT04B_01');
  PERFORM financial_exception_record_recovery_failure(v_org,v_intent,NULL,
     source_intent.customer_user_id,'FRA_P4CT04B_02');
  SELECT count(*) INTO n FROM financial_exception_events WHERE financial_exception_id=v_case;
  IF n<>3 THEN RAISE EXCEPTION 'P4C T04B FAIL: expected 3 events, got %',n; END IF;
  IF (SELECT count(*) FROM financial_exception_events
    WHERE financial_exception_id=v_case AND event_type='RECOVERY_FAILED')<>2
  THEN RAISE EXCEPTION 'P4C T04B FAIL: failed attempts mismatch'; END IF;
  RAISE NOTICE 'P4C T04B SETUP PASS: isolated case + 3 events ready to commit';
END $test$;
COMMIT;

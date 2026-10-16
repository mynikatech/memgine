-- P4-C Test 02: isolated synthetic case, rollback-only lifecycle and audit test.
-- Execute in pgAdmin against the intended DEV database (15432).
-- Uses existing rows as templates only; does not update/delete those rows.
-- DO NOT replace the final ROLLBACK with COMMIT.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $test$
DECLARE
  v_org constant varchar := 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b';
  v_admin constant varchar := 'USR_25019ee5-c2cc-4b9c-a866-d8a9e158afe5';
  v_intent_id constant varchar := 'P4CT02-INTENT-20261017';
  v_case_id constant varchar := 'P4CT02-CASE-20261017';
  v_provider_ref constant varchar := 'P4CT02-CAPTURE-20261017';
  v_source_case poynt_collect_financial_exceptions%ROWTYPE;
  v_source_intent payment_intents%ROWTYPE;
  v_new_intent payment_intents%ROWTYPE;
  v_new_case poynt_collect_financial_exceptions%ROWTYPE;
  v_event_count int;
  v_forbidden boolean;
BEGIN
  IF NOT can_administer_organization(v_org, v_admin) THEN
    RAISE EXCEPTION 'P4C T02 STOP: selected Org Admin actor lacks authorization';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id=v_intent_id)
     OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case_id)
     OR EXISTS (SELECT 1 FROM financial_exception_events WHERE financial_exception_id=v_case_id) THEN
    RAISE EXCEPTION 'P4C T02 STOP: synthetic identifiers already present';
  END IF;

  SELECT * INTO v_source_case FROM poynt_collect_financial_exceptions
   WHERE organization_id=v_org AND payment_intent_id IS NOT NULL
      AND commerce_transaction_id IS NULL AND case_status='OPEN'
   ORDER BY opened_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T02 STOP: no suitable source case'; END IF;
  SELECT * INTO v_source_intent FROM payment_intents
   WHERE payment_intent_id=v_source_case.payment_intent_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T02 STOP: source payment intent missing'; END IF;

  -- Copy needed non-sensitive structural relationships within this rollback-only
  -- transaction; replace payment identity and provider identifiers. The original
  -- intent and original case are never updated.
  SELECT * INTO v_new_intent FROM jsonb_populate_record(NULL::payment_intents,
    to_jsonb(v_source_intent) || jsonb_build_object(
      'payment_intent_id',v_intent_id,
      'idempotency_key','P4CT02-IDEMP-20261017',
      'provider_reference_id',v_provider_ref,
      'commerce_transaction_id',NULL,
      'finalized_subscription_id',NULL,
      'status','PROCESSING',
      'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
  INSERT INTO payment_intents SELECT (v_new_intent).*;

  SELECT * INTO v_new_case FROM jsonb_populate_record(NULL::poynt_collect_financial_exceptions,
    to_jsonb(v_source_case) || jsonb_build_object(
      'financial_exception_id',v_case_id,
      'payment_intent_id',v_intent_id,
      'commerce_transaction_id',NULL,
      'provider_reference_id',v_provider_ref,
      'provider_transaction_id',v_provider_ref,
      'case_status','OPEN',
      'fulfillment_outcome','UNFULFILLED',
      'related_payment_intent_id',NULL,
      'related_subscription_id',NULL,
      'opened_at',clock_timestamp(),'updated_at',clock_timestamp(),
      'resolved_at',NULL));
  INSERT INTO poynt_collect_financial_exceptions SELECT (v_new_case).*;

  SELECT count(*) INTO v_event_count FROM financial_exception_events
   WHERE financial_exception_id=v_case_id AND event_type='OPENED'
      AND event_identity='OPENED:'||v_case_id;
  IF v_event_count<>1 THEN RAISE EXCEPTION 'P4C T02 FAIL: OPENED event count %',v_event_count; END IF;
  RAISE NOTICE 'P4C T02 PASS: synthetic exception created; exactly one OPENED event';

  IF financial_exception_transition(v_org,v_case_id,'UNDER_REVIEW',
        'Synthetic review opened for lifecycle test',v_admin) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P4C T02 FAIL: OPEN -> UNDER_REVIEW';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM financial_exception_events
      WHERE financial_exception_id=v_case_id AND event_type='STATUS_CHANGED'
        AND previous_case_status='OPEN' AND new_case_status='UNDER_REVIEW'
        AND actor_user_id=v_admin AND actor_origin='ORG_ADMIN') THEN
    RAISE EXCEPTION 'P4C T02 FAIL: missing review event/actor';
  END IF;
  RAISE NOTICE 'P4C T02 PASS: OPEN -> UNDER_REVIEW; authorized actor captured';

  -- This case has no fulfillment evidence. Manual resolution MUST fail.
  v_forbidden := false;
  BEGIN
    PERFORM financial_exception_transition(v_org,v_case_id,'RESOLVED',
       'Synthetic review attempted without fulfillment',v_admin);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_forbidden := true;
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'P4C T02 FAIL: unfulfilled case was resolvable'; END IF;
  IF (SELECT case_status FROM poynt_collect_financial_exceptions
       WHERE financial_exception_id=v_case_id) <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'P4C T02 FAIL: rejected resolution changed state';
  END IF;
  RAISE NOTICE 'P4C T02 PASS: RESOLVED rejected without verified fulfillment';

  IF financial_exception_transition(v_org,v_case_id,'OPEN',
       'Synthetic review returned to queue',v_admin) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P4C T02 FAIL: UNDER_REVIEW -> OPEN';
  END IF;
  SELECT count(*) INTO v_event_count FROM financial_exception_events
   WHERE financial_exception_id=v_case_id AND event_type='STATUS_CHANGED'
     AND actor_user_id=v_admin AND actor_origin='ORG_ADMIN';
  IF v_event_count<>2 THEN
    RAISE EXCEPTION 'P4C T02 FAIL: expected two status-change events, found %',v_event_count;
  END IF;
  IF (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case_id)<>3 THEN
    RAISE EXCEPTION 'P4C T02 FAIL: expected exactly three audit events';
  END IF;
  IF (SELECT case_status FROM poynt_collect_financial_exceptions
       WHERE financial_exception_id=v_case_id)<>'OPEN' THEN
    RAISE EXCEPTION 'P4C T02 FAIL: final status not OPEN';
  END IF;
  RAISE NOTICE 'P4C T02 PASS: UNDER_REVIEW -> OPEN; 3 total events, 2 authorized transitions';
  RAISE NOTICE 'P4C T02 COMPLETE: all mutations will be rolled back';
END $test$;
ROLLBACK;

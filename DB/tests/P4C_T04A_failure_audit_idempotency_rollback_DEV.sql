-- P4-C Test 04A: recovery-failure audit identities and rollback-only semantics; rollback only.
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
  v_intent_id constant varchar := 'P4CT04A-INTENT-20261017';
  v_case_id constant varchar := 'P4CT04A-CASE-20261017';
  v_provider_ref constant varchar := 'P4CT04A-CAPTURE-20261017';
  v_source_case poynt_collect_financial_exceptions%ROWTYPE;
  v_source_intent payment_intents%ROWTYPE;
  v_new_intent payment_intents%ROWTYPE;
  v_new_case poynt_collect_financial_exceptions%ROWTYPE;
  v_event_count int;
  v_forbidden boolean;
  v_outsider varchar;
  v_other_org_admin constant varchar := 'USR_20663c93-9634-4d33-b44c-0521d0bf395f';
  v_other_org constant varchar := 'ORG_1287bdf6-65e7-4b3b-ba5f-6d1f5db1c4ef';
  v_count int;
  v_before_status varchar;

BEGIN
  IF NOT can_administer_organization(v_org, v_admin) THEN
    RAISE EXCEPTION 'P4C T04A STOP: selected Org Admin actor lacks authorization';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id=v_intent_id)
     OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case_id)
     OR EXISTS (SELECT 1 FROM financial_exception_events WHERE financial_exception_id=v_case_id) THEN
    RAISE EXCEPTION 'P4C T04A STOP: synthetic identifiers already present';
  END IF;

  SELECT * INTO v_source_case FROM poynt_collect_financial_exceptions
   WHERE organization_id=v_org AND payment_intent_id IS NOT NULL
      AND commerce_transaction_id IS NULL AND case_status='OPEN'
   ORDER BY opened_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T04A STOP: no suitable source case'; END IF;
  SELECT * INTO v_source_intent FROM payment_intents
   WHERE payment_intent_id=v_source_case.payment_intent_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T04A STOP: source payment intent missing'; END IF;

  -- Copy needed non-sensitive structural relationships within this rollback-only
  -- transaction; replace payment identity and provider identifiers. The original
  -- intent and original case are never updated.
  SELECT * INTO v_new_intent FROM jsonb_populate_record(NULL::payment_intents,
    to_jsonb(v_source_intent) || jsonb_build_object(
      'payment_intent_id',v_intent_id,
      'idempotency_key','P4CT04A-IDEMP-20261017',
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


  IF v_source_intent.customer_user_id IS NULL THEN
    RAISE EXCEPTION 'P4C T04A STOP: source customer actor unavailable';
  END IF;
  IF NOT payment_actor_is_authorized(v_intent_id,v_source_intent.customer_user_id) THEN
    RAISE EXCEPTION 'P4C T04A STOP: synthetic intent actor not authorized';
  END IF;
  RAISE NOTICE 'P4C T04A PASS: synthetic case OPENED event automatically created';

  -- Each failed *invocation* gets a new identity. Replaying its audit write
  -- must be idempotent even though it is the same financial exception.
  PERFORM financial_exception_record_recovery_failure(v_org,v_intent_id,NULL,
    v_source_intent.customer_user_id,'FRA_P4CT04A_01');
  PERFORM financial_exception_record_recovery_failure(v_org,v_intent_id,NULL,
    v_source_intent.customer_user_id,'FRA_P4CT04A_01');
  SELECT count(*) INTO v_event_count FROM financial_exception_events
    WHERE financial_exception_id=v_case_id AND event_type='RECOVERY_FAILED';
  IF v_event_count<>1 THEN
    RAISE EXCEPTION 'P4C T04A FAIL: replay generated duplicate event (count=%)',v_event_count;
  END IF;
  RAISE NOTICE 'P4C T04A PASS: identical recovery-attempt replay produced one failure event';

  PERFORM financial_exception_record_recovery_failure(v_org,v_intent_id,NULL,
    v_source_intent.customer_user_id,'FRA_P4CT04A_02');
  SELECT count(*) INTO v_event_count FROM financial_exception_events
    WHERE financial_exception_id=v_case_id AND event_type='RECOVERY_FAILED';
  IF v_event_count<>2 THEN
    RAISE EXCEPTION 'P4C T04A FAIL: distinct attempts not independently audited';
  END IF;
  IF EXISTS (SELECT 1 FROM financial_exception_events
    WHERE financial_exception_id=v_case_id AND event_type='RECOVERY_FAILED'
    AND (actor_user_id IS DISTINCT FROM v_source_intent.customer_user_id
         OR actor_origin IS DISTINCT FROM 'CUSTOMER'
         OR previous_case_status IS DISTINCT FROM 'OPEN'
         OR new_case_status IS DISTINCT FROM 'OPEN'
         OR previous_fulfillment_outcome IS DISTINCT FROM 'UNFULFILLED'
         OR new_fulfillment_outcome IS DISTINCT FROM 'UNFULFILLED')) THEN
    RAISE EXCEPTION 'P4C T04A FAIL: failed-event actor/state differs';
  END IF;
  IF EXISTS (SELECT 1 FROM financial_exception_events
    WHERE financial_exception_id=v_case_id AND description ~* '(FRA_|token|nonce|secret|payload|card)') THEN
    RAISE EXCEPTION 'P4C T04A FAIL: unsanitized audit event description';
  END IF;
  IF (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case_id) <> 3
    OR (SELECT case_status FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case_id) <> 'OPEN'
    OR (SELECT fulfillment_outcome FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case_id) <> 'UNFULFILLED'
  THEN RAISE EXCEPTION 'P4C T04A FAIL: case changed or event count incorrect'; END IF;
  RAISE NOTICE 'P4C T04A PASS: two unique failures and original OPENED event; case/evidence unchanged';

  -- Separate savepoint/subtransaction: an independent aborted operation must
  -- not erase the previously recorded events inside the outer transaction.
  BEGIN
    PERFORM financial_exception_record_recovery_failure(v_org,v_intent_id,NULL,
      v_source_intent.customer_user_id,'FRA_P4CT04A_ABORTED');
    RAISE EXCEPTION 'P4C_T04A_SIMULATED_ROLLBACK' USING ERRCODE='P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  IF (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case_id) <> 3 THEN
    RAISE EXCEPTION 'P4C T04A FAIL: rolled-back subtransaction leaked/lost an event';
  END IF;
  RAISE NOTICE 'P4C T04A PASS: rolled-back operation leaves previously recorded events intact';
  RAISE NOTICE 'P4C T04A COMPLETE: all synthetic changes will ROLLBACK';
END $test$;
ROLLBACK;

-- P4-C Test 03: authorization and cross-organization isolation; rollback only.
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
  v_intent_id constant varchar := 'P4CT03-INTENT-20261017';
  v_case_id constant varchar := 'P4CT03-CASE-20261017';
  v_provider_ref constant varchar := 'P4CT03-CAPTURE-20261017';
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
    RAISE EXCEPTION 'P4C T03 STOP: selected Org Admin actor lacks authorization';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id=v_intent_id)
     OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case_id)
     OR EXISTS (SELECT 1 FROM financial_exception_events WHERE financial_exception_id=v_case_id) THEN
    RAISE EXCEPTION 'P4C T03 STOP: synthetic identifiers already present';
  END IF;

  SELECT * INTO v_source_case FROM poynt_collect_financial_exceptions
   WHERE organization_id=v_org AND payment_intent_id IS NOT NULL
      AND commerce_transaction_id IS NULL AND case_status='OPEN'
   ORDER BY opened_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T03 STOP: no suitable source case'; END IF;
  SELECT * INTO v_source_intent FROM payment_intents
   WHERE payment_intent_id=v_source_case.payment_intent_id AND organization_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4C T03 STOP: source payment intent missing'; END IF;

  -- Copy needed non-sensitive structural relationships within this rollback-only
  -- transaction; replace payment identity and provider identifiers. The original
  -- intent and original case are never updated.
  SELECT * INTO v_new_intent FROM jsonb_populate_record(NULL::payment_intents,
    to_jsonb(v_source_intent) || jsonb_build_object(
      'payment_intent_id',v_intent_id,
      'idempotency_key','P4CT03-IDEMP-20261017',
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


  -- Identify a real, existing user who is NOT an administrator of this case's
  -- organization.  No role or user records are changed.
  SELECT u.user_id INTO v_outsider
    FROM "user" u
   WHERE u.user_id <> v_admin AND NOT u.is_deleted
     AND NOT can_administer_organization(v_org,u.user_id)
   ORDER BY u.user_id LIMIT 1;
  IF v_outsider IS NULL THEN
     RAISE EXCEPTION 'P4C T03 STOP: no non-admin user available';
  END IF;
  IF NOT can_administer_organization(v_other_org,v_other_org_admin)
     OR can_administer_organization(v_org,v_other_org_admin) THEN
     RAISE EXCEPTION 'P4C T03 STOP: selected cross-org administrator is not isolated';
  END IF;
  RAISE NOTICE 'P4C T03 PRECHECK PASS: admin, outsider, and separate-org admin verified';

  -- The correct organization admin can read all three protected APIs.
  SELECT count(*) INTO v_count FROM financial_exception_list(v_org,v_admin)
   WHERE "financialExceptionId"=v_case_id;
  IF v_count<>1 THEN RAISE EXCEPTION 'P4C T03 FAIL: authorized list'; END IF;
  SELECT count(*) INTO v_count FROM financial_exception_detail(v_org,v_case_id,v_admin);
  IF v_count<>1 THEN RAISE EXCEPTION 'P4C T03 FAIL: authorized detail'; END IF;
  SELECT count(*) INTO v_count FROM financial_exception_events(v_org,v_case_id,v_admin)
   WHERE "eventType"='OPENED';
  IF v_count<>1 THEN RAISE EXCEPTION 'P4C T03 FAIL: authorized event history'; END IF;
  RAISE NOTICE 'P4C T03 PASS: authorized org admin can list, view, and read events';

  -- Unauthorized in-org or cross-org users must have NO information disclosure.
  IF EXISTS(SELECT 1 FROM financial_exception_list(v_org,v_outsider)
     WHERE "financialExceptionId"=v_case_id)
  OR EXISTS(SELECT 1 FROM financial_exception_detail(v_org,v_case_id,v_outsider))
  OR EXISTS(SELECT 1 FROM financial_exception_events(v_org,v_case_id,v_outsider))
  OR EXISTS(SELECT 1 FROM financial_exception_list(v_org,v_other_org_admin)
     WHERE "financialExceptionId"=v_case_id)
  OR EXISTS(SELECT 1 FROM financial_exception_detail(v_org,v_case_id,v_other_org_admin))
  OR EXISTS(SELECT 1 FROM financial_exception_events(v_org,v_case_id,v_other_org_admin))
  OR EXISTS(SELECT 1 FROM financial_exception_detail(v_other_org,v_case_id,v_other_org_admin))
  OR EXISTS(SELECT 1 FROM financial_exception_events(v_other_org,v_case_id,v_other_org_admin)) THEN
    RAISE EXCEPTION 'P4C T03 FAIL: unauthorized/cross-org read leaked case';
  END IF;
  RAISE NOTICE 'P4C T03 PASS: unauthorized and cross-org reads return no case data';

  -- Explicit denial on all unauthorized transition attempts.
  FOR v_outsider IN SELECT unnest(ARRAY[v_outsider, v_other_org_admin]) LOOP
    v_forbidden := false;
    BEGIN
      PERFORM financial_exception_transition(v_org,v_case_id,'UNDER_REVIEW',
            'P4C synthetic unauthorized transition',v_outsider);
    EXCEPTION WHEN SQLSTATE '42501' THEN v_forbidden:=true;
    END;
    IF NOT v_forbidden THEN
      RAISE EXCEPTION 'P4C T03 FAIL: transition not denied to actor %',v_outsider;
    END IF;
  END LOOP;
  v_forbidden := false;
  BEGIN
    PERFORM financial_exception_transition(v_other_org,v_case_id,'UNDER_REVIEW',
       'P4C synthetic cross organization transition',v_other_org_admin);
  EXCEPTION WHEN SQLSTATE 'P0002' OR SQLSTATE '42501' THEN v_forbidden:=true;
  END;
  IF NOT v_forbidden THEN RAISE EXCEPTION 'P4C T03 FAIL: cross-org transition allowed'; END IF;

  SELECT case_status INTO v_before_status FROM poynt_collect_financial_exceptions
   WHERE financial_exception_id=v_case_id;
  SELECT count(*) INTO v_event_count FROM financial_exception_events
   WHERE financial_exception_id=v_case_id;
  IF v_before_status IS DISTINCT FROM 'OPEN' OR v_event_count<>1 THEN
    RAISE EXCEPTION 'P4C T03 FAIL: rejected transition changed case/audit history';
  END IF;
  RAISE NOTICE 'P4C T03 PASS: unauthorized/cross-org transitions denied (42501/P0002); no mutation';
  RAISE NOTICE 'P4C T03 COMPLETE: isolated synthetic records will be rolled back';
END $test$;
ROLLBACK;

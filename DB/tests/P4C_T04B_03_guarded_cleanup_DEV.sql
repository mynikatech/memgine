-- P4-C Test 04B / Step 3: execute ONLY after Step 2 VERIFY PASS.
-- Deletes only exact synthetic event/case/intent IDs, with safety prechecks.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $test$
DECLARE
 v_case constant varchar := 'P4CT04B-CASE-20261017';
 v_intent constant varchar := 'P4CT04B-INTENT-20261017';
 c poynt_collect_financial_exceptions%ROWTYPE;
 p payment_intents%ROWTYPE;
 n int;
BEGIN
 SELECT * INTO c FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case FOR UPDATE;
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id=v_intent FOR UPDATE;
 IF c.financial_exception_id IS NULL OR p.payment_intent_id IS NULL
 OR c.organization_id IS DISTINCT FROM 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
 OR c.payment_intent_id IS DISTINCT FROM v_intent
 OR c.commerce_transaction_id IS NOT NULL
 OR c.provider_transaction_id IS DISTINCT FROM 'P4CT04B-CAPTURE-20261017'
 OR c.provider_reference_id IS DISTINCT FROM 'P4CT04B-CAPTURE-20261017'
 OR c.case_status IS DISTINCT FROM 'OPEN' OR c.fulfillment_outcome IS DISTINCT FROM 'UNFULFILLED'
 OR c.related_subscription_id IS NOT NULL OR c.related_payment_intent_id IS NOT NULL
 OR p.organization_id IS DISTINCT FROM c.organization_id OR p.customer_user_id IS NULL
 OR p.idempotency_key IS DISTINCT FROM 'P4CT04B-IDEMP-20261017'
 OR p.status IS DISTINCT FROM 'PROCESSING' OR p.finalized_subscription_id IS NOT NULL
 OR p.commerce_transaction_id IS NOT NULL
 OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case) <> 3
 OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case
     AND event_identity IN ('OPENED:'||v_case,
       'RECOVERY_FAILED:'||v_case||':FRA_P4CT04B_01',
       'RECOVERY_FAILED:'||v_case||':FRA_P4CT04B_02')) <> 3
 THEN RAISE EXCEPTION 'P4C T04B CLEANUP STOP: ownership/state/event mismatch'; END IF;
 DELETE FROM financial_exception_events WHERE financial_exception_id=v_case;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>3 THEN RAISE EXCEPTION 'P4C T04B CLEANUP STOP: event delete count %', n; END IF;
 DELETE FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case AND payment_intent_id=v_intent;
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4C T04B CLEANUP STOP: case delete count %', n; END IF;
 DELETE FROM payment_intents WHERE payment_intent_id=v_intent AND idempotency_key='P4CT04B-IDEMP-20261017';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4C T04B CLEANUP STOP: intent delete count %', n; END IF;
 RAISE NOTICE 'P4C T04B CLEANUP PASS: only synthetic case, intent and 3 audit events deleted';
END $test$;
COMMIT;

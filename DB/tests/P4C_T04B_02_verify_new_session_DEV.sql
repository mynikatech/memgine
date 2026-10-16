-- P4-C Test 04B / Step 2: run in a fresh pgAdmin connection AFTER setup COMMIT.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;
DO $test$
DECLARE
  v_case constant varchar := 'P4CT04B-CASE-20261017';
  v_intent constant varchar := 'P4CT04B-INTENT-20261017';
  c poynt_collect_financial_exceptions%ROWTYPE;
  p payment_intents%ROWTYPE;
  n int;
BEGIN
 SELECT * INTO c FROM poynt_collect_financial_exceptions WHERE financial_exception_id=v_case;
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id=v_intent;
 IF c.financial_exception_id IS NULL OR p.payment_intent_id IS NULL
    OR c.payment_intent_id IS DISTINCT FROM v_intent
    OR c.provider_reference_id IS DISTINCT FROM 'P4CT04B-CAPTURE-20261017'
    OR c.case_status IS DISTINCT FROM 'OPEN'
    OR c.fulfillment_outcome IS DISTINCT FROM 'UNFULFILLED'
    OR p.status IS DISTINCT FROM 'PROCESSING'
 THEN RAISE EXCEPTION 'P4C T04B VERIFY FAIL: synthetic case/intent not durably consistent'; END IF;
 IF (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case) <> 3
    OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case AND event_type='OPENED'
        AND event_identity='OPENED:'||v_case AND actor_origin='SYSTEM') <> 1
    OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case
        AND event_type='RECOVERY_FAILED' AND actor_user_id=p.customer_user_id
        AND actor_origin='CUSTOMER' AND previous_case_status='OPEN' AND new_case_status='OPEN'
        AND previous_fulfillment_outcome='UNFULFILLED' AND new_fulfillment_outcome='UNFULFILLED') <> 2
    OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case
        AND event_identity='RECOVERY_FAILED:'||v_case||':FRA_P4CT04B_01')<>1
    OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case
        AND event_identity='RECOVERY_FAILED:'||v_case||':FRA_P4CT04B_02')<>1
 THEN RAISE EXCEPTION 'P4C T04B VERIFY FAIL: committed audit history mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM financial_exception_events WHERE financial_exception_id=v_case
   AND description ~* '(FRA_|token|nonce|secret|payload|card)')
 THEN RAISE EXCEPTION 'P4C T04B VERIFY FAIL: unsafe event description'; END IF;
 RAISE NOTICE 'P4C T04B VERIFY PASS: 3 committed events visible from new session; no duplicate replay; case OPEN';
END $test$;
ROLLBACK;

-- P4-B concurrent SUCCESS Session B. DEV port 15432.
-- Start DURING the 25-second sleep in Session A; use separate Query Tool connection.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '45s';
SET LOCAL statement_timeout = '90s';
DO $test$
DECLARE v_result varchar; v_sub varchar; v_case_count int; v_s_count int;
BEGIN
  v_result := commerce_recover_counter_financial_exception(
   'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
   'P4BCS-C-20261016',
   'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_result IS DISTINCT FROM 'P4BCS-C-20261016' THEN RAISE EXCEPTION 'P4B CS B FAIL: result'; END IF;
  SELECT subscription_id INTO v_sub FROM commerce_transactions
   WHERE commerce_transaction_id='P4BCS-C-20261016' AND status='PROVIDER_SUCCEEDED';
  SELECT count(*) INTO v_case_count FROM poynt_collect_financial_exceptions
   WHERE commerce_transaction_id='P4BCS-C-20261016'
    AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED'
    AND related_subscription_id=v_sub;
  SELECT count(*) INTO v_s_count FROM subscriptions
   WHERE organization_user_id='P4BCS-OU-20261017' AND NOT is_deleted;
  IF v_sub IS NULL OR v_case_count<>1 OR v_s_count<>1 THEN
   RAISE EXCEPTION 'P4B CS B FAIL: duplicate or incomplete fulfillment';
  END IF;
  RAISE NOTICE 'P4B CS B PASS: identical Commerce result; exactly one membership and resolved case';
END $test$;
COMMIT;

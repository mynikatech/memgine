-- P4-B concurrent SUCCESS Session A. DEV port 15432.
-- Run AFTER step 1 COMMIT. Start B while this script is holding its locks.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '45s';
SET LOCAL statement_timeout = '90s';
DO $test$
DECLARE v_result varchar; v_sub varchar; v_cases int;
BEGIN
  v_result := commerce_recover_counter_financial_exception(
   'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
   'P4BCS-C-20261016',
   'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_result IS DISTINCT FROM 'P4BCS-C-20261016' THEN RAISE EXCEPTION 'P4B CS A FAIL: result'; END IF;
  SELECT subscription_id INTO v_sub FROM commerce_transactions
   WHERE commerce_transaction_id='P4BCS-C-20261016' AND status='PROVIDER_SUCCEEDED';
  IF v_sub IS NULL THEN RAISE EXCEPTION 'P4B CS A FAIL: subscription missing'; END IF;
  SELECT count(*) INTO v_cases FROM poynt_collect_financial_exceptions
   WHERE commerce_transaction_id='P4BCS-C-20261016'
    AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED'
    AND related_subscription_id=v_sub;
  IF v_cases<>1 THEN RAISE EXCEPTION 'P4B CS A FAIL: unresolved exception'; END IF;
  RAISE NOTICE 'P4B CS A PASS: success finalized; holding transaction locks 25 seconds, START SESSION B NOW';
  PERFORM pg_sleep(25);
END $test$;
COMMIT;

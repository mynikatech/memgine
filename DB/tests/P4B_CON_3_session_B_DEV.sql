-- DEV ONLY. Session B: launch in separate Query Tool while Session A is running.
-- Should block on A attempt lock, then fail safely after A COMMIT.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL statement_timeout='120s';
DO $$
BEGIN
 BEGIN
   PERFORM commerce_recover_counter_financial_exception('ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b','P4BCON-C-20261016','USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
   RAISE EXCEPTION 'P4B CON B FAIL: downstream failure unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '23505' THEN
   RAISE NOTICE 'P4B CON B EXPECTED: second recovery rejected by downstream finalizer';
 END;
 IF NOT EXISTS(SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id='P4BCON-C-20261016' AND status='PROVIDER_SUCCEEDED')
 OR NOT EXISTS(SELECT 1 FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND case_status='OPEN' AND fulfillment_outcome='FAILED') THEN
  RAISE EXCEPTION 'P4B CON B FAIL: financial evidence changed'; END IF;
 RAISE NOTICE 'P4B CON B PASS: concurrent failed recovery preserved captured evidence';
END $$;
COMMIT;

-- P4-A T10 (2/5): simulate downstream fulfillment transaction failing.
-- DEV ONLY, synthetic fixture; no actual finalizer or entitlement mutation.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
DO $test$
DECLARE v_count int;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM commerce_transactions
 WHERE commerce_transaction_id='P4ADUR-C-20261016'
 AND status='PROVIDER_SUCCEEDED' AND provider_transaction_id='P4ADUR-TX-20261016')
 THEN RAISE EXCEPTION 'P4A T10 FAIL: committed provider success missing'; END IF;
 BEGIN
   -- Failing downstream SQL work, rolled back by this PL/pgSQL subtransaction.
   -- No real fulfillment function or subscription/redemption is touched.
   RAISE EXCEPTION 'P4A-SIMULATED-FULFILLMENT-ERROR';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM <> 'P4A-SIMULATED-FULFILLMENT-ERROR' THEN RAISE; END IF;
 END;
 SELECT count(*) INTO v_count FROM poynt_collect_financial_exceptions
 WHERE commerce_transaction_id='P4ADUR-C-20261016';
 IF v_count<>0 THEN RAISE EXCEPTION 'P4A T10 FAIL: case unexpectedly exists already'; END IF;
 RAISE NOTICE 'P4A T10 FAILURE PASS: simulated fulfillment exception handled; payment success unchanged';
END $test$;
ROLLBACK;

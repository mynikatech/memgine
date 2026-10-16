-- DEV ONLY. Session A: simulate concurrent failed recovery with synthetic records.
-- Start Session B immediately AFTER starting this query, within 25 seconds.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL statement_timeout='120s';
-- Take attempt lock first, as the actual recovery does, and KEEP it until COMMIT.
SELECT commerce_provider_payment_attempt_id FROM commerce_provider_payment_attempts
 WHERE commerce_transaction_id='P4BCON-C-20261016' AND provider_reference_id='P4BCON-REF-20261016' FOR UPDATE;
DO $$
DECLARE v_state text;
BEGIN
 BEGIN
   PERFORM commerce_recover_counter_financial_exception('ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b','P4BCON-C-20261016','USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
   RAISE EXCEPTION 'P4B CON A FAIL: downstream failure unexpectedly succeeded';
 EXCEPTION WHEN SQLSTATE '23505' THEN
   RAISE NOTICE 'P4B CON A EXPECTED: pending redemption is unavailable';
 END;
 IF NOT EXISTS(SELECT 1 FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND case_status='OPEN' AND fulfillment_outcome='FAILED') THEN
   RAISE EXCEPTION 'P4B CON A FAIL: exception changed'; END IF;
 RAISE NOTICE 'P4B CON A HOLDING LOCK for 25 seconds: start B NOW';
 PERFORM pg_sleep(25);
END $$;
COMMIT;
SELECT 'P4B CON A PASS: synthetic failed recovery preserved evidence' AS result;

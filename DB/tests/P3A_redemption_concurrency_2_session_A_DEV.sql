-- P3-A Counter redemption concurrency, DEV ONLY (port 15432).
-- Synthetic records only; no Poynt call and no benefit consumption.
-- Finish both sessions before running cleanup.

BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL statement_timeout='75s';
DO $$
DECLARE v record; n integer;
BEGIN
 SELECT * INTO v FROM commerce_begin_counter_redemption_remote_terminal_payment(
 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b','P3ARD-C-20261016',
 'POS_e0940e88-ccf3-461e-aedf-1f0fab879733','P3ARD-REF-A-20261016',
 'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
 IF v."alreadyDispatched" IS DISTINCT FROM false OR v."providerReferenceId"<>'P3ARD-REF-A-20261016'
 THEN RAISE EXCEPTION 'P3ARD A FAIL: first attempt not created'; END IF;
 SELECT count(*) INTO n FROM commerce_provider_payment_attempts
 WHERE commerce_transaction_id='P3ARD-C-20261016' AND payment_channel='REMOTE_TERMINAL';
 IF n<>1 THEN RAISE EXCEPTION 'P3ARD A FAIL: expected one attempt, got %',n; END IF;
 RAISE NOTICE 'P3ARD A CLAIMED: holding lock 30 seconds; launch B now';
 PERFORM pg_sleep(30);
END $$;
COMMIT;
SELECT 'P3ARD A PASS: first attempt committed; no provider call' AS result;

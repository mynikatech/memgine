-- P3-A Counter Payment Bridge concurrency -- DEV ONLY, port 15432.
-- No provider calls. Synthetic IDs are fixed for cross-session coordination.
-- Do not run concurrently with another copy of this test.

BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '70s';
DO $$
DECLARE
  r record;
  v_count integer;
BEGIN
  SELECT * INTO r FROM commerce_begin_counter_remote_terminal_payment(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P3ACOUNTER-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P3ACOUNTER-REF-A-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF r."alreadyDispatched" IS DISTINCT FROM false
     OR r."providerReferenceId" IS DISTINCT FROM 'P3ACOUNTER-REF-A-20261016'
  THEN RAISE EXCEPTION 'P3A A FAIL: first begin did not create new attempt'; END IF;

  SELECT count(*) INTO v_count FROM commerce_provider_payment_attempts
   WHERE commerce_transaction_id='P3ACOUNTER-C-20261016'
     AND payment_channel='REMOTE_TERMINAL'
     AND provider_status='DISPATCHING';
  IF v_count<>1 THEN RAISE EXCEPTION 'P3A A FAIL: expected exactly one DISPATCHING attempt, found %',v_count; END IF;
  RAISE NOTICE 'P3A A CLAIMED: holding transaction lock for 30 seconds; start Session B NOW';
  PERFORM pg_sleep(30);
END $$;
COMMIT;
SELECT 'P3A A PASS: first begin committed one DISPATCHING attempt (no provider dispatch)' AS result;

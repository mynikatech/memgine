-- P3-A Counter Payment Bridge concurrency -- DEV ONLY, port 15432.
-- No provider calls. Synthetic IDs are fixed for cross-session coordination.
-- Do not run concurrently with another copy of this test.

BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '70s';
DO $$
DECLARE
  r record;
  v_started timestamptz := clock_timestamp();
  v_seconds numeric;
  v_count integer;
BEGIN
  SELECT * INTO r FROM commerce_begin_counter_remote_terminal_payment(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P3ACOUNTER-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P3ACOUNTER-REF-B-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  v_seconds := extract(epoch from clock_timestamp()-v_started);
  IF v_seconds<3 THEN
    RAISE EXCEPTION 'P3A B INCONCLUSIVE: waited only % seconds; run during Session A sleep',round(v_seconds,2);
  END IF;
  IF r."alreadyDispatched" IS DISTINCT FROM true
     OR r."providerReferenceId" IS DISTINCT FROM 'P3ACOUNTER-REF-A-20261016'
  THEN RAISE EXCEPTION 'P3A B FAIL: competing begin did not reuse reference A'; END IF;

  SELECT count(*) INTO v_count FROM commerce_provider_payment_attempts
   WHERE commerce_transaction_id='P3ACOUNTER-C-20261016'
     AND payment_channel='REMOTE_TERMINAL';
  IF v_count<>1 THEN RAISE EXCEPTION 'P3A B FAIL: % attempts exist, expected exactly one',v_count; END IF;
  IF EXISTS(SELECT 1 FROM commerce_provider_payment_attempts
            WHERE provider_reference_id='P3ACOUNTER-REF-B-20261016') THEN
    RAISE EXCEPTION 'P3A B FAIL: competing reference was inserted'; END IF;
  RAISE NOTICE 'P3A B PASS: waited % seconds; recovered reference A; exactly one attempt; no second attempt',round(v_seconds,2);
END $$;
ROLLBACK;

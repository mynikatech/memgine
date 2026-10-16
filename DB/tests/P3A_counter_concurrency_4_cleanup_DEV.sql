-- P3-A Counter Payment Bridge concurrency -- DEV ONLY, port 15432.
-- No provider calls. Synthetic IDs are fixed for cross-session coordination.
-- Do not run concurrently with another copy of this test.

-- Run ONLY after sessions A and B have finished, including after a failure.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  v_count int;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM commerce_transactions
                WHERE commerce_transaction_id='P3ACOUNTER-C-20261016')
  THEN RAISE EXCEPTION 'P3A CLEANUP STOP: synthetic Commerce transaction absent'; END IF;
  IF EXISTS(SELECT 1 FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id='P3ACOUNTER-C-20261016'
       AND provider_transaction_id IS NOT NULL)
  THEN RAISE EXCEPTION 'P3A CLEANUP STOP: provider transaction evidence exists; manual review required'; END IF;

  DELETE FROM commerce_provider_payment_attempts
   WHERE commerce_transaction_id='P3ACOUNTER-C-20261016'
     AND provider_reference_id='P3ACOUNTER-REF-A-20261016'
     AND provider_status='DISPATCHING';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count>1 THEN RAISE EXCEPTION 'P3A CLEANUP FAIL: multiple remote attempts unexpectedly deleted'; END IF;
  IF EXISTS(SELECT 1 FROM commerce_provider_payment_attempts
            WHERE commerce_transaction_id='P3ACOUNTER-C-20261016') THEN
     RAISE EXCEPTION 'P3A CLEANUP STOP: unexpected payment attempt remains'; END IF;

  DELETE FROM payment_attempts WHERE payment_attempt_id='P3ACOUNTER-A-20261016'
     AND payment_intent_id='P3ACOUNTER-I-20261016';
  IF NOT FOUND THEN RAISE EXCEPTION 'P3A CLEANUP STOP: synthetic payment attempt missing'; END IF;
  DELETE FROM payment_intents WHERE payment_intent_id='P3ACOUNTER-I-20261016'
     AND commerce_transaction_id='P3ACOUNTER-C-20261016';
  IF NOT FOUND THEN RAISE EXCEPTION 'P3A CLEANUP STOP: synthetic payment intent missing'; END IF;
  DELETE FROM commerce_transactions WHERE commerce_transaction_id='P3ACOUNTER-C-20261016'
      AND provider_transaction_id IS NULL AND status IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS');
  IF NOT FOUND THEN RAISE EXCEPTION 'P3A CLEANUP STOP: Commerce status or evidence unexpected'; END IF;
  RAISE NOTICE 'P3A COUNTER CLEANUP PASS: synthetic rows removed';
END $$;
COMMIT;

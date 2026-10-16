-- DEV ONLY. Run AFTER A and B have finished, in a separate Query Tool tab.
-- Deletes ONLY the uniquely identified synthetic intent. Refuses to delete if linked
-- to any attempts, capture, exception, or Commerce transaction, to avoid touching real data.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $test$
DECLARE v_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM payment_attempts WHERE payment_intent_id='P3ACONC-I-20261016')
    OR EXISTS (SELECT 1 FROM poynt_collect_verified_captures WHERE payment_intent_id='P3ACONC-I-20261016')
    OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions WHERE payment_intent_id='P3ACONC-I-20261016')
    OR EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id='P3ACONC-I-20261016' AND commerce_transaction_id IS NOT NULL)
  THEN RAISE EXCEPTION 'P3A CLEANUP STOP: unexpected linked records; inspect manually'; END IF;
  DELETE FROM payment_intents
  WHERE payment_intent_id='P3ACONC-I-20261016'
    AND idempotency_key='P3ACONC-I-20261016'
    AND authorization_mode='CUSTOMER_SESSION'
    AND provider_reference_id IS NULL
    AND finalized_subscription_id IS NULL
    AND status IN ('PENDING','PROCESSING');
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count <> 1 THEN RAISE EXCEPTION 'P3A CLEANUP STOP: expected exactly one synthetic intent, removed %',v_count; END IF;
  RAISE NOTICE 'P3A CLEANUP PASS: exactly one synthetic intent deleted';
END $test$;
COMMIT;

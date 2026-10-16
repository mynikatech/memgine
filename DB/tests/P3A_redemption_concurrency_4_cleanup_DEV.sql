-- P3-A Counter redemption concurrency, DEV ONLY (port 15432).
-- Synthetic records only; no Poynt call and no benefit consumption.
-- Finish both sessions before running cleanup.

-- Run only after A and B have finished. Failure is fail-closed; don't force deletion.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE n integer;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id='P3ARD-C-20261016')
 OR NOT EXISTS(SELECT 1 FROM redemption_transaction WHERE redemption_transaction_id='P3ARD-R-20261016')
 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: expected synthetic fixture missing'; END IF;
 IF EXISTS(SELECT 1 FROM commerce_provider_payment_attempts
    WHERE commerce_transaction_id='P3ARD-C-20261016'
    AND (provider_status <> 'DISPATCHING' OR provider_transaction_id IS NOT NULL
         OR provider_reference_id <> 'P3ARD-REF-A-20261016'))
 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: unexpected payment evidence/state'; END IF;
 IF EXISTS(SELECT 1 FROM commerce_transactions
    WHERE commerce_transaction_id='P3ARD-C-20261016'
      AND (status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') OR provider_transaction_id IS NOT NULL))
 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: Commerce status changed'; END IF;
 IF EXISTS(SELECT 1 FROM redemption_transaction
    WHERE redemption_transaction_id='P3ARD-R-20261016' AND status <> 'PENDING')
 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: redemption state changed'; END IF;
 DELETE FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P3ARD-C-20261016'
 AND provider_reference_id='P3ARD-REF-A-20261016' AND provider_status='DISPATCHING';
 DELETE FROM commerce_transaction_redemptions WHERE commerce_transaction_redemption_id='P3ARD-L-20261016'
 AND commerce_transaction_id='P3ARD-C-20261016' AND redemption_transaction_id='P3ARD-R-20261016';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: expected one synthetic link'; END IF;
 DELETE FROM commerce_transactions WHERE commerce_transaction_id='P3ARD-C-20261016';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: expected one synthetic Commerce transaction'; END IF;
 DELETE FROM redemption_transaction WHERE redemption_transaction_id='P3ARD-R-20261016';
 GET DIAGNOSTICS n = ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P3ARD CLEANUP STOP: expected one synthetic redemption'; END IF;
 RAISE NOTICE 'P3ARD CLEANUP PASS: synthetic rows removed';
END $$;
COMMIT;

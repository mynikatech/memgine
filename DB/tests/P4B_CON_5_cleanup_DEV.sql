-- DEV ONLY. Cleanup of committed synthetic failed-recovery concurrency fixture.
-- Run AFTER verification. Fail closed on unexpected states.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$ DECLARE n integer; BEGIN
 IF (SELECT count(*) FROM commerce_transactions WHERE commerce_transaction_id='P4BCON-C-20261016' AND status='PROVIDER_SUCCEEDED')<>1
 OR (SELECT count(*) FROM redemption_transaction WHERE redemption_transaction_id='P4BCON-R-20261016' AND status='SUCCESS')<>1
 OR (SELECT count(*) FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4BCON-C-20261016' AND provider_status='SUCCEEDED' AND provider_reference_id='P4BCON-REF-20261016')<>1
 OR (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND case_status='OPEN' AND fulfillment_outcome='FAILED')<>1
 OR EXISTS(SELECT 1 FROM redemption_transaction_item WHERE redemption_transaction_id='P4BCON-R-20261016' AND (redemption_id IS NOT NULL OR offer_redemption_id IS NOT NULL OR status <> 'PENDING'))
 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: fixture changed; do not force deletion'; END IF;
 DELETE FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: exception mismatch'; END IF;
 DELETE FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4BCON-C-20261016' AND provider_reference_id='P4BCON-REF-20261016';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: attempt mismatch'; END IF;
 DELETE FROM commerce_transaction_redemptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND redemption_transaction_id='P4BCON-R-20261016';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: link mismatch'; END IF;
 DELETE FROM redemption_transaction_item WHERE redemption_transaction_id='P4BCON-R-20261016';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: items missing'; END IF;
 DELETE FROM commerce_transactions WHERE commerce_transaction_id='P4BCON-C-20261016' AND source_channel='COUNTER_REDEMPTION';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: transaction mismatch'; END IF;
 DELETE FROM redemption_transaction WHERE redemption_transaction_id='P4BCON-R-20261016';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'P4B CON CLEANUP STOP: redemption mismatch'; END IF;
 RAISE NOTICE 'P4B CON CLEANUP PASS: committed synthetic fixture removed';
END $$;
COMMIT;

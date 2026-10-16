-- DEV ONLY. Read-only post-concurrency evidence check.
BEGIN READ ONLY;
SET LOCAL search_path=memginedev,pg_catalog;
DO $$ BEGIN
 IF (SELECT count(*) FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4BCON-C-20261016' AND provider_status='SUCCEEDED' AND provider_reference_id='P4BCON-REF-20261016')<>1
 OR (SELECT count(*) FROM commerce_transactions WHERE commerce_transaction_id='P4BCON-C-20261016' AND status='PROVIDER_SUCCEEDED')<>1
 OR (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4BCON-C-20261016' AND case_status='OPEN' AND fulfillment_outcome='FAILED')<>1
 OR (SELECT count(*) FROM redemption_transaction WHERE redemption_transaction_id='P4BCON-R-20261016' AND status='SUCCESS')<>1
 THEN RAISE EXCEPTION 'P4B CON VERIFY FAIL: synthetic financial evidence changed'; END IF;
 IF EXISTS(SELECT 1 FROM redemption_transaction_item WHERE redemption_transaction_id='P4BCON-R-20261016' AND (redemption_id IS NOT NULL OR offer_redemption_id IS NOT NULL))
 THEN RAISE EXCEPTION 'P4B CON VERIFY FAIL: unexpected benefit consumption'; END IF;
 RAISE NOTICE 'P4B CON VERIFY PASS: two attempted recoveries, provider success retained, exception OPEN/FAILED, zero benefit consumption';
END $$;
ROLLBACK;

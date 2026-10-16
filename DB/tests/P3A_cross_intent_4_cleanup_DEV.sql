-- DEV ONLY. Run after A and B fully finish. Deletes ONLY the two named synthetic
-- payment intents; refuses cleanup if either is linked to financial records.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $test$
DECLARE ids varchar(64)[] := ARRAY['P3AXINT-A-20261016','P3AXINT-B-20261016'];
 removed integer;
BEGIN
 IF EXISTS(SELECT 1 FROM payment_attempts WHERE payment_intent_id=ANY(ids))
 OR EXISTS(SELECT 1 FROM poynt_collect_verified_captures WHERE payment_intent_id=ANY(ids))
 OR EXISTS(SELECT 1 FROM poynt_collect_financial_exceptions WHERE payment_intent_id=ANY(ids))
 OR EXISTS(SELECT 1 FROM payment_intents WHERE payment_intent_id=ANY(ids)
   AND (commerce_transaction_id IS NOT NULL OR provider_reference_id IS NOT NULL OR finalized_subscription_id IS NOT NULL))
 THEN RAISE EXCEPTION 'P3A CLEANUP STOP: unexpected linkage; inspect manually'; END IF;
 DELETE FROM payment_intents
 WHERE payment_intent_id=ANY(ids) AND idempotency_key=payment_intent_id
 AND authorization_mode='CUSTOMER_SESSION' AND status IN ('PENDING','PROCESSING')
 AND provider_reference_id IS NULL AND finalized_subscription_id IS NULL;
 GET DIAGNOSTICS removed=ROW_COUNT;
 IF removed<>2 THEN RAISE EXCEPTION 'P3A CLEANUP STOP: expected exactly 2 synthetic rows, deleted % (rolled back)',removed; END IF;
 RAISE NOTICE 'P3A CLEANUP PASS: exactly two synthetic intents deleted';
END $test$;
COMMIT;

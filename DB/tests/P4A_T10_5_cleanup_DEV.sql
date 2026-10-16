-- P4-A T10 (5/5): ONLY after verify and all other sessions finished.
-- Deletes EXACT synthetic fixture, fails closed if any unexpected evidence is found.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL lock_timeout='5s';
DO $test$
DECLARE n int;
BEGIN
 IF (SELECT count(*) FROM commerce_transactions WHERE commerce_transaction_id='P4ADUR-C-20261016')<>1
 OR (SELECT count(*) FROM payment_intents WHERE payment_intent_id='P4ADUR-I-20261016')<>1
 OR (SELECT count(*) FROM payment_attempts WHERE payment_attempt_id='P4ADUR-A-20261016')<>1
 THEN RAISE EXCEPTION 'P4A T10 CLEANUP STOP: fixture incomplete or changed'; END IF;
 IF (SELECT count(*) FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4ADUR-C-20261016'
   AND provider_reference_id='P4ADUR-REF-20261016' AND provider_transaction_id='P4ADUR-TX-20261016'
   AND provider_status='SUCCEEDED')<>1
 OR (SELECT count(*) FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4ADUR-C-20261016')<>1
 OR (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4ADUR-C-20261016'
   AND provider_transaction_id='P4ADUR-TX-20261016' AND classification='CAPTURED_UNFULFILLED')<>1
 OR (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4ADUR-C-20261016')<>1
 OR NOT EXISTS (SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id='P4ADUR-C-20261016'
   AND status='PROVIDER_SUCCEEDED' AND provider_transaction_id='P4ADUR-TX-20261016')
 THEN RAISE EXCEPTION 'P4A T10 CLEANUP STOP: unexpected financial state/evidence; do not force delete'; END IF;
 -- Do not delete actual verified payment evidence. These identifiers belong ONLY to
 -- our synthetic fixture; this is a controlled DEV-only test teardown.
 DELETE FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id='P4ADUR-C-20261016'
 AND provider_transaction_id='P4ADUR-TX-20261016';
 DELETE FROM commerce_provider_payment_attempts WHERE commerce_transaction_id='P4ADUR-C-20261016'
 AND provider_reference_id='P4ADUR-REF-20261016';
 DELETE FROM payment_attempts WHERE payment_attempt_id='P4ADUR-A-20261016'
 AND payment_intent_id='P4ADUR-I-20261016';
 DELETE FROM payment_intents WHERE payment_intent_id='P4ADUR-I-20261016'
 AND commerce_transaction_id='P4ADUR-C-20261016';
 DELETE FROM commerce_transactions WHERE commerce_transaction_id='P4ADUR-C-20261016'
 AND provider_transaction_id='P4ADUR-TX-20261016';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4A T10 CLEANUP STOP: Commerce deletion unexpected'; END IF;
 RAISE NOTICE 'P4A T10 CLEANUP PASS: synthetic Commerce, evidence and exception removed';
END $test$;
COMMIT;

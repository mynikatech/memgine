-- Run in TAB A; while sleeping, immediately start Session B in TAB B.
-- Session A claims A and holds the advisory lock 30 seconds, then commits.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '65s';
DO $test$
DECLARE v_org varchar(64); v_user varchar(64); v_claim boolean;
BEGIN
 SELECT organization_id,customer_user_id INTO v_org,v_user FROM payment_intents
 WHERE payment_intent_id='P3AXINT-A-20261016';
 IF v_org IS NULL THEN RAISE EXCEPTION 'P3A missing fixture A'; END IF;
 SELECT payment_claim_poynt_collect_charge(v_org,'P3AXINT-A-20261016',v_user) INTO v_claim;
 IF v_claim IS DISTINCT FROM true THEN RAISE EXCEPTION 'P3A FAIL A: first claim did not succeed'; END IF;
 RAISE NOTICE 'P3A A: first intent claimed, holding transaction 30 seconds';
 PERFORM pg_sleep(30);
END $test$;
COMMIT;
SELECT CASE WHEN status='PROCESSING' THEN 'P3A A PASS: first intent PROCESSING and committed'
 ELSE 'P3A A FAIL: unexpected status '||status END AS result
 FROM memginedev.payment_intents WHERE payment_intent_id='P3AXINT-A-20261016';

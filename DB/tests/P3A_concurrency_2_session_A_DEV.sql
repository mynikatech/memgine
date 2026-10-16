-- Run this entire script in pgAdmin Query Tool TAB A.
-- Immediately after starting it, run Session B in a DIFFERENT Query Tool tab.
-- A acquires the claim, holds its transaction for 30 seconds, then COMMITS.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '65s';
DO $test$
DECLARE v_claim boolean; v_org varchar(64); v_actor varchar(64);
BEGIN
  SELECT organization_id, customer_user_id INTO v_org,v_actor
  FROM payment_intents WHERE payment_intent_id='P3ACONC-I-20261016';
  IF v_org IS NULL THEN RAISE EXCEPTION 'P3A fixture missing; run setup first'; END IF;
  SELECT payment_claim_poynt_collect_charge(v_org,'P3ACONC-I-20261016',v_actor) INTO v_claim;
  IF v_claim IS DISTINCT FROM true THEN RAISE EXCEPTION 'P3A FAIL A: first claim did not win'; END IF;
  RAISE NOTICE 'P3A A: claim acquired; holding transaction 30 seconds';
  PERFORM pg_sleep(30);
END $test$;
COMMIT;
SELECT 'P3A A PASS: first claim committed' AS result;

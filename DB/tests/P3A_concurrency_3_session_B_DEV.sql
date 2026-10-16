-- Run this entire script in a DIFFERENT pgAdmin Query Tool TAB B
-- while Session A is sleeping (start within 5 seconds of A).
-- To prove real contention, B must wait >= 3 seconds on A's lock, then return FALSE.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '65s';
DO $test$
DECLARE v_claim boolean; v_org varchar(64); v_actor varchar(64);
  v_started timestamptz; v_wait numeric;
BEGIN
  SELECT organization_id, customer_user_id INTO v_org,v_actor
  FROM payment_intents WHERE payment_intent_id='P3ACONC-I-20261016';
  IF v_org IS NULL THEN RAISE EXCEPTION 'P3A fixture missing; run setup first'; END IF;
  v_started := clock_timestamp();
  SELECT payment_claim_poynt_collect_charge(v_org,'P3ACONC-I-20261016',v_actor) INTO v_claim;
  v_wait := extract(epoch FROM clock_timestamp()-v_started);
  IF v_claim IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P3A FAIL B: competing claim was allowed (value=%)',v_claim;
  END IF;
  IF v_wait < 3 THEN
    RAISE EXCEPTION 'P3A NOT PROVEN: second claim returned FALSE without measurable contention (wait=% seconds); rerun with B started during A sleep', round(v_wait,2);
  END IF;
  RAISE NOTICE 'P3A B PASS: competing claim blocked for % seconds and returned FALSE; no second charge claim authorized',round(v_wait,2);
END $test$;
ROLLBACK;

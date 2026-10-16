-- Run in independent TAB B within 5 seconds of A starting its 30-second sleep.
-- Expected: B waits on the shared customer/product advisory lock then gets
-- SQLSTATE 22023, NOT permission to charge. B remains PENDING.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '65s';
DO $test$
DECLARE v_org varchar(64); v_user varchar(64); v_claim boolean;
        t0 timestamptz; waited numeric; rejected boolean := false;
        state_b varchar(32); v_error text;
BEGIN
 SELECT organization_id,customer_user_id INTO v_org,v_user FROM payment_intents
 WHERE payment_intent_id='P3AXINT-B-20261016';
 IF v_org IS NULL THEN RAISE EXCEPTION 'P3A missing fixture B'; END IF;
 t0:=clock_timestamp();
 BEGIN
   SELECT payment_claim_poynt_collect_charge(v_org,'P3AXINT-B-20261016',v_user) INTO v_claim;
 EXCEPTION WHEN SQLSTATE '22023' THEN
   GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
   IF v_error NOT LIKE 'Existing membership payment requires review%' THEN
     RAISE EXCEPTION 'P3A FAIL B: unexpected 22023: %',v_error;
   END IF;
   rejected:=true;
 END;
 waited:=extract(epoch FROM clock_timestamp()-t0);
 IF NOT rejected THEN
   RAISE EXCEPTION 'P3A FAIL B: competing DIFFERENT intent received outcome %; expected same-product protection',v_claim;
 END IF;
 IF waited < 3 THEN
   RAISE EXCEPTION 'P3A NOT PROVEN: B did not measurably wait (% sec); start B during A sleep',round(waited,2);
 END IF;
 SELECT status INTO state_b FROM payment_intents WHERE payment_intent_id='P3AXINT-B-20261016';
 IF state_b IS DISTINCT FROM 'PENDING' THEN
   RAISE EXCEPTION 'P3A FAIL B: second intent status changed to %',state_b;
 END IF;
 RAISE NOTICE 'P3A B PASS: different intent waited % seconds, rejected by same-product guard, stayed PENDING',round(waited,2);
END $test$;
ROLLBACK;

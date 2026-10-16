-- P4-B committed successful concurrency: READ-ONLY FIXTURE PREFLIGHT.
-- DEV ONLY: 127.0.0.1:15432 / memgine_dev. No provider calls.
-- Run this first; it does NOT run fulfillment or create records.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;
DO $test$
DECLARE v_ct int; v_pi int; v_pa int; v_actor boolean; v_term boolean;
BEGIN
  SELECT count(*) INTO v_ct FROM commerce_transactions
   WHERE commerce_transaction_id='CTX_0c1a68fb-e783-498f-8518-ade352df5043'
     AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
     AND source_channel='COUNTER' AND status='ORDER_CREATED' AND NOT is_deleted;
  SELECT count(*) INTO v_pi FROM payment_intents
   WHERE payment_intent_id='0b9c61c7-0219-4b6d-82ca-9be15228d6cb'
     AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
     AND finalized_subscription_id IS NULL;
  SELECT count(*) INTO v_pa FROM payment_attempts
   WHERE payment_intent_id='0b9c61c7-0219-4b6d-82ca-9be15228d6cb';
  SELECT counter_can_operate('ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
           p.store_id,p.staff_id,'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e') INTO v_actor
    FROM payment_intents p WHERE p.payment_intent_id='0b9c61c7-0219-4b6d-82ca-9be15228d6cb';
  SELECT EXISTS (
    SELECT 1 FROM poynt_terminal_bindings b JOIN pos_devices d ON d.pos_device_id=b.pos_device_id
    JOIN commerce_transactions c ON c.commerce_transaction_id='CTX_0c1a68fb-e783-498f-8518-ade352df5043'
    WHERE b.pos_device_id='POS_e0940e88-ccf3-461e-aedf-1f0fab879733'
      AND b.organization_id=c.organization_id AND b.store_id IS NOT DISTINCT FROM c.store_id
      AND NOT b.is_deleted AND NOT d.is_deleted AND d.revoked_at IS NULL
      AND NULLIF(btrim(b.poynt_business_id),'') IS NOT NULL
      AND NULLIF(btrim(b.poynt_terminal_id),'') IS NOT NULL) INTO v_term;
  IF v_ct<>1 OR v_pi<>1 OR v_pa<1 OR v_actor IS DISTINCT FROM true OR v_term IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P4B CON SUCCESS PREFLIGHT STOP: source reference or authorized terminal unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id LIKE 'P4BCS-%')
    OR EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id LIKE 'P4BCS-%')
    OR EXISTS (SELECT 1 FROM business_otp_context WHERE business_otp_context_id LIKE 'P4BCS-%')
    OR EXISTS (SELECT 1 FROM otp_challenges WHERE otp_challenge_id LIKE 'P4BCS-%')
    OR EXISTS (SELECT 1 FROM "user" WHERE user_id LIKE 'P4BCS-%')
    OR EXISTS (SELECT 1 FROM organization_user WHERE organization_user_id LIKE 'P4BCS-%')
  THEN RAISE EXCEPTION 'P4B CON SUCCESS PREFLIGHT STOP: earlier synthetic fixture exists'; END IF;
  RAISE NOTICE 'P4B CON SUCCESS PREFLIGHT PASS: Counter source, payment attempt, staff authorization and terminal available; test IDs unused';
END $test$;
SELECT table_name,column_name,data_type,is_nullable,column_default
 FROM information_schema.columns
 WHERE table_schema='memginedev' AND table_name IN ('user','organization_user','subscriptions','payment_intents')
 ORDER BY table_name,ordinal_position;
SELECT conrelid::regclass AS referencing_table, conname AS fk_name,
       pg_get_constraintdef(oid) AS definition
 FROM pg_constraint WHERE contype='f'
  AND confrelid IN ('memginedev."user"'::regclass,'memginedev.organization_user'::regclass,
                   'memginedev.subscriptions'::regclass)
 ORDER BY referencing_table::text,conname;
ROLLBACK;

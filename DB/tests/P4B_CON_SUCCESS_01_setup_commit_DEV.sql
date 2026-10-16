-- P4-B Counter membership recovery -- DEV ONLY, port 15432.
-- NO provider calls, NO commit; synthetic cloning and fulfillment rolled back.
-- Do not run concurrently with another copy of this test.

BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE
  c commerce_transactions%ROWTYPE;
  p payment_intents%ROWTYPE;
  a payment_attempts%ROWTYPE;
  v_new_c commerce_transactions%ROWTYPE;
  v_new_p payment_intents%ROWTYPE;
  v_new_a payment_attempts%ROWTYPE;
  n int;
  v_challenge otp_challenges%ROWTYPE;
  v_context business_otp_context%ROWTYPE;
  v_source_user "user"%ROWTYPE;
  v_synthetic_user "user"%ROWTYPE;
  v_source_ou organization_user%ROWTYPE;
  v_synthetic_ou organization_user%ROWTYPE;
BEGIN
  -- Never overwrite or automatically remove a previous fixture.
  IF EXISTS (SELECT 1 FROM "user" WHERE user_id='P4BCS-U-20261017')
    OR EXISTS (SELECT 1 FROM organization_user WHERE organization_user_id='P4BCS-OU-20261017')
    OR EXISTS (SELECT 1 FROM otp_challenges WHERE otp_challenge_id='P4BCS-OTP-20261016')
    OR EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id='P4BCS-I-20261016')
  THEN RAISE EXCEPTION 'P4B CS EXISTING FIXTURE: do not rerun setup'; END IF;
  -- Prevent colliding with unfinished earlier run. Never replace/delete anything here.
  SELECT count(*) INTO n FROM commerce_transactions
   WHERE commerce_transaction_id = 'P4BCS-C-20261016';
  IF n <> 0 THEN RAISE EXCEPTION 'P4B FIXTURE ALREADY EXISTS: cleanup previous run first'; END IF;

  SELECT * INTO c FROM commerce_transactions
   WHERE commerce_transaction_id='CTX_0c1a68fb-e783-498f-8518-ade352df5043'
     AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
     AND source_channel='COUNTER' AND status='ORDER_CREATED' AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FIXTURE UNAVAILABLE: source Commerce transaction has changed'; END IF;

  SELECT * INTO p FROM payment_intents
   WHERE payment_intent_id='0b9c61c7-0219-4b6d-82ca-9be15228d6cb'
     AND commerce_transaction_id=c.commerce_transaction_id
     AND organization_id=c.organization_id
     AND staff_id='STF_53a4cbbb-a118-4267-a1da-5d268bce53a6'
     AND store_id=c.store_id AND finalized_subscription_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FIXTURE UNAVAILABLE: source payment intent has changed'; END IF;

  SELECT * INTO a FROM payment_attempts
   WHERE payment_intent_id=p.payment_intent_id
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FIXTURE UNAVAILABLE: source payment attempt missing'; END IF;

  IF NOT EXISTS (
   SELECT 1 FROM poynt_terminal_bindings b JOIN pos_devices d ON d.pos_device_id=b.pos_device_id
    WHERE b.pos_device_id='POS_e0940e88-ccf3-461e-aedf-1f0fab879733'
      AND b.organization_id=c.organization_id AND b.store_id IS NOT DISTINCT FROM c.store_id
      AND NOT b.is_deleted AND NOT d.is_deleted AND d.revoked_at IS NULL
      AND NULLIF(btrim(b.poynt_business_id),'') IS NOT NULL
      AND NULLIF(btrim(b.poynt_terminal_id),'') IS NOT NULL
  ) OR NOT counter_can_operate(c.organization_id, p.store_id, p.staff_id,
                                'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e')
  THEN RAISE EXCEPTION 'P4B FIXTURE UNAVAILABLE: terminal or staff authorization changed'; END IF;

  SELECT * INTO v_source_user FROM "user" WHERE user_id=p.customer_user_id AND NOT is_deleted;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B CS UNSUITABLE: source customer missing'; END IF;
  SELECT * INTO v_source_ou FROM organization_user
   WHERE organization_id=c.organization_id AND user_id=p.customer_user_id AND NOT is_deleted
   ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B CS UNSUITABLE: source customer organization linkage missing'; END IF;

  SELECT * INTO v_synthetic_user FROM jsonb_populate_record(NULL::"user",
     to_jsonb(v_source_user) || jsonb_build_object(
       'user_id','P4BCS-U-20261017', 'user_code','P4BCS-U-20261017',
       'first_name','Synthetic', 'last_name','Concurrency',
       'display_name','Synthetic Concurrency Test',
       'primary_phone','+15550006117', 'primary_email',NULL,
       'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
       'is_deleted',false,'version_no',1));
  INSERT INTO "user" SELECT (v_synthetic_user).*;

  SELECT * INTO v_synthetic_ou FROM jsonb_populate_record(NULL::organization_user,
     to_jsonb(v_source_ou) || jsonb_build_object(
       'organization_user_id','P4BCS-OU-20261017',
       'user_id','P4BCS-U-20261017',
       'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
       'is_deleted',false,'version_no',1));
  INSERT INTO organization_user SELECT (v_synthetic_ou).*;
  RAISE NOTICE 'P4B CON SUCCESS CUSTOMER PASS: independent synthetic customer created';

  -- Simulate independently-created Counter OTP authorization using synthetic
  -- challenge/context rows. No existing OTP authorization is copied or consumed.
  -- This is a DB fixture, not proof of a completed real-world OTP verification.
  SELECT * INTO v_challenge FROM jsonb_populate_record(NULL::otp_challenges,
      jsonb_build_object(
        'otp_challenge_id','P4BCS-OTP-20261016',
        'destination','+15550006117', 'destination_region','US',
        'purpose','COUNTER_PURCHASE_VERIFY', 'delivery_channel','SMS',
        'provider_code','TEST',
        'otp_hash', repeat('0',64), 'otp_salt','P4BCS-ONLY',
        'context_json','{}'::jsonb,'status','CONSUMED',
        'failed_attempt_count',0,'max_attempt_count',3,
        'created_at',clock_timestamp() - interval '1 minute',
        'expires_at',clock_timestamp() + interval '10 minutes',
        'consumed_at',clock_timestamp(),
        'updated_at',clock_timestamp(),
        'created_by','USR_b474a1c3-79e5-4d20-96a9-780cbe32227e',
        'updated_by','USR_b474a1c3-79e5-4d20-96a9-780cbe32227e',
        'version_no',1));
  INSERT INTO otp_challenges SELECT (v_challenge).*;

  SELECT * INTO v_context FROM jsonb_populate_record(NULL::business_otp_context,
      jsonb_build_object(
        'business_otp_context_id','P4BCS-OTPC-20261016',
        'otp_challenge_id','P4BCS-OTP-20261016',
        'purpose','COUNTER_PURCHASE_VERIFY',
        'organization_id',c.organization_id,
        'store_id',p.store_id,
        'plan_id',p.membership_plan_id,
        'subscription_id',NULL,
        'user_id','P4BCS-U-20261017',
        'staff_id',p.staff_id,
        'normalized_phone','+15550006117',
        'benefit_ids',NULL,
        'payload','{}'::jsonb,
        'consumed_at',NULL,
        'created_at',clock_timestamp(),
        'counter_purchase_id',NULL));
  IF v_context.user_id IS NULL OR v_context.plan_id IS NULL OR v_context.staff_id IS NULL THEN
    RAISE EXCEPTION 'P4B FIXTURE UNSUITABLE: source intent lacks customer/plan/staff';
  END IF;
  INSERT INTO business_otp_context SELECT (v_context).*;

  -- Full-row cloning preserves current schema-required snapshot fields without
  -- updating the source row. Replace identifiers, external unique keys and status.
  SELECT * INTO v_new_c FROM jsonb_populate_record(NULL::commerce_transactions,
     to_jsonb(c) || jsonb_build_object(
       'commerce_transaction_id','P4BCS-C-20261016',
       'idempotency_key','P4BCS-C-20261016',
       'provider_order_id','P4BCS-ORDER-20261016',
       'customer_user_id','P4BCS-U-20261017',
       'provider_transaction_id',NULL,
       'status','ORDER_CREATED','completed_at',NULL,
       'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
       'version_no',1,'failure_code',NULL,'failure_message',NULL));
  INSERT INTO commerce_transactions SELECT (v_new_c).*;

  SELECT * INTO v_new_p FROM jsonb_populate_record(NULL::payment_intents,
     to_jsonb(p) || jsonb_build_object(
       'payment_intent_id','P4BCS-I-20261016',
       'commerce_transaction_id','P4BCS-C-20261016',
       'business_otp_challenge_id','P4BCS-OTP-20261016',
       'customer_user_id','P4BCS-U-20261017',
       'idempotency_key','P4BCS-I-20261016',
       'provider_reference_id',NULL,
       'finalized_subscription_id',NULL,
       'status','PENDING','failure_code',NULL,'failure_message',NULL,
       'cancelled_at',NULL,'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
  INSERT INTO payment_intents SELECT (v_new_p).*;

  SELECT * INTO v_new_a FROM jsonb_populate_record(NULL::payment_attempts,
     to_jsonb(a) || jsonb_build_object(
       'payment_attempt_id','P4BCS-A-20261016',
       'payment_intent_id','P4BCS-I-20261016',
       'idempotency_key','P4BCS-A-20261016',
       'provider_reference_id',NULL,
       'status','PENDING','failure_code',NULL,'failure_message',NULL,
       'processed_at',NULL,'created_at',clock_timestamp()));
  INSERT INTO payment_attempts SELECT (v_new_a).*;

  RAISE NOTICE 'P4B CON SUCCESS AUTH PASS: synthetic OTP challenge and Counter purchase context created';
  RAISE NOTICE 'P4B COUNTER SETUP PASS: synthetic Commerce, intent, attempt created; transaction remains uncommitted';
END $$;

DO $p4b$
DECLARE
  r record;
  v_case varchar;
  v_result varchar;
  v_repeat varchar;
  v_count int;
  v_subscription varchar;
BEGIN
  SELECT * INTO r FROM commerce_begin_counter_remote_terminal_payment(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BCS-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P4BCS-REF-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF r."alreadyDispatched" IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P4B FAIL: synthetic attempt unexpectedly reused';
  END IF;
  UPDATE commerce_provider_payment_attempts
     SET provider_status='SUCCEEDED', provider_transaction_id='P4BCS-TX-20261016'
   WHERE commerce_transaction_id='P4BCS-C-20261016'
     AND provider_reference_id='P4BCS-REF-20261016' AND provider_status='DISPATCHING';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FAIL: no synthetic provider attempt'; END IF;
  UPDATE commerce_transactions
     SET status='PROVIDER_SUCCEEDED', provider_transaction_id='P4BCS-TX-20261016'
   WHERE commerce_transaction_id='P4BCS-C-20261016' AND status='PROVIDER_IN_PROGRESS';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FAIL: no synthetic Commerce provider success'; END IF;
  RAISE NOTICE 'P4B CON SUCCESS EVIDENCE PASS: synthetic Counter success recorded synthetically; COMMIT follows';

  v_case := commerce_open_counter_financial_exception_for_recovery(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BCS-C-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_case IS NULL THEN RAISE EXCEPTION 'P4B CS FAIL: no case'; END IF;
  RAISE NOTICE 'P4B CON SUCCESS SETUP PASS: verified evidence and open exception; COMMIT follows';
END $p4b$;
COMMIT;

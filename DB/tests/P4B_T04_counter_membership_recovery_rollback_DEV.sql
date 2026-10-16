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
BEGIN
  -- Prevent colliding with unfinished earlier run. Never replace/delete anything here.
  SELECT count(*) INTO n FROM commerce_transactions
   WHERE commerce_transaction_id = 'P4BTEST-C-20261016';
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

  -- Full-row cloning preserves current schema-required snapshot fields without
  -- updating the source row. Replace identifiers, external unique keys and status.
  SELECT * INTO v_new_c FROM jsonb_populate_record(NULL::commerce_transactions,
     to_jsonb(c) || jsonb_build_object(
       'commerce_transaction_id','P4BTEST-C-20261016',
       'idempotency_key','P4BTEST-C-20261016',
       'provider_order_id','P4BTEST-ORDER-20261016',
       'provider_transaction_id',NULL,
       'status','ORDER_CREATED','completed_at',NULL,
       'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
       'version_no',1,'failure_code',NULL,'failure_message',NULL));
  INSERT INTO commerce_transactions SELECT (v_new_c).*;

  SELECT * INTO v_new_p FROM jsonb_populate_record(NULL::payment_intents,
     to_jsonb(p) || jsonb_build_object(
       'payment_intent_id','P4BTEST-I-20261016',
       'commerce_transaction_id','P4BTEST-C-20261016',
       'business_otp_challenge_id',NULL,
       'idempotency_key','P4BTEST-I-20261016',
       'provider_reference_id',NULL,
       'finalized_subscription_id',NULL,
       'status','PENDING','failure_code',NULL,'failure_message',NULL,
       'cancelled_at',NULL,'created_at',clock_timestamp(),'updated_at',clock_timestamp()));
  INSERT INTO payment_intents SELECT (v_new_p).*;

  SELECT * INTO v_new_a FROM jsonb_populate_record(NULL::payment_attempts,
     to_jsonb(a) || jsonb_build_object(
       'payment_attempt_id','P4BTEST-A-20261016',
       'payment_intent_id','P4BTEST-I-20261016',
       'idempotency_key','P4BTEST-A-20261016',
       'provider_reference_id',NULL,
       'status','PENDING','failure_code',NULL,'failure_message',NULL,
       'processed_at',NULL,'created_at',clock_timestamp()));
  INSERT INTO payment_attempts SELECT (v_new_a).*;

  RAISE NOTICE 'P4B COUNTER SETUP PASS: synthetic Commerce, intent, attempt created; COMMIT follows';
END $$;


-- Prepare synthetic success evidence without contacting terminal or provider.
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
    'P4BTEST-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P4BTEST-REF-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF r."alreadyDispatched" IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P4B FAIL: synthetic attempt unexpectedly reused';
  END IF;
  UPDATE commerce_provider_payment_attempts
     SET provider_status='SUCCEEDED', provider_transaction_id='P4BTEST-TX-20261016'
   WHERE commerce_transaction_id='P4BTEST-C-20261016'
     AND provider_reference_id='P4BTEST-REF-20261016' AND provider_status='DISPATCHING';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FAIL: no synthetic provider attempt'; END IF;
  UPDATE commerce_transactions
     SET status='PROVIDER_SUCCEEDED', provider_transaction_id='P4BTEST-TX-20261016'
   WHERE commerce_transaction_id='P4BTEST-C-20261016' AND status='PROVIDER_IN_PROGRESS';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B FAIL: no synthetic Commerce provider success'; END IF;
  RAISE NOTICE 'P4B T04 EVIDENCE PASS: synthetic Counter success recorded in rollback-only transaction';

  v_case := commerce_open_counter_financial_exception_for_recovery(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BTEST-C-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_case IS NULL THEN RAISE EXCEPTION 'P4B FAIL: evidence-backed case not opened'; END IF;
  RAISE NOTICE 'P4B T04 CASE PASS: authorized recovery case opened';

  BEGIN
    v_result := commerce_recover_counter_financial_exception(
      'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
      'P4BTEST-C-20261016',
      'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P4B T04 RECOVERY FAILED: SQLSTATE %, %', SQLSTATE, SQLERRM;
    RAISE;
  END;
  IF v_result IS DISTINCT FROM 'P4BTEST-C-20261016' THEN
    RAISE EXCEPTION 'P4B FAIL: unexpected recovery result %', v_result;
  END IF;

  SELECT subscription_id INTO v_subscription FROM commerce_transactions
    WHERE commerce_transaction_id='P4BTEST-C-20261016';
  IF v_subscription IS NULL THEN RAISE EXCEPTION 'P4B FAIL: recovery did not link subscription'; END IF;
  SELECT count(*) INTO v_count FROM poynt_collect_financial_exceptions
   WHERE commerce_transaction_id='P4BTEST-C-20261016'
     AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED'
     AND related_subscription_id=v_subscription;
  IF v_count <> 1 THEN RAISE EXCEPTION 'P4B FAIL: case not resolved against subscription'; END IF;
  RAISE NOTICE 'P4B T04 FULFILLMENT PASS: subscription linked; original exception resolved';

  v_repeat := commerce_recover_counter_financial_exception(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BTEST-C-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_repeat IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'P4B FAIL: repeat returned different result'; END IF;
  SELECT count(*) INTO v_count FROM poynt_collect_financial_exceptions
   WHERE commerce_transaction_id='P4BTEST-C-20261016';
  IF v_count <> 1 THEN RAISE EXCEPTION 'P4B FAIL: duplicate financial exception'; END IF;
  RAISE NOTICE 'P4B T04 REPEAT PASS: same Commerce result and only one financial exception';
END $p4b$;
ROLLBACK;

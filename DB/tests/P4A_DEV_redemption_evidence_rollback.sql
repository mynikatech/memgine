-- P3-A Counter redemption concurrency, DEV ONLY (port 15432).
-- Synthetic records only; no Poynt call and no benefit consumption.
-- Finish both sessions before running cleanup.

BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL lock_timeout='5s';
DO $$
DECLARE r redemption_transaction%ROWTYPE; c commerce_transactions%ROWTYPE;
 nr redemption_transaction%ROWTYPE; nc commerce_transactions%ROWTYPE;
 actor_ou varchar(64); n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM redemption_transaction WHERE redemption_transaction_id='P3ARD-R-20261016')
 OR EXISTS(SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id='P3ARD-C-20261016')
 THEN RAISE EXCEPTION 'P3ARD SETUP STOP: existing synthetic fixture; cleanup before retry'; END IF;

 SELECT * INTO r FROM redemption_transaction
 WHERE redemption_transaction_id='RTX_40e3d218-7d04-425f-9116-e175b7f78837'
 AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b';
 IF NOT FOUND THEN RAISE EXCEPTION 'P3ARD FIXTURE UNAVAILABLE: source redemption changed'; END IF;
 IF NOT counter_can_operate(r.organization_id,r.store_id,r.staff_id,
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e') THEN
    RAISE EXCEPTION 'P3ARD FIXTURE UNAVAILABLE: staff unauthorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM poynt_terminal_bindings b JOIN pos_devices d ON d.pos_device_id=b.pos_device_id
  WHERE b.pos_device_id='POS_e0940e88-ccf3-461e-aedf-1f0fab879733'
    AND b.organization_id=r.organization_id AND b.store_id IS NOT DISTINCT FROM r.store_id
    AND NOT b.is_deleted AND NOT d.is_deleted AND d.revoked_at IS NULL
    AND NULLIF(btrim(b.poynt_business_id),'') IS NOT NULL AND NULLIF(btrim(b.poynt_terminal_id),'') IS NOT NULL)
 THEN RAISE EXCEPTION 'P3ARD FIXTURE UNAVAILABLE: terminal inactive'; END IF;

 SELECT organization_user_id INTO actor_ou FROM organization_user
  WHERE organization_id=r.organization_id AND user_id='USR_b474a1c3-79e5-4d20-96a9-780cbe32227e'
    AND NOT is_deleted LIMIT 1;
 IF actor_ou IS NULL THEN RAISE EXCEPTION 'P3ARD FIXTURE UNAVAILABLE: actor membership missing'; END IF;

 SELECT * INTO c FROM commerce_transactions WHERE commerce_transaction_id='CTX_0c1a68fb-e783-498f-8518-ade352df5043'
 AND organization_id=r.organization_id AND integration_configuration_id IS NOT NULL
 AND provider_order_id IS NOT NULL AND total_minor>0 AND currency_code ~ '^[A-Z]{3}$'
 AND store_id IS NOT DISTINCT FROM r.store_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'P3ARD FIXTURE UNAVAILABLE: base Commerce pricing/integration missing'; END IF;

 SELECT * INTO nr FROM jsonb_populate_record(NULL::redemption_transaction,to_jsonb(r)||jsonb_build_object(
  'redemption_transaction_id','P3ARD-R-20261016',
  'redemption_transaction_number','P3ARD-NUM-20261016',
  'status','PENDING','completed_at',NULL,
  'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'version_no',1));
 INSERT INTO redemption_transaction SELECT (nr).*;

 SELECT * INTO nc FROM jsonb_populate_record(NULL::commerce_transactions,to_jsonb(c)||jsonb_build_object(
   'commerce_transaction_id','P3ARD-C-20261016',
   'source_channel','COUNTER_REDEMPTION','status','ORDER_CREATED',
   'idempotency_key','P3ARD-C-20261016',
   'provider_order_id','P3ARD-ORDER-20261016',
   'provider_transaction_id',NULL,'subscription_id',NULL,
   'completed_at',NULL,'failure_code',NULL,'failure_message',NULL,
   'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
   'created_by',actor_ou,'updated_by',actor_ou,'version_no',1));
 INSERT INTO commerce_transactions SELECT (nc).*;

 INSERT INTO commerce_transaction_redemptions(
  commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,
  created_by,updated_by)
 VALUES('P3ARD-L-20261016','P3ARD-C-20261016','P3ARD-R-20261016',actor_ou,actor_ou);

 RAISE NOTICE 'P3ARD SETUP PASS: isolated redemption/Commerce link created; COMMIT follows';
END $$;

-- P4-A / redemption: synthetic persisted success evidence; no remote provider calls.
DO $p4$
DECLARE
  r record;
  first_case varchar;
  second_case varchar;
  n int;
BEGIN
  SELECT * INTO r FROM commerce_begin_counter_redemption_remote_terminal_payment(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P3ARD-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P4A-REF-REDEEM-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF r."alreadyDispatched" IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P4A FAIL: synthetic begin unexpectedly reused attempt';
  END IF;
  -- Simulate ONLY the *persisted database outcome* of a validated successful callback.
  UPDATE commerce_provider_payment_attempts
     SET provider_status='SUCCEEDED', provider_transaction_id='P4A-TX-REDEMPTION-20261016'
   WHERE commerce_transaction_id='P3ARD-C-20261016'
     AND provider_reference_id='P4A-REF-REDEEM-20261016' AND provider_status='DISPATCHING';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4A FAIL: synthetic attempt missing'; END IF;
  UPDATE commerce_transactions
     SET status='PROVIDER_SUCCEEDED', provider_transaction_id='P4A-TX-REDEMPTION-20261016'
   WHERE commerce_transaction_id='P3ARD-C-20261016' AND status='PROVIDER_IN_PROGRESS';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4A FAIL: synthetic Commerce not in progress'; END IF;
  first_case := commerce_open_remote_terminal_financial_exception('P4A-REF-REDEEM-20261016');
  second_case := commerce_open_remote_terminal_financial_exception('P4A-REF-REDEEM-20261016');
  IF first_case IS NULL OR first_case IS DISTINCT FROM second_case THEN
    RAISE EXCEPTION 'P4A FAIL: no durable case or duplicate opener returned a different case';
  END IF;
  SELECT count(*) INTO n FROM poynt_collect_financial_exceptions
   WHERE commerce_transaction_id='P3ARD-C-20261016' AND provider_reference_id='P4A-REF-REDEEM-20261016'
     AND organization_id='ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
     AND source_channel='COUNTER_REDEMPTION'
     AND classification='CAPTURED_UNFULFILLED' AND provider_outcome='CAPTURED'
     AND fulfillment_outcome='FAILED' AND case_status='OPEN'
     AND amount_minor=(SELECT total_minor FROM commerce_transactions WHERE commerce_transaction_id='P3ARD-C-20261016')
     AND currency_code=(SELECT currency_code FROM commerce_transactions WHERE commerce_transaction_id='P3ARD-C-20261016');
  IF n <> 1 THEN RAISE EXCEPTION 'P4A FAIL: expected one matching evidence-backed case, found %',n; END IF;
  RAISE NOTICE 'P4A PASS REDEMPTION: one evidence-backed captured/unfulfilled case; repeat returned same ID';
END $p4$;
ROLLBACK;

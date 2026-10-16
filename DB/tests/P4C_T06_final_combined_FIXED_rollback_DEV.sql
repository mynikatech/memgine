-- P4-C TEST 06: single, rollback-only final DEV database regression.
-- Run the entire file in ONE pgAdmin Query Tool connected to the intended DEV DB.
-- Uses proven P4-B synthetic intent / commerce/redemption fixtures; read-only
-- references to existing customer/plan/catalog are necessary for finalizers.
-- Changes to subscriptions, benefits and all test evidence ROLLBACK at end.
-- NO external provider calls, no COMMIT. DO NOT run concurrently with other tests.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- Part A: Collect successful recovery, CUSTOMER attribution, late failures,
-- nested subtransaction rollback protection.
DO $test$
DECLARE
  f record;
  v_intent varchar(64) := 'P4BT06-I-' || substr(md5(clock_timestamp()::text || random()::text),1,20);
  v_ref varchar(160) := 'P4BT06-REF-' || substr(md5(clock_timestamp()::text || random()::text),1,20);
  v_case varchar(64);
  v_first record;
  v_second record;
  v_count bigint;
  v_before bigint;
  v_after bigint;
  v_newcase record;
  v_state record;
BEGIN
  -- Choose an eligible Collect customer/product not involved in any existing
  -- unresolved captured/processing payment or current ACTIVE membership.
  -- Existing data is only read, never changed by this script.
  SELECT i.organization_id,i.customer_user_id,i.membership_plan_id,
         i.payment_provider_config_id,i.amount,i.currency_code,
         i.subtotal_amount,i.tax_rate,i.tax_amount,i.tax_code,i.tax_name,
         sp.membership_product_id
    INTO f
    FROM payment_intents i
    JOIN subscription_plans sp ON sp.subscription_plan_id=i.membership_plan_id
    JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
   WHERE i.authorization_mode='CUSTOMER_SESSION'
     AND i.customer_user_id IS NOT NULL AND i.amount > 0
     AND pc.provider_code='POYNT_COLLECT'
     AND (pc.organization_id=i.organization_id OR pc.organization_id IS NULL)
     AND NOT EXISTS (
       SELECT 1 FROM organization_user ou
       JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
       JOIN subscription_plans xp ON xp.subscription_plan_id=s.subscription_plan_id
       JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
       JOIN statuses st ON st.status_id=es.status_id
       WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
         AND NOT ou.is_deleted AND NOT s.is_deleted
         AND xp.membership_product_id=sp.membership_product_id
         AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_intents x
       JOIN subscription_plans xp ON xp.subscription_plan_id=x.membership_plan_id
       WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
         AND x.authorization_mode='CUSTOMER_SESSION'
         AND xp.membership_product_id=sp.membership_product_id
         AND x.finalized_subscription_id IS NULL
         AND x.status IN ('PROCESSING','SUCCEEDED')
     )
   ORDER BY i.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P4B T06 FIXTURE UNAVAILABLE: no eligible existing customer/plan references; no recovery performed';
  END IF;
  SELECT count(*) INTO v_before
    FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
    WHERE ou.organization_id=f.organization_id AND ou.user_id=f.customer_user_id
      AND s.subscription_plan_id=f.membership_plan_id;
  -- Synthetic PROCESSING payment with synthetic verified capture evidence. This
  -- intentionally does NOT fabricate provider contact or alter a real payment.
  INSERT INTO payment_intents (
      payment_intent_id,organization_id,payment_provider_config_id,
      authorization_mode,membership_plan_id,customer_user_id,
      subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
      amount,currency_code,status,idempotency_key,provider_reference_id,
      created_by,updated_by
  ) VALUES (
      v_intent,f.organization_id,f.payment_provider_config_id,
      'CUSTOMER_SESSION',f.membership_plan_id,f.customer_user_id,
      f.subtotal_amount,f.tax_rate,f.tax_amount,f.tax_code,f.tax_name,
      f.amount,f.currency_code,'PROCESSING',v_intent,v_ref,
      f.customer_user_id,f.customer_user_id
  );
  -- The production payment_record_result function requires a persisted
  -- payment attempt for the intent. This is an isolated synthetic attempt;
  -- it does not dispatch or contact a payment provider.
  INSERT INTO payment_attempts (
      payment_attempt_id, payment_intent_id, provider_reference_id,
      amount, currency_code, status, idempotency_key,
      subtotal_amount, tax_rate, tax_amount, tax_code, tax_name
  ) VALUES (
      'P4BT06-A-' || substr(md5(v_intent), 1, 20),
      v_intent, v_ref, f.amount, f.currency_code, 'PROCESSING', v_intent,
      f.subtotal_amount, f.tax_rate, f.tax_amount, f.tax_code, f.tax_name
  );
  INSERT INTO poynt_collect_verified_captures (
      payment_intent_id,organization_id,provider_transaction_id,amount_minor,currency_code
  ) VALUES (
      v_intent,f.organization_id,v_ref,round(f.amount*100)::bigint,upper(f.currency_code)
  );
  RAISE NOTICE 'P4B T06 EVIDENCE PASS: synthetic payment attempt and verified Collect capture created';

  -- Open the case through the existing authorized DB function, not direct insert.
  SELECT payment_open_collect_financial_exception(
      f.organization_id,v_intent,f.customer_user_id) INTO v_case;
  IF v_case IS NULL THEN RAISE EXCEPTION 'P4B T06 FAIL: exception case not opened'; END IF;
  RAISE NOTICE 'P4B T06 CASE PASS: synthetic case opened';

  -- P4-C customer attribution set in the same transaction as the recovery.
  PERFORM set_config('memgine.financial_exception_actor',f.customer_user_id,true);
  PERFORM set_config('memgine.financial_exception_origin','CUSTOMER',true);
  -- This is the actual migration-166 recovery function, including membership finalizer.
  SELECT * INTO v_first FROM payment_recover_collect_financial_exception(
      f.organization_id,v_intent,f.customer_user_id);
  IF NOT FOUND OR v_first."subscriptionId" IS NULL THEN
    RAISE EXCEPTION 'P4B T06 FAIL: membership not returned by recovery';
  END IF;
  SELECT status,finalized_subscription_id INTO v_state FROM payment_intents
     WHERE payment_intent_id=v_intent;
  SELECT * INTO v_newcase FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id=v_intent AND organization_id=f.organization_id;
  IF v_state.status <> 'SUCCEEDED'
     OR v_state.finalized_subscription_id IS DISTINCT FROM v_first."subscriptionId"
     OR v_newcase.financial_exception_id IS DISTINCT FROM v_case
     OR v_newcase.case_status <> 'RESOLVED'
     OR v_newcase.fulfillment_outcome <> 'FULFILLED'
     OR v_newcase.related_subscription_id IS DISTINCT FROM v_first."subscriptionId" THEN
     RAISE EXCEPTION 'P4B T06 FAIL: payment/subscription/exception resolution mismatch';
  END IF;
  RAISE NOTICE 'P4B T06 FULFILLMENT PASS: synthetic membership finalized and case resolved';

  SELECT * INTO v_second FROM payment_recover_collect_financial_exception(
      f.organization_id,v_intent,f.customer_user_id);
  IF NOT FOUND OR v_second."subscriptionId" IS DISTINCT FROM v_first."subscriptionId" THEN
     RAISE EXCEPTION 'P4B T06 FAIL: repeat recovery changed subscription';
  END IF;
  SELECT count(*) INTO v_count FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id=v_intent;
  IF v_count <> 1 THEN RAISE EXCEPTION 'P4B T06 FAIL: exception duplicated'; END IF;
  SELECT count(*) INTO v_after
    FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
    WHERE ou.organization_id=f.organization_id AND ou.user_id=f.customer_user_id
      AND s.subscription_plan_id=f.membership_plan_id;
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'P4B T06 FAIL: expected exactly one new subscription; before %, after %',v_before,v_after;
  END IF;
  RAISE NOTICE 'P4B T06 REPEAT PASS: same subscription, exactly one new membership, one exception';
 
  -- P4-C successful Collect audit must be replay safe and correctly attributed.
  IF (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='OPENED')<>1
     OR (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='RECOVERY_SUCCEEDED'
        AND actor_user_id=f.customer_user_id AND actor_origin='CUSTOMER'
        AND previous_fulfillment_outcome IS DISTINCT FROM 'FULFILLED'
        AND new_fulfillment_outcome='FULFILLED')<>1
     OR (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case)<>2 THEN
    RAISE EXCEPTION 'P4C T06 FAIL: Collect opening/success event identity or actor mismatch';
  END IF;
  RAISE NOTICE 'P4C T06 COLLECT PASS: single CUSTOMER recovery success event after replay';

  -- Simulate a failed attempt being persisted AFTER another recovery fulfilled case.
  -- Never change the case or financial evidence. Audit itself is intentionally
  -- created, checked, and ultimately rolled back by the enclosing test.
  PERFORM financial_exception_record_recovery_failure(
      f.organization_id,v_intent,NULL,f.customer_user_id,'FRA_P4CT06_LATE');
  IF (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='RECOVERY_FAILED'
        AND event_identity='RECOVERY_FAILED:'||v_case||':FRA_P4CT06_LATE'
        AND new_fulfillment_outcome='FULFILLED'
        AND description ILIKE '%already fulfilled%')<>1
     OR (SELECT count(*) FROM poynt_collect_financial_exceptions
      WHERE financial_exception_id=v_case
        AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED')<>1 THEN
    RAISE EXCEPTION 'P4C T06 FAIL: late failure incorrectly recorded or changed case';
  END IF;
  RAISE NOTICE 'P4C T06 LATE PASS: failed-attempt event does not reopen fulfilled exception';

  -- Deliberately fail a nested PL/pgSQL transaction block after an audit attempt:
  -- the nested subtransaction must restore the original event count.
  SELECT count(*) INTO v_before FROM financial_exception_events WHERE financial_exception_id=v_case;
  BEGIN
    PERFORM financial_exception_record_recovery_failure(
      f.organization_id,v_intent,NULL,f.customer_user_id,'FRA_P4CT06_ROLLBACK');
    RAISE EXCEPTION 'P4C_T06_INTENTIONAL_ROLLBACK' USING ERRCODE='P0001';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  SELECT count(*) INTO v_after FROM financial_exception_events WHERE financial_exception_id=v_case;
  IF v_after<>v_before THEN RAISE EXCEPTION 'P4C T06 FAIL: audit event survived failed nested transaction'; END IF;
  RAISE NOTICE 'P4C T06 ROLLBACK PASS: failed transaction leaves prior audit events intact';

  RAISE NOTICE 'P4C T06 COLLECT COMPLETE';
END $test$;

-- Reset transaction-local context before Counter test.
SELECT set_config('memgine.financial_exception_actor','',true);
SELECT set_config('memgine.financial_exception_origin','',true);
SELECT set_config('memgine.financial_exception_reason','',true);

-- Part B: Counter redemption successful recovery, COUNTER attribution,
-- replay stability, no additional entitlement consumption.
DO $$
DECLARE r redemption_transaction%ROWTYPE; c commerce_transactions%ROWTYPE;
 nr redemption_transaction%ROWTYPE; nc commerce_transactions%ROWTYPE;
 actor_ou varchar(64); n integer;
BEGIN
 IF EXISTS(SELECT 1 FROM redemption_transaction WHERE redemption_transaction_id='P4BRD-R-20261016')
 OR EXISTS(SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id='P4BRD-C-20261016')
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
  'redemption_transaction_id','P4BRD-R-20261016',
  'redemption_transaction_number','P4BRD-NUM-20261016',
  'status','PENDING','completed_at',NULL,
  'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'version_no',1));
 INSERT INTO redemption_transaction SELECT (nr).*;

 SELECT * INTO nc FROM jsonb_populate_record(NULL::commerce_transactions,to_jsonb(c)||jsonb_build_object(
   'commerce_transaction_id','P4BRD-C-20261016',
   'source_channel','COUNTER_REDEMPTION','status','ORDER_CREATED',
   'idempotency_key','P4BRD-C-20261016',
   'provider_order_id','P4BRD-ORDER-20261016',
   'provider_transaction_id',NULL,'subscription_id',NULL,
   'completed_at',NULL,'failure_code',NULL,'failure_message',NULL,
   'created_at',clock_timestamp(),'updated_at',clock_timestamp(),
   'created_by',actor_ou,'updated_by',actor_ou,'version_no',1));
 INSERT INTO commerce_transactions SELECT (nc).*;

 INSERT INTO commerce_transaction_redemptions(
  commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,
  created_by,updated_by)
 VALUES('P4BRD-L-20261016','P4BRD-C-20261016','P4BRD-R-20261016',actor_ou,actor_ou);

 -- Clone only the source redemption items into isolated synthetic items. Never mutate
 -- any real item or underlying subscription. Finalization happens inside ROLLBACK.
 IF NOT EXISTS(SELECT 1 FROM redemption_transaction_item
               WHERE redemption_transaction_id=r.redemption_transaction_id) THEN
   RAISE EXCEPTION 'P4B T05 FIXTURE UNAVAILABLE: source redemption has no items';
 END IF;
 DECLARE
   src_item redemption_transaction_item%ROWTYPE;
   dest_item redemption_transaction_item%ROWTYPE;
   idx int := 0;
 BEGIN
   FOR src_item IN SELECT * FROM redemption_transaction_item
       WHERE redemption_transaction_id=r.redemption_transaction_id
       ORDER BY redemption_transaction_item_id LOOP
     idx := idx + 1;
     SELECT * INTO dest_item FROM jsonb_populate_record(NULL::redemption_transaction_item,
        to_jsonb(src_item)||jsonb_build_object(
          'redemption_transaction_item_id','P4BRD-ITEM-'||idx::text||'-20261016',
          'redemption_transaction_id','P4BRD-R-20261016',
          'status','PENDING', 'redemption_id',NULL, 'offer_redemption_id',NULL,
          'created_at',clock_timestamp(),'updated_at',clock_timestamp(),'version_no',1));
     INSERT INTO redemption_transaction_item SELECT (dest_item).*;
   END LOOP;
 END;
 RAISE NOTICE 'P4B T05 SETUP PASS: isolated redemption and items created';
END $$;


-- Record synthetic provider evidence (no external payment), recover, repeat, and validate.
DO $p4b$
DECLARE
  r record;
  v_case varchar;
  v_result varchar;
  v_repeat varchar;
  v_count integer;
  v_items integer;
  v_fulfill_ids jsonb;
BEGIN
  SELECT * INTO r FROM commerce_begin_counter_redemption_remote_terminal_payment(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BRD-C-20261016',
    'POS_e0940e88-ccf3-461e-aedf-1f0fab879733',
    'P4BRD-REF-20261016',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF r."alreadyDispatched" IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P4B T05 FAIL: unexpected preexisting provider dispatch';
  END IF;
  UPDATE commerce_provider_payment_attempts
     SET provider_status='SUCCEEDED',provider_transaction_id='P4BRD-TX-20261016'
   WHERE commerce_transaction_id='P4BRD-C-20261016'
     AND provider_reference_id='P4BRD-REF-20261016'
     AND provider_status='DISPATCHING';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B T05 FAIL: simulated attempt not updated'; END IF;
  UPDATE commerce_transactions
     SET status='PROVIDER_SUCCEEDED',provider_transaction_id='P4BRD-TX-20261016'
   WHERE commerce_transaction_id='P4BRD-C-20261016'
     AND status='PROVIDER_IN_PROGRESS';
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B T05 FAIL: simulated Commerce success not updated'; END IF;
  RAISE NOTICE 'P4B T05 EVIDENCE PASS: simulated captured payment recorded';

  v_case := commerce_open_counter_financial_exception_for_recovery(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BRD-C-20261016', 'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_case IS NULL THEN RAISE EXCEPTION 'P4B T05 FAIL: no financial case'; END IF;
  IF NOT EXISTS(SELECT 1 FROM poynt_collect_financial_exceptions
     WHERE commerce_transaction_id='P4BRD-C-20261016'
       AND case_status='OPEN' AND source_channel='COUNTER_REDEMPTION') THEN
    RAISE EXCEPTION 'P4B T05 FAIL: financial case not OPEN';
  END IF;
  RAISE NOTICE 'P4B T05 CASE PASS: authorized exception opened';

  -- Simulate Kotlin's transaction-local actor attribution.
  PERFORM set_config('memgine.financial_exception_actor',
    'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e',true);
  PERFORM set_config('memgine.financial_exception_origin','COUNTER',true);
  BEGIN
    v_result := commerce_recover_counter_financial_exception(
      'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
      'P4BRD-C-20261016', 'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'P4B T05 RECOVERY FAILED: SQLSTATE %, %',SQLSTATE,SQLERRM;
    RAISE;
  END;
  IF v_result IS DISTINCT FROM 'P4BRD-C-20261016' THEN
    RAISE EXCEPTION 'P4B T05 FAIL: recovery returned wrong Commerce ID';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM commerce_transactions WHERE commerce_transaction_id=v_result
                  AND status='COMPLETED') OR
     NOT EXISTS(SELECT 1 FROM redemption_transaction WHERE redemption_transaction_id='P4BRD-R-20261016'
                  AND status='SUCCESS' AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'P4B T05 FAIL: redemption not completed';
  END IF;
  SELECT count(*),jsonb_agg(jsonb_build_object('item',redemption_transaction_item_id,
                                              'redemption',redemption_id,'offerRedemption',offer_redemption_id)
                       ORDER BY redemption_transaction_item_id)
    INTO v_items,v_fulfill_ids
    FROM redemption_transaction_item WHERE redemption_transaction_id='P4BRD-R-20261016'
       AND status='SUCCESS' AND (redemption_id IS NOT NULL OR offer_redemption_id IS NOT NULL);
  IF v_items=0 OR v_items IS DISTINCT FROM (
    SELECT count(*) FROM redemption_transaction_item WHERE redemption_transaction_id='P4BRD-R-20261016') THEN
    RAISE EXCEPTION 'P4B T05 FAIL: one or more redemption items not fulfilled';
  END IF;
  IF (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id=v_result
       AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED')<>1 THEN
    RAISE EXCEPTION 'P4B T05 FAIL: financial case not resolved';
  END IF;
  RAISE NOTICE 'P4B T05 FULFILLMENT PASS: redemption completed, % item(s), case resolved',v_items;

  v_repeat := commerce_recover_counter_financial_exception(
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b',
    'P4BRD-C-20261016', 'USR_b474a1c3-79e5-4d20-96a9-780cbe32227e');
  IF v_repeat IS DISTINCT FROM v_result THEN RAISE EXCEPTION 'P4B T05 FAIL: repeated result differed'; END IF;
  IF v_fulfill_ids IS DISTINCT FROM (
    SELECT jsonb_agg(jsonb_build_object('item',redemption_transaction_item_id,
                                       'redemption',redemption_id,'offerRedemption',offer_redemption_id)
                     ORDER BY redemption_transaction_item_id)
    FROM redemption_transaction_item WHERE redemption_transaction_id='P4BRD-R-20261016'
      AND status='SUCCESS' AND (redemption_id IS NOT NULL OR offer_redemption_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'P4B T05 FAIL: repeated recovery changed consumed item IDs';
  END IF;
  IF (SELECT count(*) FROM poynt_collect_financial_exceptions
       WHERE commerce_transaction_id='P4BRD-C-20261016')<>1 THEN
    RAISE EXCEPTION 'P4B T05 FAIL: duplicate financial case';
  END IF;
  RAISE NOTICE 'P4B T05 REPEAT PASS: stable fulfillment IDs and one exception';
  IF (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='OPENED')<>1
     OR (SELECT count(*) FROM financial_exception_events
      WHERE financial_exception_id=v_case AND event_type='RECOVERY_SUCCEEDED'
        AND actor_user_id='USR_b474a1c3-79e5-4d20-96a9-780cbe32227e'
        AND actor_origin='COUNTER'
        AND new_fulfillment_outcome='FULFILLED')<>1
     OR (SELECT count(*) FROM financial_exception_events WHERE financial_exception_id=v_case)<>2 THEN
    RAISE EXCEPTION 'P4C T06 FAIL: redemption event count or Counter attribution mismatch';
  END IF;
  RAISE NOTICE 'P4C T06 REDEMPTION PASS: single COUNTER recovery success event after replay';
END $p4b$;

DO $final$
BEGIN
  IF EXISTS (SELECT 1 FROM financial_exception_events
             WHERE event_identity LIKE 'RECOVERY_FAILED:%:FRA_P4CT06_ROLLBACK') THEN
    RAISE EXCEPTION 'P4C T06 FAIL: rollback sentinel found';
  END IF;
  RAISE NOTICE 'P4C T06 PASS: all checks passed; outer ROLLBACK removes every synthetic change';
END $final$;
ROLLBACK;

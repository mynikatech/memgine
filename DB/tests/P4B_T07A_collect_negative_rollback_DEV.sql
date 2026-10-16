-- Memgine P4-B Test 06: Remote Collect fulfillment recovery, DEV ONLY (port 15432).
-- Synthetic payment intent/capture/exception only; NEVER call provider; no existing-row updates.
-- Uses existing CUSTOMER/PLAN/CONFIG as read-only references; no actual OTP or payment.
-- Execute whole script in ONE query-tool session. Final ROLLBACK is mandatory.
-- This is a synthetic DB-function test, not an end-to-end provider/API test.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
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
    RAISE EXCEPTION 'P4B T07A FIXTURE UNAVAILABLE: no eligible existing customer/plan references; no recovery performed';
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
  RAISE NOTICE 'P4B T07A EVIDENCE PASS: synthetic payment attempt and verified Collect capture created';

  -- Open the case through the existing authorized DB function, not direct insert.
  SELECT payment_open_collect_financial_exception(
      f.organization_id,v_intent,f.customer_user_id) INTO v_case;
  IF v_case IS NULL THEN RAISE EXCEPTION 'P4B T07A FAIL: exception case not opened'; END IF;
  RAISE NOTICE 'P4B T07A CASE PASS: synthetic case opened';

  -- 1) An unrelated actor must be rejected, even with matching capture evidence.
  BEGIN
    PERFORM * FROM payment_recover_collect_financial_exception(
       f.organization_id, v_intent, 'USR_P4B_T07_UNAUTHORIZED');
    RAISE EXCEPTION 'P4B T07A FAIL: unauthorized actor was accepted';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    RAISE NOTICE 'P4B T07A AUTH PASS: unrelated actor rejected';
  END;

  -- 2) A mismatched capture must not be interpreted as a successful payment.
  UPDATE poynt_collect_verified_captures SET amount_minor=amount_minor+1
   WHERE payment_intent_id=v_intent;
  BEGIN
    PERFORM * FROM payment_recover_collect_financial_exception(
       f.organization_id, v_intent, f.customer_user_id);
    RAISE EXCEPTION 'P4B T07A FAIL: mismatched capture was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'P4B T07A EVIDENCE PASS: mismatched capture rejected';
  END;
  UPDATE poynt_collect_verified_captures SET amount_minor=round(f.amount*100)::bigint
   WHERE payment_intent_id=v_intent;

  -- 3) Force recovery to fail at the EXISTING payment-result layer by removing
  -- only this synthetic attempt. A previously opened case must remain OPEN.
  DELETE FROM payment_attempts WHERE payment_intent_id=v_intent;
  IF NOT FOUND THEN RAISE EXCEPTION 'P4B T07A SETUP FAIL: attempt missing'; END IF;
  BEGIN
    PERFORM * FROM payment_recover_collect_financial_exception(
       f.organization_id, v_intent, f.customer_user_id);
    RAISE EXCEPTION 'P4B T07A FAIL: recovery succeeded without payment attempt';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RAISE NOTICE 'P4B T07A FAILURE PASS: missing synthetic attempt prevents finalization';
  END;
  IF (SELECT count(*) FROM poynt_collect_financial_exceptions
      WHERE payment_intent_id=v_intent AND financial_exception_id=v_case
        AND case_status='OPEN' AND fulfillment_outcome='UNFULFILLED') <> 1
     OR (SELECT status FROM payment_intents WHERE payment_intent_id=v_intent) <> 'PROCESSING'
     OR EXISTS(SELECT 1 FROM payment_intents WHERE payment_intent_id=v_intent
               AND finalized_subscription_id IS NOT NULL) THEN
    RAISE EXCEPTION 'P4B T07A FAIL: failed recovery altered capture, status or exception';
  END IF;
  SELECT count(*) INTO v_after FROM subscriptions s
    JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
   WHERE ou.organization_id=f.organization_id AND ou.user_id=f.customer_user_id
     AND s.subscription_plan_id=f.membership_plan_id;
  IF v_after <> v_before THEN RAISE EXCEPTION 'P4B T07A FAIL: unexpected new subscription'; END IF;
  RAISE NOTICE 'P4B T07A PRESERVATION PASS: open case, processing payment, no new subscription';
END $test$;
ROLLBACK;

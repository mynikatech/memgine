-- P3-A Collect charge-claim validation. DEV only. Execute ENTIRE script in one session.
-- Synthetic payment intents only; no external provider calls, no existing row updates.
-- Copy mandatory quote snapshot fields from existing eligible Collect intent.
-- PostgreSQL function security-definer tests use existing customer/plan/config references.
BEGIN;
SET LOCAL search_path TO memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '40s';

DO $test$
DECLARE
  f record;
  v_cfg varchar(64);
  v_first varchar(64) := 'P3A-I-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  v_second varchar(64) := 'P3A-I-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  v_other varchar(64) := 'P3A-I-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  v_allowed boolean;
  v_status varchar;
  v_blocked boolean;
  v_exception text;
BEGIN
  -- Find an EXISTING eligible Customer-session principal, plan, and Collect config
  -- with no active membership or unresolved same-product payment. All seeded rows
  -- below are entirely synthetic; this SELECT does not change any existing row.
  SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
         sp.membership_product_id, i.payment_provider_config_id,
         i.amount, i.currency_code,
         i.subtotal_amount, i.tax_rate, i.tax_amount, i.tax_code, i.tax_name
    INTO f
    FROM payment_intents i
    JOIN subscription_plans sp ON sp.subscription_plan_id = i.membership_plan_id
    JOIN payment_provider_configs pc ON pc.payment_provider_config_id = i.payment_provider_config_id
   WHERE i.authorization_mode = 'CUSTOMER_SESSION'
     AND i.customer_user_id IS NOT NULL
     AND pc.provider_code = 'POYNT_COLLECT'
     AND i.amount > 0
     AND NOT EXISTS (
        SELECT 1 FROM organization_user ou JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
        JOIN subscription_plans xp ON xp.subscription_plan_id=s.subscription_plan_id
        JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
        JOIN statuses st ON st.status_id=es.status_id
        WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
          AND NOT ou.is_deleted AND NOT s.is_deleted AND xp.membership_product_id=sp.membership_product_id
          AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_intents x JOIN subscription_plans xp ON xp.subscription_plan_id=x.membership_plan_id
       WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
         AND x.authorization_mode='CUSTOMER_SESSION' AND xp.membership_product_id=sp.membership_product_id
         AND x.finalized_subscription_id IS NULL AND x.status IN ('PROCESSING','SUCCEEDED')
     )
   ORDER BY i.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P3A FIXTURE UNAVAILABLE: no existing eligible Collect customer/plan without active membership or unresolved charge. No existing data modified.';
  END IF;

  -- Capture a pending intent, then claim it exactly once.
  INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,
     authorization_mode,membership_plan_id,customer_user_id,
     subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
     amount,currency_code,status,idempotency_key,created_by,updated_by)
  VALUES(v_first,f.organization_id,f.payment_provider_config_id,'CUSTOMER_SESSION',
     f.membership_plan_id,f.customer_user_id,
     f.subtotal_amount,f.tax_rate,f.tax_amount,f.tax_code,f.tax_name,
     f.amount,f.currency_code,'PENDING',v_first,f.customer_user_id,f.customer_user_id);
  SELECT payment_claim_poynt_collect_charge(f.organization_id,v_first,f.customer_user_id) INTO v_allowed;
  IF v_allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'P3A FAIL: first claim not allowed'; END IF;
  SELECT status INTO v_status FROM payment_intents WHERE payment_intent_id=v_first;
  IF v_status <> 'PROCESSING' THEN RAISE EXCEPTION 'P3A FAIL: claimed status %',v_status; END IF;
  SELECT payment_claim_poynt_collect_charge(f.organization_id,v_first,f.customer_user_id) INTO v_allowed;
  IF v_allowed IS DISTINCT FROM false THEN RAISE EXCEPTION 'P3A FAIL: duplicate claim allowed'; END IF;
  RAISE NOTICE 'P3A PASS: first claim wins, transitions to PROCESSING, repeated same-intent claim rejected';

  -- A separate pending payment for the same customer/product must not be charged
  -- while the first is PROCESSING.  No expected exception should abort this DO block.
  INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,
     authorization_mode,membership_plan_id,customer_user_id,
     subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
     amount,currency_code,status,idempotency_key,created_by,updated_by)
  VALUES(v_second,f.organization_id,f.payment_provider_config_id,'CUSTOMER_SESSION',
     f.membership_plan_id,f.customer_user_id,
     f.subtotal_amount,f.tax_rate,f.tax_amount,f.tax_code,f.tax_name,
     f.amount,f.currency_code,'PENDING',v_second,f.customer_user_id,f.customer_user_id);
  v_blocked := false;
  BEGIN
    SELECT payment_claim_poynt_collect_charge(f.organization_id,v_second,f.customer_user_id) INTO v_allowed;
    v_blocked := v_allowed IS DISTINCT FROM true;
  EXCEPTION WHEN SQLSTATE '22023' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'P3A FAIL: second same-product intent was allowed'; END IF;
  SELECT status INTO v_status FROM payment_intents WHERE payment_intent_id=v_second;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'P3A FAIL: blocked intent changed to %', v_status; END IF;
  RAISE NOTICE 'P3A PASS: unresolved PROCESSING same-customer/product payment blocks a second charge';

  -- Actor isolation: the caller cannot claim another customer's payment.
  v_blocked := false;
  BEGIN
    SELECT payment_claim_poynt_collect_charge(f.organization_id,v_second,'P3A-UNAUTHORIZED-ACTOR') INTO v_allowed;
  EXCEPTION WHEN SQLSTATE '42501' THEN v_blocked := true;
  END;
  IF NOT v_blocked THEN RAISE EXCEPTION 'P3A FAIL: unauthorized actor not rejected'; END IF;
  RAISE NOTICE 'P3A PASS: unauthorized customer cannot claim another customer intent';
  RAISE NOTICE 'P3A PASS: synthetic case complete; outer ROLLBACK follows';
END
$test$;
ROLLBACK;

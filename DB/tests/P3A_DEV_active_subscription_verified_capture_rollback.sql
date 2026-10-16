-- P3-A DEV-only financial safety validation: active subscription and verified capture.
-- Run this ENTIRE script in one pgAdmin Query Tool tab against 127.0.0.1:15432/memgine_dev.
-- All new rows are synthetic, no existing rows are updated, no provider calls.
-- A missing eligible active-subscription fixture is explicitly SKIPPED, not reported as PASS.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $test$
DECLARE
    f record;
    v_id varchar(64) := 'P3AACT-' || substr(md5(clock_timestamp()::text || random()::text), 1, 20);
    v_allowed boolean;
    v_blocked boolean := false;
    v_status varchar;
BEGIN
    -- Choose an existing active subscription/customer AND a same-plan Collect
    -- pricing snapshot. We only READ the existing subscription and intent.
    SELECT i.organization_id, ou.user_id AS customer_user_id, i.membership_plan_id,
           i.payment_provider_config_id, i.amount, i.currency_code,
           i.subtotal_amount, i.tax_rate, i.tax_amount, i.tax_code, i.tax_name
      INTO f
      FROM subscriptions s
      JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN subscription_plans active_plan ON active_plan.subscription_plan_id = s.subscription_plan_id
      JOIN entity_status es ON es.entity_status_id = s.subscription_status_id
      JOIN statuses st ON st.status_id = es.status_id
      JOIN payment_intents i
        ON i.organization_id = ou.organization_id
       AND i.membership_plan_id = s.subscription_plan_id
      JOIN payment_provider_configs pc ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE NOT s.is_deleted AND NOT ou.is_deleted
       AND st.status_code = 'ACTIVE' AND s.end_date >= CURRENT_DATE
       AND i.amount > 0
       AND pc.provider_code = 'POYNT_COLLECT'
       AND ou.user_id IS NOT NULL
     ORDER BY i.created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE 'P3A SKIP: no existing active-subscription customer/plan with Collect pricing fixture; active-subscription protection NOT verified';
    ELSE
        INSERT INTO payment_intents (
            payment_intent_id, organization_id, payment_provider_config_id,
            authorization_mode, membership_plan_id, customer_user_id,
            subtotal_amount, tax_rate, tax_amount, tax_code, tax_name,
            amount, currency_code, status, idempotency_key, created_by, updated_by
        ) VALUES (
            v_id, f.organization_id, f.payment_provider_config_id,
            'CUSTOMER_SESSION', f.membership_plan_id, f.customer_user_id,
            f.subtotal_amount, f.tax_rate, f.tax_amount, f.tax_code, f.tax_name,
            f.amount, f.currency_code, 'PENDING', v_id, f.customer_user_id, f.customer_user_id
        );

        BEGIN
            SELECT payment_claim_poynt_collect_charge(f.organization_id, v_id, f.customer_user_id)
              INTO v_allowed;
            v_blocked := (v_allowed IS DISTINCT FROM true);
        EXCEPTION WHEN SQLSTATE '22023' THEN
            v_blocked := true;
        END;
        IF NOT v_blocked THEN
            RAISE EXCEPTION 'P3A FAIL: active membership permitted another same-product charge';
        END IF;
        SELECT status INTO v_status FROM payment_intents WHERE payment_intent_id = v_id;
        IF v_status IS DISTINCT FROM 'PENDING' THEN
            RAISE EXCEPTION 'P3A FAIL: active-membership blocked intent changed to %', v_status;
        END IF;
        RAISE NOTICE 'P3A PASS: existing active membership blocks another same-product Collect claim; intent stays PENDING';
    END IF;
END
$test$;

DO $test$
DECLARE
    f record;
    v_seed varchar(64) := 'P3ACAP-' || substr(md5(clock_timestamp()::text || random()::text), 1, 20);
    v_next varchar(64) := 'P3ANXT-' || substr(md5(clock_timestamp()::text || random()::text), 1, 20);
    v_provider_ref varchar(160) := 'P3A-CAP-' || substr(md5(clock_timestamp()::text || random()::text), 1, 24);
    v_allowed boolean;
    v_blocked boolean := false;
    v_status varchar;
    v_count integer;
BEGIN
    -- Choose an eligible customer/product without active membership or existing
    -- unresolved payment, as in the previously successful P3-A claim test.
    SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
           sp.membership_product_id, i.payment_provider_config_id, i.amount,
           i.currency_code, i.subtotal_amount, i.tax_rate, i.tax_amount,
           i.tax_code, i.tax_name
      INTO f
      FROM payment_intents i
      JOIN subscription_plans sp ON sp.subscription_plan_id = i.membership_plan_id
      JOIN payment_provider_configs pc ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE i.authorization_mode = 'CUSTOMER_SESSION'
       AND i.customer_user_id IS NOT NULL AND i.amount > 0
       AND pc.provider_code = 'POYNT_COLLECT'
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
            WHERE x.organization_id=i.organization_id
              AND x.customer_user_id=i.customer_user_id
              AND x.authorization_mode='CUSTOMER_SESSION'
              AND xp.membership_product_id=sp.membership_product_id
              AND x.finalized_subscription_id IS NULL
              AND x.status IN ('PROCESSING','SUCCEEDED')
       )
     ORDER BY i.created_at DESC LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'P3A FIXTURE UNAVAILABLE: no eligible Collect customer/plan for synthetic capture test';
    END IF;

    -- Synthetic prior charge, originally PROCESSING. A verified capture is
    -- inserted as fixture evidence; this does not call a provider or assert a
    -- real payment was captured. Then status is set to FAILED, so that the
    -- claim's verified-capture guard is isolated from its PROCESSING guard.
    INSERT INTO payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id,
        authorization_mode, membership_plan_id, customer_user_id,
        subtotal_amount, tax_rate, tax_amount, tax_code, tax_name,
        amount, currency_code, status, idempotency_key, provider_reference_id,
        created_by, updated_by
    ) VALUES (
        v_seed, f.organization_id, f.payment_provider_config_id,
        'CUSTOMER_SESSION', f.membership_plan_id, f.customer_user_id,
        f.subtotal_amount, f.tax_rate, f.tax_amount, f.tax_code, f.tax_name,
        f.amount, f.currency_code, 'PROCESSING', v_seed, v_provider_ref,
        f.customer_user_id, f.customer_user_id
    );

    INSERT INTO poynt_collect_verified_captures(
        payment_intent_id, organization_id, provider_transaction_id, amount_minor, currency_code
    ) VALUES (
        v_seed, f.organization_id, v_provider_ref, round(f.amount * 100)::bigint, upper(f.currency_code)
    );

    UPDATE payment_intents SET status = 'FAILED'
     WHERE payment_intent_id = v_seed;

    INSERT INTO payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id,
        authorization_mode, membership_plan_id, customer_user_id,
        subtotal_amount, tax_rate, tax_amount, tax_code, tax_name,
        amount, currency_code, status, idempotency_key, created_by, updated_by
    ) VALUES (
        v_next, f.organization_id, f.payment_provider_config_id,
        'CUSTOMER_SESSION', f.membership_plan_id, f.customer_user_id,
        f.subtotal_amount, f.tax_rate, f.tax_amount, f.tax_code, f.tax_name,
        f.amount, f.currency_code, 'PENDING', v_next,
        f.customer_user_id, f.customer_user_id
    );

    BEGIN
        SELECT payment_claim_poynt_collect_charge(f.organization_id, v_next, f.customer_user_id)
          INTO v_allowed;
        v_blocked := (v_allowed IS DISTINCT FROM true);
    EXCEPTION WHEN SQLSTATE '22023' THEN
        v_blocked := true;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION 'P3A FAIL: prior verified capture allowed another same-product claim';
    END IF;
    SELECT status INTO v_status FROM payment_intents WHERE payment_intent_id = v_next;
    IF v_status IS DISTINCT FROM 'PENDING' THEN
        RAISE EXCEPTION 'P3A FAIL: blocked intent changed to %', v_status;
    END IF;
    SELECT count(*) INTO v_count FROM poynt_collect_verified_captures WHERE payment_intent_id=v_seed;
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'P3A FAIL: expected synthetic capture evidence missing';
    END IF;
    RAISE NOTICE 'P3A PASS: verified capture blocks another same-product claim even when prior intent is FAILED; new intent remains PENDING';
END
$test$;

DO $test$
DECLARE
  n int;
BEGIN
  SELECT count(*) INTO n FROM payment_intents WHERE payment_intent_id LIKE 'P3AACT-%'
      OR payment_intent_id LIKE 'P3ACAP-%' OR payment_intent_id LIKE 'P3ANXT-%';
  -- No assertion on global prefix counts; test rows are still transaction-local.
  RAISE NOTICE 'P3A PASS: synthetic validation completed; outer ROLLBACK follows';
END
$test$;
ROLLBACK;

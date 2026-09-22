-- Correct the RETURN QUERY status expression type for payment start functions.
-- Migration 077/079 are applied; this changes only the result expression cast.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar,
    p_challenge_id varchar, p_provider_code varchar, p_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar;
    v_plan_id varchar;
    v_user_id varchar;
    v_store_id varchar;
    v_staff_id varchar;
    v_amount numeric(12,2);
    v_currency varchar(10);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
            v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id,
            v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text
        FROM "${schemaName}".payment_provider_configs pc
        WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    SELECT c.plan_id, c.user_id, c.store_id, c.staff_id
      INTO v_plan_id, v_user_id, v_store_id, v_staff_id
      FROM "${schemaName}".business_otp_context c
      JOIN "${schemaName}".otp_challenges o ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose IN ('COUNTER_PURCHASE_VERIFY', 'APP_MEMBERSHIP_PURCHASE_VERIFY')
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;
    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023';
    END IF;
    SELECT sp.price, cur.currency_code INTO v_amount, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
     WHERE sp.subscription_plan_id = v_plan_id AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023'; END IF;
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, business_otp_challenge_id,
        membership_plan_id, customer_user_id, store_id, staff_id, amount, currency_code,
        status, idempotency_key, created_by, updated_by
    ) VALUES (p_intent_id, p_organization_id, v_provider_id, p_challenge_id,
        v_plan_id, v_user_id, v_store_id, v_staff_id, v_amount, v_currency,
        'PENDING', p_idempotency_key, p_actor_user_id, p_actor_user_id);
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_amount, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_amount::double precision,
        v_currency, NULL::varchar, v_plan_id, v_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_authenticated_membership_intent(
    p_intent_id varchar, p_attempt_id varchar, p_organization_id varchar,
    p_plan_id varchar, p_customer_user_id varchar, p_provider_code varchar,
    p_idempotency_key varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar;
    v_amount numeric(12,2);
    v_currency varchar(10);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
            v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id,
            v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text
        FROM "${schemaName}".payment_provider_configs pc
        WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    IF NOT "${schemaName}".customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT sp.price, cur.currency_code INTO v_amount, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
     WHERE sp.subscription_plan_id = p_plan_id AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_amount IS NULL THEN RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023'; END IF;
    SELECT payment_provider_config_id INTO v_provider_id FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled LIMIT 1;
    IF v_provider_id IS NULL THEN RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023'; END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, authorization_mode,
        membership_plan_id, customer_user_id, amount, currency_code, status, idempotency_key, created_by, updated_by
    ) VALUES (
        p_intent_id, p_organization_id, v_provider_id, 'CUSTOMER_SESSION',
        p_plan_id, p_customer_user_id, v_amount, v_currency, 'PENDING', p_idempotency_key, p_customer_user_id, p_customer_user_id
    );
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_amount, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_amount::double precision,
        v_currency, NULL::varchar, p_plan_id, p_customer_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_customer_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_plan_id varchar,
    p_customer_user_id varchar,
    p_provider_code varchar,
    p_idempotency_key varchar
) RETURNS TABLE (
    "paymentIntentId" varchar, "providerCode" varchar, "status" varchar,
    "amount" double precision, "currencyCode" varchar, "providerReferenceId" varchar,
    "membershipPlanId" varchar, "customerUserId" varchar, "createdAt" text
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_provider_id varchar;
    v_amount numeric(12,2);
    v_currency varchar(10);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM "${schemaName}".payment_intents
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        RETURN QUERY SELECT v_existing.payment_intent_id, pc.provider_code, v_existing.status,
            v_existing.amount::double precision, v_existing.currency_code, v_existing.provider_reference_id,
            v_existing.membership_plan_id, v_existing.customer_user_id, v_existing.created_at::text
        FROM "${schemaName}".payment_provider_configs pc
        WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;
        RETURN;
    END IF;
    SELECT sp.price, cur.currency_code INTO v_amount, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id
     WHERE sp.subscription_plan_id = p_plan_id AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_amount IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable for payment' USING ERRCODE = '22023';
    END IF;
    SELECT payment_provider_config_id INTO v_provider_id
      FROM "${schemaName}".payment_provider_configs
     WHERE organization_id IS NULL AND provider_code = p_provider_code AND is_enabled
     LIMIT 1;
    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable' USING ERRCODE = '22023';
    END IF;
    INSERT INTO "${schemaName}".payment_intents (
        payment_intent_id, organization_id, payment_provider_config_id, authorization_mode,
        membership_plan_id, customer_user_id, amount, currency_code, status, idempotency_key, created_by, updated_by
    ) VALUES (
        p_intent_id, p_organization_id, v_provider_id, 'CUSTOMER_SESSION',
        p_plan_id, p_customer_user_id, v_amount, v_currency, 'PENDING', p_idempotency_key,
        p_customer_user_id, p_customer_user_id
    );
    INSERT INTO "${schemaName}".payment_attempts (
        payment_attempt_id, payment_intent_id, amount, currency_code, status, idempotency_key
    ) VALUES (p_attempt_id, p_intent_id, v_amount, v_currency, 'PENDING', p_idempotency_key);
    RETURN QUERY SELECT p_intent_id, p_provider_code, 'PENDING'::varchar, v_amount::double precision,
        v_currency, NULL::varchar, p_plan_id, p_customer_user_id, CURRENT_TIMESTAMP::text;
END;
$function$;


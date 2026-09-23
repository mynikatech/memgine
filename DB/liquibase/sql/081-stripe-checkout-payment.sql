-- Stripe Checkout uses the existing payment intent and attempt records. Credentials remain runtime configuration.

INSERT INTO "${schemaName}".payment_provider_configs (
    payment_provider_config_id, organization_id, provider_code, configuration_reference,
    display_name, is_enabled, is_test_mode, created_by, updated_by
) VALUES (
    'payment-provider-stripe', NULL, 'STRIPE', 'environment:STRIPE_SECRET_KEY',
    'Stripe Checkout', true, true, 'system', 'system'
) ON CONFLICT (payment_provider_config_id) DO UPDATE
SET provider_code = EXCLUDED.provider_code,
    configuration_reference = EXCLUDED.configuration_reference,
    display_name = EXCLUDED.display_name,
    is_enabled = EXCLUDED.is_enabled,
    is_test_mode = EXCLUDED.is_test_mode,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = 'system';

CREATE OR REPLACE FUNCTION "${schemaName}".payment_set_provider_reference(
    p_intent_id varchar,
    p_expected_provider_code varchar,
    p_provider_reference_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent "${schemaName}".payment_intents%ROWTYPE;
    v_provider_code varchar;
BEGIN
    IF p_provider_reference_id IS NULL OR btrim(p_provider_reference_id) = '' OR length(p_provider_reference_id) > 160 THEN
        RAISE EXCEPTION 'Payment provider reference is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_intent
      FROM "${schemaName}".payment_intents
     WHERE payment_intent_id = p_intent_id
     FOR UPDATE;

    SELECT provider_code
      INTO v_provider_code
      FROM "${schemaName}".payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;

    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR (v_intent.created_by IS DISTINCT FROM p_actor_user_id
           AND v_intent.customer_user_id IS DISTINCT FROM p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    IF v_intent.provider_reference_id IS NOT NULL THEN
        RETURN v_intent.provider_reference_id;
    END IF;

    IF v_intent.status NOT IN ('PENDING', 'PROCESSING') THEN
        RAISE EXCEPTION 'Payment cannot start provider checkout' USING ERRCODE = '22023';
    END IF;

    UPDATE "${schemaName}".payment_intents
       SET provider_reference_id = p_provider_reference_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = p_intent_id;

    UPDATE "${schemaName}".payment_attempts
       SET provider_reference_id = p_provider_reference_id
     WHERE payment_attempt_id = (
        SELECT payment_attempt_id
          FROM "${schemaName}".payment_attempts
         WHERE payment_intent_id = p_intent_id
         ORDER BY created_at DESC
         LIMIT 1
     );

    RETURN p_provider_reference_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_confirm_provider_success(
    p_intent_id varchar,
    p_organization_id varchar,
    p_expected_provider_code varchar,
    p_provider_reference_id varchar,
    p_amount_minor bigint,
    p_currency_code varchar
) RETURNS TABLE (
    "subscriptionId" varchar,
    "organizationUserId" varchar,
    "userId" varchar,
    "subscriptionNumber" varchar,
    "subscriptionPlanId" varchar,
    "subscriptionDate" text,
    "startDate" text,
    "endDate" text,
    "subscriptionStatusId" varchar,
    "totalAmount" double precision,
    "currencyCode" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent "${schemaName}".payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_actor_user_id varchar;
BEGIN
    SELECT *
      INTO v_intent
      FROM "${schemaName}".payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    SELECT provider_code
      INTO v_provider_code
      FROM "${schemaName}".payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;

    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR v_intent.provider_reference_id IS DISTINCT FROM p_provider_reference_id
       OR round(v_intent.amount * 100)::bigint <> p_amount_minor
       OR upper(v_intent.currency_code) <> upper(p_currency_code) THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;

    v_actor_user_id := COALESCE(v_intent.created_by, v_intent.customer_user_id);
    IF v_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Payment actor is unavailable' USING ERRCODE = '42501';
    END IF;

    IF NOT "${schemaName}".payment_record_result(
        p_intent_id,
        NULL,
        'SUCCEEDED',
        p_provider_reference_id,
        NULL,
        NULL,
        v_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Payment cannot be confirmed' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT *
      FROM "${schemaName}".payment_finalize_membership(p_intent_id, v_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_provider_failure(
    p_intent_id varchar,
    p_organization_id varchar,
    p_expected_provider_code varchar,
    p_provider_reference_id varchar,
    p_status varchar,
    p_failure_code varchar
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent "${schemaName}".payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_actor_user_id varchar;
BEGIN
    SELECT *
      INTO v_intent
      FROM "${schemaName}".payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    SELECT provider_code
      INTO v_provider_code
      FROM "${schemaName}".payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;

    IF NOT FOUND OR v_provider_code <> p_expected_provider_code
       OR v_intent.provider_reference_id IS DISTINCT FROM p_provider_reference_id
       OR p_status NOT IN ('FAILED', 'CANCELED') THEN
        RAISE EXCEPTION 'Provider payment does not match the payment intent' USING ERRCODE = '42501';
    END IF;

    v_actor_user_id := COALESCE(v_intent.created_by, v_intent.customer_user_id);
    IF v_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Payment actor is unavailable' USING ERRCODE = '42501';
    END IF;

    RETURN "${schemaName}".payment_record_result(
        p_intent_id,
        NULL,
        p_status,
        p_provider_reference_id,
        p_failure_code,
        NULL,
        v_actor_user_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_finalized_membership(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar,
    "organizationUserId" varchar,
    "userId" varchar,
    "subscriptionNumber" varchar,
    "subscriptionPlanId" varchar,
    "subscriptionDate" text,
    "startDate" text,
    "endDate" text,
    "subscriptionStatusId" varchar,
    "totalAmount" double precision,
    "currencyCode" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    RETURN QUERY
    SELECT s.subscription_id,
           s.organization_user_id,
           ou.user_id,
           s.subscription_number,
           s.subscription_plan_id,
           s.subscription_date::text,
           s.start_date::text,
           s.end_date::text,
           s.subscription_status_id,
           s.total_amount::double precision,
           cur.currency_code
      FROM "${schemaName}".payment_intents i
      JOIN "${schemaName}".subscriptions s
        ON s.subscription_id = i.finalized_subscription_id
      JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = s.organization_user_id
      JOIN "${schemaName}".subscription_plans sp
        ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN "${schemaName}".currencies cur
        ON cur.currency_id = sp.currency_id
     WHERE i.organization_id = p_organization_id
       AND i.payment_intent_id = p_intent_id
       AND (i.created_by = p_actor_user_id OR i.customer_user_id = p_actor_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_set_provider_reference(varchar,varchar,varchar,varchar),
    "${schemaName}".payment_confirm_provider_success(varchar,varchar,varchar,varchar,bigint,varchar),
    "${schemaName}".payment_record_provider_failure(varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".payment_get_finalized_membership(varchar,varchar,varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".payment_set_provider_reference(varchar,varchar,varchar,varchar),
    "${schemaName}".payment_confirm_provider_success(varchar,varchar,varchar,varchar,bigint,varchar),
    "${schemaName}".payment_record_provider_failure(varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".payment_get_finalized_membership(varchar,varchar,varchar)
TO "${appRole}";

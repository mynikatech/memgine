-- Counter membership payment start is one database transaction: prepare/reuse
-- the Memgine-owned Commerce order, then create/reuse and correlate PaymentIntent.
-- No provider call or subscription fulfillment occurs here.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_challenge_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_provider_code varchar,
    p_payment_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar,
    "providerCode" varchar,
    "status" varchar,
    "amount" double precision,
    "currencyCode" varchar,
    "providerReferenceId" varchar,
    "membershipPlanId" varchar,
    "customerUserId" varchar,
    "createdAt" text,
    "commerceTransactionId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_context_plan_id varchar;
    v_context_user_id varchar;
    v_context_store_id varchar;
    v_context_staff_id varchar;
    v_commerce record;
    v_payment "${schemaName}".payment_intents%ROWTYPE;
    v_started record;
    v_provider_code varchar;
    v_commerce_idempotency_key varchar(128);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_challenge_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_staff_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_provider_code), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR p_payment_idempotency_key IS NULL
       OR btrim(p_payment_idempotency_key) = ''
       OR length(p_payment_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid Counter membership payment request'
            USING ERRCODE = '22023';
    END IF;

    -- The verified business OTP is the stable logical purchase identity. Its
    -- Commerce key deliberately does not vary with the payment provider.
    v_commerce_idempotency_key := 'COUNTER_MEMBERSHIP:' || p_challenge_id;

    SELECT c.plan_id, c.user_id, c.store_id, c.staff_id
      INTO v_context_plan_id, v_context_user_id, v_context_store_id, v_context_staff_id
      FROM business_otp_context c
      JOIN otp_challenges o
        ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose = 'COUNTER_PURCHASE_VERIFY'
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;

    IF v_context_plan_id IS NULL
       OR v_context_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_context_user_id IS DISTINCT FROM p_customer_user_id
       OR v_context_store_id IS DISTINCT FROM p_store_id
       OR v_context_staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Verified Counter membership purchase authorization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_commerce
      FROM commerce_prepare_internal_membership_order(
          p_organization_id,
          p_store_id,
          p_staff_id,
          p_customer_user_id,
          p_subscription_plan_id,
          v_commerce_idempotency_key,
          p_actor_user_id
      );

    IF v_commerce."commerceTransactionId" IS NULL
       OR v_commerce."status" IS DISTINCT FROM 'ORDER_CREATED'
       OR v_commerce."amountMinor" IS NULL
       OR NULLIF(btrim(v_commerce."currencyCode"), '') IS NULL THEN
        RAISE EXCEPTION 'Counter membership Commerce order is not prepared'
            USING ERRCODE = '23505';
    END IF;

    -- Preserve the existing payment idempotency contract. A retry receives the
    -- original PaymentIntent, but it must be for this exact verified purchase.
    SELECT *
      INTO v_payment
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_payment_idempotency_key
     FOR UPDATE;

    IF NOT FOUND THEN
        SELECT *
          INTO v_started
          FROM payment_start_membership_intent(
              p_intent_id,
              p_attempt_id,
              p_organization_id,
              p_challenge_id,
              p_provider_code,
              p_payment_idempotency_key,
              p_actor_user_id
          );

        IF v_started."paymentIntentId" IS NULL THEN
            RAISE EXCEPTION 'Payment was not started' USING ERRCODE = '23505';
        END IF;

        SELECT *
          INTO v_payment
          FROM payment_intents
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND organization_id = p_organization_id
         FOR UPDATE;
    END IF;

    IF v_payment.payment_intent_id IS NULL
       OR v_payment.business_otp_challenge_id IS DISTINCT FROM p_challenge_id
       OR v_payment.membership_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_payment.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_payment.store_id IS DISTINCT FROM p_store_id
       OR v_payment.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Existing payment conflicts with the Counter membership purchase'
            USING ERRCODE = '23505';
    END IF;

    IF v_payment.commerce_transaction_id IS NOT NULL
    AND v_payment.commerce_transaction_id IS DISTINCT FROM v_commerce."commerceTransactionId" THEN
        RAISE EXCEPTION 'Payment is already associated with another Commerce transaction'
            USING ERRCODE = '23505';
    END IF;

    SELECT pc.provider_code
    INTO v_provider_code
    FROM payment_provider_configs pc
    WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id;

    IF v_provider_code IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable'
            USING ERRCODE = '23505';
    END IF;

    IF v_provider_code IS DISTINCT FROM p_provider_code THEN
        RAISE EXCEPTION 'Existing payment provider conflicts with the requested payment provider'
            USING ERRCODE = '23505';
    END IF;

    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_commerce."amountMinor"
    OR v_payment.currency_code IS DISTINCT FROM v_commerce."currencyCode" THEN
        RAISE EXCEPTION 'Payment amount or currency does not match the Commerce order'
            USING ERRCODE = '23505';
    END IF;

    UPDATE payment_intents
    SET commerce_transaction_id = v_commerce."commerceTransactionId",
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id
    WHERE payment_intent_id = v_payment.payment_intent_id
    AND organization_id = p_organization_id;

    RETURN QUERY
    SELECT
        v_payment.payment_intent_id,
        v_provider_code,
        v_payment.status,
        v_payment.amount::double precision,
        v_payment.currency_code,
        v_payment.provider_reference_id,
        v_payment.membership_plan_id,
        v_payment.customer_user_id,
        v_payment.created_at::text,
        v_commerce."commerceTransactionId"::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar
) TO "${appRole}";

-- Fix normal Counter OTP payment keys after migration 259. No data change.
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
    p_actor_user_id varchar,
    p_applied_offer_id varchar,
    p_offer_adjustment_type varchar,
    p_offer_discount_minor bigint,
    p_offer_tax_total_minor bigint,
    p_offer_final_total_minor bigint
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
    v_counter_purchase_id varchar(64);
    v_purchase counter_purchases%ROWTYPE;
    v_commerce record;
    v_transaction commerce_transactions%ROWTYPE;
    v_payment payment_intents%ROWTYPE;
    v_started record;
    v_provider_code varchar(64);
    v_integration_id varchar(64);
    v_commerce_idempotency_key varchar(128);
    v_payment_net_subtotal_minor bigint;
    v_staff_assisted boolean := false;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_challenge_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_staff_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR NULLIF(btrim(p_payment_idempotency_key), '') IS NULL
       OR length(p_payment_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid Counter membership payment request'
            USING ERRCODE = '22023';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM counter_purchases cp
         WHERE cp.counter_purchase_id = p_challenge_id
           AND cp.organization_id = p_organization_id
           AND cp.purchase_mode = 'STAFF_ASSISTED'
           AND cp.status = 'OPEN'
    ) INTO v_staff_assisted;

    IF v_staff_assisted THEN
        IF NOT counter_can_operate(
            p_organization_id, p_store_id, p_staff_id, p_actor_user_id
        ) THEN
            RAISE EXCEPTION 'Counter operation is not permitted'
                USING ERRCODE = '42501';
        END IF;

        SELECT cp.subscription_plan_id, cp.customer_user_id,
               cp.store_id, cp.staff_id, cp.counter_purchase_id
          INTO v_context_plan_id, v_context_user_id, v_context_store_id,
               v_context_staff_id, v_counter_purchase_id
          FROM counter_purchases cp
         WHERE cp.counter_purchase_id = p_challenge_id
           AND cp.organization_id = p_organization_id
           AND cp.status = 'OPEN'
           AND cp.purchase_mode = 'STAFF_ASSISTED'
         FOR UPDATE;
    ELSE
    SELECT c.plan_id, c.user_id, c.store_id, c.staff_id, c.counter_purchase_id
      INTO v_context_plan_id, v_context_user_id, v_context_store_id,
           v_context_staff_id, v_counter_purchase_id
      FROM business_otp_context c
      JOIN otp_challenges o ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose = 'COUNTER_PURCHASE_VERIFY'
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;

    END IF;

    IF v_context_plan_id IS NULL
       OR NULLIF(btrim(v_counter_purchase_id), '') IS NULL
       OR v_context_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_context_user_id IS DISTINCT FROM p_customer_user_id
       OR v_context_store_id IS DISTINCT FROM p_store_id
       OR v_context_staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Verified Counter membership purchase authorization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_purchase
      FROM counter_purchases
     WHERE counter_purchase_id = v_counter_purchase_id
     FOR UPDATE;

    IF NOT FOUND
       OR v_purchase.status IS DISTINCT FROM 'OPEN'
       OR v_purchase.organization_id IS DISTINCT FROM p_organization_id
       OR v_purchase.store_id IS DISTINCT FROM p_store_id
       OR v_purchase.staff_id IS DISTINCT FROM p_staff_id
       OR v_purchase.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_purchase.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id THEN
        RAISE EXCEPTION 'Counter purchase identity is inconsistent'
            USING ERRCODE = '23505';
    END IF;

    -- Normal Counter OTP keys are challenge-bound (also used for Agreement
    -- acceptance); Staff-Assisted keys are Counter-purchase-bound.
    -- Preserve the existing reference format for both purchase modes.
    IF p_payment_idempotency_key NOT IN (
        (CASE WHEN v_staff_assisted THEN v_counter_purchase_id
              ELSE p_challenge_id END) || ':provider',
        (CASE WHEN v_staff_assisted THEN v_counter_purchase_id
              ELSE p_challenge_id END) || ':cash'
    ) THEN
        RAISE EXCEPTION 'Counter payment idempotency key does not match purchase'
            USING ERRCODE = '22023';
    END IF;

    v_commerce_idempotency_key := 'COUNTER_MEMBERSHIP:' || v_counter_purchase_id;

    IF upper(btrim(p_provider_code)) = 'CASH' THEN
        v_provider_code := 'CASH';
        v_integration_id := NULL;

        SELECT * INTO v_commerce
          FROM commerce_prepare_internal_membership_order(
              p_organization_id, p_store_id, p_staff_id, p_customer_user_id,
              p_subscription_plan_id, v_commerce_idempotency_key, p_actor_user_id
          );
    ELSE
        IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
            RAISE EXCEPTION 'Counter operation is not permitted'
                USING ERRCODE = '42501';
        END IF;

        SELECT route.provider_code, route.integration_configuration_id
          INTO v_provider_code, v_integration_id
          FROM commerce_payment_provider_routes route
          LEFT JOIN integration_configurations integration
            ON integration.integration_configuration_id = route.integration_configuration_id
           AND integration.organization_id = route.organization_id
           AND NOT integration.is_deleted
          LEFT JOIN entity_status integration_status
            ON integration_status.entity_status_id = integration.integration_status_id
          LEFT JOIN statuses integration_state
            ON integration_state.status_id = integration_status.status_id
         WHERE route.organization_id = p_organization_id
           AND route.source_channel = 'COUNTER'
           AND route.is_enabled
           AND NOT route.is_deleted
           AND (route.store_id = p_store_id OR route.store_id IS NULL)
           AND route.provider_code IN ('TEST', 'POYNT')
           AND (
                route.provider_code = 'TEST'
                OR (
                    integration.integration_configuration_id IS NOT NULL
                    AND upper(integration.provider) = route.provider_code
                    AND integration_status.is_active
                    AND integration_state.status_code = 'ACTIVE'
                )
           )
         ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END,
                  route.commerce_payment_provider_route_id
         LIMIT 1;

        IF v_provider_code IS NULL THEN
            RAISE EXCEPTION 'No Counter payment provider is configured'
                USING ERRCODE = '22023';
        END IF;

        SELECT * INTO v_commerce
          FROM commerce_prepare_counter_membership_order(
              p_organization_id, p_store_id, p_staff_id, p_customer_user_id,
              p_subscription_plan_id, v_provider_code, v_integration_id,
              v_commerce_idempotency_key, p_actor_user_id
          );
    END IF;

    IF v_commerce."commerceTransactionId" IS NULL THEN
        RAISE EXCEPTION 'Counter membership Commerce transaction is not prepared'
            USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = v_commerce."commerceTransactionId"
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND
       OR v_transaction.subtotal_minor IS NULL
       OR v_transaction.adjustment_total_minor IS NULL
       OR v_transaction.tax_total_minor IS NULL
       OR v_transaction.total_minor IS NULL
       OR NULLIF(btrim(v_transaction.currency_code), '') IS NULL THEN
        RAISE EXCEPTION 'Counter membership Commerce pricing is unavailable'
            USING ERRCODE = '23505';
    END IF;

    -- Freeze exactly once. Once frozen, later retries reuse this persisted
    -- snapshot even if Offer configuration or the caller's candidate changes.
    IF v_transaction.membership_pricing_frozen_at IS NULL THEN
        IF p_applied_offer_id IS NULL THEN
            IF p_offer_adjustment_type IS NOT NULL
               OR p_offer_discount_minor IS NOT NULL
               OR p_offer_tax_total_minor IS NOT NULL
               OR p_offer_final_total_minor IS NOT NULL THEN
                RAISE EXCEPTION 'Incomplete membership Offer pricing snapshot'
                    USING ERRCODE = '22023';
            END IF;

            UPDATE commerce_transactions
               SET membership_pricing_frozen_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = v_transaction.updated_by,
                   version_no = version_no + 1
             WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;
        ELSE
            IF p_offer_adjustment_type NOT IN (
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               )
               OR p_offer_discount_minor IS NULL
               OR p_offer_tax_total_minor IS NULL
               OR p_offer_final_total_minor IS NULL
               OR p_offer_discount_minor < 0
               OR p_offer_tax_total_minor < 0
               OR p_offer_final_total_minor < 0
               OR p_offer_discount_minor > v_transaction.subtotal_minor
               OR p_offer_final_total_minor IS DISTINCT FROM
                    (v_transaction.subtotal_minor - p_offer_discount_minor + p_offer_tax_total_minor) THEN
                RAISE EXCEPTION 'Invalid membership Offer pricing snapshot'
                    USING ERRCODE = '22023';
            END IF;

            -- This is deliberately only identity/configuration integrity, not
            -- customer or membership-target eligibility evaluation.
            IF NOT EXISTS (
                SELECT 1
                  FROM membership_offer_applicability a
                  JOIN offer o ON o.offer_id = a.offer_id
                 WHERE a.organization_id = p_organization_id
                   AND a.offer_id = p_applied_offer_id
                   AND a.behavior = 'PURCHASE_DISCOUNT'
                   AND a.adjustment_type = p_offer_adjustment_type
                   AND a.is_active
                   AND NOT a.is_deleted
                   AND o.organization_id = p_organization_id
                   AND NOT o.is_deleted
            ) THEN
                RAISE EXCEPTION 'Membership purchase Offer snapshot is unavailable'
                    USING ERRCODE = '23503';
            END IF;

            UPDATE commerce_transactions
               SET membership_offer_id = p_applied_offer_id,
                   membership_offer_adjustment_type = p_offer_adjustment_type,
                   adjustment_total_minor = p_offer_discount_minor,
                   tax_total_minor = p_offer_tax_total_minor,
                   total_minor = p_offer_final_total_minor,
                   membership_pricing_frozen_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = v_transaction.updated_by,
                   version_no = version_no + 1
             WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;
        END IF;

        SELECT * INTO v_transaction
          FROM commerce_transactions
         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id
         FOR UPDATE;
    END IF;

    v_payment_net_subtotal_minor :=
        v_transaction.subtotal_minor - v_transaction.adjustment_total_minor;

    IF v_payment_net_subtotal_minor < 0
       OR v_transaction.total_minor IS DISTINCT FROM
            (v_payment_net_subtotal_minor + v_transaction.tax_total_minor) THEN
        RAISE EXCEPTION 'Frozen Commerce pricing is inconsistent'
            USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_payment
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_payment_idempotency_key
     FOR UPDATE;

    IF NOT FOUND THEN
        -- Preserve all existing provider/authentication behavior, but normalize
        -- the just-created PaymentIntent and attempt to the frozen Commerce
        -- snapshot before this database transaction can commit.
        IF v_staff_assisted THEN
            SELECT * INTO v_started
              FROM payment_start_staff_assisted_membership_intent(
                  p_intent_id, p_attempt_id, p_organization_id,
                  v_counter_purchase_id, v_provider_code,
                  p_payment_idempotency_key, p_actor_user_id
              );
        ELSE
        SELECT * INTO v_started
          FROM payment_start_membership_intent(
              p_intent_id, p_attempt_id, p_organization_id, p_challenge_id,
              v_provider_code, p_payment_idempotency_key, p_actor_user_id
          );
        END IF;

        IF v_started."paymentIntentId" IS NULL THEN
            RAISE EXCEPTION 'Payment was not started'
                USING ERRCODE = '23505';
        END IF;

        UPDATE payment_intents
           SET subtotal_amount = v_payment_net_subtotal_minor::numeric / 100,
               tax_amount = v_transaction.tax_total_minor::numeric / 100,
               amount = v_transaction.total_minor::numeric / 100,
               currency_code = v_transaction.currency_code,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = p_actor_user_id
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND organization_id = p_organization_id;

        UPDATE payment_attempts
           SET subtotal_amount = v_payment_net_subtotal_minor::numeric / 100,
               tax_amount = v_transaction.tax_total_minor::numeric / 100,
               amount = v_transaction.total_minor::numeric / 100,
               currency_code = v_transaction.currency_code
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND idempotency_key = p_payment_idempotency_key;

        SELECT * INTO v_payment
          FROM payment_intents
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND organization_id = p_organization_id
         FOR UPDATE;
    END IF;

    IF v_payment.payment_intent_id IS NULL
       OR (v_staff_assisted AND v_payment.business_otp_challenge_id IS NOT NULL)
       OR (NOT v_staff_assisted AND v_payment.business_otp_challenge_id IS DISTINCT FROM p_challenge_id)
       OR v_payment.membership_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_payment.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_payment.store_id IS DISTINCT FROM p_store_id
       OR v_payment.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Existing payment conflicts with Counter membership purchase'
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id
           AND pc.provider_code IS DISTINCT FROM v_provider_code
    ) THEN
        RAISE EXCEPTION 'Existing payment provider conflicts with configured Counter route'
            USING ERRCODE = '23505';
    END IF;

    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_transaction.total_minor
       OR v_payment.currency_code IS DISTINCT FROM v_transaction.currency_code THEN
        RAISE EXCEPTION 'Payment amount or currency does not match frozen Commerce pricing'
            USING ERRCODE = '23505';
    END IF;

    IF v_payment.commerce_transaction_id IS NOT NULL
       AND v_payment.commerce_transaction_id IS DISTINCT FROM v_transaction.commerce_transaction_id THEN
        RAISE EXCEPTION 'Payment is already associated with another Commerce transaction'
            USING ERRCODE = '23505';
    END IF;

    UPDATE payment_intents
       SET commerce_transaction_id = v_transaction.commerce_transaction_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment.payment_intent_id
       AND organization_id = p_organization_id;

    RETURN QUERY
    SELECT v_payment.payment_intent_id, v_provider_code, v_payment.status,
           v_payment.amount::double precision, v_payment.currency_code,
           v_payment.provider_reference_id, v_payment.membership_plan_id,
           v_payment.customer_user_id, v_payment.created_at::text,
           v_transaction.commerce_transaction_id::varchar;
END;
$function$;

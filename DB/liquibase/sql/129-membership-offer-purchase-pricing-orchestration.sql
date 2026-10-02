-- Server-authoritative automatic Membership Purchase Offer pricing.
--
-- Migration 128 owns the durable pricing snapshot and the trusted 16-argument
-- payment-start overload. This migration replaces only the existing 11-argument
-- Counter membership entry point so automatic Offer eligibility and pricing are
-- resolved inside the same database transaction before the snapshot is frozen.
--
-- No client monetary field is introduced. The runtime role is intentionally
-- denied direct execution of the 16-argument monetary overload after this change.

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
    v_counter_purchase_id varchar(64);
    v_commerce_idempotency_key varchar(128);
    v_existing_frozen_at timestamp with time zone;

    v_membership_product_id varchar(64);
    v_base_subtotal_minor bigint;
    v_tax_rate numeric(7,4);
    v_currency_code varchar(10);
    v_existing_customer boolean;

    v_offer record;
    v_candidate_discount_minor bigint;
    v_candidate_net_subtotal_minor bigint;
    v_candidate_tax_minor bigint;
    v_candidate_final_minor bigint;

    v_best_offer_id varchar(64);
    v_best_adjustment_type varchar(32);
    v_best_discount_minor bigint;
    v_best_tax_minor bigint;
    v_best_final_minor bigint;
BEGIN
    -- Resolve the same verified Counter purchase identity that the trusted
    -- migration-128 overload will enforce again before creating payment state.
    SELECT
        c.plan_id,
        c.user_id,
        c.store_id,
        c.staff_id,
        c.counter_purchase_id
      INTO
        v_context_plan_id,
        v_context_user_id,
        v_context_store_id,
        v_context_staff_id,
        v_counter_purchase_id
      FROM business_otp_context c
      JOIN otp_challenges o
        ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose = 'COUNTER_PURCHASE_VERIFY'
       AND o.status = 'CONSUMED';

    IF v_context_plan_id IS NULL
       OR NULLIF(btrim(v_counter_purchase_id), '') IS NULL
       OR v_context_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_context_user_id IS DISTINCT FROM p_customer_user_id
       OR v_context_store_id IS DISTINCT FROM p_store_id
       OR v_context_staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Verified Counter membership purchase authorization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize all starts for the same logical Counter purchase before Offer
    -- evaluation. The migration-128 overload takes this same row lock again,
    -- which is safe inside the same transaction.
    PERFORM 1
      FROM counter_purchases cp
     WHERE cp.counter_purchase_id = v_counter_purchase_id
       AND cp.organization_id = p_organization_id
       AND cp.store_id = p_store_id
       AND cp.staff_id = p_staff_id
       AND cp.customer_user_id = p_customer_user_id
       AND cp.subscription_plan_id = p_subscription_plan_id
       AND cp.status = 'OPEN'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter purchase identity is inconsistent'
            USING ERRCODE = '23505';
    END IF;

    v_commerce_idempotency_key := 'COUNTER_MEMBERSHIP:' || v_counter_purchase_id;

    -- Retry rule: if this logical purchase already has a frozen Commerce price,
    -- do not inspect current Offer configuration at all. Migration 128 will reuse
    -- the persisted snapshot and verify the PaymentIntent against that total.
    SELECT t.membership_pricing_frozen_at
      INTO v_existing_frozen_at
      FROM commerce_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.idempotency_key = v_commerce_idempotency_key
       AND NOT t.is_deleted
     LIMIT 1;

    IF FOUND AND v_existing_frozen_at IS NOT NULL THEN
        RETURN QUERY
        SELECT *
          FROM payment_start_counter_membership_intent(
              p_intent_id,
              p_attempt_id,
              p_organization_id,
              p_challenge_id,
              p_store_id,
              p_staff_id,
              p_customer_user_id,
              p_subscription_plan_id,
              p_provider_code,
              p_payment_idempotency_key,
              p_actor_user_id,
              NULL::varchar,
              NULL::varchar,
              NULL::bigint,
              NULL::bigint,
              NULL::bigint
          );
        RETURN;
    END IF;

    -- The normal membership quote remains the authoritative source for base price,
    -- currency and tax rate. Convert the base price to minor units once, then keep
    -- all Offer arithmetic in integer minor units.
    SELECT
        sp.membership_product_id,
        round(q."subtotalAmount"::numeric * 100)::bigint,
        q."taxRate"::numeric(7,4),
        q."currencyCode"
      INTO
        v_membership_product_id,
        v_base_subtotal_minor,
        v_tax_rate,
        v_currency_code
      FROM membership_purchase_quote(
          p_organization_id,
          v_context_plan_id
      ) AS q
      JOIN subscription_plans sp
        ON sp.subscription_plan_id = v_context_plan_id;

    IF v_membership_product_id IS NULL
       OR v_base_subtotal_minor IS NULL
       OR v_tax_rate IS NULL
       OR NULLIF(btrim(v_currency_code), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase pricing is unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- NEW_CUSTOMER / EXISTING_CUSTOMER is organization-membership history, not
    -- global user existence. Any current or historical non-deleted subscription
    -- for this organization makes the identified customer EXISTING_CUSTOMER.
    SELECT EXISTS (
        SELECT 1
          FROM subscriptions s
          JOIN organization_user ou
            ON ou.organization_user_id = s.organization_user_id
         WHERE ou.organization_id = p_organization_id
           AND ou.user_id = v_context_user_id
           AND NOT s.is_deleted
    ) INTO v_existing_customer;

    -- No stacking. Evaluate every automatically eligible PURCHASE_DISCOUNT and
    -- retain the candidate producing the lowest tax-inclusive payable amount.
    -- offer_id is the deterministic tie-breaker.
    FOR v_offer IN
        SELECT
            a.offer_id,
            a.adjustment_type,
            a.percentage,
            a.amount_minor,
            a.currency_code
          FROM membership_offer_applicability a
          JOIN offer o
            ON o.offer_id = a.offer_id
          JOIN entity_status oes
            ON oes.entity_status_id = o.status_id
          JOIN statuses os
            ON os.status_id = oes.status_id
         WHERE a.organization_id = p_organization_id
           AND a.behavior = 'PURCHASE_DISCOUNT'
           AND a.is_active
           AND NOT a.is_deleted
           AND o.organization_id = p_organization_id
           AND NOT o.is_deleted
           AND oes.is_active
           AND os.status_code = 'ACTIVE'
           AND (o.store_id IS NULL OR o.store_id = p_store_id)
           AND o.effective_date <= CURRENT_DATE
           AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)
           AND (
               a.customer_applicability = 'ALL'
               OR (a.customer_applicability = 'NEW_CUSTOMER' AND NOT v_existing_customer)
               OR (a.customer_applicability = 'EXISTING_CUSTOMER' AND v_existing_customer)
           )
           AND (
               a.membership_target_mode = 'ALL_MEMBERSHIP_PRODUCTS'
               OR (
                   a.membership_target_mode = 'SELECTED_MEMBERSHIP_PRODUCTS'
                   AND EXISTS (
                       SELECT 1
                         FROM membership_offer_applicability_products ap
                        WHERE ap.membership_offer_applicability_id = a.membership_offer_applicability_id
                          AND ap.organization_id = p_organization_id
                          AND ap.membership_product_id = v_membership_product_id
                          AND NOT ap.is_deleted
                   )
               )
           )
           AND (
               a.target_subscription_plan_id IS NULL
               OR a.target_subscription_plan_id = v_context_plan_id
           )
         ORDER BY a.offer_id
         FOR SHARE OF a, o
    LOOP
        v_candidate_discount_minor := NULL;
        v_candidate_net_subtotal_minor := NULL;

        IF v_offer.adjustment_type = 'PRODUCT_PERCENT_OFF' THEN
            v_candidate_discount_minor := round(
                v_base_subtotal_minor::numeric * v_offer.percentage / 100
            )::bigint;
            v_candidate_discount_minor := LEAST(
                v_base_subtotal_minor,
                GREATEST(0::bigint, v_candidate_discount_minor)
            );
            v_candidate_net_subtotal_minor :=
                v_base_subtotal_minor - v_candidate_discount_minor;

        ELSIF v_offer.adjustment_type = 'PRODUCT_FIXED_OFF' THEN
            IF upper(v_offer.currency_code) IS DISTINCT FROM upper(v_currency_code) THEN
                CONTINUE;
            END IF;
            v_candidate_discount_minor := LEAST(
                v_base_subtotal_minor,
                GREATEST(0::bigint, v_offer.amount_minor)
            );
            v_candidate_net_subtotal_minor :=
                v_base_subtotal_minor - v_candidate_discount_minor;

        ELSIF v_offer.adjustment_type = 'PRODUCT_SPECIAL_PRICE' THEN
            IF upper(v_offer.currency_code) IS DISTINCT FROM upper(v_currency_code)
               OR v_offer.amount_minor < 0
               OR v_offer.amount_minor > v_base_subtotal_minor THEN
                CONTINUE;
            END IF;
            v_candidate_net_subtotal_minor := v_offer.amount_minor;
            v_candidate_discount_minor :=
                v_base_subtotal_minor - v_candidate_net_subtotal_minor;

        ELSE
            CONTINUE;
        END IF;

        v_candidate_tax_minor := round(
            v_candidate_net_subtotal_minor::numeric * v_tax_rate / 100
        )::bigint;
        v_candidate_tax_minor := GREATEST(0::bigint, v_candidate_tax_minor);
        v_candidate_final_minor :=
            v_candidate_net_subtotal_minor + v_candidate_tax_minor;

        IF v_best_offer_id IS NULL
           OR v_candidate_final_minor < v_best_final_minor
           OR (
               v_candidate_final_minor = v_best_final_minor
               AND v_offer.offer_id < v_best_offer_id
           ) THEN
            v_best_offer_id := v_offer.offer_id;
            v_best_adjustment_type := v_offer.adjustment_type;
            v_best_discount_minor := v_candidate_discount_minor;
            v_best_tax_minor := v_candidate_tax_minor;
            v_best_final_minor := v_candidate_final_minor;
        END IF;
    END LOOP;

    -- No eligible Offer deliberately passes NULL snapshot fields. Migration 128
    -- then freezes the normal membership quote unchanged. Otherwise the selected
    -- server-calculated snapshot is frozen atomically by the trusted overload.
    RETURN QUERY
    SELECT *
      FROM payment_start_counter_membership_intent(
          p_intent_id,
          p_attempt_id,
          p_organization_id,
          p_challenge_id,
          p_store_id,
          p_staff_id,
          p_customer_user_id,
          p_subscription_plan_id,
          p_provider_code,
          p_payment_idempotency_key,
          p_actor_user_id,
          v_best_offer_id,
          v_best_adjustment_type,
          v_best_discount_minor,
          v_best_tax_minor,
          v_best_final_minor
      );
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar
) FROM PUBLIC;

-- Only the 11-argument server entry point should be callable by the runtime role.
-- The 16-argument overload contains trusted monetary parameters and remains an
-- internal SECURITY DEFINER implementation detail after migration 128.
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar, varchar, varchar, varchar, bigint, bigint, bigint
        ) FROM "${appRole}";

        GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar, varchar
        ) TO "${appRole}";
    END IF;
END $grant$;

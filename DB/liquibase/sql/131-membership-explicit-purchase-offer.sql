-- Explicit Membership Purchase Offer selection.
--
-- Migration 130 extracted automatic Membership PURCHASE_DISCOUNT pricing into
-- membership_purchase_offer_price(...). This forward migration adds optional
-- explicit Offer identity while preserving every existing signature as a
-- compatibility wrapper.
--
-- Automatic mode: explicit Offer is NULL, so current lowest-payable selection
-- remains unchanged.
--
-- Explicit mode: exactly the requested Offer is evaluated. If it is unavailable
-- or ineligible, the request fails. It never falls back to another automatic Offer.

CREATE OR REPLACE FUNCTION "${schemaName}".membership_purchase_offer_price(
    p_organization_id varchar,
    p_store_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_explicit_offer_id varchar
) RETURNS TABLE (
    "subscriptionPlanId" varchar,
    "membershipProductId" varchar,
    "baseSubtotalMinor" bigint,
    "appliedOfferId" varchar,
    "adjustmentType" varchar,
    "discountMinor" bigint,
    "netSubtotalMinor" bigint,
    "taxRate" double precision,
    "taxMinor" bigint,
    "finalTotalMinor" bigint,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_membership_product_id varchar(64);
    v_base_subtotal_minor bigint;
    v_tax_rate numeric(7,4);
    v_currency_code varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing_customer boolean;

    v_offer record;
    v_candidate_discount_minor bigint;
    v_candidate_net_subtotal_minor bigint;
    v_candidate_tax_minor bigint;
    v_candidate_final_minor bigint;

    v_best_offer_id varchar(64);
    v_best_adjustment_type varchar(32);
    v_best_discount_minor bigint;
    v_best_net_subtotal_minor bigint;
    v_best_tax_minor bigint;
    v_best_final_minor bigint;

    v_base_tax_minor bigint;
    v_base_final_minor bigint;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase quote context is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF p_explicit_offer_id IS NOT NULL
       AND NULLIF(btrim(p_explicit_offer_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership Offer is unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- The existing membership quote remains authoritative for base pricing/tax.
    SELECT
        sp.membership_product_id,
        round(q."subtotalAmount"::numeric * 100)::bigint,
        q."taxRate"::numeric(7,4),
        round(q."taxAmount"::numeric * 100)::bigint,
        round(q."totalAmount"::numeric * 100)::bigint,
        q."currencyCode",
        q."taxCode",
        q."taxName"
      INTO
        v_membership_product_id,
        v_base_subtotal_minor,
        v_tax_rate,
        v_base_tax_minor,
        v_base_final_minor,
        v_currency_code,
        v_tax_code,
        v_tax_name
      FROM membership_purchase_quote(
          p_organization_id,
          p_subscription_plan_id
      ) AS q
      JOIN subscription_plans sp
        ON sp.subscription_plan_id = p_subscription_plan_id;

    IF v_membership_product_id IS NULL
       OR v_base_subtotal_minor IS NULL
       OR v_tax_rate IS NULL
       OR v_base_tax_minor IS NULL
       OR v_base_final_minor IS NULL
       OR NULLIF(btrim(v_currency_code), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase pricing is unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- Identified customers must be active in this organization. Null identity is
    -- allowed for preview, but only ALL customer applicability can then qualify.
    IF p_customer_user_id IS NOT NULL
       AND NOT customer_has_active_relationship(
           p_organization_id,
           p_customer_user_id
       ) THEN
        RAISE EXCEPTION 'Customer is not active in this organization'
            USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NULL THEN
        v_existing_customer := NULL;
    ELSE
        SELECT EXISTS (
            SELECT 1
              FROM subscriptions s
              JOIN organization_user ou
                ON ou.organization_user_id = s.organization_user_id
             WHERE ou.organization_id = p_organization_id
               AND ou.user_id = p_customer_user_id
               AND NOT s.is_deleted
        ) INTO v_existing_customer;
    END IF;

    -- Distinguish an unknown/non-membership-purchase Offer from one that exists
    -- but is not currently eligible for this purchase.
    IF p_explicit_offer_id IS NOT NULL THEN
        PERFORM 1
          FROM membership_offer_applicability a
          JOIN offer o
            ON o.offer_id = a.offer_id
         WHERE a.offer_id = p_explicit_offer_id
           AND a.organization_id = p_organization_id
           AND o.organization_id = p_organization_id
           AND a.behavior = 'PURCHASE_DISCOUNT'
           AND NOT a.is_deleted
           AND NOT o.is_deleted
         LIMIT 1;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Membership Offer is unavailable'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    -- No stacking. Automatic mode evaluates all eligible Offers and keeps the
    -- lowest tax-inclusive payable amount. Explicit mode evaluates only the
    -- requested Offer and never substitutes another Offer.
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
           AND (p_explicit_offer_id IS NULL OR a.offer_id = p_explicit_offer_id)
           AND (
               a.customer_applicability = 'ALL'
               OR (
                   p_customer_user_id IS NOT NULL
                   AND a.customer_applicability = 'NEW_CUSTOMER'
                   AND NOT v_existing_customer
               )
               OR (
                   p_customer_user_id IS NOT NULL
                   AND a.customer_applicability = 'EXISTING_CUSTOMER'
                   AND v_existing_customer
               )
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
               OR a.target_subscription_plan_id = p_subscription_plan_id
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
            v_best_net_subtotal_minor := v_candidate_net_subtotal_minor;
            v_best_tax_minor := v_candidate_tax_minor;
            v_best_final_minor := v_candidate_final_minor;
        END IF;
    END LOOP;

    IF p_explicit_offer_id IS NOT NULL
       AND v_best_offer_id IS NULL THEN
        RAISE EXCEPTION 'Membership Offer is not eligible for this purchase'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p_subscription_plan_id,
        v_membership_product_id,
        v_base_subtotal_minor,
        v_best_offer_id,
        v_best_adjustment_type,
        COALESCE(v_best_discount_minor, 0::bigint),
        COALESCE(v_best_net_subtotal_minor, v_base_subtotal_minor),
        v_tax_rate::double precision,
        COALESCE(v_best_tax_minor, v_base_tax_minor),
        COALESCE(v_best_final_minor, v_base_final_minor),
        v_currency_code,
        v_tax_code,
        v_tax_name;
END;
$function$;

-- Preserve migration-130 4-argument pricing signature as automatic mode.
CREATE OR REPLACE FUNCTION "${schemaName}".membership_purchase_offer_price(
    p_organization_id varchar,
    p_store_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar
) RETURNS TABLE (
    "subscriptionPlanId" varchar,
    "membershipProductId" varchar,
    "baseSubtotalMinor" bigint,
    "appliedOfferId" varchar,
    "adjustmentType" varchar,
    "discountMinor" bigint,
    "netSubtotalMinor" bigint,
    "taxRate" double precision,
    "taxMinor" bigint,
    "finalTotalMinor" bigint,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    RETURN QUERY
    SELECT *
      FROM membership_purchase_offer_price(
          p_organization_id,
          p_store_id,
          p_customer_user_id,
          p_subscription_plan_id,
          NULL::varchar
      );
END;
$function$;

-- Explicit-capable Counter preview wrapper.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_actor_user_id varchar,
    p_explicit_offer_id varchar
) RETURNS TABLE (
    "planId" varchar,
    "membershipProductId" varchar,
    "subtotalAmount" double precision,
    "appliedOfferId" varchar,
    "adjustmentType" varchar,
    "discountAmount" double precision,
    "netSubtotalAmount" double precision,
    "taxRate" double precision,
    "taxAmount" double precision,
    "totalAmount" double precision,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        q."subscriptionPlanId",
        q."membershipProductId",
        (q."baseSubtotalMinor"::numeric / 100)::double precision,
        q."appliedOfferId",
        q."adjustmentType",
        (q."discountMinor"::numeric / 100)::double precision,
        (q."netSubtotalMinor"::numeric / 100)::double precision,
        q."taxRate",
        (q."taxMinor"::numeric / 100)::double precision,
        (q."finalTotalMinor"::numeric / 100)::double precision,
        q."currencyCode",
        q."taxCode",
        q."taxName"
      FROM membership_purchase_offer_price(
          p_organization_id,
          p_store_id,
          p_customer_user_id,
          p_subscription_plan_id,
          p_explicit_offer_id
      ) AS q;
END;
$function$;

-- Preserve migration-130 6-argument quote signature as automatic mode.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "planId" varchar,
    "membershipProductId" varchar,
    "subtotalAmount" double precision,
    "appliedOfferId" varchar,
    "adjustmentType" varchar,
    "discountAmount" double precision,
    "netSubtotalAmount" double precision,
    "taxRate" double precision,
    "taxAmount" double precision,
    "totalAmount" double precision,
    "currencyCode" varchar,
    "taxCode" varchar,
    "taxName" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    RETURN QUERY
    SELECT *
      FROM counter_membership_purchase_offer_quote(
          p_organization_id,
          p_store_id,
          p_staff_id,
          p_customer_user_id,
          p_subscription_plan_id,
          p_actor_user_id,
          NULL::varchar
      );
END;
$function$;

-- Explicit-capable first-attempt Counter payment start. The explicit Offer is
-- used only before pricing is frozen. Frozen retry behavior remains unchanged.
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
    p_explicit_offer_id varchar
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
    v_quote record;
BEGIN
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

    -- Once frozen, the persisted Commerce snapshot always wins, even if the
    -- caller later supplies a different explicit Offer identity.
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

    SELECT * INTO v_quote
      FROM membership_purchase_offer_price(
          p_organization_id,
          p_store_id,
          p_customer_user_id,
          p_subscription_plan_id,
          p_explicit_offer_id
      );

    IF v_quote."subscriptionPlanId" IS NULL
       OR v_quote."subscriptionPlanId" IS DISTINCT FROM p_subscription_plan_id THEN
        RAISE EXCEPTION 'Membership purchase pricing is unavailable'
            USING ERRCODE = '22023';
    END IF;

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
          v_quote."appliedOfferId",
          v_quote."adjustmentType",
          CASE WHEN v_quote."appliedOfferId" IS NULL THEN NULL::bigint ELSE v_quote."discountMinor" END,
          CASE WHEN v_quote."appliedOfferId" IS NULL THEN NULL::bigint ELSE v_quote."taxMinor" END,
          CASE WHEN v_quote."appliedOfferId" IS NULL THEN NULL::bigint ELSE v_quote."finalTotalMinor" END
      );
END;
$function$;

-- Preserve migration-130 11-argument payment-start signature as automatic mode.
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
BEGIN
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
          NULL::varchar
      );
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".membership_purchase_offer_price(
    varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".membership_purchase_offer_price(
    varchar, varchar, varchar, varchar
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
    varchar, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar, varchar
) FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, varchar
) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        -- Both pricing-engine signatures remain internal.
        REVOKE ALL ON FUNCTION "${schemaName}".membership_purchase_offer_price(
            varchar, varchar, varchar, varchar, varchar
        ) FROM "${appRole}";

        REVOKE ALL ON FUNCTION "${schemaName}".membership_purchase_offer_price(
            varchar, varchar, varchar, varchar
        ) FROM "${appRole}";

        -- Migration-128 trusted monetary overload remains internal.
        REVOKE ALL ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar, varchar, varchar, varchar, bigint, bigint, bigint
        ) FROM "${appRole}";

        -- Runtime may call only identity/context quote/payment entry points.
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar
        ) TO "${appRole}";

        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_membership_purchase_offer_quote(
            varchar, varchar, varchar, varchar, varchar, varchar
        ) TO "${appRole}";

        GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar, varchar, varchar
        ) TO "${appRole}";

        GRANT EXECUTE ON FUNCTION "${schemaName}".payment_start_counter_membership_intent(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar, varchar
        ) TO "${appRole}";
    END IF;
END $grant$;

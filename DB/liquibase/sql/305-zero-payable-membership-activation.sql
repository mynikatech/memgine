
-- 305-zero-payable-membership-activation.sql
--
-- Activate a membership without payment only when the final
-- authoritative payable total, after offers and tax, is zero.
--
-- Reuses:
--   membership_purchase_offer_price
--   corporate_membership_require_access
--   commerce_prepare_customer_membership_order
--   customer_purchase_subscription_authenticated
--
-- No payment intents, payment attempts, triggers, or new tables.

CREATE FUNCTION "${schemaName}".customer_activate_zero_total_membership(
    p_organization_id varchar,
    p_customer_user_id varchar,
    p_plan_id varchar,
    p_explicit_offer_id varchar,
    p_idempotency_key varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
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
    v_product_id varchar(64);
    v_commerce_key varchar(128);
    v_transaction commerce_transactions%ROWTYPE;
    v_prepared record;
    v_quote record;
    v_subscription record;
BEGIN
    IF p_actor_user_id IS DISTINCT FROM p_customer_user_id
       OR NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_plan_id), '') IS NULL
       OR NULLIF(btrim(p_idempotency_key), '') IS NULL
       OR length(p_idempotency_key) > 128
       OR (
           p_explicit_offer_id IS NOT NULL
           AND NULLIF(btrim(p_explicit_offer_id), '') IS NULL
       )
       OR NOT customer_can_start_membership_purchase(
           p_organization_id, p_customer_user_id
       )
    THEN
        RAISE EXCEPTION 'Customer membership activation is unavailable'
            USING ERRCODE = '42501';
    END IF;

    SELECT sp.membership_product_id
      INTO v_product_id
      FROM subscription_plans sp
      JOIN membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
     WHERE sp.subscription_plan_id = p_plan_id
       AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted
       AND NOT mp.is_deleted;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Membership plan unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- Match the paid checkout's customer/product serialization lock.
    PERFORM pg_advisory_xact_lock(
        hashtext(
            'customer-membership-start:' ||
            p_organization_id || ':' ||
            p_customer_user_id || ':' ||
            v_product_id
        )
    );

    -- Same Commerce key convention as customer membership payment.
    -- The frontend uses a separate free-activation idempotency key.
    v_commerce_key := 'CUSTOMER_MEMBERSHIP:' ||
        md5(
            p_organization_id || ':' ||
            p_customer_user_id || ':' ||
            p_idempotency_key
        );

    SELECT *
      INTO v_transaction
      FROM commerce_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.idempotency_key = v_commerce_key
       AND NOT t.is_deleted
     FOR UPDATE;

    -- An identical successful request returns its original subscription.
    IF FOUND THEN
        IF v_transaction.source_channel IS DISTINCT FROM 'CUSTOMER_MEMBERSHIP'
           OR v_transaction.customer_user_id IS DISTINCT FROM p_customer_user_id
           OR v_transaction.store_id IS NOT NULL
           OR v_transaction.integration_configuration_id IS NOT NULL
           OR (
               p_explicit_offer_id IS NOT NULL
               AND v_transaction.membership_offer_id
                   IS DISTINCT FROM p_explicit_offer_id
           )
           OR (
               SELECT count(*)
                 FROM commerce_transaction_lines l
                WHERE l.commerce_transaction_id =
                      v_transaction.commerce_transaction_id
                  AND NOT l.is_deleted
           ) <> 1
           OR NOT EXISTS (
               SELECT 1
                 FROM commerce_transaction_lines l
                WHERE l.commerce_transaction_id =
                      v_transaction.commerce_transaction_id
                  AND NOT l.is_deleted
                  AND l.line_type = 'MEMBERSHIP'
                  AND l.subscription_plan_id = p_plan_id
                  AND l.quantity = 1
           )
        THEN
            RAISE EXCEPTION 'Purchase reference belongs to a different checkout'
                USING ERRCODE = '23505';
        END IF;

        IF v_transaction.status = 'COMPLETED'
           AND v_transaction.subscription_id IS NOT NULL
           AND v_transaction.total_minor = 0
        THEN
            RETURN QUERY
            SELECT
                s.subscription_id,
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
            FROM subscriptions s
            JOIN organization_user ou
              ON ou.organization_user_id = s.organization_user_id
            JOIN subscription_plans sp
              ON sp.subscription_plan_id = s.subscription_plan_id
            JOIN currencies cur
              ON cur.currency_id = sp.currency_id
            WHERE s.subscription_id = v_transaction.subscription_id
              AND ou.organization_id = p_organization_id
              AND ou.user_id = p_customer_user_id
              AND s.subscription_plan_id = p_plan_id
              AND s.total_amount = 0
              AND NOT s.is_deleted;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Completed membership activation is inconsistent'
                    USING ERRCODE = '23505';
            END IF;

            RETURN;
        END IF;

        -- Never repurpose an existing checkout in another state.
        RAISE EXCEPTION 'Existing membership checkout requires resolution'
            USING ERRCODE = '23505';
    END IF;

    -- A zero-value activation must not bypass unresolved payments
    -- belonging to this same membership product.
    IF EXISTS (
        SELECT 1
        FROM payment_intents i
        JOIN subscription_plans sp
          ON sp.subscription_plan_id = i.membership_plan_id
        WHERE i.organization_id = p_organization_id
          AND i.customer_user_id = p_customer_user_id
          AND i.authorization_mode = 'CUSTOMER_SESSION'
          AND sp.membership_product_id = v_product_id
          AND (
              (
                  i.status IN ('PENDING', 'PROCESSING', 'SUCCEEDED')
                  AND i.finalized_subscription_id IS NULL
              )
              OR EXISTS (
                  SELECT 1
                  FROM poynt_collect_verified_captures c
                  WHERE c.organization_id = i.organization_id
                    AND c.payment_intent_id = i.payment_intent_id
              )
          )
    )
    OR EXISTS (
        SELECT 1
        FROM poynt_collect_financial_exceptions e
        JOIN payment_intents i
          ON i.payment_intent_id = e.payment_intent_id
        JOIN subscription_plans sp
          ON sp.subscription_plan_id = i.membership_plan_id
        WHERE e.organization_id = p_organization_id
          AND e.customer_user_id = p_customer_user_id
          AND e.case_status IN ('OPEN', 'UNDER_REVIEW')
          AND sp.membership_product_id = v_product_id
    )
    THEN
        RAISE EXCEPTION 'Existing membership payment requires resolution'
            USING ERRCODE = '23505';
    END IF;

    -- For Corporate Membership this requires an existing valid grant.
    -- For an ordinary membership the existing helper permits access.
    PERFORM corporate_membership_require_access(
        p_organization_id,
        p_plan_id,
        p_customer_user_id
    );

    -- The same authoritative pricing function used by paid checkout.
    -- Includes automatically selected or explicit eligible offers.
    SELECT *
      INTO v_quote
      FROM membership_purchase_offer_price(
          p_organization_id,
          NULL::varchar,
          p_customer_user_id,
          p_plan_id,
          p_explicit_offer_id
      );

    IF v_quote."subscriptionPlanId" IS DISTINCT FROM p_plan_id
       OR v_quote."membershipProductId" IS DISTINCT FROM v_product_id
       OR v_quote."finalTotalMinor" IS DISTINCT FROM 0::bigint
       OR v_quote."netSubtotalMinor" IS DISTINCT FROM 0::bigint
       OR v_quote."taxMinor" IS DISTINCT FROM 0::bigint
       OR v_quote."currencyCode" IS NULL
       OR v_quote."currencyCode" !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION 'Membership requires payment; refresh checkout'
            USING ERRCODE = '22023';
    END IF;

    -- The agreement is also checked by Kotlin against the CURRENT
    -- authoritative agreement hash. This SQL check binds acceptance
    -- to the same customer, plan and immutable purchase reference.
    IF NOT EXISTS (
        SELECT 1
        FROM membership_agreement_acceptance a
        WHERE a.organization_id = p_organization_id
          AND a.customer_user_id = p_customer_user_id
          AND a.membership_product_id = v_product_id
          AND a.purchase_reference = p_idempotency_key
          AND a.agreement_snapshot->>'planId' = p_plan_id
          AND COALESCE(
              a.agreement_snapshot->>'explicitOfferId', ''
          ) = COALESCE(p_explicit_offer_id, '')
    )
    THEN
        RAISE EXCEPTION 'Accept membership agreement before activation'
            USING ERRCODE = '42501';
    END IF;

    -- Reuse the canonical Commerce order preparation.
    SELECT *
      INTO v_prepared
      FROM commerce_prepare_customer_membership_order(
          p_organization_id,
          p_customer_user_id,
          p_plan_id,
          v_commerce_key
      );

    SELECT *
      INTO v_transaction
      FROM commerce_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.commerce_transaction_id =
           v_prepared."commerceTransactionId"
     FOR UPDATE;

    IF NOT FOUND OR v_transaction.status <> 'ORDER_CREATED'
    THEN
        RAISE EXCEPTION 'Free membership order is not ready'
            USING ERRCODE = '23505';
    END IF;

    -- Existing authoritative activation primitive:
    -- validates customer, plan, period and active subscription rules.
    SELECT *
      INTO v_subscription
      FROM customer_purchase_subscription_authenticated(
          p_organization_id,
          p_plan_id,
          p_customer_user_id
      );

    IF v_subscription."subscriptionId" IS NULL THEN
        RAISE EXCEPTION 'Membership could not be activated'
            USING ERRCODE = '23505';
    END IF;

    -- The existing subscription primitive stores the original plan price.
    -- This newly created subscription was activated at zero payable.
    UPDATE subscriptions
       SET total_amount = 0,
           subtotal_amount = 0,
           tax_amount = 0,
           tax_rate = v_quote."taxRate",
           tax_code = v_quote."taxCode",
           tax_name = v_quote."taxName",
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_customer_user_id
     WHERE subscription_id = v_subscription."subscriptionId"
       AND organization_user_id =
           v_subscription."organizationUserId";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Free membership financial snapshot was not saved'
            USING ERRCODE = '23505';
    END IF;

    -- Record the applied offer and finish the zero-value order.
    -- No payment intent or provider payment attempt is created.
    UPDATE commerce_transactions
       SET membership_offer_id = v_quote."appliedOfferId",
           membership_offer_adjustment_type =
               v_quote."adjustmentType",
           adjustment_total_minor = v_quote."discountMinor",
           tax_total_minor = 0,
           total_minor = 0,
           membership_pricing_frozen_at = CURRENT_TIMESTAMP,
           subscription_id = v_subscription."subscriptionId",
           status = 'COMPLETED',
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_subscription."organizationUserId",
           version_no = version_no + 1
     WHERE commerce_transaction_id =
           v_transaction.commerce_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Free membership order was not completed'
            USING ERRCODE = '23505';
    END IF;

    RETURN QUERY SELECT
        v_subscription."subscriptionId"::varchar,
        v_subscription."organizationUserId"::varchar,
        v_subscription."userId"::varchar,
        v_subscription."subscriptionNumber"::varchar,
        v_subscription."subscriptionPlanId"::varchar,
        v_subscription."subscriptionDate"::text,
        v_subscription."startDate"::text,
        v_subscription."endDate"::text,
        v_subscription."subscriptionStatusId"::varchar,
        0::double precision,
        v_quote."currencyCode"::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".customer_activate_zero_total_membership(
        varchar, varchar, varchar, varchar, varchar, varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".customer_activate_zero_total_membership(
        varchar, varchar, varchar, varchar, varchar, varchar
    )
TO "${appRole}";

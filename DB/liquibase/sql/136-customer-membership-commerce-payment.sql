-- Authenticated customer checkout shares the Counter Offer evaluator. A null store
-- selects organization-wide offers only; Counter continues to pass its store.
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

-- Customer-visible preview has the same fields and pricing as Counter preview.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_membership_purchase_offer_quote(
    p_organization_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer is not active in this organization' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT
        q."subscriptionPlanId", q."membershipProductId",
        (q."baseSubtotalMinor"::numeric / 100)::double precision,
        q."appliedOfferId", q."adjustmentType",
        (q."discountMinor"::numeric / 100)::double precision,
        (q."netSubtotalMinor"::numeric / 100)::double precision,
        q."taxRate", (q."taxMinor"::numeric / 100)::double precision,
        (q."finalTotalMinor"::numeric / 100)::double precision,
        q."currencyCode", q."taxCode", q."taxName"
    FROM membership_purchase_offer_price(
        p_organization_id, NULL::varchar, p_customer_user_id,
        p_subscription_plan_id, p_explicit_offer_id
    ) AS q;
END;
$function$;

-- Prepare one internal membership order for a customer session. This function
-- never contacts a payment provider and cannot reuse a Counter checkout key.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_customer_membership_order(
    p_organization_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_idempotency_key varchar
) RETURNS TABLE (
    "commerceTransactionId" varchar,
    "providerOrderId" varchar,
    "amountMinor" bigint,
    "currencyCode" varchar,
    "status" varchar
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
    v_organization_user_id varchar(64);
    v_quote record;
    v_description varchar(500);
    v_order_id varchar(160);
    v_line_count integer;
    v_subtotal_minor bigint;
    v_tax_minor bigint;
    v_total_minor bigint;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_idempotency_key), '') IS NULL
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid customer membership checkout request' USING ERRCODE = '22023';
    END IF;
    IF NOT customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer is not active in this organization' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id || ':' || p_idempotency_key));

    SELECT ou.organization_user_id INTO v_organization_user_id
      FROM organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = p_customer_user_id
       AND NOT ou.is_deleted
     LIMIT 1;
    IF v_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Customer organization membership not found' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_transaction FROM commerce_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.idempotency_key = p_idempotency_key
       AND NOT t.is_deleted
     FOR UPDATE;

    IF FOUND THEN
        v_order_id := 'MEMBERSHIP-' || v_transaction.commerce_transaction_id;
        SELECT count(*) INTO v_line_count
          FROM commerce_transaction_lines l
         WHERE l.commerce_transaction_id = v_transaction.commerce_transaction_id
           AND NOT l.is_deleted;
        IF v_transaction.source_channel IS DISTINCT FROM 'CUSTOMER_MEMBERSHIP'
           OR v_transaction.store_id IS NOT NULL
           OR v_transaction.customer_user_id IS DISTINCT FROM p_customer_user_id
           OR v_transaction.integration_configuration_id IS NOT NULL
           OR v_transaction.provider_order_id IS DISTINCT FROM v_order_id
           OR v_line_count <> 1
           OR EXISTS (
               SELECT 1 FROM commerce_transaction_lines l
                WHERE l.commerce_transaction_id = v_transaction.commerce_transaction_id
                  AND NOT l.is_deleted
                  AND (l.line_type <> 'MEMBERSHIP'
                       OR l.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id
                       OR l.quantity <> 1)
           ) THEN
            RAISE EXCEPTION 'Existing customer checkout conflicts with membership purchase'
                USING ERRCODE = '23505';
        END IF;
        IF v_transaction.status NOT IN (
            'ORDER_CREATED', 'PROVIDER_IN_PROGRESS', 'PROVIDER_SUCCEEDED',
            'FULFILLMENT_PENDING', 'COMPLETED'
        ) OR v_transaction.total_minor IS NULL OR v_transaction.currency_code IS NULL THEN
            RAISE EXCEPTION 'Existing customer checkout is not prepared'
                USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT v_transaction.commerce_transaction_id, v_order_id,
            v_transaction.total_minor, v_transaction.currency_code, v_transaction.status;
        RETURN;
    END IF;

    SELECT * INTO v_quote
      FROM membership_purchase_quote(p_organization_id, p_subscription_plan_id);
    IF v_quote."subtotalAmount" IS NULL OR v_quote."taxAmount" IS NULL
       OR v_quote."totalAmount" IS NULL OR v_quote."subtotalAmount" < 0
       OR v_quote."taxAmount" < 0
       OR round(v_quote."totalAmount"::numeric * 100)::bigint IS DISTINCT FROM
          (round(v_quote."subtotalAmount"::numeric * 100)::bigint +
           round(v_quote."taxAmount"::numeric * 100)::bigint)
       OR NULLIF(btrim(v_quote."currencyCode"), '') IS NULL
       OR v_quote."currencyCode" !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Invalid membership purchase quote' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(mp.membership_product_name, 'Membership') || ' - ' ||
           COALESCE(sp.subscription_plan_name, 'Plan')
      INTO v_description
      FROM subscription_plans sp
      JOIN membership_products mp ON mp.membership_product_id = sp.membership_product_id
     WHERE sp.subscription_plan_id = p_subscription_plan_id
       AND mp.organization_id = p_organization_id
       AND NOT sp.is_deleted AND NOT mp.is_deleted;
    IF v_description IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable' USING ERRCODE = '23503';
    END IF;
    v_subtotal_minor := round(v_quote."subtotalAmount"::numeric * 100)::bigint;
    v_tax_minor := round(v_quote."taxAmount"::numeric * 100)::bigint;
    v_total_minor := round(v_quote."totalAmount"::numeric * 100)::bigint;

    INSERT INTO commerce_transactions (
        commerce_transaction_id, organization_id, store_id, customer_user_id,
        integration_configuration_id, source_channel, status, currency_code,
        subtotal_minor, adjustment_total_minor, tax_total_minor, total_minor,
        provider_order_id, idempotency_key, created_by, updated_by
    ) VALUES (
        generate_runtime_id('CTX'), p_organization_id, NULL, p_customer_user_id,
        NULL, 'CUSTOMER_MEMBERSHIP', 'DRAFT', v_quote."currencyCode",
        v_subtotal_minor, 0, v_tax_minor, v_total_minor,
        NULL, p_idempotency_key, v_organization_user_id, v_organization_user_id
    ) RETURNING * INTO v_transaction;

    INSERT INTO commerce_transaction_lines (
        commerce_transaction_line_id, commerce_transaction_id, line_type,
        subscription_plan_id, description, quantity,
        unit_price_minor_authoritative, line_subtotal_minor, currency_code,
        price_source, created_by, updated_by
    ) VALUES (
        generate_runtime_id('CTL'), v_transaction.commerce_transaction_id, 'MEMBERSHIP',
        p_subscription_plan_id, v_description, 1,
        v_subtotal_minor, v_subtotal_minor, v_quote."currencyCode",
        'MEMGINE_MEMBERSHIP', v_organization_user_id, v_organization_user_id
    );

    v_order_id := 'MEMBERSHIP-' || v_transaction.commerce_transaction_id;
    UPDATE commerce_transactions
       SET status = 'ORDER_CREATED', provider_order_id = v_order_id,
           updated_at = CURRENT_TIMESTAMP, updated_by = v_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;
    RETURN QUERY SELECT v_transaction.commerce_transaction_id, v_order_id,
        v_total_minor, v_quote."currencyCode"::varchar, 'ORDER_CREATED'::varchar;
END;
$function$;

-- Atomic customer checkout start: prepare Commerce, freeze the shared Offer
-- quote once, start/reuse the legacy provider intent, then correlate both.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_customer_commerce_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_subscription_plan_id varchar,
    p_customer_user_id varchar,
    p_provider_code varchar,
    p_payment_idempotency_key varchar,
    p_explicit_offer_id varchar,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_commerce_key varchar(128);
    v_prepared record;
    v_transaction commerce_transactions%ROWTYPE;
    v_quote record;
    v_payment payment_intents%ROWTYPE;
    v_started record;
    v_payment_net_subtotal_minor bigint;
    v_provider_code varchar(64);
BEGIN
    IF NULLIF(btrim(p_intent_id), '') IS NULL
       OR NULLIF(btrim(p_attempt_id), '') IS NULL
       OR NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR p_actor_user_id IS DISTINCT FROM p_customer_user_id
       OR NULLIF(btrim(p_provider_code), '') IS NULL
       OR NULLIF(btrim(p_payment_idempotency_key), '') IS NULL
       OR length(p_payment_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid customer membership payment request' USING ERRCODE = '22023';
    END IF;
    IF NOT customer_has_active_relationship(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer is not active in this organization' USING ERRCODE = '42501';
    END IF;

    -- Namespaced and bounded; a retry with the same customer purchase key
    -- always resolves to the same Commerce checkout, independent of provider.
    v_commerce_key := 'CUSTOMER_MEMBERSHIP:' ||
        md5(p_organization_id || ':' || p_customer_user_id || ':' || p_payment_idempotency_key);
    SELECT * INTO v_prepared
      FROM commerce_prepare_customer_membership_order(
          p_organization_id, p_customer_user_id, p_subscription_plan_id,
          v_commerce_key
      );
    IF v_prepared."commerceTransactionId" IS NULL THEN
        RAISE EXCEPTION 'Customer membership Commerce transaction is not prepared'
            USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_transaction FROM commerce_transactions t
     WHERE t.commerce_transaction_id = v_prepared."commerceTransactionId"
       AND t.organization_id = p_organization_id AND NOT t.is_deleted
     FOR UPDATE;

    IF v_transaction.membership_pricing_frozen_at IS NULL THEN
        SELECT * INTO v_quote
          FROM membership_purchase_offer_price(
              p_organization_id, NULL::varchar, p_customer_user_id,
              p_subscription_plan_id, p_explicit_offer_id
          );
        IF v_quote."subscriptionPlanId" IS DISTINCT FROM p_subscription_plan_id
           OR v_quote."baseSubtotalMinor" IS DISTINCT FROM v_transaction.subtotal_minor
           OR v_quote."currencyCode" IS DISTINCT FROM v_transaction.currency_code
           OR v_quote."finalTotalMinor" IS NULL THEN
            RAISE EXCEPTION 'Customer membership pricing is inconsistent'
                USING ERRCODE = '23505';
        END IF;
        UPDATE commerce_transactions
           SET membership_offer_id = v_quote."appliedOfferId",
               membership_offer_adjustment_type = v_quote."adjustmentType",
               adjustment_total_minor = v_quote."discountMinor",
               tax_total_minor = v_quote."taxMinor",
               total_minor = v_quote."finalTotalMinor",
               membership_pricing_frozen_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;
        SELECT * INTO v_transaction FROM commerce_transactions t
         WHERE t.commerce_transaction_id = v_transaction.commerce_transaction_id
         FOR UPDATE;
    END IF;
    v_payment_net_subtotal_minor :=
        v_transaction.subtotal_minor - v_transaction.adjustment_total_minor;
    IF v_payment_net_subtotal_minor < 0
       OR v_transaction.total_minor IS DISTINCT FROM
          (v_payment_net_subtotal_minor + v_transaction.tax_total_minor) THEN
        RAISE EXCEPTION 'Frozen Commerce pricing is inconsistent' USING ERRCODE = '23505';
    END IF;

    SELECT * INTO v_payment FROM payment_intents i
     WHERE i.organization_id = p_organization_id
       AND i.idempotency_key = p_payment_idempotency_key
     FOR UPDATE;
    IF NOT FOUND THEN
        SELECT * INTO v_started
          FROM payment_start_customer_membership_intent(
              p_intent_id, p_attempt_id, p_organization_id,
              p_subscription_plan_id, p_customer_user_id,
              p_provider_code, p_payment_idempotency_key
          );
        IF v_started."paymentIntentId" IS NULL THEN
            RAISE EXCEPTION 'Payment was not started' USING ERRCODE = '23505';
        END IF;
        UPDATE payment_intents
           SET subtotal_amount = v_payment_net_subtotal_minor::numeric / 100,
               tax_amount = v_transaction.tax_total_minor::numeric / 100,
               amount = v_transaction.total_minor::numeric / 100,
               currency_code = v_transaction.currency_code,
               commerce_transaction_id = v_transaction.commerce_transaction_id,
               updated_at = CURRENT_TIMESTAMP, updated_by = p_customer_user_id
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND organization_id = p_organization_id;
        UPDATE payment_attempts
           SET subtotal_amount = v_payment_net_subtotal_minor::numeric / 100,
               tax_amount = v_transaction.tax_total_minor::numeric / 100,
               amount = v_transaction.total_minor::numeric / 100,
               currency_code = v_transaction.currency_code
         WHERE payment_intent_id = v_started."paymentIntentId"
           AND idempotency_key = p_payment_idempotency_key;
        SELECT * INTO v_payment FROM payment_intents i
         WHERE i.payment_intent_id = v_started."paymentIntentId"
           AND i.organization_id = p_organization_id
         FOR UPDATE;
    END IF;

    SELECT pc.provider_code INTO v_provider_code
      FROM payment_provider_configs pc
     WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id;
    IF v_payment.payment_intent_id IS NULL
       OR v_payment.authorization_mode IS DISTINCT FROM 'CUSTOMER_SESSION'
       OR v_payment.membership_plan_id IS DISTINCT FROM p_subscription_plan_id
       OR v_payment.customer_user_id IS DISTINCT FROM p_customer_user_id
       OR v_payment.created_by IS DISTINCT FROM p_customer_user_id
       OR v_payment.store_id IS NOT NULL OR v_payment.staff_id IS NOT NULL
       OR v_provider_code IS DISTINCT FROM p_provider_code
       OR (v_payment.commerce_transaction_id IS NOT NULL
           AND v_payment.commerce_transaction_id IS DISTINCT FROM
               v_transaction.commerce_transaction_id)
       OR round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_transaction.total_minor
       OR v_payment.currency_code IS DISTINCT FROM v_transaction.currency_code THEN
        RAISE EXCEPTION 'Existing payment conflicts with customer Commerce checkout'
            USING ERRCODE = '23505';
    END IF;
    UPDATE payment_intents
       SET commerce_transaction_id = v_transaction.commerce_transaction_id,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_customer_user_id
     WHERE payment_intent_id = v_payment.payment_intent_id
       AND commerce_transaction_id IS NULL;

    RETURN QUERY SELECT v_payment.payment_intent_id, v_provider_code,
        v_payment.status, v_payment.amount::double precision,
        v_payment.currency_code, v_payment.provider_reference_id,
        v_payment.membership_plan_id, v_payment.customer_user_id,
        v_payment.created_at::text, v_transaction.commerce_transaction_id::varchar;
END;
$function$;

-- Reconcile an already persisted provider/PaymentIntent outcome for the
-- customer-owned checkout. Payment truth is committed before this call.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_sync_customer_membership_payment_result(
    p_organization_id varchar,
    p_payment_intent_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_payment payment_intents%ROWTYPE;
    v_commerce commerce_transactions%ROWTYPE;
    v_evidence commerce_provider_payment_attempts%ROWTYPE;
    v_actor_organization_user_id varchar(64);
    v_reference varchar(160);
    v_existing_evidence boolean;
BEGIN
    SELECT * INTO v_payment FROM payment_intents
     WHERE payment_intent_id = p_payment_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment intent does not belong to organization' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_commerce FROM commerce_transactions
     WHERE commerce_transaction_id = v_payment.commerce_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND
       OR v_commerce.source_channel IS DISTINCT FROM 'CUSTOMER_MEMBERSHIP'
       OR v_commerce.store_id IS NOT NULL
       OR v_commerce.integration_configuration_id IS NOT NULL
       OR v_commerce.customer_user_id IS DISTINCT FROM v_payment.customer_user_id
       OR v_payment.authorization_mode IS DISTINCT FROM 'CUSTOMER_SESSION'
       OR v_payment.created_by IS DISTINCT FROM v_payment.customer_user_id
       OR (p_actor_user_id IS NOT NULL
           AND p_actor_user_id IS DISTINCT FROM v_payment.customer_user_id) THEN
        RAISE EXCEPTION 'Customer payment Commerce correlation is inconsistent'
            USING ERRCODE = '23505';
    END IF;
    IF v_payment.status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') THEN
        RETURN true;
    END IF;
    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_commerce.total_minor
       OR v_payment.currency_code IS DISTINCT FROM v_commerce.currency_code THEN
        RAISE EXCEPTION 'Payment amount or currency does not match Commerce transaction'
            USING ERRCODE = '23505';
    END IF;
    SELECT ou.organization_user_id INTO v_actor_organization_user_id
      FROM organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = v_payment.customer_user_id
       AND NOT ou.is_deleted
     LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Customer organization membership not found' USING ERRCODE = '42501';
    END IF;
    v_reference := 'PAYMENT_INTENT:' || v_payment.payment_intent_id;
    SELECT * INTO v_evidence FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = v_commerce.commerce_transaction_id
       AND payment_channel = 'LEGACY_PAYMENT_INTENT'
       AND provider_reference_id = v_reference
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    v_existing_evidence := FOUND;
    IF v_existing_evidence THEN
        IF v_evidence.provider_status IS DISTINCT FROM v_payment.status
           OR v_evidence.amount_minor IS DISTINCT FROM v_commerce.total_minor
           OR v_evidence.currency_code IS DISTINCT FROM v_commerce.currency_code THEN
            RAISE EXCEPTION 'Conflicting payment result for Commerce transaction'
                USING ERRCODE = '23505';
        END IF;
    ELSE
        INSERT INTO commerce_provider_payment_attempts (
            commerce_provider_payment_attempt_id, commerce_transaction_id,
            provider_transaction_id, provider_status, amount_minor, currency_code,
            failure_code, failure_message, created_by, payment_channel,
            provider_reference_id
        ) VALUES (
            generate_runtime_id('CPA'), v_commerce.commerce_transaction_id,
            NULLIF(btrim(v_payment.provider_reference_id), ''), v_payment.status,
            v_commerce.total_minor, v_commerce.currency_code,
            CASE WHEN v_payment.status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_code END,
            CASE WHEN v_payment.status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_message END,
            v_actor_organization_user_id, 'LEGACY_PAYMENT_INTENT', v_reference
        );
    END IF;
    IF v_payment.status = 'SUCCEEDED' THEN
        IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN
            UPDATE commerce_transactions
               SET subscription_id = v_payment.finalized_subscription_id
             WHERE commerce_transaction_id = v_commerce.commerce_transaction_id
               AND subscription_id IS NULL
               AND v_payment.finalized_subscription_id IS NOT NULL;
            RETURN true;
        END IF;
        IF v_commerce.status NOT IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS') THEN
            RAISE EXCEPTION 'Commerce transaction cannot accept payment success'
                USING ERRCODE = '23505';
        END IF;
        UPDATE commerce_transactions
           SET status = 'PROVIDER_SUCCEEDED',
               provider_transaction_id = NULLIF(btrim(v_payment.provider_reference_id), ''),
               subscription_id = COALESCE(subscription_id, v_payment.finalized_subscription_id),
               failure_code = NULL, failure_message = NULL,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_commerce.commerce_transaction_id;
    ELSE
        IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN RETURN true; END IF;
        IF v_commerce.status NOT IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS') THEN
            RAISE EXCEPTION 'Commerce transaction cannot accept payment failure'
                USING ERRCODE = '23505';
        END IF;
        IF v_existing_evidence AND v_commerce.status = 'ORDER_CREATED' THEN RETURN true; END IF;
        UPDATE commerce_transactions
           SET status = 'ORDER_CREATED', provider_transaction_id = NULL,
               failure_code = COALESCE(NULLIF(btrim(v_payment.failure_code), ''), v_payment.status),
               failure_message = NULLIF(btrim(v_payment.failure_message), ''),
               updated_at = CURRENT_TIMESTAMP, updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_commerce.commerce_transaction_id;
    END IF;
    RETURN true;
END;
$function$;


-- Preserve Counter reconciliation and dispatch customer-owned checkouts separately.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_sync_membership_payment_result(

    p_organization_id varchar,

    p_payment_intent_id varchar,

    p_actor_user_id varchar

)

RETURNS boolean

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    v_payment payment_intents%ROWTYPE;

    v_commerce commerce_transactions%ROWTYPE;

    v_actor_organization_user_id varchar(64);

    v_attempt commerce_provider_payment_attempts%ROWTYPE;

    v_payment_status varchar(32);

    v_provider_reference varchar(160);

    v_evidence_reference varchar(160);

    v_sync_actor_user_id varchar(64);

    v_existing_evidence boolean := false;

BEGIN

    SELECT * INTO v_payment FROM payment_intents

     WHERE payment_intent_id=p_payment_intent_id AND organization_id=p_organization_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Payment intent does not belong to organization' USING ERRCODE='42501'; END IF;

    IF v_payment.commerce_transaction_id IS NULL THEN RETURN true; END IF;



    SELECT * INTO v_commerce FROM commerce_transactions

     WHERE commerce_transaction_id=v_payment.commerce_transaction_id AND NOT is_deleted FOR UPDATE;



    IF FOUND AND v_commerce.source_channel = 'CUSTOMER_MEMBERSHIP' THEN
        RETURN commerce_sync_customer_membership_payment_result(
            p_organization_id, p_payment_intent_id, p_actor_user_id
        );
    END IF;

    IF NOT FOUND OR v_commerce.organization_id IS DISTINCT FROM p_organization_id

       OR v_commerce.source_channel NOT IN ('COUNTER_MEMBERSHIP','COUNTER')

       OR v_commerce.customer_user_id IS DISTINCT FROM v_payment.customer_user_id

       OR v_commerce.store_id IS DISTINCT FROM v_payment.store_id THEN

        RAISE EXCEPTION 'Payment Commerce correlation is inconsistent' USING ERRCODE='23505';

    END IF;



    v_payment_status:=v_payment.status;

    IF v_payment_status NOT IN ('SUCCEEDED','FAILED','CANCELED') THEN RETURN true; END IF;

    IF round(v_payment.amount*100)::bigint IS DISTINCT FROM v_commerce.total_minor

       OR v_payment.currency_code IS DISTINCT FROM v_commerce.currency_code THEN

        RAISE EXCEPTION 'Payment amount or currency does not match Commerce transaction' USING ERRCODE='23505';

    END IF;



    v_sync_actor_user_id:=COALESCE(NULLIF(btrim(p_actor_user_id),''),v_payment.created_by);

    IF v_sync_actor_user_id IS NULL OR v_payment.store_id IS NULL OR v_payment.staff_id IS NULL

       OR NOT counter_can_operate(p_organization_id,v_payment.store_id,v_payment.staff_id,v_sync_actor_user_id) THEN

        RAISE EXCEPTION 'Counter payment operation is not permitted' USING ERRCODE='42501';

    END IF;



    SELECT ou.organization_user_id INTO v_actor_organization_user_id

      FROM organization_user ou

     WHERE ou.organization_id=p_organization_id AND ou.user_id=v_sync_actor_user_id AND NOT ou.is_deleted

     LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN RAISE EXCEPTION 'Organization membership not found' USING ERRCODE='42501'; END IF;



    v_provider_reference:=NULLIF(btrim(v_payment.provider_reference_id),'');

    v_evidence_reference:='PAYMENT_INTENT:' || v_payment.payment_intent_id;



    SELECT * INTO v_attempt FROM commerce_provider_payment_attempts

     WHERE commerce_transaction_id=v_commerce.commerce_transaction_id

       AND payment_channel='LEGACY_PAYMENT_INTENT'

       AND provider_reference_id=v_evidence_reference

     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    v_existing_evidence:=FOUND;



    IF v_existing_evidence THEN

        IF v_attempt.provider_status IS DISTINCT FROM v_payment_status

           OR v_attempt.amount_minor IS DISTINCT FROM v_commerce.total_minor

           OR v_attempt.currency_code IS DISTINCT FROM v_commerce.currency_code THEN

            RAISE EXCEPTION 'Conflicting payment result for Commerce transaction' USING ERRCODE='23505';

        END IF;

    ELSE

        INSERT INTO commerce_provider_payment_attempts(

            commerce_provider_payment_attempt_id,commerce_transaction_id,

            provider_transaction_id,provider_status,amount_minor,currency_code,

            failure_code,failure_message,created_by,payment_channel,provider_reference_id

        ) VALUES (

            generate_runtime_id('CPA'),v_commerce.commerce_transaction_id,

            v_provider_reference,v_payment_status,v_commerce.total_minor,v_commerce.currency_code,

            CASE WHEN v_payment_status='SUCCEEDED' THEN NULL ELSE v_payment.failure_code END,

            CASE WHEN v_payment_status='SUCCEEDED' THEN NULL ELSE v_payment.failure_message END,

            v_actor_organization_user_id,'LEGACY_PAYMENT_INTENT',v_evidence_reference

        );

    END IF;



    IF v_payment_status='SUCCEEDED' THEN

        IF v_commerce.status='PROVIDER_SUCCEEDED' THEN

            UPDATE commerce_transactions

               SET subscription_id=COALESCE(subscription_id,v_payment.finalized_subscription_id)

             WHERE commerce_transaction_id=v_commerce.commerce_transaction_id;

            RETURN true;

        END IF;

        IF v_commerce.status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') THEN

            RAISE EXCEPTION 'Commerce transaction cannot accept payment success' USING ERRCODE='23505';

        END IF;

        UPDATE commerce_transactions

           SET status='PROVIDER_SUCCEEDED',provider_transaction_id=v_provider_reference,

               subscription_id=COALESCE(subscription_id,v_payment.finalized_subscription_id),

               failure_code=NULL,failure_message=NULL,updated_at=CURRENT_TIMESTAMP,

               updated_by=v_actor_organization_user_id,version_no=version_no+1

         WHERE commerce_transaction_id=v_commerce.commerce_transaction_id;

    ELSE

        IF v_commerce.status='PROVIDER_SUCCEEDED' THEN RETURN true; END IF;

        IF v_commerce.status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') THEN

            RAISE EXCEPTION 'Commerce transaction cannot accept payment failure' USING ERRCODE='23505';

        END IF;

        IF v_existing_evidence AND v_commerce.status='ORDER_CREATED' THEN RETURN true; END IF;

        UPDATE commerce_transactions

           SET status='ORDER_CREATED',provider_transaction_id=NULL,

               failure_code=COALESCE(NULLIF(btrim(v_payment.failure_code),''),v_payment_status),

               failure_message=NULLIF(btrim(v_payment.failure_message),''),

               updated_at=CURRENT_TIMESTAMP,updated_by=v_actor_organization_user_id,

               version_no=version_no+1

         WHERE commerce_transaction_id=v_commerce.commerce_transaction_id;

    END IF;

    RETURN true;

END;

$function$;

REVOKE ALL ON FUNCTION "${schemaName}".customer_membership_purchase_offer_quote(varchar,varchar,varchar,varchar),
    "${schemaName}".commerce_prepare_customer_membership_order(varchar,varchar,varchar,varchar),
    "${schemaName}".payment_start_customer_commerce_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".commerce_sync_customer_membership_payment_result(varchar,varchar,varchar),
    "${schemaName}".commerce_sync_membership_payment_result(varchar,varchar,varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".customer_membership_purchase_offer_quote(varchar,varchar,varchar,varchar),
    "${schemaName}".payment_start_customer_commerce_membership_intent(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".commerce_sync_membership_payment_result(varchar,varchar,varchar)
TO "${appRole}";

-- A prospective authenticated customer has a global user_id but no
-- organization_user_id until a successful membership purchase.
-- Preserve the existing organization-user audit convention for Counter and
-- add global-user audit identity only to customer-owned Commerce records.
ALTER TABLE "${schemaName}".commerce_transactions
    ADD COLUMN customer_actor_user_id varchar(64)
        REFERENCES "${schemaName}"."user"(user_id),
    ALTER COLUMN created_by DROP NOT NULL,
    ALTER COLUMN updated_by DROP NOT NULL;

ALTER TABLE "${schemaName}".commerce_transactions
    ADD CONSTRAINT ck_customer_commerce_transaction_actor CHECK (
        (created_by IS NOT NULL AND updated_by IS NOT NULL)
        OR (source_channel = 'CUSTOMER_MEMBERSHIP'
            AND customer_actor_user_id IS NOT NULL)
    );

ALTER TABLE "${schemaName}".commerce_transaction_lines
    ADD COLUMN customer_actor_user_id varchar(64)
        REFERENCES "${schemaName}"."user"(user_id),
    ALTER COLUMN created_by DROP NOT NULL,
    ALTER COLUMN updated_by DROP NOT NULL;

ALTER TABLE "${schemaName}".commerce_transaction_lines
    ADD CONSTRAINT ck_customer_commerce_line_actor CHECK (
        (created_by IS NOT NULL AND updated_by IS NOT NULL)
        OR (line_type = 'MEMBERSHIP' AND customer_actor_user_id IS NOT NULL)
    );

ALTER TABLE "${schemaName}".commerce_provider_payment_attempts
    ADD COLUMN customer_actor_user_id varchar(64)
        REFERENCES "${schemaName}"."user"(user_id),
    ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE "${schemaName}".commerce_provider_payment_attempts
    ADD CONSTRAINT ck_customer_commerce_payment_actor CHECK (
        created_by IS NOT NULL OR customer_actor_user_id IS NOT NULL
    );

CREATE OR REPLACE FUNCTION "${schemaName}".customer_is_active_global_user(
    p_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM "user" u
        JOIN entity_status es ON es.entity_status_id = u.user_status_id
        JOIN statuses s ON s.status_id = es.status_id
        WHERE u.user_id = p_user_id AND NOT u.is_deleted
          AND es.is_active AND s.status_code = 'ACTIVE'
    );
$function$;

-- Match the existing authenticated purchase helper's relationship rules:
-- an active CUSTOMER relationship or no relationship can purchase; an
-- inactive/deleted or non-customer relationship cannot be bypassed.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_can_start_membership_purchase(
    p_organization_id varchar,
    p_customer_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT customer_is_active_global_user(p_customer_user_id)
       AND EXISTS (
           SELECT 1 FROM organization o
           JOIN entity_status es ON es.entity_status_id = o.organization_status_id
           JOIN statuses s ON s.status_id = es.status_id
           WHERE o.organization_id = p_organization_id
             AND NOT o.is_deleted AND es.is_active AND s.status_code = 'ACTIVE'
       )
       AND (
           customer_has_active_relationship(p_organization_id, p_customer_user_id)
           OR NOT EXISTS (
               SELECT 1 FROM organization_user ou
               WHERE ou.organization_id = p_organization_id
                 AND ou.user_id = p_customer_user_id
           )
       );
$function$;


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

    -- Membership history, not an organization relationship, determines
    -- NEW_CUSTOMER / EXISTING_CUSTOMER. Match migration 133 global identity.
    IF p_customer_user_id IS NOT NULL
       AND NOT customer_is_active_global_user(p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer account is unavailable'
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

REVOKE ALL ON FUNCTION "${schemaName}".customer_is_active_global_user(varchar),
    "${schemaName}".customer_can_start_membership_purchase(varchar,varchar)
FROM PUBLIC;

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
    IF NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
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
    IF NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id || ':' || p_idempotency_key));

    SELECT ou.organization_user_id INTO v_organization_user_id
      FROM organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = p_customer_user_id
       AND NOT ou.is_deleted
     LIMIT 1;
    -- A prospect has no organization_user yet; the global user is recorded
    -- separately in the customer-only audit column.

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
        provider_order_id, idempotency_key, created_by, updated_by,
        customer_actor_user_id
    ) VALUES (
        generate_runtime_id('CTX'), p_organization_id, NULL, p_customer_user_id,
        NULL, 'CUSTOMER_MEMBERSHIP', 'DRAFT', v_quote."currencyCode",
        v_subtotal_minor, 0, v_tax_minor, v_total_minor,
        NULL, p_idempotency_key, v_organization_user_id, v_organization_user_id,
        p_customer_user_id
    ) RETURNING * INTO v_transaction;

    INSERT INTO commerce_transaction_lines (
        commerce_transaction_line_id, commerce_transaction_id, line_type,
        subscription_plan_id, description, quantity,
        unit_price_minor_authoritative, line_subtotal_minor, currency_code,
        price_source, created_by, updated_by, customer_actor_user_id
    ) VALUES (
        generate_runtime_id('CTL'), v_transaction.commerce_transaction_id, 'MEMBERSHIP',
        p_subscription_plan_id, v_description, 1,
        v_subtotal_minor, v_subtotal_minor, v_quote."currencyCode",
        'MEMGINE_MEMBERSHIP', v_organization_user_id, v_organization_user_id,
        p_customer_user_id
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
    IF NOT customer_can_start_membership_purchase(p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is unavailable' USING ERRCODE = '42501';
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
    -- Failed/cancelled payments may precede the first organization relationship.
    -- The global user remains the audit actor in that case.
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
            provider_reference_id, customer_actor_user_id
        ) VALUES (
            generate_runtime_id('CPA'), v_commerce.commerce_transaction_id,
            NULLIF(btrim(v_payment.provider_reference_id), ''), v_payment.status,
            v_commerce.total_minor, v_commerce.currency_code,
            CASE WHEN v_payment.status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_code END,
            CASE WHEN v_payment.status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_message END,
            v_actor_organization_user_id, 'LEGACY_PAYMENT_INTENT', v_reference,
            v_payment.customer_user_id
        );
    END IF;
    IF v_payment.status = 'SUCCEEDED' THEN
        IF v_commerce.status = 'COMPLETED' THEN
            IF v_commerce.subscription_id IS DISTINCT FROM
               v_payment.finalized_subscription_id THEN
                RAISE EXCEPTION 'Completed customer checkout subscription conflicts with payment'
                    USING ERRCODE = '23505';
            END IF;
            RETURN true;
        END IF;
        IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN
            UPDATE commerce_transactions
               SET subscription_id = v_payment.finalized_subscription_id,
                   status = 'COMPLETED',
                   completed_at = CURRENT_TIMESTAMP,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = v_actor_organization_user_id,
                   version_no = version_no + 1
             WHERE commerce_transaction_id = v_commerce.commerce_transaction_id
               AND v_payment.finalized_subscription_id IS NOT NULL;
            RETURN true;
        END IF;
        IF v_commerce.status NOT IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS') THEN
            RAISE EXCEPTION 'Commerce transaction cannot accept payment success'
                USING ERRCODE = '23505';
        END IF;
        UPDATE commerce_transactions
           SET status = CASE WHEN v_payment.finalized_subscription_id IS NULL
                             THEN 'PROVIDER_SUCCEEDED' ELSE 'COMPLETED' END,
               provider_transaction_id = NULLIF(btrim(v_payment.provider_reference_id), ''),
               subscription_id = COALESCE(subscription_id, v_payment.finalized_subscription_id),
               completed_at = CASE WHEN v_payment.finalized_subscription_id IS NOT NULL
                                   THEN CURRENT_TIMESTAMP ELSE completed_at END,
               failure_code = NULL, failure_message = NULL,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_commerce.commerce_transaction_id;
    ELSE
        IF v_commerce.status IN ('PROVIDER_SUCCEEDED', 'COMPLETED') THEN RETURN true; END IF;
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

CREATE OR REPLACE FUNCTION "${schemaName}".payment_finalize_membership(
    p_intent_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    i "${schemaName}".payment_intents%ROWTYPE; c "${schemaName}".business_otp_context%ROWTYPE; v_result record;
BEGIN
    SELECT * INTO i FROM "${schemaName}".payment_intents WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF NOT FOUND OR (i.created_by IS DISTINCT FROM p_actor_user_id AND i.customer_user_id IS DISTINCT FROM p_actor_user_id) THEN RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501'; END IF;
    IF i.status <> 'SUCCEEDED' THEN RAISE EXCEPTION 'Payment has not succeeded' USING ERRCODE = '22023'; END IF;
    IF i.finalized_subscription_id IS NOT NULL THEN
        RETURN QUERY SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number, s.subscription_plan_id, s.subscription_date::text, s.start_date::text, s.end_date::text, s.subscription_status_id, s.total_amount::double precision, cur.currency_code FROM "${schemaName}".subscriptions s JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id WHERE s.subscription_id = i.finalized_subscription_id;
        RETURN;
    END IF;
    IF i.authorization_mode = 'CUSTOMER_SESSION' THEN
        SELECT * INTO v_result FROM "${schemaName}".customer_purchase_subscription_authenticated(
            i.organization_id, i.membership_plan_id, i.customer_user_id);
    ELSE
        SELECT * INTO c FROM "${schemaName}".business_otp_context WHERE otp_challenge_id = i.business_otp_challenge_id FOR UPDATE;
        IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.organization_id <> i.organization_id OR c.plan_id <> i.membership_plan_id THEN RAISE EXCEPTION 'Verified membership purchase authorization is unavailable' USING ERRCODE = '22023'; END IF;
        IF c.purpose = 'COUNTER_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM "${schemaName}".counter_purchase_subscription(i.organization_id, c.store_id, c.staff_id, c.plan_id, c.user_id, NULL, NULL, NULL, NULL, p_actor_user_id);
        ELSIF c.purpose = 'APP_MEMBERSHIP_PURCHASE_VERIFY' THEN
            SELECT * INTO v_result FROM "${schemaName}".purchase_membership_subscription(i.organization_id, c.plan_id, c.user_id, c.payload->>'firstName', c.payload->>'lastName', c.payload->>'primaryEmail', c.payload->>'primaryPhone', p_actor_user_id);
        ELSE RAISE EXCEPTION 'Payment does not authorize a membership purchase' USING ERRCODE = '22023'; END IF;
    END IF;
    IF v_result."subscriptionId" IS NULL THEN RAISE EXCEPTION 'Membership purchase was not created' USING ERRCODE = 'P0002'; END IF;
    UPDATE "${schemaName}".subscriptions
       SET subtotal_amount = i.subtotal_amount, tax_rate = i.tax_rate, tax_amount = i.tax_amount,
           tax_code = i.tax_code, tax_name = i.tax_name, total_amount = i.amount,
           updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE subscription_id = v_result."subscriptionId";
    UPDATE "${schemaName}".payment_intents SET finalized_subscription_id = v_result."subscriptionId", updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id WHERE payment_intent_id = p_intent_id;
    UPDATE "${schemaName}".business_otp_context SET consumed_at = CURRENT_TIMESTAMP WHERE otp_challenge_id = i.business_otp_challenge_id;
    RETURN QUERY SELECT s.subscription_id, s.organization_user_id, ou.user_id, s.subscription_number, s.subscription_plan_id, s.subscription_date::text, s.start_date::text, s.end_date::text, s.subscription_status_id, s.total_amount::double precision, cur.currency_code FROM "${schemaName}".subscriptions s JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id JOIN "${schemaName}".currencies cur ON cur.currency_id = sp.currency_id WHERE s.subscription_id = v_result."subscriptionId";
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".customer_purchase_subscription_authenticated(
    p_organization_id varchar,
    p_plan_id varchar,
    p_customer_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar,
    "subscriptionDate" text, "startDate" text, "endDate" text,
    "subscriptionStatusId" varchar, "totalAmount" double precision,
    "currencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_organization_user_id varchar;
    v_customer_type_id varchar;
    v_active_relationship_status_id varchar;
    v_primary_phone varchar;
BEGIN
    IF NULLIF(trim(p_organization_id), '') IS NULL
       OR NULLIF(trim(p_plan_id), '') IS NULL
       OR NULLIF(trim(p_customer_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase is unavailable'
            USING ERRCODE = '22023';
    END IF;

    IF NOT customer_is_active_global_user(p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer account is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT NULLIF(btrim(u.primary_phone), '')
      INTO v_primary_phone
      FROM "${schemaName}"."user" u
     WHERE u.user_id = p_customer_user_id
       AND NOT u.is_deleted;

    /*
     * Coordinate with the phone-based identity linking path when a phone
     * exists. An authenticated global user without one is serialized by
     * immutable user_id; no new user identity is created.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            COALESCE(v_primary_phone, 'CUSTOMER_USER:' || p_customer_user_id), 0
        )
    );

    IF NOT EXISTS (
        SELECT 1
          FROM "${schemaName}".organization o
          JOIN "${schemaName}".entity_status es
            ON es.entity_status_id = o.organization_status_id
          JOIN "${schemaName}".statuses s
            ON s.status_id = es.status_id
         WHERE o.organization_id = p_organization_id
           AND NOT o.is_deleted
           AND s.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Organization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id
      INTO STRICT v_customer_type_id
      FROM "${schemaName}".organization_user_types
     WHERE organization_user_type_code = 'CUSTOMER'
       AND is_active = TRUE;

    SELECT es.entity_status_id
      INTO STRICT v_active_relationship_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses s
        ON s.status_id = es.status_id
     WHERE et.entity_type_code = 'ORGANIZATION_USER'
       AND s.status_code = 'ACTIVE'
       AND es.is_active = TRUE;

    /*
     * Prefer an existing active relationship.
     */
    SELECT ou.organization_user_id
      INTO v_organization_user_id
      FROM "${schemaName}".organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = p_customer_user_id
       AND ou.organization_user_type_id = v_customer_type_id
       AND NOT ou.is_deleted
       AND ou.organization_user_status_id = v_active_relationship_status_id
     ORDER BY ou.organization_user_id
     LIMIT 1
     FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        /*
         * A previous inactive/deleted relationship must not be
         * silently reactivated by a purchase.
         */
        IF EXISTS (
            SELECT 1
              FROM "${schemaName}".organization_user ou
             WHERE ou.organization_id = p_organization_id
               AND ou.user_id = p_customer_user_id
               AND ou.organization_user_type_id = v_customer_type_id
        ) THEN
            RAISE EXCEPTION 'Customer relationship is unavailable'
                USING ERRCODE = '42501';
        END IF;

        v_organization_user_id := gen_random_uuid()::text;

        INSERT INTO "${schemaName}".organization_user (
            organization_user_id,
            organization_id,
            user_id,
            organization_user_type_id,
            organization_user_status_id,
            joining_date,
            created_by,
            updated_by
        ) VALUES (
            v_organization_user_id,
            p_organization_id,
            p_customer_user_id,
            v_customer_type_id,
            v_active_relationship_status_id,
            CURRENT_DATE,
            p_customer_user_id,
            p_customer_user_id
        );
    END IF;

    RETURN QUERY
    SELECT *
      FROM "${schemaName}".purchase_membership_subscription(
          p_organization_id,
          p_plan_id,
          p_customer_user_id,
          NULL,
          NULL,
          NULL,
          NULL,
          p_customer_user_id
      );
END;
$function$;

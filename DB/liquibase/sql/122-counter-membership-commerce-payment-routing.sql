-- Phase 4B-1: Counter membership purchases enter Commerce before payment.

-- The normal Counter Pay action resolves the configured COUNTER route at the

-- store/org level (TEST or POYNT). Cash remains the explicit Counter cash path.



INSERT INTO "${schemaName}".payment_provider_configs (

    payment_provider_config_id, organization_id, provider_code,

    configuration_reference, display_name, is_enabled, is_test_mode,

    created_by, updated_by

)

SELECT

    'payment-provider-poynt', NULL, 'POYNT', 'commerce-counter-route',

    'Poynt Commerce terminal payment', true, false, 'system', 'system'

WHERE NOT EXISTS (

    SELECT 1 FROM "${schemaName}".payment_provider_configs

     WHERE organization_id IS NULL AND provider_code = 'POYNT'

);



UPDATE "${schemaName}".payment_provider_configs

   SET is_enabled = true,

       updated_at = CURRENT_TIMESTAMP,

       updated_by = 'system'

 WHERE organization_id IS NULL AND provider_code = 'POYNT';



-- Counter-scoped Commerce actor. Generic Commerce administration remains

-- admin-protected; this helper only opens the transaction already correlated

-- to the staff member's verified Counter purchase.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_actor_organization_user(

    p_transaction_id varchar,

    p_actor_user_id varchar

)

RETURNS varchar

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    t commerce_transactions%ROWTYPE;

    p payment_intents%ROWTYPE;

    v_organization_user_id varchar(64);

BEGIN

    SELECT * INTO t

      FROM commerce_transactions

     WHERE commerce_transaction_id = p_transaction_id

       AND source_channel = 'COUNTER'

       AND NOT is_deleted;



    IF NOT FOUND THEN

        RAISE EXCEPTION 'Counter Commerce transaction is unavailable'

            USING ERRCODE = '42501';

    END IF;



    SELECT * INTO p

      FROM payment_intents

     WHERE commerce_transaction_id = t.commerce_transaction_id

       AND organization_id = t.organization_id

     ORDER BY created_at DESC

     LIMIT 1;



    IF NOT FOUND

       OR p.store_id IS NULL

       OR p.staff_id IS NULL

       OR p.store_id IS DISTINCT FROM t.store_id

       OR NOT counter_can_operate(t.organization_id, p.store_id, p.staff_id, p_actor_user_id) THEN

        RAISE EXCEPTION 'Counter Commerce operation is not permitted'

            USING ERRCODE = '42501';

    END IF;



    SELECT organization_user_id

      INTO v_organization_user_id

      FROM organization_user

     WHERE organization_id = t.organization_id

       AND user_id = p_actor_user_id

       AND NOT is_deleted

     ORDER BY organization_user_id

     LIMIT 1;



    IF v_organization_user_id IS NULL THEN

        RAISE EXCEPTION 'Organization membership not found'

            USING ERRCODE = '42501';

    END IF;



    RETURN v_organization_user_id;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_counter_membership_order(

    p_organization_id varchar,

    p_store_id varchar,

    p_staff_id varchar,

    p_customer_user_id varchar,

    p_subscription_plan_id varchar,

    p_provider_code varchar,

    p_integration_configuration_id varchar,

    p_idempotency_key varchar,

    p_actor_user_id varchar

)

RETURNS TABLE (

    "commerceTransactionId" varchar,

    "providerOrderId" varchar,

    "amountMinor" bigint,

    "currencyCode" varchar,

    "status" varchar

)

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    v_transaction commerce_transactions%ROWTYPE;

    v_actor_organization_user_id varchar(64);

    v_order_id varchar(160);

    v_subtotal numeric(12,2);

    v_tax numeric(12,2);

    v_total numeric(12,2);

    v_currency varchar(3);

    v_description varchar(500);

    v_subtotal_minor bigint;

    v_tax_minor bigint;

    v_total_minor bigint;

    v_provider varchar(64);

    v_line_count integer;

BEGIN

    v_provider := upper(btrim(p_provider_code));



    IF NULLIF(btrim(p_organization_id), '') IS NULL

       OR NULLIF(btrim(p_store_id), '') IS NULL

       OR NULLIF(btrim(p_staff_id), '') IS NULL

       OR NULLIF(btrim(p_customer_user_id), '') IS NULL

       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL

       OR v_provider NOT IN ('TEST', 'POYNT')

       OR NULLIF(btrim(p_actor_user_id), '') IS NULL

       OR NULLIF(btrim(p_idempotency_key), '') IS NULL

       OR length(p_idempotency_key) > 128 THEN

        RAISE EXCEPTION 'Invalid Counter membership Commerce request'

            USING ERRCODE = '22023';

    END IF;



    IF (v_provider = 'TEST' AND p_integration_configuration_id IS NOT NULL)

       OR (v_provider = 'POYNT' AND NULLIF(btrim(p_integration_configuration_id), '') IS NULL) THEN

        RAISE EXCEPTION 'Counter payment provider configuration is inconsistent'

            USING ERRCODE = '22023';

    END IF;



    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN

        RAISE EXCEPTION 'Counter operation is not permitted'

            USING ERRCODE = '42501';

    END IF;



    SELECT ou.organization_user_id

      INTO v_actor_organization_user_id

      FROM organization_user ou

     WHERE ou.organization_id = p_organization_id

       AND ou.user_id = p_actor_user_id

       AND NOT ou.is_deleted

     ORDER BY ou.organization_user_id

     LIMIT 1;



    IF v_actor_organization_user_id IS NULL THEN

        RAISE EXCEPTION 'Counter actor organization membership not found'

            USING ERRCODE = '42501';

    END IF;



    IF NOT EXISTS (

        SELECT 1

          FROM organization_user ou

          JOIN organization_user_types ot

            ON ot.organization_user_type_id = ou.organization_user_type_id

         WHERE ou.organization_id = p_organization_id

           AND ou.user_id = p_customer_user_id

           AND ot.organization_user_type_code = 'CUSTOMER'

           AND NOT ou.is_deleted

    ) THEN

        RAISE EXCEPTION 'Customer is not in organization'

            USING ERRCODE = '23503';

    END IF;



    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id || ':' || p_idempotency_key));



    SELECT * INTO v_transaction

      FROM commerce_transactions

     WHERE organization_id = p_organization_id

       AND idempotency_key = p_idempotency_key

       AND NOT is_deleted

     FOR UPDATE;



    IF FOUND THEN

        SELECT count(*) INTO v_line_count

          FROM commerce_transaction_lines

         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id

           AND NOT is_deleted;



        IF v_transaction.source_channel IS DISTINCT FROM 'COUNTER'

           OR v_transaction.store_id IS DISTINCT FROM p_store_id

           OR v_transaction.customer_user_id IS DISTINCT FROM p_customer_user_id

           OR v_transaction.integration_configuration_id IS DISTINCT FROM p_integration_configuration_id

           OR v_line_count <> 1

           OR EXISTS (

               SELECT 1 FROM commerce_transaction_lines l

                WHERE l.commerce_transaction_id = v_transaction.commerce_transaction_id

                  AND NOT l.is_deleted

                  AND (l.line_type <> 'MEMBERSHIP'

                       OR l.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id

                       OR l.quantity <> 1)

           ) THEN

            RAISE EXCEPTION 'Existing Commerce transaction conflicts with Counter purchase'

                USING ERRCODE = '23505';

        END IF;



        RETURN QUERY SELECT

            v_transaction.commerce_transaction_id,

            v_transaction.provider_order_id,

            v_transaction.total_minor,

            v_transaction.currency_code,

            v_transaction.status;

        RETURN;

    END IF;



    SELECT q."subtotalAmount", q."taxAmount", q."totalAmount", q."currencyCode"

      INTO v_subtotal, v_tax, v_total, v_currency

      FROM membership_purchase_quote(p_organization_id, p_subscription_plan_id) AS q;



    IF v_subtotal IS NULL OR v_tax IS NULL OR v_total IS NULL

       OR v_subtotal < 0 OR v_tax < 0 OR v_total < 0

       OR v_total <> v_subtotal + v_tax

       OR v_currency !~ '^[A-Z]{3}$' THEN

        RAISE EXCEPTION 'Invalid membership purchase quote'

            USING ERRCODE = '22023';

    END IF;



    SELECT COALESCE(mp.membership_product_name, 'Membership') || ' - ' ||

           COALESCE(sp.subscription_plan_name, 'Plan')

      INTO v_description

      FROM subscription_plans sp

      JOIN membership_products mp

        ON mp.membership_product_id = sp.membership_product_id

     WHERE sp.subscription_plan_id = p_subscription_plan_id

       AND mp.organization_id = p_organization_id

       AND NOT sp.is_deleted

       AND NOT mp.is_deleted;



    IF v_description IS NULL THEN

        RAISE EXCEPTION 'Membership plan is unavailable'

            USING ERRCODE = '23503';

    END IF;



    v_subtotal_minor := round(v_subtotal * 100)::bigint;

    v_tax_minor := round(v_tax * 100)::bigint;

    v_total_minor := round(v_total * 100)::bigint;



    INSERT INTO commerce_transactions (

        commerce_transaction_id, organization_id, store_id, customer_user_id,

        integration_configuration_id, source_channel, status, currency_code,

        subtotal_minor, adjustment_total_minor, tax_total_minor, total_minor,

        provider_order_id, idempotency_key, created_by, updated_by

    ) VALUES (

        generate_runtime_id('CTX'), p_organization_id, p_store_id, p_customer_user_id,

        p_integration_configuration_id, 'COUNTER', 'DRAFT', v_currency,

        v_subtotal_minor, 0, v_tax_minor, v_total_minor,

        NULL, p_idempotency_key, v_actor_organization_user_id, v_actor_organization_user_id

    ) RETURNING * INTO v_transaction;



    INSERT INTO commerce_transaction_lines (

        commerce_transaction_line_id, commerce_transaction_id, line_type,

        subscription_plan_id, description, quantity,

        unit_price_minor_authoritative, line_subtotal_minor,

        currency_code, price_source, created_by, updated_by

    ) VALUES (

        generate_runtime_id('CTL'), v_transaction.commerce_transaction_id, 'MEMBERSHIP',

        p_subscription_plan_id, v_description, 1,

        v_subtotal_minor, v_subtotal_minor,

        v_currency, 'MEMGINE_MEMBERSHIP', v_actor_organization_user_id, v_actor_organization_user_id

    );



    IF v_provider = 'POYNT' THEN

        UPDATE commerce_transactions

           SET status = 'READY_FOR_PROVIDER',

               updated_at = CURRENT_TIMESTAMP,

               updated_by = v_actor_organization_user_id,

               version_no = version_no + 1

         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;

    ELSE

        v_order_id := 'MEMBERSHIP-' || v_transaction.commerce_transaction_id;

        UPDATE commerce_transactions

           SET status = 'ORDER_CREATED',

               provider_order_id = v_order_id,

               updated_at = CURRENT_TIMESTAMP,

               updated_by = v_actor_organization_user_id,

               version_no = version_no + 1

         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;

    END IF;



    RETURN QUERY SELECT

        v_transaction.commerce_transaction_id,

        CASE WHEN v_provider = 'TEST' THEN v_order_id ELSE NULL::varchar END,

        v_total_minor,

        v_currency,

        CASE WHEN v_provider = 'TEST' THEN 'ORDER_CREATED'::varchar ELSE 'READY_FOR_PROVIDER'::varchar END;

END;

$function$;



-- Same signature as migration 115. For normal Counter Pay, p_provider_code is

-- deliberately ignored in favor of the configured COUNTER route. CASH remains

-- explicit and keeps the already-working legacy/internal Commerce bridge.

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

    v_purchase counter_purchases%ROWTYPE;

    v_commerce record;

    v_payment payment_intents%ROWTYPE;

    v_started record;

    v_provider_code varchar(64);

    v_integration_id varchar(64);

    v_commerce_idempotency_key varchar(128);

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



    IF v_commerce."commerceTransactionId" IS NULL

       OR v_commerce."amountMinor" IS NULL

       OR NULLIF(btrim(v_commerce."currencyCode"), '') IS NULL THEN

        RAISE EXCEPTION 'Counter membership Commerce transaction is not prepared'

            USING ERRCODE = '23505';

    END IF;



    SELECT * INTO v_payment

      FROM payment_intents

     WHERE organization_id = p_organization_id

       AND idempotency_key = p_payment_idempotency_key

     FOR UPDATE;



    IF NOT FOUND THEN

        SELECT * INTO v_started

          FROM payment_start_membership_intent(

              p_intent_id, p_attempt_id, p_organization_id, p_challenge_id,

              v_provider_code, p_payment_idempotency_key, p_actor_user_id

          );



        SELECT * INTO v_payment

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

        RAISE EXCEPTION 'Existing payment conflicts with Counter membership purchase'

            USING ERRCODE = '23505';

    END IF;



    IF EXISTS (

        SELECT 1 FROM payment_provider_configs pc

         WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id

           AND pc.provider_code IS DISTINCT FROM v_provider_code

    ) THEN

        RAISE EXCEPTION 'Existing payment provider conflicts with configured Counter route'

            USING ERRCODE = '23505';

    END IF;



    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_commerce."amountMinor"

       OR v_payment.currency_code IS DISTINCT FROM v_commerce."currencyCode" THEN

        RAISE EXCEPTION 'Payment amount or currency does not match Commerce transaction'

            USING ERRCODE = '23505';

    END IF;



    IF v_payment.commerce_transaction_id IS NOT NULL

       AND v_payment.commerce_transaction_id IS DISTINCT FROM v_commerce."commerceTransactionId" THEN

        RAISE EXCEPTION 'Payment is already associated with another Commerce transaction'

            USING ERRCODE = '23505';

    END IF;



    UPDATE payment_intents

       SET commerce_transaction_id = v_commerce."commerceTransactionId",

           updated_at = CURRENT_TIMESTAMP,

           updated_by = p_actor_user_id

     WHERE payment_intent_id = v_payment.payment_intent_id;



    RETURN QUERY

    SELECT v_payment.payment_intent_id, v_provider_code, v_payment.status,

           v_payment.amount::double precision, v_payment.currency_code,

           v_payment.provider_reference_id, v_payment.membership_plan_id,

           v_payment.customer_user_id, v_payment.created_at::text,

           v_commerce."commerceTransactionId"::varchar;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_membership_transaction(

    p_organization_id varchar,

    p_transaction_id varchar,

    p_actor_user_id varchar

)

RETURNS TABLE(

    "transactionId" varchar, "organizationId" varchar, "storeId" varchar,

    "customerUserId" varchar, "integrationConfigurationId" varchar,

    "sourceChannel" varchar, status varchar, "currencyCode" varchar,

    "subtotalMinor" bigint, "adjustmentTotalMinor" bigint,

    "taxTotalMinor" bigint, "totalMinor" bigint, "providerOrderId" varchar,

    "idempotencyKey" varchar

)

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

BEGIN

    PERFORM commerce_counter_actor_organization_user(p_transaction_id, p_actor_user_id);

    RETURN QUERY

    SELECT t.commerce_transaction_id, t.organization_id, t.store_id,

           t.customer_user_id, t.integration_configuration_id,

           t.source_channel, t.status, t.currency_code, t.subtotal_minor,

           t.adjustment_total_minor, t.tax_total_minor, t.total_minor,

           t.provider_order_id, t.idempotency_key

      FROM commerce_transactions t

     WHERE t.commerce_transaction_id = p_transaction_id

       AND t.organization_id = p_organization_id

       AND t.source_channel = 'COUNTER'

       AND NOT t.is_deleted;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_membership_lines(

    p_transaction_id varchar,

    p_actor_user_id varchar

)

RETURNS TABLE(

    "lineId" varchar, "transactionId" varchar, "lineType" varchar,

    "subscriptionPlanId" varchar, description varchar, quantity integer,

    "unitPriceMinorAuthoritative" bigint, "lineSubtotalMinor" bigint,

    "currencyCode" varchar, "priceSource" varchar

)

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

BEGIN

    PERFORM commerce_counter_actor_organization_user(p_transaction_id, p_actor_user_id);

    RETURN QUERY

    SELECT l.commerce_transaction_line_id, l.commerce_transaction_id,

           l.line_type, l.subscription_plan_id, l.description, l.quantity,

           l.unit_price_minor_authoritative, l.line_subtotal_minor,

           l.currency_code, l.price_source

      FROM commerce_transaction_lines l

     WHERE l.commerce_transaction_id = p_transaction_id

       AND NOT l.is_deleted

     ORDER BY l.created_at, l.commerce_transaction_line_id;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_payment_provider(

    p_transaction_id varchar,

    p_actor_user_id varchar

)

RETURNS TABLE("providerCode" varchar, "integrationConfigurationId" varchar)

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

BEGIN

    PERFORM commerce_counter_actor_organization_user(p_transaction_id, p_actor_user_id);

    RETURN QUERY

    SELECT pc.provider_code, t.integration_configuration_id

      FROM commerce_transactions t

      JOIN payment_intents p ON p.commerce_transaction_id = t.commerce_transaction_id

      JOIN payment_provider_configs pc

        ON pc.payment_provider_config_id = p.payment_provider_config_id

     WHERE t.commerce_transaction_id = p_transaction_id

       AND t.source_channel = 'COUNTER'

       AND NOT t.is_deleted

     ORDER BY p.created_at DESC

     LIMIT 1;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(

    p_transaction_id varchar,

    p_actor_user_id varchar

)

RETURNS TABLE(

    "integrationConfigurationId" varchar, "organizationId" varchar,

    "applicationId" varchar, "businessId" varchar, "providerStoreId" varchar,

    "secretReference" varchar, "merchantCurrencyCode" varchar,

    "storeId" varchar, "lastFullSyncAt" text, "lastIncrementalSyncAt" text

)

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

BEGIN

    PERFORM commerce_counter_actor_organization_user(p_transaction_id, p_actor_user_id);

    RETURN QUERY

    SELECT c.integration_configuration_id, c.organization_id, c.application_id,

           c.provider_business_id, c.provider_store_id,

           c.credential_secret_reference, c.merchant_currency_code,

           s.store_id, s.last_full_sync_at::text, s.last_incremental_sync_at::text

      FROM commerce_transactions t

      JOIN commerce_provider_catalog_configurations c

        ON c.integration_configuration_id = t.integration_configuration_id

       AND c.organization_id = t.organization_id

       AND NOT c.is_deleted

      JOIN integration_configurations i

        ON i.integration_configuration_id = c.integration_configuration_id

       AND i.organization_id = c.organization_id

       AND upper(i.provider) = 'POYNT'

       AND NOT i.is_deleted

      LEFT JOIN commerce_catalog_sync_states s

        ON s.integration_configuration_id = c.integration_configuration_id

       AND (s.store_id = t.store_id OR s.store_id IS NULL)

     WHERE t.commerce_transaction_id = p_transaction_id

       AND t.source_channel = 'COUNTER'

       AND NOT t.is_deleted

     ORDER BY CASE WHEN s.store_id = t.store_id THEN 0 ELSE 1 END

     LIMIT 1;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_persist_counter_membership_provider_order(

    p_transaction_id varchar,

    p_provider_order_id varchar,

    p_subtotal_minor bigint,

    p_tax_total_minor bigint,

    p_total_minor bigint,

    p_currency_code varchar,

    p_actor_user_id varchar

)

RETURNS boolean

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    t commerce_transactions%ROWTYPE;

    v_actor varchar(64);

BEGIN

    SELECT * INTO t

      FROM commerce_transactions

     WHERE commerce_transaction_id = p_transaction_id

       AND source_channel = 'COUNTER'

       AND NOT is_deleted

     FOR UPDATE;



    IF NOT FOUND THEN

        RAISE EXCEPTION 'Counter Commerce transaction not found' USING ERRCODE = 'P0002';

    END IF;



    v_actor := commerce_counter_actor_organization_user(p_transaction_id, p_actor_user_id);



    IF t.status = 'ORDER_CREATED' AND t.provider_order_id = p_provider_order_id THEN

        RETURN true;

    END IF;



    IF t.status <> 'READY_FOR_PROVIDER'

       OR t.integration_configuration_id IS NULL

       OR NULLIF(btrim(p_provider_order_id), '') IS NULL

       OR p_subtotal_minor IS DISTINCT FROM t.subtotal_minor

       OR p_tax_total_minor IS DISTINCT FROM t.tax_total_minor

       OR p_total_minor IS DISTINCT FROM t.total_minor

       OR p_currency_code IS DISTINCT FROM t.currency_code THEN

        RAISE EXCEPTION 'Poynt membership order does not match Commerce transaction'

            USING ERRCODE = '23505';

    END IF;



    UPDATE commerce_transactions

       SET status = 'ORDER_CREATED',

           provider_order_id = p_provider_order_id,

           failure_code = NULL,

           failure_message = NULL,

           updated_at = CURRENT_TIMESTAMP,

           updated_by = v_actor,

           version_no = version_no + 1

     WHERE commerce_transaction_id = p_transaction_id;



    RETURN true;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_start_counter_terminal_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_payment_intent_id varchar(64);
    v_payment_attempt_id varchar(64);
BEGIN
    SELECT * INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter Commerce transaction not found'
            USING ERRCODE='P0002';
    END IF;

    v_actor := commerce_counter_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF t.status <> 'ORDER_CREATED'
       OR t.integration_configuration_id IS NULL
       OR NULLIF(btrim(t.provider_order_id), '') IS NULL
       OR t.total_minor IS NULL
       OR t.total_minor <= 0
       OR t.currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Counter Commerce transaction is not ready for terminal payment'
            USING ERRCODE='23505';
    END IF;

    SELECT p.payment_intent_id
      INTO v_payment_intent_id
      FROM payment_intents p
     WHERE p.commerce_transaction_id = t.commerce_transaction_id
       AND p.organization_id = t.organization_id
       AND p.finalized_subscription_id IS NULL
     ORDER BY p.created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'Correlated membership payment intent is unavailable'
            USING ERRCODE='23505';
    END IF;

    UPDATE payment_intents
       SET status = 'PROCESSING',
           failure_code = NULL,
           failure_message = NULL,
           cancelled_at = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment_intent_id
       AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'CANCELED');

    SELECT payment_attempt_id
      INTO v_payment_attempt_id
      FROM payment_attempts
     WHERE payment_intent_id = v_payment_intent_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_payment_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Correlated payment attempt is unavailable'
            USING ERRCODE='23505';
    END IF;

    UPDATE payment_attempts
       SET status = 'PROCESSING',
           failure_code = NULL,
           failure_message = NULL,
           processed_at = NULL
     WHERE payment_attempt_id = v_payment_attempt_id
       AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'CANCELED');

    UPDATE commerce_transactions
       SET status='PROVIDER_IN_PROGRESS',
           failure_code=NULL,
           failure_message=NULL,
           updated_at=CURRENT_TIMESTAMP,
           updated_by=v_actor,
           version_no=version_no+1
     WHERE commerce_transaction_id=p_transaction_id;

    RETURN true;
END;
$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_membership_payment(

    p_transaction_id varchar

)

RETURNS varchar

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    t commerce_transactions%ROWTYPE;

    p payment_intents%ROWTYPE;

    v_subscription record;

BEGIN

    SELECT * INTO t FROM commerce_transactions

     WHERE commerce_transaction_id=p_transaction_id

       AND source_channel='COUNTER' AND NOT is_deleted

     FOR UPDATE;

    IF NOT FOUND THEN RETURN NULL; END IF;



    SELECT * INTO p FROM payment_intents

     WHERE commerce_transaction_id=t.commerce_transaction_id

       AND organization_id=t.organization_id

     ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN RETURN NULL; END IF;



    IF p.finalized_subscription_id IS NOT NULL THEN

        UPDATE commerce_transactions

           SET subscription_id=COALESCE(subscription_id,p.finalized_subscription_id)

         WHERE commerce_transaction_id=t.commerce_transaction_id;

        RETURN p.finalized_subscription_id;

    END IF;



    IF t.status <> 'PROVIDER_SUCCEEDED' OR NULLIF(btrim(t.provider_transaction_id),'') IS NULL THEN

        RETURN NULL;

    END IF;



    IF round(p.amount * 100)::bigint IS DISTINCT FROM t.total_minor

       OR p.currency_code IS DISTINCT FROM t.currency_code THEN

        RAISE EXCEPTION 'Commerce payment amount or currency does not match membership payment'

            USING ERRCODE='23505';

    END IF;



    PERFORM payment_record_result(

        p.payment_intent_id, NULL, 'SUCCEEDED', t.provider_transaction_id,

        NULL, NULL, p.created_by

    );



    SELECT * INTO v_subscription

      FROM payment_finalize_membership(p.payment_intent_id, p.created_by);



    IF v_subscription."subscriptionId" IS NULL THEN

        RAISE EXCEPTION 'Membership finalization was unavailable' USING ERRCODE='23505';

    END IF;



    UPDATE commerce_transactions

       SET subscription_id=v_subscription."subscriptionId",

           updated_at=CURRENT_TIMESTAMP,

           version_no=version_no+1

     WHERE commerce_transaction_id=t.commerce_transaction_id;



    RETURN v_subscription."subscriptionId";

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_counter_terminal_payment_result(

    p_organization_id varchar,

    p_transaction_id varchar,

    p_provider_transaction_id varchar,

    p_provider_status varchar,

    p_amount_minor bigint,

    p_currency_code varchar,

    p_failure_code varchar,

    p_failure_message varchar,

    p_actor_user_id varchar

)

RETURNS boolean

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE

    t commerce_transactions%ROWTYPE;

    v_actor varchar(64);

    v_status varchar(32);

    p payment_intents%ROWTYPE;

    v_provider_transaction_id varchar(160);

BEGIN

    SELECT * INTO t FROM commerce_transactions

     WHERE commerce_transaction_id=p_transaction_id

       AND organization_id=p_organization_id

       AND source_channel='COUNTER' AND NOT is_deleted

     FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Counter Commerce transaction not found' USING ERRCODE='P0002'; END IF;



    v_actor := commerce_counter_actor_organization_user(p_transaction_id,p_actor_user_id);

    v_status := upper(btrim(p_provider_status));

    v_provider_transaction_id := NULLIF(btrim(p_provider_transaction_id),'');



    IF v_status NOT IN ('SUCCEEDED','FAILED','CANCELLED')

       OR p_amount_minor IS DISTINCT FROM t.total_minor

       OR p_currency_code IS DISTINCT FROM t.currency_code

       OR (v_status='SUCCEEDED' AND v_provider_transaction_id IS NULL)

       OR length(COALESCE(p_failure_code,''))>80

       OR length(COALESCE(p_failure_message,''))>500 THEN

        RAISE EXCEPTION 'Invalid terminal payment result' USING ERRCODE='22023';

    END IF;



    IF t.status='PROVIDER_SUCCEEDED' AND v_status='SUCCEEDED'

       AND t.provider_transaction_id IS NOT DISTINCT FROM v_provider_transaction_id THEN

        PERFORM commerce_finalize_counter_membership_payment(t.commerce_transaction_id);

        RETURN true;

    END IF;



    IF t.status <> 'PROVIDER_IN_PROGRESS' THEN

        RAISE EXCEPTION 'Commerce transaction is not awaiting terminal payment result' USING ERRCODE='23505';

    END IF;



    INSERT INTO commerce_provider_payment_attempts(

        commerce_provider_payment_attempt_id, commerce_transaction_id,

        provider_transaction_id, provider_status, amount_minor, currency_code,

        failure_code, failure_message, created_by, payment_channel,

        provider_reference_id

    ) VALUES (

        generate_runtime_id('CPA'), t.commerce_transaction_id,

        v_provider_transaction_id, v_status, p_amount_minor, p_currency_code,

        NULLIF(btrim(p_failure_code),''), NULLIF(btrim(p_failure_message),''),

        v_actor, 'TERMINAL', 'COMMERCE:' || t.commerce_transaction_id

    );



    IF v_status='SUCCEEDED' THEN

        UPDATE commerce_transactions
           SET status='PROVIDER_SUCCEEDED',
               provider_transaction_id=v_provider_transaction_id,
               failure_code=NULL,
               failure_message=NULL,
               updated_at=CURRENT_TIMESTAMP,
               updated_by=v_actor,
               version_no=version_no+1
         WHERE commerce_transaction_id=t.commerce_transaction_id;

        PERFORM commerce_finalize_counter_membership_payment(
            t.commerce_transaction_id
        );

    ELSE

        UPDATE commerce_transactions
           SET status='ORDER_CREATED',
               provider_transaction_id=NULL,
               failure_code=COALESCE(
                   NULLIF(btrim(p_failure_code),''),
                   v_status
               ),
               failure_message=NULLIF(
                   btrim(p_failure_message),''
               ),
               updated_at=CURRENT_TIMESTAMP,
               updated_by=v_actor,
               version_no=version_no+1
         WHERE commerce_transaction_id=t.commerce_transaction_id;

        SELECT *
          INTO p
          FROM payment_intents
         WHERE commerce_transaction_id=t.commerce_transaction_id
           AND organization_id=t.organization_id
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Correlated membership payment intent is unavailable'
                USING ERRCODE='23505';
        END IF;

        IF p.finalized_subscription_id IS NOT NULL
           OR p.status='SUCCEEDED' THEN
            RAISE EXCEPTION
                'Terminal failure conflicts with finalized membership payment'
                USING ERRCODE='23505';
        END IF;

        PERFORM payment_record_result(
            p.payment_intent_id,
            NULL,
            CASE
                WHEN v_status='CANCELLED' THEN 'CANCELED'
                ELSE 'FAILED'
            END,
            v_provider_transaction_id,
            COALESCE(
                NULLIF(btrim(p_failure_code),''),
                CASE
                    WHEN v_status='CANCELLED'
                        THEN 'TERMINAL_PAYMENT_CANCELED'
                    ELSE 'TERMINAL_PAYMENT_FAILED'
                END
            ),
            NULLIF(btrim(p_failure_message),''),
            p.created_by
        );

    END IF;



    RETURN true;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_counter_pos_device(

    p_organization_id varchar,

    p_store_id varchar,

    p_staff_id varchar,

    p_actor_user_id varchar

)

RETURNS varchar

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

DECLARE v_count integer; v_device_id varchar(64);

BEGIN

    IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN

        RAISE EXCEPTION 'Counter operation is not permitted' USING ERRCODE='42501';

    END IF;

    SELECT count(*), min(d.pos_device_id) INTO v_count,v_device_id

      FROM pos_devices d

      JOIN poynt_terminal_bindings b

        ON b.pos_device_id=d.pos_device_id

       AND b.organization_id=d.organization_id

       AND b.store_id=d.store_id

       AND NOT b.is_deleted

     WHERE d.organization_id=p_organization_id AND d.store_id=p_store_id

       AND NOT d.is_deleted AND d.revoked_at IS NULL;

    IF v_count=0 THEN RAISE EXCEPTION 'No active Poynt terminal is paired to this store' USING ERRCODE='22023'; END IF;

    IF v_count>1 THEN RAISE EXCEPTION 'Multiple active Poynt terminals are paired to this store' USING ERRCODE='22023'; END IF;

    RETURN v_device_id;

END;

$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_remote_terminal_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_pos_device_id varchar,
    p_reference_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "alreadyDispatched" boolean,
    "integrationConfigurationId" varchar,
    "providerOrderId" varchar,
    "amountMinor" bigint,
    "currencyCode" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "providerDeviceId" varchar,
    "providerReferenceId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    a commerce_provider_payment_attempts%ROWTYPE;
    v_payment_intent_id varchar(64);
    v_payment_attempt_id varchar(64);
BEGIN
    SELECT * INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id=p_transaction_id
       AND organization_id=p_organization_id
       AND source_channel='COUNTER'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter Commerce transaction not found'
            USING ERRCODE='P0002';
    END IF;

    v_actor := commerce_counter_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    SELECT * INTO a
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id=t.commerce_transaction_id
       AND payment_channel='REMOTE_TERMINAL'
       AND provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION 'Active remote payment attempt conflicts with transaction state'
                USING ERRCODE='23505';
        END IF;

        RETURN QUERY
        SELECT true,
               t.integration_configuration_id,
               t.provider_order_id,
               t.total_minor,
               t.currency_code,
               a.provider_business_id,
               a.provider_store_id,
               a.provider_device_id,
               a.provider_reference_id;
        RETURN;
    END IF;

    IF t.status IS DISTINCT FROM 'ORDER_CREATED'
       OR t.integration_configuration_id IS NULL
       OR NULLIF(btrim(t.provider_order_id),'') IS NULL
       OR t.total_minor IS NULL
       OR t.total_minor<=0
       OR t.currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Counter Commerce transaction is not ready for remote payment'
            USING ERRCODE='23505';
    END IF;

    SELECT b.poynt_business_id,
           b.poynt_store_id,
           b.poynt_terminal_id
      INTO a.provider_business_id,
           a.provider_store_id,
           a.provider_device_id
      FROM poynt_terminal_bindings b
      JOIN pos_devices d
        ON d.pos_device_id=b.pos_device_id
     WHERE b.pos_device_id=p_pos_device_id
       AND b.organization_id=t.organization_id
       AND b.store_id IS NOT DISTINCT FROM t.store_id
       AND NOT b.is_deleted
       AND NOT d.is_deleted
       AND d.revoked_at IS NULL;

    IF NOT FOUND
       OR NULLIF(btrim(a.provider_business_id),'') IS NULL
       OR NULLIF(btrim(a.provider_device_id),'') IS NULL THEN
        RAISE EXCEPTION 'Registered Poynt terminal is unavailable'
            USING ERRCODE='22023';
    END IF;

    SELECT p.payment_intent_id
      INTO v_payment_intent_id
      FROM payment_intents p
     WHERE p.commerce_transaction_id = t.commerce_transaction_id
       AND p.organization_id = t.organization_id
       AND p.finalized_subscription_id IS NULL
     ORDER BY p.created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_payment_intent_id IS NULL THEN
        RAISE EXCEPTION 'Correlated membership payment intent is unavailable'
            USING ERRCODE='23505';
    END IF;

    UPDATE payment_intents
       SET status = 'PROCESSING',
           failure_code = NULL,
           failure_message = NULL,
           cancelled_at = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment_intent_id
       AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'CANCELED');

    SELECT payment_attempt_id
      INTO v_payment_attempt_id
      FROM payment_attempts
     WHERE payment_intent_id = v_payment_intent_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF v_payment_attempt_id IS NULL THEN
        RAISE EXCEPTION 'Correlated payment attempt is unavailable'
            USING ERRCODE='23505';
    END IF;

    UPDATE payment_attempts
       SET status = 'PROCESSING',
           failure_code = NULL,
           failure_message = NULL,
           processed_at = NULL
     WHERE payment_attempt_id = v_payment_attempt_id
       AND status IN ('PENDING', 'PROCESSING', 'FAILED', 'CANCELED');

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        created_by,
        payment_channel,
        provider_reference_id,
        target_pos_device_id,
        provider_business_id,
        provider_store_id,
        provider_device_id
    ) VALUES (
        generate_runtime_id('CPA'),
        t.commerce_transaction_id,
        'DISPATCHING',
        t.total_minor,
        t.currency_code,
        v_actor,
        'REMOTE_TERMINAL',
        p_reference_id,
        p_pos_device_id,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
    );

    UPDATE commerce_transactions
       SET status='PROVIDER_IN_PROGRESS',
           failure_code=NULL,
           failure_message=NULL,
           updated_at=CURRENT_TIMESTAMP,
           updated_by=v_actor,
           version_no=version_no+1
     WHERE commerce_transaction_id=t.commerce_transaction_id;

    RETURN QUERY
    SELECT false,
           t.integration_configuration_id,
           t.provider_order_id,
           t.total_minor,
           t.currency_code,
           a.provider_business_id,
           a.provider_store_id,
           a.provider_device_id,
           p_reference_id;
END;
$function$;



CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_membership_payment_by_reference(
    p_reference_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
    t commerce_transactions%ROWTYPE;
    p payment_intents%ROWTYPE;
    v_payment_status varchar(32);
    v_failure_code varchar(80);
BEGIN
    SELECT * INTO a
      FROM commerce_provider_payment_attempts
     WHERE provider_reference_id=p_reference_id
       AND payment_channel='REMOTE_TERMINAL'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id = a.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND OR t.source_channel IS DISTINCT FROM 'COUNTER' THEN
        RETURN NULL;
    END IF;

    IF a.provider_status = 'SUCCEEDED' THEN
        RETURN commerce_finalize_counter_membership_payment(
            t.commerce_transaction_id
        );
    END IF;

    IF a.provider_status NOT IN ('FAILED', 'CANCELLED') THEN
        RETURN NULL;
    END IF;

    SELECT * INTO p
      FROM payment_intents
     WHERE commerce_transaction_id = t.commerce_transaction_id
       AND organization_id = t.organization_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Correlated membership payment intent is unavailable'
            USING ERRCODE='23505';
    END IF;

    IF p.finalized_subscription_id IS NOT NULL
       OR p.status = 'SUCCEEDED' THEN
        RAISE EXCEPTION 'Terminal failure conflicts with finalized membership payment'
            USING ERRCODE='23505';
    END IF;

    v_payment_status := CASE
        WHEN a.provider_status = 'CANCELLED' THEN 'CANCELED'
        ELSE 'FAILED'
    END;

    IF p.status = v_payment_status THEN
        RETURN NULL;
    END IF;

    v_failure_code := COALESCE(
        NULLIF(btrim(a.failure_code), ''),
        CASE
            WHEN a.provider_status = 'CANCELLED'
                THEN 'REMOTE_PAYMENT_CANCELED'
            ELSE 'REMOTE_PAYMENT_FAILED'
        END
    );

    PERFORM payment_record_result(
        p.payment_intent_id,
        NULL,
        v_payment_status,
        a.provider_transaction_id,
        v_failure_code,
        NULLIF(btrim(a.failure_message), ''),
        p.created_by
    );

    RETURN NULL;
END;
$function$;



-- Migration 116 was Counter-membership specific. Accept Phase 4B COUNTER as the

-- same membership-payment correlation for TEST/CASH result synchronization.

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



REVOKE ALL ON FUNCTION

    "${schemaName}".commerce_counter_actor_organization_user(varchar,varchar),

    "${schemaName}".commerce_prepare_counter_membership_order(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_get_counter_membership_transaction(varchar,varchar,varchar),

    "${schemaName}".commerce_get_counter_membership_lines(varchar,varchar),

    "${schemaName}".commerce_get_counter_payment_provider(varchar,varchar),

    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(varchar,varchar),

    "${schemaName}".commerce_persist_counter_membership_provider_order(varchar,varchar,bigint,bigint,bigint,varchar,varchar),

    "${schemaName}".commerce_start_counter_terminal_payment(varchar,varchar,varchar),

    "${schemaName}".commerce_record_counter_terminal_payment_result(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_finalize_counter_membership_payment(varchar),

    "${schemaName}".commerce_resolve_counter_pos_device(varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_begin_counter_remote_terminal_payment(varchar,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_finalize_counter_membership_payment_by_reference(varchar)

FROM PUBLIC;



GRANT EXECUTE ON FUNCTION

    "${schemaName}".commerce_prepare_counter_membership_order(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_get_counter_membership_transaction(varchar,varchar,varchar),

    "${schemaName}".commerce_get_counter_membership_lines(varchar,varchar),

    "${schemaName}".commerce_get_counter_payment_provider(varchar,varchar),

    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(varchar,varchar),

    "${schemaName}".commerce_persist_counter_membership_provider_order(varchar,varchar,bigint,bigint,bigint,varchar,varchar),

    "${schemaName}".commerce_start_counter_terminal_payment(varchar,varchar,varchar),

    "${schemaName}".commerce_record_counter_terminal_payment_result(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_finalize_counter_membership_payment(varchar),

    "${schemaName}".commerce_resolve_counter_pos_device(varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_begin_counter_remote_terminal_payment(varchar,varchar,varchar,varchar,varchar),

    "${schemaName}".commerce_finalize_counter_membership_payment_by_reference(varchar),

    "${schemaName}".commerce_sync_membership_payment_result(varchar,varchar,varchar)

TO "${appRole}";

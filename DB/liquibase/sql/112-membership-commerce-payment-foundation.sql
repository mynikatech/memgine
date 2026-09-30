-- Provider-neutral foundation for a future atomic Counter membership checkout.
-- This migration does not alter Counter orchestration or any payment result lifecycle.

ALTER TABLE "${schemaName}".payment_intents
    ADD COLUMN IF NOT EXISTS commerce_transaction_id varchar(64)
        REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id);

CREATE INDEX IF NOT EXISTS ix_payment_intents_commerce_transaction
    ON "${schemaName}".payment_intents (commerce_transaction_id)
    WHERE commerce_transaction_id IS NOT NULL;

-- A foreign key alone cannot guarantee that the intent and checkout belong to
-- the same organization. Keep that invariant at the database boundary.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_intent_validate_commerce_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NEW.commerce_transaction_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM commerce_transactions t
            WHERE t.commerce_transaction_id = NEW.commerce_transaction_id
              AND t.organization_id = NEW.organization_id
              AND NOT t.is_deleted
       ) THEN
        RAISE EXCEPTION 'Payment intent and commerce transaction must belong to the same organization'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_payment_intent_validate_commerce_organization
    ON "${schemaName}".payment_intents;

CREATE TRIGGER trg_payment_intent_validate_commerce_organization
    BEFORE INSERT OR UPDATE OF organization_id, commerce_transaction_id
    ON "${schemaName}".payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION "${schemaName}".payment_intent_validate_commerce_organization();

REVOKE ALL ON FUNCTION "${schemaName}".payment_intent_validate_commerce_organization()
    FROM PUBLIC;

-- The function owns only a membership checkout. It deliberately never calls an
-- external order provider and rejects any persisted mixed/external basket on retry.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_internal_membership_order(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_customer_user_id varchar,
    p_subscription_plan_id varchar,
    p_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
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
    v_line_count integer;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_staff_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL
       OR NULLIF(btrim(p_subscription_plan_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR NULLIF(btrim(p_idempotency_key), '') IS NULL
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid membership checkout request' USING ERRCODE = '22023';
    END IF;

    -- Serialize one logical checkout key before checking/inserting the partial
    -- unique index on commerce_transactions.
    PERFORM pg_advisory_xact_lock(hashtext(p_organization_id || ':' || p_idempotency_key));

    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT ou.organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = p_actor_user_id
       AND NOT ou.is_deleted
     LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Counter actor organization membership not found' USING ERRCODE = '42501';
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
        RAISE EXCEPTION 'Customer is not in organization' USING ERRCODE = '23503';
    END IF;

    SELECT t.*
      INTO v_transaction
      FROM commerce_transactions t
     WHERE t.organization_id = p_organization_id
       AND t.idempotency_key = p_idempotency_key
       AND NOT t.is_deleted
     FOR UPDATE;

    IF FOUND THEN
        v_order_id := 'MEMBERSHIP-' || v_transaction.commerce_transaction_id;

        SELECT count(*)
          INTO v_line_count
          FROM commerce_transaction_lines l
         WHERE l.commerce_transaction_id = v_transaction.commerce_transaction_id
           AND NOT l.is_deleted;

        IF v_transaction.source_channel IS DISTINCT FROM 'COUNTER_MEMBERSHIP'
           OR v_transaction.store_id IS DISTINCT FROM p_store_id
           OR v_transaction.customer_user_id IS DISTINCT FROM p_customer_user_id
           OR v_transaction.integration_configuration_id IS NOT NULL
           OR v_line_count <> 1
           OR EXISTS (
               SELECT 1
                 FROM commerce_transaction_lines l
                WHERE l.commerce_transaction_id = v_transaction.commerce_transaction_id
                  AND NOT l.is_deleted
                  AND (
                      l.line_type <> 'MEMBERSHIP'
                      OR l.subscription_plan_id IS DISTINCT FROM p_subscription_plan_id
                      OR l.quantity <> 1
                  )
           ) THEN
            RAISE EXCEPTION 'Existing commerce checkout conflicts with the membership purchase'
                USING ERRCODE = '23505';
        END IF;

        IF v_transaction.status <> 'ORDER_CREATED'
           OR v_transaction.provider_order_id IS DISTINCT FROM v_order_id
           OR v_transaction.total_minor IS NULL
           OR v_transaction.currency_code IS NULL THEN
            RAISE EXCEPTION 'Existing commerce checkout is not a prepared membership order'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
            v_transaction.commerce_transaction_id,
            v_order_id,
            v_transaction.total_minor,
            v_transaction.currency_code,
            v_transaction.status;

        RETURN;
    END IF;

    -- membership_purchase_quote is the existing authoritative plan availability,
    -- price, currency, and tax source. No amount or currency is client supplied.
    SELECT
        q."subtotalAmount",
        q."taxAmount",
        q."totalAmount",
        q."currencyCode"
      INTO
        v_subtotal,
        v_tax,
        v_total,
        v_currency
      FROM membership_purchase_quote(
          p_organization_id,
          p_subscription_plan_id
      ) AS q;

    IF v_subtotal IS NULL
       OR v_tax IS NULL
       OR v_total IS NULL
       OR v_subtotal < 0
       OR v_tax < 0
       OR v_total < 0
       OR v_total <> (v_subtotal + v_tax)
       OR NULLIF(btrim(v_currency), '') IS NULL
       OR v_currency !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION 'Invalid membership purchase quote'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        COALESCE(mp.membership_product_name, 'Membership') || ' - ' ||
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
        RAISE EXCEPTION 'Membership plan is unavailable' USING ERRCODE = '23503';
    END IF;

    v_subtotal_minor := round(v_subtotal * 100)::bigint;
    v_tax_minor := round(v_tax * 100)::bigint;
    v_total_minor := round(v_total * 100)::bigint;

    INSERT INTO commerce_transactions (
        commerce_transaction_id,
        organization_id,
        store_id,
        customer_user_id,
        integration_configuration_id,
        source_channel,
        status,
        currency_code,
        subtotal_minor,
        adjustment_total_minor,
        tax_total_minor,
        total_minor,
        provider_order_id,
        idempotency_key,
        created_by,
        updated_by
    ) VALUES (
        generate_runtime_id('CTX'),
        p_organization_id,
        p_store_id,
        p_customer_user_id,
        NULL,
        'COUNTER_MEMBERSHIP',
        'DRAFT',
        v_currency,
        v_subtotal_minor,
        0,
        v_tax_minor,
        v_total_minor,
        NULL,
        p_idempotency_key,
        v_actor_organization_user_id,
        v_actor_organization_user_id
    )
    RETURNING *
      INTO v_transaction;

    INSERT INTO commerce_transaction_lines (
        commerce_transaction_line_id,
        commerce_transaction_id,
        line_type,
        subscription_plan_id,
        description,
        quantity,
        unit_price_minor_authoritative,
        line_subtotal_minor,
        currency_code,
        price_source,
        created_by,
        updated_by
    ) VALUES (
        generate_runtime_id('CTL'),
        v_transaction.commerce_transaction_id,
        'MEMBERSHIP',
        p_subscription_plan_id,
        v_description,
        1,
        v_subtotal_minor,
        v_subtotal_minor,
        v_currency,
        'MEMGINE_MEMBERSHIP',
        v_actor_organization_user_id,
        v_actor_organization_user_id
    );

    v_order_id := 'MEMBERSHIP-' || v_transaction.commerce_transaction_id;

    UPDATE commerce_transactions
       SET status = 'ORDER_CREATED',
           provider_order_id = v_order_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;

    RETURN QUERY
    SELECT
        v_transaction.commerce_transaction_id,
        v_order_id,
        v_total_minor,
        v_currency,
        'ORDER_CREATED'::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_prepare_internal_membership_order(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_prepare_internal_membership_order(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
) TO "${appRole}";

-- Existing payment start signatures are unchanged. Adding an OUT column needs a
-- drop/recreate in PostgreSQL, so keep the function bodies equivalent to 092 and
-- expose the nullable correlation column for current and future intents.

DROP FUNCTION "${schemaName}".payment_start_membership_intent(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
);

DROP FUNCTION "${schemaName}".payment_start_authenticated_membership_intent(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
);

DROP FUNCTION "${schemaName}".payment_start_customer_membership_intent(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar
);

DROP FUNCTION "${schemaName}".payment_get_intent(
    varchar,
    varchar,
    varchar
);

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_intent(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentIntentId" varchar,
    "providerCode" varchar,
    "status" varchar,
    "amount" double precision,
    "currencyCode" varchar,
    "providerReferenceId" varchar,
    "failureCode" varchar,
    "failureMessage" varchar,
    "membershipPlanId" varchar,
    "customerUserId" varchar,
    "finalizedSubscriptionId" varchar,
    "createdAt" text,
    "commerceTransactionId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        i.payment_intent_id,
        pc.provider_code,
        i.status,
        i.amount::double precision,
        i.currency_code,
        i.provider_reference_id,
        i.failure_code,
        i.failure_message,
        i.membership_plan_id,
        i.customer_user_id,
        i.finalized_subscription_id,
        i.created_at::text,
        i.commerce_transaction_id
      FROM payment_intents i
      JOIN payment_provider_configs pc
        ON pc.payment_provider_config_id = i.payment_provider_config_id
     WHERE i.organization_id = p_organization_id
       AND i.payment_intent_id = p_intent_id
       AND (
           i.created_by = p_actor_user_id
           OR i.customer_user_id = p_actor_user_id
       );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_challenge_id varchar,
    p_provider_code varchar,
    p_idempotency_key varchar,
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
    v_provider_id varchar;
    v_plan_id varchar;
    v_user_id varchar;
    v_store_id varchar;
    v_staff_id varchar;
    v_subtotal numeric(12,2);
    v_rate numeric(7,4);
    v_tax numeric(12,2);
    v_total numeric(12,2);
    v_currency varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL
       OR btrim(p_idempotency_key) = ''
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_existing
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            v_existing.payment_intent_id,
            pc.provider_code,
            v_existing.status,
            v_existing.amount::double precision,
            v_existing.currency_code,
            v_existing.provider_reference_id,
            v_existing.membership_plan_id,
            v_existing.customer_user_id,
            v_existing.created_at::text,
            v_existing.commerce_transaction_id
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;

        RETURN;
    END IF;

    SELECT
        c.plan_id,
        c.user_id,
        c.store_id,
        c.staff_id
      INTO
        v_plan_id,
        v_user_id,
        v_store_id,
        v_staff_id
      FROM business_otp_context c
      JOIN otp_challenges o
        ON o.otp_challenge_id = c.otp_challenge_id
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.organization_id = p_organization_id
       AND c.consumed_at IS NULL
       AND c.purpose IN (
           'COUNTER_PURCHASE_VERIFY',
           'APP_MEMBERSHIP_PURCHASE_VERIFY'
       )
       AND o.status = 'CONSUMED'
     FOR UPDATE OF c;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'Verified membership purchase authorization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        q."subtotalAmount",
        q."taxRate",
        q."taxAmount",
        q."totalAmount",
        q."currencyCode",
        q."taxCode",
        q."taxName"
      INTO
        v_subtotal,
        v_rate,
        v_tax,
        v_total,
        v_currency,
        v_tax_code,
        v_tax_name
      FROM membership_purchase_quote(
          p_organization_id,
          v_plan_id
      ) AS q;

    SELECT payment_provider_config_id
      INTO v_provider_id
      FROM payment_provider_configs
     WHERE organization_id IS NULL
       AND provider_code = p_provider_code
       AND is_enabled
     LIMIT 1;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO payment_intents (
        payment_intent_id,
        organization_id,
        payment_provider_config_id,
        business_otp_challenge_id,
        membership_plan_id,
        customer_user_id,
        store_id,
        staff_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key,
        created_by,
        updated_by
    ) VALUES (
        p_intent_id,
        p_organization_id,
        v_provider_id,
        p_challenge_id,
        v_plan_id,
        v_user_id,
        v_store_id,
        v_staff_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key,
        p_actor_user_id,
        p_actor_user_id
    );

    INSERT INTO payment_attempts (
        payment_attempt_id,
        payment_intent_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key
    ) VALUES (
        p_attempt_id,
        p_intent_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key
    );

    RETURN QUERY
    SELECT
        p_intent_id,
        p_provider_code,
        'PENDING'::varchar,
        v_total::double precision,
        v_currency,
        NULL::varchar,
        v_plan_id,
        v_user_id,
        CURRENT_TIMESTAMP::text,
        NULL::varchar;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_start_authenticated_membership_intent(
    p_intent_id varchar,
    p_attempt_id varchar,
    p_organization_id varchar,
    p_plan_id varchar,
    p_customer_user_id varchar,
    p_provider_code varchar,
    p_idempotency_key varchar
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
    v_provider_id varchar;
    v_subtotal numeric(12,2);
    v_rate numeric(7,4);
    v_tax numeric(12,2);
    v_total numeric(12,2);
    v_currency varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL
       OR btrim(p_idempotency_key) = ''
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_existing
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            v_existing.payment_intent_id,
            pc.provider_code,
            v_existing.status,
            v_existing.amount::double precision,
            v_existing.currency_code,
            v_existing.provider_reference_id,
            v_existing.membership_plan_id,
            v_existing.customer_user_id,
            v_existing.created_at::text,
            v_existing.commerce_transaction_id
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;

        RETURN;
    END IF;

    IF NOT customer_has_active_relationship(
        p_organization_id,
        p_customer_user_id
    ) THEN
        RAISE EXCEPTION 'Customer purchase is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT
        q."subtotalAmount",
        q."taxRate",
        q."taxAmount",
        q."totalAmount",
        q."currencyCode",
        q."taxCode",
        q."taxName"
      INTO
        v_subtotal,
        v_rate,
        v_tax,
        v_total,
        v_currency,
        v_tax_code,
        v_tax_name
      FROM membership_purchase_quote(
          p_organization_id,
          p_plan_id
      ) AS q;

    SELECT payment_provider_config_id
      INTO v_provider_id
      FROM payment_provider_configs
     WHERE organization_id IS NULL
       AND provider_code = p_provider_code
       AND is_enabled
     LIMIT 1;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO payment_intents (
        payment_intent_id,
        organization_id,
        payment_provider_config_id,
        authorization_mode,
        membership_plan_id,
        customer_user_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key,
        created_by,
        updated_by
    ) VALUES (
        p_intent_id,
        p_organization_id,
        v_provider_id,
        'CUSTOMER_SESSION',
        p_plan_id,
        p_customer_user_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key,
        p_customer_user_id,
        p_customer_user_id
    );

    INSERT INTO payment_attempts (
        payment_attempt_id,
        payment_intent_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key
    ) VALUES (
        p_attempt_id,
        p_intent_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key
    );

    RETURN QUERY
    SELECT
        p_intent_id,
        p_provider_code,
        'PENDING'::varchar,
        v_total::double precision,
        v_currency,
        NULL::varchar,
        p_plan_id,
        p_customer_user_id,
        CURRENT_TIMESTAMP::text,
        NULL::varchar;
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
    v_provider_id varchar;
    v_subtotal numeric(12,2);
    v_rate numeric(7,4);
    v_tax numeric(12,2);
    v_total numeric(12,2);
    v_currency varchar(10);
    v_tax_code varchar(32);
    v_tax_name varchar(100);
    v_existing "${schemaName}".payment_intents%ROWTYPE;
BEGIN
    IF p_idempotency_key IS NULL
       OR btrim(p_idempotency_key) = ''
       OR length(p_idempotency_key) > 128 THEN
        RAISE EXCEPTION 'Invalid payment idempotency key'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_existing
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            v_existing.payment_intent_id,
            pc.provider_code,
            v_existing.status,
            v_existing.amount::double precision,
            v_existing.currency_code,
            v_existing.provider_reference_id,
            v_existing.membership_plan_id,
            v_existing.customer_user_id,
            v_existing.created_at::text,
            v_existing.commerce_transaction_id
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_existing.payment_provider_config_id;

        RETURN;
    END IF;

    SELECT
        q."subtotalAmount",
        q."taxRate",
        q."taxAmount",
        q."totalAmount",
        q."currencyCode",
        q."taxCode",
        q."taxName"
      INTO
        v_subtotal,
        v_rate,
        v_tax,
        v_total,
        v_currency,
        v_tax_code,
        v_tax_name
      FROM membership_purchase_quote(
          p_organization_id,
          p_plan_id
      ) AS q;

    SELECT payment_provider_config_id
      INTO v_provider_id
      FROM payment_provider_configs
     WHERE organization_id IS NULL
       AND provider_code = p_provider_code
       AND is_enabled
     LIMIT 1;

    IF v_provider_id IS NULL THEN
        RAISE EXCEPTION 'Payment provider is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO payment_intents (
        payment_intent_id,
        organization_id,
        payment_provider_config_id,
        authorization_mode,
        membership_plan_id,
        customer_user_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key,
        created_by,
        updated_by
    ) VALUES (
        p_intent_id,
        p_organization_id,
        v_provider_id,
        'CUSTOMER_SESSION',
        p_plan_id,
        p_customer_user_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key,
        p_customer_user_id,
        p_customer_user_id
    );

    INSERT INTO payment_attempts (
        payment_attempt_id,
        payment_intent_id,
        subtotal_amount,
        tax_rate,
        tax_amount,
        tax_code,
        tax_name,
        amount,
        currency_code,
        status,
        idempotency_key
    ) VALUES (
        p_attempt_id,
        p_intent_id,
        v_subtotal,
        v_rate,
        v_tax,
        v_tax_code,
        v_tax_name,
        v_total,
        v_currency,
        'PENDING',
        p_idempotency_key
    );

    RETURN QUERY
    SELECT
        p_intent_id,
        p_provider_code,
        'PENDING'::varchar,
        v_total::double precision,
        v_currency,
        NULL::varchar,
        p_plan_id,
        p_customer_user_id,
        CURRENT_TIMESTAMP::text,
        NULL::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".payment_start_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_start_authenticated_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_start_customer_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_get_intent(
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".payment_start_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_start_authenticated_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_start_customer_membership_intent(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".payment_get_intent(
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";
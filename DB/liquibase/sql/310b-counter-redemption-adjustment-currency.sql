
-- 310B: Preserve the authoritative provider currency on
-- applied Counter redemption adjustments.
-- Percentage-based adjustment configurations may have NULL currency.
-- Reject conflicting non-NULL transaction adjustment currencies.
-- Forward-only replacement; leave executed 309 migrations unchanged.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_persist_counter_redemption_provider_order(
    p_transaction_id varchar,
    p_provider_order_id varchar,
    p_line_prices jsonb,
    p_adjustments jsonb,
    p_subtotal_minor bigint,
    p_adjustment_total_minor bigint,
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
    commerce_record commerce_transactions%ROWTYPE;
    actor_organization_user_id varchar(64);
    line_count integer;
    adjustment_count integer;
BEGIN
    SELECT commerce_transaction.*
    INTO commerce_record
    FROM commerce_transactions AS commerce_transaction
    WHERE commerce_transaction.commerce_transaction_id = p_transaction_id
      AND commerce_transaction.source_channel IN (
          'COUNTER_REDEMPTION', 'CUSTOMER_FULFILLMENT'
      )
      AND NOT commerce_transaction.is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    actor_organization_user_id :=
        commerce_counter_checkout_actor_organization_user(
            p_transaction_id, p_actor_user_id
        );

    -- Preserve existing advance-order provider association.
    IF commerce_record.source_channel = 'CUSTOMER_FULFILLMENT' THEN
        IF commerce_record.status <> 'ORDER_CREATED'
           OR NULLIF(btrim(p_provider_order_id), '') IS NULL
           OR commerce_record.subtotal_minor
                IS DISTINCT FROM p_subtotal_minor
           OR commerce_record.adjustment_total_minor
                IS DISTINCT FROM p_adjustment_total_minor
           OR commerce_record.tax_total_minor
                IS DISTINCT FROM p_tax_total_minor
           OR commerce_record.total_minor
                IS DISTINCT FROM p_total_minor
           OR commerce_record.currency_code IS DISTINCT FROM 'CAD'
           OR commerce_record.currency_code
                IS DISTINCT FROM p_currency_code
           OR (
                commerce_record.provider_order_id IS NOT NULL
                AND commerce_record.provider_order_id <> p_provider_order_id
           )
           OR NOT EXISTS (
               SELECT 1
               FROM fulfillments AS fulfillment_order
               JOIN statuses AS payment_timing
                 ON payment_timing.status_id =
                    fulfillment_order.payment_timing_status_id
                AND payment_timing.status_code = 'PAY_AT_COUNTER'
               WHERE fulfillment_order.commerce_transaction_id =
                     p_transaction_id
                 AND fulfillment_order.cancelled_at IS NULL
                 AND fulfillment_order.cancellation_requested_at IS NULL
                 AND fulfillment_order.fulfilled_at IS NULL
           )
        THEN
            RAISE EXCEPTION
                'Provider order conflicts with the accepted checkout'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_transactions
        SET provider_order_id = p_provider_order_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = actor_organization_user_id,
            version_no = version_no + 1
        WHERE commerce_transaction_id = p_transaction_id
          AND provider_order_id IS NULL;

        RETURN true;
    END IF;

    -- Preserve idempotency for an already persisted provider order.
    IF commerce_record.status = 'ORDER_CREATED' THEN
        IF commerce_record.provider_order_id = p_provider_order_id
           AND commerce_record.subtotal_minor
                IS NOT DISTINCT FROM p_subtotal_minor
           AND commerce_record.adjustment_total_minor
                IS NOT DISTINCT FROM p_adjustment_total_minor
           AND commerce_record.tax_total_minor
                IS NOT DISTINCT FROM p_tax_total_minor
           AND commerce_record.total_minor
                IS NOT DISTINCT FROM p_total_minor
           AND commerce_record.currency_code
                IS NOT DISTINCT FROM p_currency_code
        THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION
            'Provider order conflicts with persisted Commerce order'
            USING ERRCODE = '23505';
    END IF;

    IF commerce_record.status <> 'READY_FOR_PROVIDER' THEN
        RAISE EXCEPTION
            'Counter redemption Commerce transaction is not ready for provider order'
            USING ERRCODE = '23505';
    END IF;

    IF NULLIF(btrim(p_provider_order_id), '') IS NULL
       OR p_line_prices IS NULL
       OR jsonb_typeof(p_line_prices) <> 'array'
       OR p_adjustments IS NULL
       OR jsonb_typeof(p_adjustments) <> 'array'
       OR p_subtotal_minor IS NULL
       OR p_adjustment_total_minor IS NULL
       OR p_tax_total_minor IS NULL
       OR p_total_minor IS NULL
       OR p_subtotal_minor < 0
       OR p_adjustment_total_minor < 0
       OR p_tax_total_minor < 0
       OR p_total_minor < 0
       OR p_currency_code IS NULL
       OR p_currency_code !~ '^[A-Z]{3}$'
       OR p_total_minor <>
          p_subtotal_minor - p_adjustment_total_minor + p_tax_total_minor
    THEN
        RAISE EXCEPTION
            'Invalid Counter redemption provider order result'
            USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)
    INTO line_count
    FROM commerce_transaction_lines AS commerce_line
    WHERE commerce_line.commerce_transaction_id =
          commerce_record.commerce_transaction_id
      AND NOT commerce_line.is_deleted;

    IF line_count = 0
       OR EXISTS (
           SELECT 1
           FROM commerce_transaction_lines AS commerce_line
           WHERE commerce_line.commerce_transaction_id =
                 commerce_record.commerce_transaction_id
             AND NOT commerce_line.is_deleted
             AND commerce_line.line_type <> 'EXTERNAL_PRODUCT'
       )
       OR (
           SELECT COUNT(*)
           FROM jsonb_array_elements(p_line_prices)
       ) <> line_count
    THEN
        RAISE EXCEPTION
            'Counter redemption provider order lines are invalid'
            USING ERRCODE = '22023';
    END IF;

    -- Validate exact provider line identifiers, quantities and currency.
    IF EXISTS (
        WITH actual_lines AS (
            SELECT
                commerce_transaction_line_id,
                quantity
            FROM commerce_transaction_lines
            WHERE commerce_transaction_id =
                  commerce_record.commerce_transaction_id
              AND NOT is_deleted
        ),
        supplied_lines AS (
            SELECT *
            FROM jsonb_to_recordset(p_line_prices) AS supplied_price(
                line_id varchar,
                unit_price_minor bigint,
                line_subtotal_minor bigint,
                currency_code varchar,
                price_source varchar
            )
        )
        SELECT 1
        FROM actual_lines AS actual_line
        FULL JOIN supplied_lines AS supplied_line
          ON supplied_line.line_id =
             actual_line.commerce_transaction_line_id
        WHERE actual_line.commerce_transaction_line_id IS NULL
           OR supplied_line.line_id IS NULL
           OR supplied_line.unit_price_minor IS NULL
           OR supplied_line.unit_price_minor < 0
           OR supplied_line.line_subtotal_minor IS NULL
           OR supplied_line.line_subtotal_minor <>
              supplied_line.unit_price_minor * actual_line.quantity
           OR supplied_line.currency_code
              IS DISTINCT FROM p_currency_code
           OR supplied_line.price_source
              IS DISTINCT FROM 'PROVIDER_FINAL'
    ) THEN
        RAISE EXCEPTION
            'Counter redemption provider line values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(SUM(provider_line.line_subtotal_minor), 0)
        FROM jsonb_to_recordset(p_line_prices) AS provider_line(
            line_id varchar,
            unit_price_minor bigint,
            line_subtotal_minor bigint,
            currency_code varchar,
            price_source varchar
        )
    ) IS DISTINCT FROM p_subtotal_minor
    THEN
        RAISE EXCEPTION
            'Counter redemption provider subtotal is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*)
    INTO adjustment_count
    FROM commerce_transaction_adjustments AS transaction_adjustment
    WHERE transaction_adjustment.commerce_transaction_id =
          commerce_record.commerce_transaction_id
      AND NOT transaction_adjustment.is_deleted;

    IF (
        SELECT COUNT(*)
        FROM jsonb_array_elements(p_adjustments)
    ) <> adjustment_count
    THEN
        RAISE EXCEPTION
            'Counter redemption provider adjustments are invalid'
            USING ERRCODE = '22023';
    END IF;

    -- Validate exact adjustment identifiers and provider amounts.
    IF EXISTS (
        WITH actual_adjustments AS (
            SELECT commerce_transaction_adjustment_id
            FROM commerce_transaction_adjustments
            WHERE commerce_transaction_id =
                  commerce_record.commerce_transaction_id
              AND NOT is_deleted
        ),
        supplied_adjustments AS (
            SELECT *
            FROM jsonb_to_recordset(p_adjustments) AS provider_adjustment(
                adjustment_id varchar,
                applied_amount_minor bigint,
                status varchar
            )
        )
        SELECT 1
        FROM actual_adjustments AS actual_adjustment
        FULL JOIN supplied_adjustments AS supplied_adjustment
          ON supplied_adjustment.adjustment_id =
             actual_adjustment.commerce_transaction_adjustment_id
        WHERE actual_adjustment.commerce_transaction_adjustment_id IS NULL
           OR supplied_adjustment.adjustment_id IS NULL
           OR supplied_adjustment.applied_amount_minor IS NULL
           OR supplied_adjustment.applied_amount_minor < 0
           OR supplied_adjustment.status IS DISTINCT FROM 'APPLIED'
    ) THEN
        RAISE EXCEPTION
            'Counter redemption provider adjustment values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(
            SUM(provider_adjustment.applied_amount_minor), 0
        )
        FROM jsonb_to_recordset(p_adjustments) AS provider_adjustment(
            adjustment_id varchar,
            applied_amount_minor bigint,
            status varchar
        )
    ) IS DISTINCT FROM p_adjustment_total_minor
       OR p_adjustment_total_minor > p_subtotal_minor
    THEN
        RAISE EXCEPTION
            'Counter redemption provider discount total is invalid'
            USING ERRCODE = '22023';
    END IF;

    -- 310B: An optional configuration currency may be NULL.
    -- A non-NULL transaction currency must never conflict with
    -- the authoritative provider-confirmed currency.
    IF EXISTS (
        SELECT 1
        FROM commerce_transaction_adjustments AS transaction_adjustment
        WHERE transaction_adjustment.commerce_transaction_id =
              commerce_record.commerce_transaction_id
          AND NOT transaction_adjustment.is_deleted
          AND transaction_adjustment.currency_code IS NOT NULL
          AND transaction_adjustment.currency_code
              IS DISTINCT FROM p_currency_code
    ) THEN
        RAISE EXCEPTION
            'Counter redemption adjustment currency conflicts with provider currency'
            USING ERRCODE = '23505';
    END IF;

    -- Preserve provider-authoritative line prices.
    UPDATE commerce_transaction_lines AS commerce_line
    SET unit_price_minor_authoritative =
            provider_line.unit_price_minor,
        line_subtotal_minor = provider_line.line_subtotal_minor,
        currency_code = provider_line.currency_code,
        price_source = provider_line.price_source,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = actor_organization_user_id,
        version_no = commerce_line.version_no + 1
    FROM jsonb_to_recordset(p_line_prices) AS provider_line(
        line_id varchar,
        unit_price_minor bigint,
        line_subtotal_minor bigint,
        currency_code varchar,
        price_source varchar
    )
    WHERE commerce_line.commerce_transaction_line_id =
          provider_line.line_id
      AND commerce_line.commerce_transaction_id =
          commerce_record.commerce_transaction_id
      AND NOT commerce_line.is_deleted;

    -- 310B: Persist the authoritative currency with the
    -- provider-confirmed discount amount.
    UPDATE commerce_transaction_adjustments AS transaction_adjustment
    SET applied_amount_minor =
            provider_adjustment.applied_amount_minor,
        status = 'APPLIED',
        currency_code = p_currency_code,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = actor_organization_user_id,
        version_no = transaction_adjustment.version_no + 1
    FROM jsonb_to_recordset(p_adjustments) AS provider_adjustment(
        adjustment_id varchar,
        applied_amount_minor bigint,
        status varchar
    )
    WHERE transaction_adjustment.commerce_transaction_adjustment_id =
          provider_adjustment.adjustment_id
      AND transaction_adjustment.commerce_transaction_id =
          commerce_record.commerce_transaction_id
      AND NOT transaction_adjustment.is_deleted;

    -- Preserve existing order persistence and fulfillment creation.
    UPDATE commerce_transactions
    SET status = 'ORDER_CREATED',
        provider_order_id = p_provider_order_id,
        provider_transaction_id = NULL,
        subtotal_minor = p_subtotal_minor,
        adjustment_total_minor = p_adjustment_total_minor,
        tax_total_minor = p_tax_total_minor,
        total_minor = p_total_minor,
        currency_code = p_currency_code,
        failure_code = NULL,
        failure_message = NULL,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = actor_organization_user_id,
        version_no = version_no + 1
    WHERE commerce_transaction_id =
          commerce_record.commerce_transaction_id;

    PERFORM place_immediate_counter_order(
        commerce_record.commerce_transaction_id,
        p_actor_user_id
    );

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_persist_counter_redemption_provider_order(
        varchar, varchar, jsonb, jsonb,
        bigint, bigint, bigint, bigint,
        varchar, varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_persist_counter_redemption_provider_order(
        varchar, varchar, jsonb, jsonb,
        bigint, bigint, bigint, bigint,
        varchar, varchar
    )
TO "${appRole}";

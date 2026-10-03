-- Counter Benefit / Offer POS payment completion.
--
-- Forward-fix only. Existing migrations remain immutable.
--
-- Three Counter identification flows (customer QR, staff-assisted, phone+OTP)
-- converge on the same COUNTER_REDEMPTION Commerce transaction.
--
-- Entitlements remain PENDING until:
--   1) the POS provider order is persisted, and
--   2) payment succeeds, or the persisted provider order has a zero total.
--
-- Poynt Android UI remains intentionally deferred.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_checkout_actor_organization_user(
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
    c commerce_transactions%ROWTYPE;
    r redemption_transaction%ROWTYPE;
    v_organization_user_id varchar(64);
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter Commerce transaction is unavailable'
            USING ERRCODE = '42501';
    END IF;

    IF c.source_channel = 'COUNTER' THEN
        RETURN commerce_counter_actor_organization_user(
            p_transaction_id,
            p_actor_user_id
        );
    END IF;

    IF c.source_channel <> 'COUNTER_REDEMPTION' THEN
        RAISE EXCEPTION 'Counter Commerce operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT rt.*
      INTO r
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     ORDER BY x.created_at
     LIMIT 1;

    IF NOT FOUND
       OR c.store_id IS NULL
       OR r.store_id IS DISTINCT FROM c.store_id
       OR r.staff_id IS NULL
       OR NOT counter_can_operate(
            c.organization_id,
            c.store_id,
            r.staff_id,
            p_actor_user_id
       ) THEN
        RAISE EXCEPTION 'Counter Commerce operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_organization_user_id
      FROM organization_user
     WHERE organization_id = c.organization_id
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


-- Bind customer-created QR transactions to the Counter store/staff before
-- migration 123 creates the Commerce basket. Existing Counter-created
-- transactions already carry these values and must match them.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_counter_redemption_checkout(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "commerceTransactionId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    status varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    r redemption_transaction%ROWTYPE;
    p record;
    v_provider varchar(32);
BEGIN
    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO r
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF r.status <> 'PENDING'
       OR (
            r.expires_at IS NOT NULL
            AND r.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
       ) THEN
        RAISE EXCEPTION 'Redemption transaction cannot be prepared'
            USING ERRCODE = '23505';
    END IF;

    IF r.store_id IS NOT NULL
       AND r.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store'
            USING ERRCODE = '42501';
    END IF;

    IF r.staff_id IS NOT NULL
       AND r.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context'
            USING ERRCODE = '42501';
    END IF;

    UPDATE redemption_transaction
       SET store_id = COALESCE(store_id, p_store_id),
           staff_id = COALESCE(staff_id, p_staff_id),
           updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_id = r.redemption_transaction_id
       AND (
            store_id IS DISTINCT FROM COALESCE(store_id, p_store_id)
            OR staff_id IS DISTINCT FROM COALESCE(staff_id, p_staff_id)
       );

    SELECT *
      INTO p
      FROM commerce_prepare_counter_redemption_transaction(
          p_transaction_id,
          p_organization_id,
          p_store_id,
          p_staff_id,
          p_actor_user_id
      );

    v_provider := p."providerCode";

    -- Migration 123 intentionally returned NULL provider code when an existing
    -- Commerce transaction was reused. Recover it from the persisted transaction
    -- so retries are deterministic.
    IF v_provider IS NULL THEN
        SELECT CASE
                   WHEN c.integration_configuration_id IS NULL THEN 'TEST'
                   ELSE upper(ic.provider)
               END
          INTO v_provider
          FROM commerce_transactions c
          LEFT JOIN integration_configurations ic
            ON ic.integration_configuration_id = c.integration_configuration_id
           AND ic.organization_id = c.organization_id
           AND NOT ic.is_deleted
         WHERE c.commerce_transaction_id = p."commerceTransactionId"
           AND c.source_channel = 'COUNTER_REDEMPTION'
           AND NOT c.is_deleted;
    END IF;

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'Counter redemption payment provider is unavailable'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p."commerceTransactionId"::varchar,
        v_provider::varchar,
        p."integrationConfigurationId"::varchar,
        p.status::varchar;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_checkout(
    p_organization_id varchar,
    p_redemption_transaction_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionTransactionId" varchar,
    "transactionNumber" varchar,
    "redemptionStatus" varchar,
    "redemptionCompletedAt" text,
    "commerceTransactionId" varchar,
    "organizationId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    "commerceStatus" varchar,
    "subtotalMinor" bigint,
    "adjustmentTotalMinor" bigint,
    "taxTotalMinor" bigint,
    "totalMinor" bigint,
    "currencyCode" varchar,
    "providerOrderId" varchar,
    "providerTransactionId" varchar,
    "failureCode" varchar,
    "failureMessage" varchar,
    "storeId" varchar,
    "customerUserId" varchar,
    "idempotencyKey" varchar
)
LANGUAGE plpgsql
STABLE
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
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        r.redemption_transaction_id,
        r.redemption_transaction_number,
        r.status,
        r.completed_at::text,
        c.commerce_transaction_id,
        c.organization_id,
        CASE
            WHEN c.integration_configuration_id IS NULL THEN 'TEST'::varchar
            ELSE upper(ic.provider)::varchar
        END,
        c.integration_configuration_id,
        c.status,
        c.subtotal_minor,
        c.adjustment_total_minor,
        c.tax_total_minor,
        c.total_minor,
        c.currency_code,
        c.provider_order_id,
        c.provider_transaction_id,
        c.failure_code,
        c.failure_message,
        c.store_id,
        c.customer_user_id,
        c.idempotency_key
      FROM redemption_transaction r
      JOIN commerce_transaction_redemptions x
        ON x.redemption_transaction_id = r.redemption_transaction_id
       AND NOT x.is_deleted
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = x.commerce_transaction_id
       AND c.source_channel = 'COUNTER_REDEMPTION'
       AND NOT c.is_deleted
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = c.integration_configuration_id
       AND ic.organization_id = c.organization_id
       AND NOT ic.is_deleted
     WHERE r.redemption_transaction_id = p_redemption_transaction_id
       AND r.organization_id = p_organization_id
       AND c.organization_id = p_organization_id
       AND c.store_id = p_store_id
       AND r.store_id = p_store_id
       AND r.staff_id = p_staff_id
     ORDER BY x.created_at
     LIMIT 1;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_lines(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "lineId" varchar,
    "transactionId" varchar,
    "lineType" varchar,
    "sourceEntityType" varchar,
    "sourceEntityId" varchar,
    "productMappingId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    description varchar,
    quantity integer,
    "unitPriceMinorSnapshot" bigint,
    "unitPriceMinorAuthoritative" bigint,
    "lineSubtotalMinor" bigint,
    "currencyCode" varchar,
    "priceSource" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        l.commerce_transaction_line_id,
        l.commerce_transaction_id,
        l.line_type,
        l.source_entity_type,
        l.source_entity_id,
        l.commerce_product_mapping_id,
        l.external_product_id,
        l.external_variant_id,
        l.description,
        l.quantity,
        l.unit_price_minor_snapshot,
        l.unit_price_minor_authoritative,
        l.line_subtotal_minor,
        l.currency_code,
        l.price_source
      FROM commerce_transaction_lines l
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = l.commerce_transaction_id
     WHERE l.commerce_transaction_id = p_transaction_id
       AND c.source_channel = 'COUNTER_REDEMPTION'
       AND NOT l.is_deleted
       AND NOT c.is_deleted
     ORDER BY l.created_at, l.commerce_transaction_line_id;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_adjustments(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "adjustmentId" varchar,
    "transactionId" varchar,
    "targetLineId" varchar,
    "commerceAdjustmentId" varchar,
    "sourceType" varchar,
    "sourceId" varchar,
    "adjustmentType" varchar,
    percentage double precision,
    "requestedAmountMinor" bigint,
    "appliedAmountMinor" bigint,
    "currencyCode" varchar,
    status varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        a.commerce_transaction_adjustment_id,
        a.commerce_transaction_id,
        a.target_line_id,
        a.commerce_adjustment_id,
        a.source_type,
        a.source_id,
        a.adjustment_type,
        a.percentage::double precision,
        a.requested_amount_minor,
        a.applied_amount_minor,
        a.currency_code,
        a.status
      FROM commerce_transaction_adjustments a
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = a.commerce_transaction_id
     WHERE a.commerce_transaction_id = p_transaction_id
       AND c.source_channel = 'COUNTER_REDEMPTION'
       AND NOT a.is_deleted
       AND NOT c.is_deleted
     ORDER BY a.created_at, a.commerce_transaction_adjustment_id;
END;
$function$;


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
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_line_count integer;
    v_adjustment_count integer;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF c.status = 'ORDER_CREATED' THEN
        IF c.provider_order_id = p_provider_order_id
           AND c.subtotal_minor IS NOT DISTINCT FROM p_subtotal_minor
           AND c.adjustment_total_minor IS NOT DISTINCT FROM p_adjustment_total_minor
           AND c.tax_total_minor IS NOT DISTINCT FROM p_tax_total_minor
           AND c.total_minor IS NOT DISTINCT FROM p_total_minor
           AND c.currency_code IS NOT DISTINCT FROM p_currency_code THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION 'Provider order conflicts with persisted Commerce order'
            USING ERRCODE = '23505';
    END IF;

    IF c.status <> 'READY_FOR_PROVIDER' THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction is not ready for provider order'
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
       OR p_total_minor <> p_subtotal_minor - p_adjustment_total_minor + p_tax_total_minor THEN
        RAISE EXCEPTION 'Invalid Counter redemption provider order result'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_line_count
      FROM commerce_transaction_lines
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND NOT is_deleted;

    IF v_line_count = 0
       OR EXISTS (
            SELECT 1
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
               AND line_type <> 'EXTERNAL_PRODUCT'
       )
       OR (SELECT count(*) FROM jsonb_array_elements(p_line_prices)) <> v_line_count THEN
        RAISE EXCEPTION 'Counter redemption provider order lines are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_line_id, quantity
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
        ),
        supplied AS (
            SELECT *
              FROM jsonb_to_recordset(p_line_prices) AS x(
                  line_id varchar,
                  unit_price_minor bigint,
                  line_subtotal_minor bigint,
                  currency_code varchar,
                  price_source varchar
              )
        )
        SELECT 1
          FROM actual l
          FULL JOIN supplied x
            ON x.line_id = l.commerce_transaction_line_id
         WHERE l.commerce_transaction_line_id IS NULL
            OR x.line_id IS NULL
            OR x.unit_price_minor IS NULL
            OR x.unit_price_minor < 0
            OR x.line_subtotal_minor IS NULL
            OR x.line_subtotal_minor <> x.unit_price_minor * l.quantity
            OR x.currency_code IS DISTINCT FROM p_currency_code
            OR x.price_source IS DISTINCT FROM 'PROVIDER_FINAL'
    ) THEN
        RAISE EXCEPTION 'Counter redemption provider line values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(sum(x.line_subtotal_minor), 0)
          FROM jsonb_to_recordset(p_line_prices) AS x(
              line_id varchar,
              unit_price_minor bigint,
              line_subtotal_minor bigint,
              currency_code varchar,
              price_source varchar
          )
    ) IS DISTINCT FROM p_subtotal_minor THEN
        RAISE EXCEPTION 'Counter redemption provider subtotal is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_adjustment_count
      FROM commerce_transaction_adjustments
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND NOT is_deleted;

    IF (SELECT count(*) FROM jsonb_array_elements(p_adjustments)) <> v_adjustment_count THEN
        RAISE EXCEPTION 'Counter redemption provider adjustments are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_adjustment_id
              FROM commerce_transaction_adjustments
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
        ),
        supplied AS (
            SELECT *
              FROM jsonb_to_recordset(p_adjustments) AS x(
                  adjustment_id varchar,
                  applied_amount_minor bigint,
                  status varchar
              )
        )
        SELECT 1
          FROM actual a
          FULL JOIN supplied x
            ON x.adjustment_id = a.commerce_transaction_adjustment_id
         WHERE a.commerce_transaction_adjustment_id IS NULL
            OR x.adjustment_id IS NULL
            OR x.applied_amount_minor IS NULL
            OR x.applied_amount_minor < 0
            OR x.status IS DISTINCT FROM 'APPLIED'
    ) THEN
        RAISE EXCEPTION 'Counter redemption provider adjustment values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(sum(x.applied_amount_minor), 0)
          FROM jsonb_to_recordset(p_adjustments) AS x(
              adjustment_id varchar,
              applied_amount_minor bigint,
              status varchar
          )
    ) IS DISTINCT FROM p_adjustment_total_minor
       OR p_adjustment_total_minor > p_subtotal_minor THEN
        RAISE EXCEPTION 'Counter redemption provider discount total is invalid'
            USING ERRCODE = '22023';
    END IF;

    UPDATE commerce_transaction_lines l
       SET unit_price_minor_authoritative = x.unit_price_minor,
           line_subtotal_minor = x.line_subtotal_minor,
           currency_code = x.currency_code,
           price_source = x.price_source,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = l.version_no + 1
      FROM jsonb_to_recordset(p_line_prices) AS x(
          line_id varchar,
          unit_price_minor bigint,
          line_subtotal_minor bigint,
          currency_code varchar,
          price_source varchar
      )
     WHERE l.commerce_transaction_line_id = x.line_id
       AND l.commerce_transaction_id = c.commerce_transaction_id
       AND NOT l.is_deleted;

    UPDATE commerce_transaction_adjustments a
       SET applied_amount_minor = x.applied_amount_minor,
           status = 'APPLIED',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = a.version_no + 1
      FROM jsonb_to_recordset(p_adjustments) AS x(
          adjustment_id varchar,
          applied_amount_minor bigint,
          status varchar
      )
     WHERE a.commerce_transaction_adjustment_id = x.adjustment_id
       AND a.commerce_transaction_id = c.commerce_transaction_id
       AND NOT a.is_deleted;

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
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;


-- The Poynt provider needs the transaction-scoped credential/configuration for
-- both membership and redemption Counter checkouts. Generic Org Admin catalog
-- configuration remains admin protected.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "organizationId" varchar,
    "applicationId" varchar,
    "businessId" varchar,
    "providerStoreId" varchar,
    "secretReference" varchar,
    "merchantCurrencyCode" varchar,
    "storeId" varchar,
    "lastFullSyncAt" text,
    "lastIncrementalSyncAt" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        cfg.integration_configuration_id,
        cfg.organization_id,
        cfg.application_id,
        cfg.provider_business_id,
        cfg.provider_store_id,
        cfg.credential_secret_reference,
        cfg.merchant_currency_code,
        sync.store_id,
        sync.last_full_sync_at::text,
        sync.last_incremental_sync_at::text
      FROM commerce_transactions t
      JOIN commerce_provider_catalog_configurations cfg
        ON cfg.integration_configuration_id = t.integration_configuration_id
       AND cfg.organization_id = t.organization_id
       AND NOT cfg.is_deleted
      JOIN integration_configurations i
        ON i.integration_configuration_id = cfg.integration_configuration_id
       AND i.organization_id = cfg.organization_id
       AND upper(i.provider) = 'POYNT'
       AND NOT i.is_deleted
      LEFT JOIN commerce_catalog_sync_states sync
        ON sync.integration_configuration_id = cfg.integration_configuration_id
       AND (sync.store_id = t.store_id OR sync.store_id IS NULL)
     WHERE t.commerce_transaction_id = p_transaction_id
       AND t.source_channel IN ('COUNTER', 'COUNTER_REDEMPTION')
       AND NOT t.is_deleted
     ORDER BY CASE WHEN sync.store_id = t.store_id THEN 0 ELSE 1 END
     LIMIT 1;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_redemption_remote_terminal_payment(
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
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    a commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_reference_id), '') IS NULL
       OR length(p_reference_id) > 160 THEN
        RAISE EXCEPTION 'Invalid remote payment reference'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    SELECT *
      INTO a
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND payment_channel = 'REMOTE_TERMINAL'
       AND provider_status IN (
           'DISPATCHING',
           'DISPATCHED',
           'RECEIVED',
           'STARTED'
       )
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        IF c.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION 'Active remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
            true,
            c.integration_configuration_id,
            c.provider_order_id,
            c.total_minor,
            c.currency_code,
            a.provider_business_id,
            a.provider_store_id,
            a.provider_device_id,
            a.provider_reference_id;
        RETURN;
    END IF;

    IF c.status IS DISTINCT FROM 'ORDER_CREATED'
       OR c.integration_configuration_id IS NULL
       OR NULLIF(btrim(c.provider_order_id), '') IS NULL
       OR c.total_minor IS NULL
       OR c.total_minor <= 0
       OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction is not ready for remote payment'
            USING ERRCODE = '23505';
    END IF;

    SELECT
        b.poynt_business_id,
        b.poynt_store_id,
        b.poynt_terminal_id
      INTO
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
      FROM poynt_terminal_bindings b
      JOIN pos_devices d
        ON d.pos_device_id = b.pos_device_id
     WHERE b.pos_device_id = p_pos_device_id
       AND b.organization_id = c.organization_id
       AND b.store_id IS NOT DISTINCT FROM c.store_id
       AND NOT b.is_deleted
       AND NOT d.is_deleted
       AND d.revoked_at IS NULL;

    IF NOT FOUND
       OR NULLIF(btrim(a.provider_business_id), '') IS NULL
       OR NULLIF(btrim(a.provider_device_id), '') IS NULL THEN
        RAISE EXCEPTION 'Registered Poynt terminal is unavailable'
            USING ERRCODE = '22023';
    END IF;

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
        c.commerce_transaction_id,
        'DISPATCHING',
        c.total_minor,
        c.currency_code,
        v_actor,
        'REMOTE_TERMINAL',
        p_reference_id,
        p_pos_device_id,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
    );

    UPDATE commerce_transactions
       SET status = 'PROVIDER_IN_PROGRESS',
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN QUERY
    SELECT
        false,
        c.integration_configuration_id,
        c.provider_order_id,
        c.total_minor,
        c.currency_code,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id,
        p_reference_id;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_complete_counter_redemption_zero_value(
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
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF c.status = 'COMPLETED' THEN
        RETURN true;
    END IF;

    IF c.status = 'PROVIDER_SUCCEEDED' THEN
        RETURN commerce_finalize_counter_redemption_transaction(
            c.commerce_transaction_id,
            p_actor_user_id
        );
    END IF;

    IF c.status <> 'ORDER_CREATED'
       OR c.total_minor IS DISTINCT FROM 0
       OR NULLIF(btrim(c.provider_order_id), '') IS NULL THEN
        RAISE EXCEPTION 'Counter redemption transaction is not a zero-value provider order'
            USING ERRCODE = '23505';
    END IF;

    UPDATE commerce_transactions
       SET status = 'PROVIDER_SUCCEEDED',
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN commerce_finalize_counter_redemption_transaction(
        c.commerce_transaction_id,
        p_actor_user_id
    );
END;
$function$;


-- LOCAL/DEV TEST-provider confirmation. The server exposes this only when TEST
-- is enabled for the running environment. Client never supplies amount/currency.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_counter_redemption_test_result(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_provider_status varchar,
    p_provider_transaction_id varchar,
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
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_status varchar(32);
    v_provider_transaction_id varchar(160);
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF c.integration_configuration_id IS NOT NULL THEN
        RAISE EXCEPTION 'TEST provider is not configured for this transaction'
            USING ERRCODE = '22023';
    END IF;

    v_status := upper(btrim(p_provider_status));
    v_provider_transaction_id := NULLIF(btrim(p_provider_transaction_id), '');

    IF v_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
       OR (v_status = 'SUCCEEDED' AND v_provider_transaction_id IS NULL)
       OR length(COALESCE(p_failure_code, '')) > 80
       OR length(COALESCE(p_failure_message, '')) > 500 THEN
        RAISE EXCEPTION 'Invalid TEST payment result'
            USING ERRCODE = '22023';
    END IF;

    IF c.status = 'COMPLETED' AND v_status = 'SUCCEEDED' THEN
        RETURN true;
    END IF;

    IF c.status <> 'ORDER_CREATED'
       OR c.total_minor IS NULL
       OR c.total_minor <= 0
       OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Counter redemption transaction is not awaiting TEST payment'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        failure_code,
        failure_message,
        created_by,
        payment_channel
    ) VALUES (
        generate_runtime_id('CPA'),
        c.commerce_transaction_id,
        v_provider_transaction_id,
        v_status,
        c.total_minor,
        c.currency_code,
        NULLIF(btrim(p_failure_code), ''),
        NULLIF(btrim(p_failure_message), ''),
        v_actor,
        'TEST'
    );

    IF v_status = 'SUCCEEDED' THEN
        UPDATE commerce_transactions
           SET status = 'PROVIDER_SUCCEEDED',
               provider_transaction_id = v_provider_transaction_id,
               failure_code = NULL,
               failure_message = NULL,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor,
               version_no = version_no + 1
         WHERE commerce_transaction_id = c.commerce_transaction_id;

        RETURN commerce_finalize_counter_redemption_transaction(
            c.commerce_transaction_id,
            p_actor_user_id
        );
    END IF;

    UPDATE commerce_transactions
       SET status = 'ORDER_CREATED',
           provider_transaction_id = NULL,
           failure_code = COALESCE(
               NULLIF(btrim(p_failure_code), ''),
               v_status
           ),
           failure_message = NULLIF(btrim(p_failure_message), ''),
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;


-- Forward-fix migration 123 finalization authorization.
--
-- Migration 123 called the membership-only
-- commerce_counter_actor_organization_user(...) helper from a
-- COUNTER_REDEMPTION transaction. That helper deliberately accepts only
-- source_channel='COUNTER' with a correlated membership PaymentIntent.
--
-- Use the shared Counter checkout actor helper instead.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_redemption_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;

    v_actor varchar(64);
    v_success varchar(64);
    v_id varchar(64);
    v_number varchar(64);
    v_sequence bigint;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    IF c.status = 'COMPLETED' THEN
        RETURN true;
    END IF;

    IF c.status <> 'PROVIDER_SUCCEEDED' THEN
        RAISE EXCEPTION 'Counter redemption provider payment has not succeeded'
            USING ERRCODE = '23505';
    END IF;

    SELECT rt.*
      INTO t
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     FOR UPDATE OF rt;

    IF NOT FOUND OR t.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Pending redemption transaction is unavailable'
            USING ERRCODE = '23505';
    END IF;

    SELECT es.entity_status_id
      INTO v_success
      FROM entity_status es
      JOIN entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'REDEMPTION'
       AND st.status_code = 'SUCCESS'
       AND es.is_active;

    IF v_success IS NULL THEN
        RAISE EXCEPTION 'Successful redemption status is unavailable'
            USING ERRCODE = '23503';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        IF i.status = 'SUCCESS' THEN
            CONTINUE;
        END IF;

        IF i.status <> 'PENDING' THEN
            RAISE EXCEPTION 'Redemption transaction item is not pending'
                USING ERRCODE = '23505';
        END IF;

        IF i.item_type = 'BENEFIT' THEN
            v_id := generate_runtime_id('RDM');
            v_sequence := next_business_sequence(
                'REDEMPTION',
                t.subscription_id
            );

            SELECT (
                subscription_number
                || '_RDM_'
                || lpad(v_sequence::text, 3, '0')
            )::varchar(64)
              INTO v_number
              FROM subscriptions
             WHERE subscription_id = t.subscription_id;

            INSERT INTO redemptions (
                redemption_id,
                redemption_number,
                subscription_id,
                benefit_id,
                store_id,
                staff_id,
                redemption_status_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                v_number,
                t.subscription_id,
                i.benefit_id,
                c.store_id,
                t.staff_id,
                v_success,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSIF i.item_type = 'OFFER' THEN
            v_id := generate_runtime_id('ORD');

            INSERT INTO offer_redemptions (
                offer_redemption_id,
                redemption_transaction_id,
                redemption_transaction_item_id,
                organization_id,
                subscription_id,
                offer_id,
                store_id,
                staff_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                t.redemption_transaction_id,
                i.redemption_transaction_item_id,
                c.organization_id,
                t.subscription_id,
                i.offer_id,
                c.store_id,
                t.staff_id,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET offer_redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSE
            RAISE EXCEPTION 'Unsupported redemption transaction item type'
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    UPDATE redemption_transaction
       SET status = 'SUCCESS',
           store_id = c.store_id,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_id = t.redemption_transaction_id;

    UPDATE commerce_transactions
       SET status = 'COMPLETED',
           completed_at = CURRENT_TIMESTAMP,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;


-- Forward-fix migration 123's remote callback actor conversion.
--
-- commerce_transactions.created_by / updated_by store organization_user_id,
-- while the finalizer takes the authenticated global user_id.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_payment_by_reference(
    p_reference_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
    c commerce_transactions%ROWTYPE;
    v_actor_user_id varchar(64);
BEGIN
    SELECT *
      INTO a
      FROM commerce_provider_payment_attempts
     WHERE provider_reference_id = p_reference_id
       AND payment_channel = 'REMOTE_TERMINAL'
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = a.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF c.source_channel = 'COUNTER_REDEMPTION' THEN
        IF a.provider_status <> 'SUCCEEDED' THEN
            RETURN NULL;
        END IF;

        SELECT ou.user_id
          INTO v_actor_user_id
          FROM organization_user ou
         WHERE ou.organization_user_id =
               COALESCE(c.updated_by, c.created_by)
           AND ou.organization_id = c.organization_id
           AND NOT ou.is_deleted
         LIMIT 1;

        IF v_actor_user_id IS NULL THEN
            RAISE EXCEPTION 'Counter redemption actor is unavailable'
                USING ERRCODE = '42501';
        END IF;

        PERFORM commerce_finalize_counter_redemption_transaction(
            c.commerce_transaction_id,
            v_actor_user_id
        );

        RETURN c.commerce_transaction_id;
    END IF;

    IF c.source_channel = 'COUNTER' THEN
        RETURN commerce_finalize_counter_membership_payment_by_reference(
            p_reference_id
        );
    END IF;

    RETURN NULL;
END;
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_counter_checkout_actor_organization_user(varchar, varchar)
FROM PUBLIC, "${appRole}";

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_prepare_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_lines(varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_adjustments(varchar, varchar),
    "${schemaName}".commerce_persist_counter_redemption_provider_order(varchar, varchar, jsonb, jsonb, bigint, bigint, bigint, bigint, varchar, varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(varchar, varchar),
    "${schemaName}".commerce_begin_counter_redemption_remote_terminal_payment(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_complete_counter_redemption_zero_value(varchar, varchar, varchar),
    "${schemaName}".commerce_record_counter_redemption_test_result(varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_finalize_counter_redemption_transaction(varchar, varchar),
    "${schemaName}".commerce_finalize_counter_payment_by_reference(varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_prepare_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_checkout(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_lines(varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_adjustments(varchar, varchar),
    "${schemaName}".commerce_persist_counter_redemption_provider_order(varchar, varchar, jsonb, jsonb, bigint, bigint, bigint, bigint, varchar, varchar),
    "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(varchar, varchar),
    "${schemaName}".commerce_begin_counter_redemption_remote_terminal_payment(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_complete_counter_redemption_zero_value(varchar, varchar, varchar),
    "${schemaName}".commerce_record_counter_redemption_test_result(varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_finalize_counter_redemption_transaction(varchar, varchar),
    "${schemaName}".commerce_finalize_counter_payment_by_reference(varchar)
TO "${appRole}";

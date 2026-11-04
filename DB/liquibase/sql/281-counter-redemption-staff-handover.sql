-- Migration 281: Allow an authorized Counter operator to continue another
-- staff member's redemption at the SAME Store without reassigning its owner.
-- Seven complete, explicit CREATE OR REPLACE FUNCTION definitions copied
-- from checked-in migrations 135, 206, and 217, with only the indicated
-- handover authorization clauses changed. Original transaction staff, payment
-- attempts, remote references and financial safeguards remain intact.
-- No dynamic SQL, generated function definitions, new functions, triggers,
-- tables, or data backfill.


-- Function 1 of 7
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

    -- Keep the originating staff on the redemption for historical attribution.
    -- For financial actions, the authenticated actor must themselves be an
    -- active staff member assigned to this same Store. Do not authorize using
    -- an unrelated active staff row or the original staff member's identity.
    IF NOT FOUND
       OR c.store_id IS NULL
       OR r.store_id IS DISTINCT FROM c.store_id
       OR NOT EXISTS (
           SELECT 1
             FROM staff acting_staff
             JOIN organization_user acting_member
               ON acting_member.organization_user_id = acting_staff.organization_user_id
              AND acting_member.organization_id = c.organization_id
              AND acting_member.user_id = p_actor_user_id
              AND NOT acting_member.is_deleted
            WHERE acting_staff.organization_id = c.organization_id
              AND counter_can_operate(
                    c.organization_id,
                    c.store_id,
                    acting_staff.staff_id,
                    p_actor_user_id
                  )
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


-- Function 2 of 7
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

    -- A currently authorized operator may continue the same-Store checkout.
    -- Keep r.staff_id as the original staff attribution.

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


-- Function 3 of 7
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
       -- Original staff attribution is not a checkout access restriction.
     ORDER BY x.created_at
     LIMIT 1;
END;
$function$;


-- Function 4 of 7
CREATE OR REPLACE FUNCTION "${schemaName}".select_counter_redemption_item_product_mapping(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_item_id varchar,
    p_mapping_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_item redemption_transaction_item%ROWTYPE;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT item.*
      INTO v_item
      FROM redemption_transaction_item item
      JOIN redemption_transaction transaction_row
        ON transaction_row.redemption_transaction_id = item.redemption_transaction_id
     WHERE item.redemption_transaction_item_id = p_item_id
       AND item.redemption_transaction_id = p_transaction_id
       AND transaction_row.organization_id = p_organization_id
       AND transaction_row.status = 'PENDING'
       AND (transaction_row.store_id IS NULL OR transaction_row.store_id = p_store_id)
       -- Same-Store current staff authorization is checked above.
     FOR UPDATE OF item, transaction_row;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pending redemption item is unavailable' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM commerce_product_mappings mapping
         WHERE mapping.commerce_product_mapping_id = p_mapping_id
           AND mapping.organization_id = p_organization_id
           AND mapping.is_active
           AND NOT mapping.is_deleted
           AND (mapping.store_id = p_store_id OR mapping.store_id IS NULL)
           AND ((v_item.item_type = 'BENEFIT' AND EXISTS (
                SELECT 1 FROM benefit_product bp
                 WHERE bp.benefit_id = v_item.benefit_id
                   AND bp.organization_id = p_organization_id
                   AND bp.product_id = mapping.product_id
                   AND bp.is_active AND NOT bp.is_deleted
           )) OR (v_item.item_type = 'OFFER' AND EXISTS (
                SELECT 1 FROM offer_product op
                 WHERE op.offer_id = v_item.offer_id
                   AND op.organization_id = p_organization_id
                   AND op.product_id = mapping.product_id
                   AND op.is_active AND NOT op.is_deleted
           )))
    ) THEN
        RAISE EXCEPTION 'Selected POS product does not apply to redemption item' USING ERRCODE = '23503';
    END IF;

    UPDATE redemption_transaction_item
       SET commerce_product_mapping_id = p_mapping_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_item_id = p_item_id;

    RETURN true;
END;
$function$;


-- Function 5 of 7
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
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
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;
    c commerce_transactions%ROWTYPE;

    v_actor varchar(64);
    v_reason text;
    v_provider varchar(32);
    v_integration varchar(64);

    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
    v_line varchar(64);
    v_mapping_count integer;
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
      INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.store_id IS NOT NULL
       AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store'
            USING ERRCODE = '42501';
    END IF;

    -- The current staff may prepare this redemption at the same Store;
    -- keep t.staff_id unchanged as the originating staff.

    IF t.status <> 'PENDING'
       OR (
            t.expires_at IS NOT NULL
            AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
       ) THEN
        RAISE EXCEPTION 'Redemption transaction cannot be prepared'
            USING ERRCODE = '23505';
    END IF;

    SELECT organization_user_id
      INTO v_actor
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     ORDER BY organization_user_id
     LIMIT 1;

    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        v_reason :=
            CASE
                WHEN i.item_type = 'BENEFIT' THEN
                    counter_benefit_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.benefit_id
                    )
                ELSE
                    counter_offer_rejection(
                        p_organization_id,
                        t.subscription_id,
                        i.offer_id,
                        p_store_id
                    )
            END;

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    SELECT c0.*
      INTO c
      FROM commerce_transaction_redemptions x
      JOIN commerce_transactions c0
        ON c0.commerce_transaction_id = x.commerce_transaction_id
     WHERE x.redemption_transaction_id = t.redemption_transaction_id
       AND NOT x.is_deleted
       AND NOT c0.is_deleted
     FOR UPDATE OF c0;

    IF FOUND THEN
        RETURN QUERY
        SELECT
            c.commerce_transaction_id,
            NULL::varchar,
            c.integration_configuration_id,
            c.status;
        RETURN;
    END IF;

    SELECT
        r.provider_code,
        r.integration_configuration_id
      INTO
        v_provider,
        v_integration
      FROM commerce_payment_provider_routes r
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = r.integration_configuration_id
       AND ic.organization_id = r.organization_id
       AND NOT ic.is_deleted
      LEFT JOIN entity_status ies
        ON ies.entity_status_id = ic.integration_status_id
      LEFT JOIN statuses ist
        ON ist.status_id = ies.status_id
     WHERE r.organization_id = p_organization_id
       AND r.source_channel = 'COUNTER'
       AND r.is_enabled
       AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
       AND r.provider_code IN ('TEST', 'POYNT')
       AND (
            r.provider_code = 'TEST'
            OR (
                ic.integration_configuration_id IS NOT NULL
                AND upper(ic.provider) = r.provider_code
                AND ies.is_active
                AND ist.status_code = 'ACTIVE'
            )
       )
     ORDER BY
        CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
        r.commerce_payment_provider_route_id
     LIMIT 1;

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured'
            USING ERRCODE = '22023';
    END IF;

    c.commerce_transaction_id := generate_runtime_id('CTX');

    INSERT INTO commerce_transactions (
        commerce_transaction_id,
        organization_id,
        store_id,
        customer_user_id,
        subscription_id,
        integration_configuration_id,
        source_channel,
        status,
        idempotency_key,
        created_by,
        updated_by
    )
    VALUES (
        c.commerce_transaction_id,
        p_organization_id,
        p_store_id,
        (
            SELECT ou.user_id
              FROM subscriptions sub
              JOIN organization_user ou
                ON ou.organization_user_id = sub.organization_user_id
             WHERE sub.subscription_id = t.subscription_id
        ),
        t.subscription_id,
        v_integration,
        'COUNTER_REDEMPTION',
        'DRAFT',
        ('COUNTER_REDEMPTION:' || t.redemption_transaction_id)::varchar(128),
        v_actor,
        v_actor
    );

    INSERT INTO commerce_transaction_redemptions (
        commerce_transaction_redemption_id,
        commerce_transaction_id,
        redemption_transaction_id,
        created_by,
        updated_by
    )
    VALUES (
        generate_runtime_id('CTR'),
        c.commerce_transaction_id,
        t.redemption_transaction_id,
        v_actor,
        v_actor
    );

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         ORDER BY created_at, redemption_transaction_item_id
    LOOP
        a := NULL;
        m := NULL;

        IF i.item_type = 'BENEFIT' THEN
            SELECT ca.*
              INTO a
              FROM benefit_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.benefit_id = i.benefit_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        ELSE
            SELECT ca.*
              INTO a
              FROM offer_commerce_adjustments x
              JOIN commerce_adjustments ca
                ON ca.commerce_adjustment_id = x.commerce_adjustment_id
             WHERE x.organization_id = p_organization_id
               AND x.offer_id = i.offer_id
               AND NOT x.is_deleted
               AND NOT ca.is_deleted
               AND ca.is_active
               AND ca.adjustment_type IN (
                    'PRODUCT_FREE',
                    'PRODUCT_PERCENT_OFF',
                    'PRODUCT_FIXED_OFF',
                    'PRODUCT_SPECIAL_PRICE'
               );
        END IF;

        IF a.commerce_adjustment_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product adjustment', lower(i.item_type)
                USING ERRCODE = '23503';
        END IF;

        /* Canonical Benefit/Offer associations determine eligibility. */
        IF i.commerce_product_mapping_id IS NOT NULL THEN
            SELECT pm.*
              INTO m
              FROM commerce_product_mappings pm
             WHERE pm.commerce_product_mapping_id = i.commerce_product_mapping_id
               AND pm.organization_id = p_organization_id
               AND pm.is_active AND NOT pm.is_deleted
               AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
               AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
               AND ((i.item_type = 'BENEFIT' AND EXISTS (
                    SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                     AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                     AND bp.is_active AND NOT bp.is_deleted
               )) OR (i.item_type = 'OFFER' AND EXISTS (
                    SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                     AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                     AND op.is_active AND NOT op.is_deleted
               )));
            IF m.commerce_product_mapping_id IS NULL THEN
                RAISE EXCEPTION 'Selected POS product is not eligible for this redemption checkout context' USING ERRCODE = '23503';
            END IF;
        ELSE
            WITH eligible_mappings AS (
                SELECT pm.*
                  FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                         AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                         AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                         AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                         AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred_mappings AS (
                SELECT * FROM eligible_mappings exact_mapping WHERE exact_mapping.store_id = p_store_id
                UNION ALL
                SELECT * FROM eligible_mappings organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM eligible_mappings exact_mapping
                         WHERE exact_mapping.store_id = p_store_id
                           AND exact_mapping.product_id = organization_mapping.product_id
                           AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT count(*) INTO v_mapping_count FROM preferred_mappings;

            IF v_mapping_count = 0 THEN
                RAISE EXCEPTION 'No active POS mapping is configured for the eligible canonical Product' USING ERRCODE = '23503';
            ELSIF v_mapping_count > 1 THEN
                RAISE EXCEPTION 'Select a POS product for this redemption; multiple eligible mappings are configured' USING ERRCODE = '22023';
            END IF;

            WITH eligible_mappings AS (
                SELECT pm.*
                  FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                         AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                         AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                         AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                         AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred_mappings AS (
                SELECT * FROM eligible_mappings exact_mapping WHERE exact_mapping.store_id = p_store_id
                UNION ALL
                SELECT * FROM eligible_mappings organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM eligible_mappings exact_mapping
                         WHERE exact_mapping.store_id = p_store_id
                           AND exact_mapping.product_id = organization_mapping.product_id
                           AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT * INTO m FROM preferred_mappings;

            UPDATE redemption_transaction_item
               SET commerce_product_mapping_id = m.commerce_product_mapping_id,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id = i.redemption_transaction_item_id;
        END IF;

        SELECT
            product_name,
            currency_code,
            unit_price_minor_snapshot
          INTO s
          FROM commerce_product_snapshots
         WHERE organization_id = p_organization_id
           AND integration_configuration_id = m.integration_configuration_id
           AND COALESCE(store_id, '') = COALESCE(m.store_id, '')
           AND external_product_id = m.external_product_id
           AND COALESCE(external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND is_active
           AND NOT is_deleted
         ORDER BY last_synced_at DESC
         LIMIT 1;

        IF s.product_name IS NULL THEN
            RAISE EXCEPTION 'Selected POS product has no active catalog snapshot'
                USING ERRCODE = '23503';
        END IF;

        v_line := generate_runtime_id('CTL');

        INSERT INTO commerce_transaction_lines (
            commerce_transaction_line_id,
            commerce_transaction_id,
            line_type,
            source_entity_type,
            source_entity_id,
            commerce_product_mapping_id,
            external_product_id,
            external_variant_id,
            description,
            quantity,
            unit_price_minor_snapshot,
            currency_code,
            price_source,
            created_by,
            updated_by
        )
        VALUES (
            v_line,
            c.commerce_transaction_id,
            'EXTERNAL_PRODUCT',
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            m.commerce_product_mapping_id,
            m.external_product_id,
            m.external_variant_id,
            s.product_name,
            1,
            s.unit_price_minor_snapshot,
            s.currency_code,
            'PROVIDER_FINAL',
            v_actor,
            v_actor
        );

        INSERT INTO commerce_transaction_adjustments (
            commerce_transaction_adjustment_id,
            commerce_transaction_id,
            target_line_id,
            commerce_adjustment_id,
            source_type,
            source_id,
            adjustment_type,
            percentage,
            requested_amount_minor,
            currency_code,
            created_by,
            updated_by
        )
        VALUES (
            generate_runtime_id('CTA'),
            c.commerce_transaction_id,
            v_line,
            a.commerce_adjustment_id,
            i.item_type,
            COALESCE(i.benefit_id, i.offer_id),
            a.adjustment_type,
            a.percentage,
            a.amount_minor,
            a.currency_code,
            v_actor,
            v_actor
        );
    END LOOP;

    UPDATE commerce_transactions
       SET status = 'READY_FOR_PROVIDER',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN QUERY
    SELECT
        c.commerce_transaction_id,
        v_provider,
        v_integration,
        'READY_FOR_PROVIDER'::varchar;
END;
$function$;


-- Function 6 of 7
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_review_counter_redemption_checkout(
    p_transaction_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionTransactionId" varchar,
    "transactionNumber" varchar,
    "redemptionVersionNo" integer,
    "expiresAt" text,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    "redemptionItemId" varchar,
    "redemptionItemVersionNo" integer,
    "itemType" varchar,
    "benefitId" varchar,
    "offerId" varchar,
    "commerceProductMappingId" varchar,
    "mappingVersionNo" integer,
    "canonicalProductId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "quantity" integer,
    "snapshotProductName" varchar,
    "snapshotUnitPriceMinor" bigint,
    "snapshotCurrencyCode" varchar,
    "commerceAdjustmentId" varchar,
    "adjustmentVersionNo" integer,
    "adjustmentType" varchar,
    "percentage" numeric,
    "amountMinor" bigint,
    "adjustmentCurrencyCode" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;
    a commerce_adjustments%ROWTYPE;
    m commerce_product_mappings%ROWTYPE;
    s record;
    v_reason text;
    v_provider varchar(32);
    v_integration varchar(64);
    v_mapping_count integer;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t
      FROM redemption_transaction
     WHERE redemption_transaction_id = p_transaction_id
       AND organization_id = p_organization_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE = 'P0002';
    END IF;
    IF t.store_id IS NOT NULL AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store' USING ERRCODE = '42501';
    END IF;
    -- The original staff does not restrict an authorized same-Store review.
    IF t.status <> 'PENDING' OR (t.expires_at IS NOT NULL AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
        RAISE EXCEPTION 'Redemption transaction cannot be reviewed' USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM commerce_transaction_redemptions x
          JOIN commerce_transactions c ON c.commerce_transaction_id = x.commerce_transaction_id
         WHERE x.redemption_transaction_id = t.redemption_transaction_id
           AND NOT x.is_deleted
           AND NOT c.is_deleted
    ) THEN
        RAISE EXCEPTION 'Redemption checkout has already started' USING ERRCODE = '23505';
    END IF;

    SELECT r.provider_code, r.integration_configuration_id
      INTO v_provider, v_integration
      FROM commerce_payment_provider_routes r
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = r.integration_configuration_id
       AND ic.organization_id = r.organization_id
       AND NOT ic.is_deleted
      LEFT JOIN entity_status ies ON ies.entity_status_id = ic.integration_status_id
      LEFT JOIN statuses ist ON ist.status_id = ies.status_id
     WHERE r.organization_id = p_organization_id
       AND r.source_channel = 'COUNTER'
       AND r.is_enabled
       AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
       AND r.provider_code IN ('TEST', 'POYNT')
       AND (r.provider_code = 'TEST' OR (
            ic.integration_configuration_id IS NOT NULL
            AND upper(ic.provider) = r.provider_code
            AND ies.is_active
            AND ist.status_code = 'ACTIVE'
       ))
     ORDER BY CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
              r.commerce_payment_provider_route_id
     LIMIT 1;
    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'No Counter payment provider is configured' USING ERRCODE = '22023';
    END IF;

    FOR i IN
        SELECT * FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         ORDER BY created_at, redemption_transaction_item_id
    LOOP
        v_reason := CASE WHEN i.item_type = 'BENEFIT'
            THEN counter_benefit_rejection(p_organization_id, t.subscription_id, i.benefit_id)
            ELSE counter_offer_rejection(p_organization_id, t.subscription_id, i.offer_id, p_store_id)
        END;
        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505';
        END IF;

        SELECT ca.* INTO a
          FROM (SELECT bca.commerce_adjustment_id FROM benefit_commerce_adjustments bca
                 WHERE i.item_type = 'BENEFIT' AND bca.organization_id = p_organization_id
                   AND bca.benefit_id = i.benefit_id AND NOT bca.is_deleted
                UNION ALL
                SELECT oca.commerce_adjustment_id FROM offer_commerce_adjustments oca
                 WHERE i.item_type = 'OFFER' AND oca.organization_id = p_organization_id
                   AND oca.offer_id = i.offer_id AND NOT oca.is_deleted) link
          JOIN commerce_adjustments ca ON ca.commerce_adjustment_id = link.commerce_adjustment_id
         WHERE NOT ca.is_deleted AND ca.is_active
           AND ca.adjustment_type IN ('PRODUCT_FREE', 'PRODUCT_PERCENT_OFF', 'PRODUCT_FIXED_OFF', 'PRODUCT_SPECIAL_PRICE');
        IF a.commerce_adjustment_id IS NULL THEN
            RAISE EXCEPTION 'Selected % has no active POS product adjustment', lower(i.item_type) USING ERRCODE = '23503';
        END IF;

        IF i.commerce_product_mapping_id IS NOT NULL THEN
            SELECT pm.* INTO m
              FROM commerce_product_mappings pm
             WHERE pm.commerce_product_mapping_id = i.commerce_product_mapping_id
               AND pm.organization_id = p_organization_id
               AND pm.is_active AND NOT pm.is_deleted
               AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
               AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
               AND ((i.item_type = 'BENEFIT' AND EXISTS (
                    SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                      AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                      AND bp.is_active AND NOT bp.is_deleted
               )) OR (i.item_type = 'OFFER' AND EXISTS (
                    SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                      AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                      AND op.is_active AND NOT op.is_deleted
               )));
        ELSE
            WITH eligible AS (
                SELECT pm.* FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                          AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                          AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                          AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                          AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred AS (
                SELECT * FROM eligible WHERE store_id = p_store_id
                UNION ALL
                SELECT organization_mapping.* FROM eligible organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM eligible exact_mapping
                      WHERE exact_mapping.store_id = p_store_id
                        AND exact_mapping.product_id = organization_mapping.product_id
                        AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT count(*) INTO v_mapping_count FROM preferred;
            IF v_mapping_count = 0 THEN
                RAISE EXCEPTION 'No active POS mapping is configured for the eligible canonical Product' USING ERRCODE = '23503';
            ELSIF v_mapping_count > 1 THEN
                RAISE EXCEPTION 'Select a POS product for this redemption; multiple eligible mappings are configured' USING ERRCODE = '22023';
            END IF;
            WITH eligible AS (
                SELECT pm.* FROM commerce_product_mappings pm
                 WHERE pm.organization_id = p_organization_id
                   AND pm.is_active AND NOT pm.is_deleted
                   AND (v_integration IS NULL OR pm.integration_configuration_id = v_integration)
                   AND (pm.store_id = p_store_id OR pm.store_id IS NULL)
                   AND ((i.item_type = 'BENEFIT' AND EXISTS (
                        SELECT 1 FROM benefit_product bp WHERE bp.benefit_id = i.benefit_id
                          AND bp.organization_id = p_organization_id AND bp.product_id = pm.product_id
                          AND bp.is_active AND NOT bp.is_deleted
                   )) OR (i.item_type = 'OFFER' AND EXISTS (
                        SELECT 1 FROM offer_product op WHERE op.offer_id = i.offer_id
                          AND op.organization_id = p_organization_id AND op.product_id = pm.product_id
                          AND op.is_active AND NOT op.is_deleted
                   )))
            ), preferred AS (
                SELECT * FROM eligible WHERE store_id = p_store_id
                UNION ALL
                SELECT organization_mapping.* FROM eligible organization_mapping
                 WHERE organization_mapping.store_id IS NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM eligible exact_mapping
                      WHERE exact_mapping.store_id = p_store_id
                        AND exact_mapping.product_id = organization_mapping.product_id
                        AND exact_mapping.integration_configuration_id IS NOT DISTINCT FROM organization_mapping.integration_configuration_id
                   )
            )
            SELECT * INTO m FROM preferred;
        END IF;
        IF m.commerce_product_mapping_id IS NULL THEN
            RAISE EXCEPTION 'Selected POS product is not eligible for this redemption checkout context' USING ERRCODE = '23503';
        END IF;

        SELECT product_name, unit_price_minor_snapshot, currency_code INTO s
          FROM commerce_product_snapshots
         WHERE organization_id = p_organization_id
           AND integration_configuration_id = m.integration_configuration_id
           AND COALESCE(store_id, '') = COALESCE(m.store_id, '')
           AND external_product_id = m.external_product_id
           AND COALESCE(external_variant_id, '') = COALESCE(m.external_variant_id, '')
           AND is_active AND NOT is_deleted
         ORDER BY last_synced_at DESC
         LIMIT 1;
        IF s.product_name IS NULL THEN
            RAISE EXCEPTION 'Selected POS product has no active catalog snapshot' USING ERRCODE = '23503';
        END IF;

        RETURN QUERY SELECT t.redemption_transaction_id, t.redemption_transaction_number, t.version_no,
            t.expires_at::text, v_provider, v_integration, i.redemption_transaction_item_id, i.version_no,
            i.item_type, i.benefit_id, i.offer_id, m.commerce_product_mapping_id, m.version_no,
            m.product_id, m.external_product_id, m.external_variant_id, 1, s.product_name,
            s.unit_price_minor_snapshot, s.currency_code, a.commerce_adjustment_id, a.version_no,
            a.adjustment_type, a.percentage, a.amount_minor, a.currency_code;
    END LOOP;
END;
$function$;


-- Function 7 of 7
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_redemption_review(
    p_organization_id varchar,
    p_redemption_transaction_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar, "organizationId" varchar, "applicationId" varchar,
    "businessId" varchar, "providerStoreId" varchar, "secretReference" varchar,
    "merchantCurrencyCode" varchar, "storeId" varchar, "lastFullSyncAt" text,
    "lastIncrementalSyncAt" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE t redemption_transaction%ROWTYPE;
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO t FROM redemption_transaction
     WHERE redemption_transaction_id = p_redemption_transaction_id AND organization_id = p_organization_id;
    IF NOT FOUND OR (t.store_id IS NOT NULL AND t.store_id IS DISTINCT FROM p_store_id)
       -- Same-Store operator authorization is checked via counter_can_operate.
       OR t.status <> 'PENDING' OR (t.expires_at IS NOT NULL AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
        RAISE EXCEPTION 'Counter redemption review is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT cfg.integration_configuration_id, cfg.organization_id, cfg.application_id,
           cfg.provider_business_id, cfg.provider_store_id, cfg.credential_secret_reference,
           cfg.merchant_currency_code, sync.store_id, sync.last_full_sync_at::text, sync.last_incremental_sync_at::text
      FROM commerce_payment_provider_routes r
      JOIN commerce_provider_catalog_configurations cfg
        ON cfg.integration_configuration_id = r.integration_configuration_id
       AND cfg.organization_id = r.organization_id AND NOT cfg.is_deleted
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = cfg.integration_configuration_id
       AND ic.organization_id = cfg.organization_id AND upper(ic.provider) = 'POYNT' AND NOT ic.is_deleted
      LEFT JOIN commerce_catalog_sync_states sync
        ON sync.integration_configuration_id = cfg.integration_configuration_id
       AND (sync.store_id = p_store_id OR sync.store_id IS NULL)
     WHERE r.organization_id = p_organization_id AND r.source_channel = 'COUNTER'
       AND r.provider_code = 'POYNT' AND r.is_enabled AND NOT r.is_deleted
       AND (r.store_id = p_store_id OR r.store_id IS NULL)
     ORDER BY CASE WHEN r.store_id = p_store_id THEN 0 ELSE 1 END,
              CASE WHEN sync.store_id = p_store_id THEN 0 ELSE 1 END
     LIMIT 1;
END;
$function$;

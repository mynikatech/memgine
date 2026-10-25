-- Canonical Benefit/Offer Product eligibility is independent of POS mapping
-- availability. POS mappings remain contextual checkout infrastructure.

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_applicability_internal(
    p_entity_type varchar,
    p_organization_id varchar,
    p_entity_id varchar,
    p_adjustment_type varchar,
    p_percentage numeric,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_active boolean,
    p_mapping_ids varchar[],
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_adjustment_id varchar(64);
    v_mapping_id varchar(64);
    v_requires_product boolean := p_adjustment_type IN (
        'PRODUCT_FREE',
        'PRODUCT_PERCENT_OFF',
        'PRODUCT_FIXED_OFF',
        'PRODUCT_SPECIAL_PRICE'
    );
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    IF p_entity_type = 'BENEFIT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM benefits
             WHERE benefit_id = p_entity_id
               AND organization_id = p_organization_id
               AND NOT is_deleted
        ) THEN
            RAISE EXCEPTION 'Benefit is not in organization' USING ERRCODE = '23503';
        END IF;
        SELECT link.commerce_adjustment_id
          INTO v_adjustment_id
          FROM benefit_commerce_adjustments link
         WHERE link.organization_id = p_organization_id
           AND link.benefit_id = p_entity_id
           AND NOT link.is_deleted
         FOR UPDATE;
    ELSIF p_entity_type = 'OFFER' THEN
        IF NOT EXISTS (
            SELECT 1 FROM offer
             WHERE offer_id = p_entity_id
               AND organization_id = p_organization_id
               AND NOT is_deleted
        ) THEN
            RAISE EXCEPTION 'Offer is not in organization' USING ERRCODE = '23503';
        END IF;
        SELECT link.commerce_adjustment_id
          INTO v_adjustment_id
          FROM offer_commerce_adjustments link
         WHERE link.organization_id = p_organization_id
           AND link.offer_id = p_entity_id
           AND NOT link.is_deleted
         FOR UPDATE;
    ELSE
        RAISE EXCEPTION 'Invalid commerce applicability entity' USING ERRCODE = '22023';
    END IF;

    IF p_adjustment_type NOT IN (
        'PRODUCT_FREE',
        'PRODUCT_PERCENT_OFF',
        'PRODUCT_FIXED_OFF',
        'PRODUCT_SPECIAL_PRICE',
        'ORDER_PERCENT_OFF',
        'ORDER_FIXED_OFF'
    )
       OR (NOT v_requires_product AND COALESCE(cardinality(p_mapping_ids), 0) <> 0) THEN
        RAISE EXCEPTION 'Invalid commerce adjustment mapping' USING ERRCODE = '22023';
    END IF;

    IF (p_adjustment_type IN ('PRODUCT_PERCENT_OFF', 'ORDER_PERCENT_OFF')
            AND (p_percentage IS NULL OR p_percentage <= 0 OR p_percentage > 100
                 OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL))
       OR (p_adjustment_type IN ('PRODUCT_FIXED_OFF', 'PRODUCT_SPECIAL_PRICE', 'ORDER_FIXED_OFF')
            AND (p_percentage IS NOT NULL OR p_amount_minor IS NULL OR p_amount_minor < 0
                 OR p_currency_code !~ '^[A-Z]{3}$'))
       OR (p_adjustment_type = 'PRODUCT_FREE'
            AND (p_percentage IS NOT NULL OR p_amount_minor IS NOT NULL OR p_currency_code IS NOT NULL)) THEN
        RAISE EXCEPTION 'Invalid commerce adjustment value' USING ERRCODE = '22023';
    END IF;

    IF p_mapping_ids IS NOT NULL AND (
        cardinality(p_mapping_ids) <> (
            SELECT count(DISTINCT selected_mapping.mapping_id)
              FROM unnest(p_mapping_ids) AS selected_mapping(mapping_id)
        )
        OR EXISTS (
            SELECT 1
              FROM unnest(p_mapping_ids) AS selected_mapping(mapping_id)
              LEFT JOIN commerce_product_mappings mapping
                ON mapping.commerce_product_mapping_id = selected_mapping.mapping_id
               AND mapping.organization_id = p_organization_id
               AND mapping.is_active
               AND NOT mapping.is_deleted
              LEFT JOIN product
                ON product.product_id = mapping.product_id
               AND product.organization_id = p_organization_id
               AND NOT product.is_deleted
             WHERE mapping.commerce_product_mapping_id IS NULL
                OR mapping.product_id IS NULL
                OR product.product_id IS NULL
        )
    ) THEN
        RAISE EXCEPTION 'Commerce product mapping is not an active canonical Product mapping'
            USING ERRCODE = '23503';
    END IF;

    IF v_requires_product
       AND COALESCE(p_active, true)
       AND COALESCE(cardinality(p_mapping_ids), 0) = 0
       AND NOT EXISTS (
            SELECT 1
              FROM (
                    SELECT bp.product_id
                      FROM benefit_product bp
                     WHERE p_entity_type = 'BENEFIT'
                       AND bp.benefit_id = p_entity_id
                       AND bp.organization_id = p_organization_id
                       AND bp.is_active
                       AND NOT bp.is_deleted
                    UNION ALL
                    SELECT op.product_id
                      FROM offer_product op
                     WHERE p_entity_type = 'OFFER'
                       AND op.offer_id = p_entity_id
                       AND op.organization_id = p_organization_id
                       AND op.is_active
                       AND NOT op.is_deleted
                   ) canonical_products
       ) THEN
        RAISE EXCEPTION 'Active product adjustment requires canonical Product eligibility'
            USING ERRCODE = '23503';
    END IF;

    IF v_requires_product
       AND COALESCE(cardinality(p_mapping_ids), 0) > 0
       AND EXISTS (
            SELECT 1
              FROM unnest(p_mapping_ids) selected_mapping(mapping_id)
              JOIN commerce_product_mappings mapping
                ON mapping.commerce_product_mapping_id = selected_mapping.mapping_id
             WHERE NOT (
                (p_entity_type = 'BENEFIT' AND EXISTS (
                    SELECT 1 FROM benefit_product bp
                     WHERE bp.benefit_id = p_entity_id
                       AND bp.organization_id = p_organization_id
                       AND bp.product_id = mapping.product_id
                       AND bp.is_active AND NOT bp.is_deleted
                )) OR
                (p_entity_type = 'OFFER' AND EXISTS (
                    SELECT 1 FROM offer_product op
                     WHERE op.offer_id = p_entity_id
                       AND op.organization_id = p_organization_id
                       AND op.product_id = mapping.product_id
                       AND op.is_active AND NOT op.is_deleted
                ))
             )
       ) THEN
        RAISE EXCEPTION 'Commerce product mapping is not eligible for the canonical Product association'
            USING ERRCODE = '23503';
    END IF;

    IF v_adjustment_id IS NULL THEN
        v_adjustment_id := generate_runtime_id('CMA');
        INSERT INTO commerce_adjustments (
            commerce_adjustment_id,
            organization_id,
            adjustment_type,
            percentage,
            amount_minor,
            currency_code,
            is_active,
            created_by,
            updated_by
        ) VALUES (
            v_adjustment_id,
            p_organization_id,
            p_adjustment_type,
            p_percentage,
            p_amount_minor,
            upper(p_currency_code),
            COALESCE(p_active, true),
            v_actor_organization_user_id,
            v_actor_organization_user_id
        );

        IF p_entity_type = 'BENEFIT' THEN
            INSERT INTO benefit_commerce_adjustments (
                benefit_commerce_adjustment_id,
                organization_id,
                benefit_id,
                commerce_adjustment_id,
                created_by,
                updated_by
            ) VALUES (
                generate_runtime_id('BCA'),
                p_organization_id,
                p_entity_id,
                v_adjustment_id,
                v_actor_organization_user_id,
                v_actor_organization_user_id
            );
        ELSE
            INSERT INTO offer_commerce_adjustments (
                offer_commerce_adjustment_id,
                organization_id,
                offer_id,
                commerce_adjustment_id,
                created_by,
                updated_by
            ) VALUES (
                generate_runtime_id('OCA'),
                p_organization_id,
                p_entity_id,
                v_adjustment_id,
                v_actor_organization_user_id,
                v_actor_organization_user_id
            );
        END IF;
    ELSE
        UPDATE commerce_adjustments
           SET adjustment_type = p_adjustment_type,
               percentage = p_percentage,
               amount_minor = p_amount_minor,
               currency_code = upper(p_currency_code),
               is_active = COALESCE(p_active, true),
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_adjustment_id = v_adjustment_id;

        UPDATE commerce_adjustment_product_mappings
           SET is_deleted = true,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_adjustment_id = v_adjustment_id
           AND NOT is_deleted;
    END IF;

    FOREACH v_mapping_id IN ARRAY COALESCE(p_mapping_ids, ARRAY[]::varchar[])
    LOOP
        INSERT INTO commerce_adjustment_product_mappings (
            commerce_adjustment_product_mapping_id,
            commerce_adjustment_id,
            commerce_product_mapping_id,
            created_by,
            updated_by
        ) VALUES (
            generate_runtime_id('CAP'),
            v_adjustment_id,
            v_mapping_id,
            v_actor_organization_user_id,
            v_actor_organization_user_id
        );
    END LOOP;

    RETURN v_adjustment_id;
END;
$function$;

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
       AND (transaction_row.staff_id IS NULL OR transaction_row.staff_id = p_staff_id)
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

    IF t.staff_id IS NOT NULL
       AND t.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context'
            USING ERRCODE = '42501';
    END IF;

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
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_apply_catalog_sync_preview(
  p_organization_id varchar,p_preview_id varchar,p_idempotency_key varchar,p_actor_user_id varchar
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
  v_actor varchar(64); v_preview commerce_catalog_sync_previews%ROWTYPE; r commerce_catalog_sync_preview_rows%ROWTYPE;
  v_product varchar(64); v_mapping varchar(64); v_count integer:=0; v_created integer:=0; v_mapped integer:=0;
BEGIN
  v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
  IF NULLIF(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>160 THEN RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_preview FROM commerce_catalog_sync_previews
   WHERE catalog_sync_preview_id=p_preview_id AND organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog preview was not found' USING ERRCODE='23503'; END IF;
  IF v_preview.status='APPLIED' THEN
    IF v_preview.apply_idempotency_key=p_idempotency_key THEN RETURN v_preview.apply_result; END IF;
    RAISE EXCEPTION 'Catalog preview was already applied' USING ERRCODE='23505';
  END IF;
  IF v_preview.expires_at <= CURRENT_TIMESTAMP THEN
    -- Do not update status here: the exception below rolls back this function's
    -- transaction. Expiry is derived authoritatively from expires_at on every
    -- apply attempt until a caller creates a replacement preview.
    RAISE EXCEPTION 'Catalog preview has expired; generate a new preview' USING ERRCODE='22023';
  END IF;
  IF v_preview.status <> 'READY' THEN RAISE EXCEPTION 'Catalog preview is unavailable' USING ERRCODE='40001'; END IF;
  IF NOT EXISTS (SELECT 1 FROM integration_configurations i WHERE i.integration_configuration_id=v_preview.integration_configuration_id AND i.organization_id=p_organization_id AND NOT i.is_deleted)
     OR NOT EXISTS (SELECT 1 FROM product_catalog c WHERE c.product_catalog_id=v_preview.product_catalog_id AND c.organization_id=p_organization_id AND c.is_active AND NOT c.is_deleted AND (c.integration_configuration_id IS NULL OR c.integration_configuration_id=v_preview.integration_configuration_id)) THEN
    RAISE EXCEPTION 'Catalog or integration changed since preview; regenerate preview' USING ERRCODE='40001';
  END IF;
  IF v_preview.store_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM stores
     WHERE store_id=v_preview.store_id AND organization_id=p_organization_id AND NOT is_deleted
  ) THEN
    RAISE EXCEPTION 'Store changed since preview; regenerate preview' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM commerce_catalog_sync_preview_rows WHERE catalog_sync_preview_id=p_preview_id AND proposed_action IN ('CONFLICT','INVALID')) THEN
    RAISE EXCEPTION 'Catalog preview has unresolved conflicts or invalid records' USING ERRCODE='23505';
  END IF;
  FOR r IN SELECT * FROM commerce_catalog_sync_preview_rows WHERE catalog_sync_preview_id=p_preview_id AND eligible_for_apply ORDER BY row_number FOR UPDATE LOOP
    IF r.proposed_action NOT IN ('NEW','MATCHED','UPDATE','UNCHANGED') OR NOT r.active THEN CONTINUE; END IF;
    IF r.canonical_product_id IS NOT NULL THEN
      SELECT product_id INTO v_product FROM product WHERE product_id=r.canonical_product_id AND organization_id=p_organization_id AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR (r.canonical_product_version_no IS NOT NULL AND (SELECT version_no FROM product WHERE product_id=v_product)<>r.canonical_product_version_no) THEN
        RAISE EXCEPTION 'Canonical product changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
    ELSE
      IF r.proposed_action <> 'NEW' THEN RAISE EXCEPTION 'Preview contains an unsafe product mapping' USING ERRCODE='23505'; END IF;
      v_product:=generate_runtime_id('PRD');
      INSERT INTO product(product_id,organization_id,product_code,product_name,description,status_id,product_catalog_id,sku,base_price_minor,currency_code,created_by,updated_by)
      VALUES(v_product,p_organization_id,'POS-' || upper(substr(md5(v_preview.integration_configuration_id || ':' || r.external_product_id || ':' || coalesce(r.external_variant_id,'')),1,24)),r.product_name,r.description,'entity-status-product-active',v_preview.product_catalog_id,r.external_sku,r.unit_price_minor,r.currency_code,p_actor_user_id,p_actor_user_id);
      v_created:=v_created+1;
    END IF;
    IF r.commerce_product_mapping_id IS NOT NULL THEN
      SELECT commerce_product_mapping_id INTO v_mapping
        FROM commerce_product_mappings
       WHERE commerce_product_mapping_id=r.commerce_product_mapping_id
         AND organization_id=p_organization_id
         AND integration_configuration_id=v_preview.integration_configuration_id
         AND store_id IS NOT DISTINCT FROM v_preview.store_id
         AND external_product_id=r.external_product_id
         AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id
         AND NOT is_deleted
       FOR UPDATE;
      IF NOT FOUND OR r.mapping_version_no IS NULL
         OR (SELECT product_id FROM commerce_product_mappings WHERE commerce_product_mapping_id=v_mapping) IS DISTINCT FROM v_product
         OR (SELECT version_no FROM commerce_product_mappings WHERE commerce_product_mapping_id=v_mapping)<>r.mapping_version_no THEN
        RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
      UPDATE commerce_product_mappings
         SET external_sku=r.external_sku,is_active=true,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1
       WHERE commerce_product_mapping_id=v_mapping
         AND (external_sku IS DISTINCT FROM r.external_sku OR NOT is_active);
    ELSE
      SELECT commerce_product_mapping_id INTO v_mapping
        FROM commerce_product_mappings
       WHERE organization_id=p_organization_id AND integration_configuration_id=v_preview.integration_configuration_id
         AND store_id IS NOT DISTINCT FROM v_preview.store_id AND external_product_id=r.external_product_id
         AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id AND NOT is_deleted
       FOR UPDATE;
      IF FOUND THEN
        RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE='40001';
      END IF;
      v_mapping:=generate_runtime_id('CPM');
      INSERT INTO commerce_product_mappings(commerce_product_mapping_id,organization_id,product_id,integration_configuration_id,store_id,external_product_id,external_variant_id,external_sku,is_active,created_by,updated_by)
      VALUES(v_mapping,p_organization_id,v_product,v_preview.integration_configuration_id,v_preview.store_id,r.external_product_id,r.external_variant_id,r.external_sku,true,v_actor,v_actor);
    END IF;
    INSERT INTO commerce_product_snapshots(commerce_product_snapshot_id,organization_id,integration_configuration_id,store_id,commerce_product_mapping_id,external_product_id,external_variant_id,external_sku,product_name,description,currency_code,unit_price_minor_snapshot,is_active,source_updated_at,created_by,updated_by)
    VALUES(generate_runtime_id('CPS'),p_organization_id,v_preview.integration_configuration_id,v_preview.store_id,v_mapping,r.external_product_id,r.external_variant_id,r.external_sku,r.product_name,r.description,r.currency_code,r.unit_price_minor,r.active,r.source_updated_at,v_actor,v_actor)
    ON CONFLICT (organization_id,integration_configuration_id,(COALESCE(store_id,'')),external_product_id,(COALESCE(external_variant_id,''))) WHERE NOT is_deleted DO UPDATE
      SET commerce_product_mapping_id=v_mapping,external_sku=EXCLUDED.external_sku,product_name=EXCLUDED.product_name,description=EXCLUDED.description,
          currency_code=EXCLUDED.currency_code,unit_price_minor_snapshot=EXCLUDED.unit_price_minor_snapshot,
          is_active=EXCLUDED.is_active,source_updated_at=EXCLUDED.source_updated_at,last_synced_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=commerce_product_snapshots.version_no+1
      WHERE commerce_product_snapshots.commerce_product_mapping_id IS DISTINCT FROM v_mapping
         OR commerce_product_snapshots.external_sku IS DISTINCT FROM EXCLUDED.external_sku
         OR commerce_product_snapshots.product_name IS DISTINCT FROM EXCLUDED.product_name
         OR commerce_product_snapshots.description IS DISTINCT FROM EXCLUDED.description
         OR commerce_product_snapshots.currency_code IS DISTINCT FROM EXCLUDED.currency_code
         OR commerce_product_snapshots.unit_price_minor_snapshot IS DISTINCT FROM EXCLUDED.unit_price_minor_snapshot
         OR commerce_product_snapshots.is_active IS DISTINCT FROM EXCLUDED.is_active
         OR commerce_product_snapshots.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at;
    v_mapped:=v_mapped+1; v_count:=v_count+1;
  END LOOP;
  UPDATE commerce_catalog_sync_previews SET status='APPLIED',applied_at=CURRENT_TIMESTAMP,applied_by=v_actor,apply_idempotency_key=p_idempotency_key,apply_result=jsonb_build_object('previewId',p_preview_id,'createdCount',v_created,'appliedCount',v_count,'mappedCount',v_mapped),version_no=version_no+1 WHERE catalog_sync_preview_id=p_preview_id;
  RETURN (SELECT apply_result FROM commerce_catalog_sync_previews WHERE catalog_sync_preview_id=p_preview_id);
END;
$function$;


-- P3 snapshots predate the persisted mapping reference. Backfill only exact,
-- unambiguous active external identities in the same checkout scope.
UPDATE "${schemaName}".commerce_product_snapshots snapshot
   SET commerce_product_mapping_id = mapping.commerce_product_mapping_id,
       updated_at = CURRENT_TIMESTAMP,
       version_no = snapshot.version_no + 1
  FROM "${schemaName}".commerce_product_mappings mapping
 WHERE snapshot.commerce_product_mapping_id IS NULL
   AND snapshot.organization_id = mapping.organization_id
   AND snapshot.integration_configuration_id = mapping.integration_configuration_id
   AND snapshot.store_id IS NOT DISTINCT FROM mapping.store_id
   AND snapshot.external_product_id = mapping.external_product_id
   AND snapshot.external_variant_id IS NOT DISTINCT FROM mapping.external_variant_id
   AND mapping.is_active AND NOT mapping.is_deleted AND NOT snapshot.is_deleted
   AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".commerce_product_mappings ambiguous_mapping
         WHERE ambiguous_mapping.organization_id = mapping.organization_id
           AND ambiguous_mapping.integration_configuration_id = mapping.integration_configuration_id
           AND ambiguous_mapping.store_id IS NOT DISTINCT FROM mapping.store_id
           AND ambiguous_mapping.external_product_id = mapping.external_product_id
           AND ambiguous_mapping.external_variant_id IS NOT DISTINCT FROM mapping.external_variant_id
           AND ambiguous_mapping.is_active AND NOT ambiguous_mapping.is_deleted
           AND ambiguous_mapping.commerce_product_mapping_id <> mapping.commerce_product_mapping_id
   );
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_applicability_internal(varchar, varchar, varchar, varchar, numeric, bigint, varchar, boolean, varchar[], varchar),
    "${schemaName}".commerce_prepare_counter_redemption_transaction(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".select_counter_redemption_item_product_mapping(varchar, varchar, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".select_counter_redemption_item_product_mapping(varchar, varchar, varchar, varchar, varchar, varchar, varchar) TO "${appRole}";

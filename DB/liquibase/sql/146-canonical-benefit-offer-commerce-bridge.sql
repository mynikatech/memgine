-- Preserve adjustment configuration without a usable POS mapping. Inactive
-- adjustments have no mapping rows and cannot be executed by Commerce.
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
       OR (v_requires_product AND COALESCE(cardinality(p_mapping_ids), 0) = 0 AND COALESCE(p_active, true))
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

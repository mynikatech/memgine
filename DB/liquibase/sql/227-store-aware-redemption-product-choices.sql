-- W227: Store-aware canonical Product choices. Does not mutate Product/mapping data.
-- The product ID alone identifies the Product; no name/SKU reconciliation is performed.
CREATE OR REPLACE FUNCTION "${schemaName}".redemption_product_choices(
    p_organization_id varchar,
    p_subscription_id varchar,
    p_item_type varchar,
    p_item_id varchar,
    p_actor_user_id varchar,
    p_store_id varchar DEFAULT NULL,
    p_staff_id varchar DEFAULT NULL
)
RETURNS TABLE("productId" varchar, "productName" varchar, "productCode" varchar)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    -- Preserve the W219 ownership and Counter authorization contract.
    IF NOT EXISTS (
        SELECT 1
        FROM subscriptions s
        JOIN organization_user ou
          ON ou.organization_user_id = s.organization_user_id
        WHERE s.subscription_id = p_subscription_id
          AND ou.organization_id = p_organization_id
          AND NOT s.is_deleted
          AND NOT ou.is_deleted
          AND (
              ou.user_id = p_actor_user_id
              OR (
                  p_store_id IS NOT NULL
                  AND p_staff_id IS NOT NULL
                  AND counter_can_operate(
                      p_organization_id, p_store_id,
                      p_staff_id, p_actor_user_id
                  )
              )
          )
    ) THEN
        RAISE EXCEPTION 'Subscription product selection is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_item_type NOT IN ('BENEFIT', 'OFFER') THEN
        RAISE EXCEPTION 'Invalid redemption item type'
            USING ERRCODE = '22023';
    END IF;

    -- Store context cannot be partially supplied (no accidental unscoped fallback).
    IF (p_store_id IS NULL) <> (p_staff_id IS NULL) THEN
        RAISE EXCEPTION 'Store and staff must be supplied together'
            USING ERRCODE = '22023';
    END IF;

    -- Authorization above deliberately preserves W219 behavior for customers.
    -- Product eligibility is determined by Product ID + the authoritative Store
    -- integration and external catalog. Canonical Product home catalog is irrelevant.
    RETURN QUERY
    SELECT p.product_id, p.product_name, p.product_code
    FROM product p
    WHERE p.organization_id = p_organization_id
      AND NOT p.is_deleted
      AND (
          (p_item_type = 'BENEFIT' AND EXISTS (
              SELECT 1 FROM benefit_product bp
              WHERE bp.organization_id = p_organization_id
                AND bp.benefit_id = p_item_id
                AND bp.product_id = p.product_id
                AND bp.is_active AND NOT bp.is_deleted
          ))
          OR
          (p_item_type = 'OFFER' AND EXISTS (
              SELECT 1 FROM offer_product op
              WHERE op.organization_id = p_organization_id
                AND op.offer_id = p_item_id
                AND op.product_id = p.product_id
                AND op.is_active AND NOT op.is_deleted
          ))
      )
      AND EXISTS (
          SELECT 1
          FROM commerce_product_mappings m
          JOIN commerce_store_catalog_sources source
            ON source.organization_id = m.organization_id
           AND source.store_id = m.store_id
           AND source.integration_configuration_id = m.integration_configuration_id
          JOIN poynt_store_catalog_configurations cfg
            ON cfg.organization_id = source.organization_id
           AND cfg.store_id = source.store_id
           AND cfg.integration_configuration_id = source.integration_configuration_id
          JOIN stores st
            ON st.organization_id = source.organization_id
           AND st.store_id = source.store_id
           AND NOT st.is_deleted
          JOIN integration_configurations integration
            ON integration.organization_id = source.organization_id
           AND integration.integration_configuration_id = source.integration_configuration_id
           AND NOT integration.is_deleted
           AND upper(integration.provider) = 'POYNT'
          WHERE m.organization_id = p_organization_id
            AND m.product_id = p.product_id
            AND m.is_active AND NOT m.is_deleted
            AND m.store_id IS NOT NULL
            AND m.external_catalog_id = cfg.effective_catalog_id
            AND NULLIF(btrim(cfg.effective_catalog_id), '') IS NOT NULL
            AND (p_store_id IS NULL OR m.store_id = p_store_id)
      )
    ORDER BY p.product_name, p.product_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".redemption_product_choices(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".redemption_product_choices(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
) TO "${appRole}";

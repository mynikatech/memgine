-- W224: DB-scoped candidate search for W223 manual reconciliation.
-- Read only; no Product or Commerce mapping records are changed.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_manual_relink_candidates(
    p_organization_id varchar,
    p_mapping_id varchar,
    p_actor_user_id varchar,
    p_search varchar DEFAULT ''
)
RETURNS TABLE(
    "productId" varchar,
    "organizationId" varchar,
    "productName" varchar,
    "productCode" varchar,
    sku varchar,
    "catalogId" varchar,
    "catalogName" varchar,
    "categoryId" varchar,
    "categoryName" varchar,
    "basePriceMinor" bigint,
    "currencyCode" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_mapping commerce_product_mappings%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF length(coalesce(p_search, '')) > 200 THEN
        RAISE EXCEPTION 'Search term is too long' USING ERRCODE = '22023';
    END IF;
    SELECT m.* INTO v_mapping
      FROM commerce_product_mappings m
     WHERE m.organization_id = p_organization_id
       AND m.commerce_product_mapping_id = p_mapping_id
       AND m.is_active AND NOT m.is_deleted;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active commerce mapping not found in organization' USING ERRCODE = '23503';
    END IF;
    IF v_mapping.store_id IS NULL OR nullif(btrim(v_mapping.external_catalog_id), '') IS NULL THEN
        RAISE EXCEPTION 'Manual relink requires a catalog-qualified Store mapping' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM integration_configurations i
         WHERE i.integration_configuration_id = v_mapping.integration_configuration_id
           AND i.organization_id = p_organization_id
           AND NOT i.is_deleted
    ) THEN
        RAISE EXCEPTION 'Mapping integration is inactive or missing' USING ERRCODE = '23503';
    END IF;
    RETURN QUERY
    SELECT p.product_id::varchar, p.organization_id::varchar,
           p.product_name::varchar, p.product_code::varchar,
           p.sku::varchar,
           c.product_catalog_id::varchar, c.catalog_name::varchar,
           cat.product_catalog_category_id::varchar, cat.category_name::varchar,
           p.base_price_minor::bigint, p.currency_code::varchar,
           p.version_no::integer
      FROM product p
      JOIN product_catalog c
        ON c.product_catalog_id = p.product_catalog_id
       AND c.organization_id = p.organization_id
       AND c.integration_configuration_id = v_mapping.integration_configuration_id
       AND c.is_active AND NOT c.is_deleted
      LEFT JOIN product_catalog_category cat
        ON cat.product_catalog_category_id = p.product_catalog_category_id
       AND cat.organization_id = p.organization_id
       AND cat.product_catalog_id = p.product_catalog_id
       AND NOT cat.is_deleted
     WHERE p.organization_id = p_organization_id
       AND p.product_id IS DISTINCT FROM v_mapping.product_id
       AND p.status_id = 'entity-status-product-active'
       AND NOT p.is_deleted
       AND (nullif(btrim(coalesce(p_search, '')), '') IS NULL
            OR position(lower(btrim(p_search)) in lower(p.product_name)) > 0)
     ORDER BY lower(p.product_name), lower(coalesce(cat.category_name, 'Uncategorized')),
              lower(c.catalog_name), p.product_id
     LIMIT 100;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_manual_relink_candidates(varchar,varchar,varchar,varchar) FROM PUBLIC;

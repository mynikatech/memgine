-- W229: catalog-filtered canonical Products for Store catalog maintenance.
-- Existing organization-wide get_organization_products_admin remains unchanged.
CREATE OR REPLACE FUNCTION "${schemaName}".get_catalog_products_admin(
 p_organization_id varchar,
 p_product_catalog_id varchar,
 p_search varchar,
 p_actor_user_id varchar
)
RETURNS TABLE(
 "productId" varchar, "organizationId" varchar, "productCatalogId" varchar,
 "catalogName" varchar, "integrationConfigurationId" varchar, "integrationName" varchar,
 "productCatalogCategoryId" varchar, "categoryName" varchar,
 "productCode" varchar, "productName" varchar, description varchar,
 "shortCode" varchar, sku varchar, upc varchar, "basePriceMinor" bigint,
 "currencyCode" varchar, active boolean, "externalProductIds" varchar,
 "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', '${schemaName}'
AS $function$
 SELECT p.product_id, p.organization_id, p.product_catalog_id, c.catalog_name,
        c.integration_configuration_id, i.integration_name, p.product_catalog_category_id,
        cat.category_name, p.product_code, p.product_name, p.description, p.short_code,
        p.sku, p.upc, p.base_price_minor, p.currency_code,
        p.status_id = 'entity-status-product-active',
        string_agg(DISTINCT m.external_product_id, ', ' ORDER BY m.external_product_id)::varchar,
        p.version_no
 FROM product p
 JOIN product_catalog c
   ON c.product_catalog_id = p.product_catalog_id
  AND c.organization_id = p_organization_id
  AND NOT c.is_deleted
 LEFT JOIN integration_configurations i
   ON i.integration_configuration_id = c.integration_configuration_id AND NOT i.is_deleted
 LEFT JOIN product_catalog_category cat
   ON cat.product_catalog_category_id = p.product_catalog_category_id AND NOT cat.is_deleted
 LEFT JOIN commerce_product_mappings m
   ON m.product_id = p.product_id AND NOT m.is_deleted
 WHERE p.organization_id = p_organization_id
   AND p.product_catalog_id = p_product_catalog_id
   AND NOT p.is_deleted
   AND can_administer_organization(p_organization_id, p_actor_user_id)
   AND (NULLIF(btrim(p_search), '') IS NULL
        OR p.product_name ILIKE '%' || btrim(p_search) || '%'
        OR p.product_code ILIKE '%' || btrim(p_search) || '%'
        OR COALESCE(p.sku, '') ILIKE '%' || btrim(p_search) || '%')
 GROUP BY p.product_id, c.catalog_name, c.integration_configuration_id,
          i.integration_name, cat.category_name
 ORDER BY p.product_name, p.product_id;
$function$;

-- Match existing app role access: grant only to the configured database application role.
-- Liquibase properties supply appRole; do not grant this SECURITY DEFINER function to PUBLIC.
REVOKE ALL ON FUNCTION "${schemaName}".get_catalog_products_admin(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_catalog_products_admin(varchar,varchar,varchar,varchar) TO "${appRole}";

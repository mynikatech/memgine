-- Controlled resolution for an ambiguous, persisted P3 catalog-preview row.
ALTER TABLE "${schemaName}".commerce_catalog_sync_preview_rows
    ADD COLUMN IF NOT EXISTS resolved_canonical_product_id varchar(64)
        REFERENCES "${schemaName}".product(product_id),
    ADD COLUMN IF NOT EXISTS resolved_canonical_product_version_no integer,
    ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS resolved_by varchar(64)
        REFERENCES "${schemaName}".organization_user(organization_user_id);

-- Provider category evidence is staged only. It never changes canonical category ownership.
ALTER TABLE "${schemaName}".commerce_catalog_sync_preview_rows
    ADD COLUMN IF NOT EXISTS external_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS category_metadata_available boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(
    p_organization_id varchar, p_integration_configuration_id varchar, p_product_catalog_id varchar,
    p_store_id varchar, p_rows jsonb, p_actor_user_id varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_actor varchar(64); v_preview varchar(64); r record;
BEGIN
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) > 2000 THEN RAISE EXCEPTION 'Catalog preview is invalid or exceeds the maximum size' USING ERRCODE='22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM integration_configurations WHERE integration_configuration_id=p_integration_configuration_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Commerce integration is unavailable' USING ERRCODE='23503'; END IF;
    IF NOT EXISTS (SELECT 1 FROM product_catalog WHERE product_catalog_id=p_product_catalog_id AND organization_id=p_organization_id AND NOT is_deleted AND is_active AND (integration_configuration_id IS NULL OR integration_configuration_id=p_integration_configuration_id)) THEN RAISE EXCEPTION 'Product catalog is unavailable for this integration' USING ERRCODE='23503'; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Store is not in organization' USING ERRCODE='23503'; END IF;
    v_preview := generate_runtime_id('CSP');
    INSERT INTO commerce_catalog_sync_previews(catalog_sync_preview_id,organization_id,integration_configuration_id,product_catalog_id,store_id,expires_at,created_by) VALUES(v_preview,p_organization_id,p_integration_configuration_id,p_product_catalog_id,p_store_id,CURRENT_TIMESTAMP + interval '30 minutes',v_actor);
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x("rowNumber" integer,"externalProductId" varchar,"externalVariantId" varchar,"externalSku" varchar,"productName" varchar,description varchar,"currencyCode" varchar,"unitPriceMinor" bigint,active boolean,"sourceUpdatedAt" timestamptz,"canonicalProductId" varchar,"canonicalProductVersionNo" integer,"mappingId" varchar,"mappingVersionNo" integer,action varchar,reason varchar,"hasDependentBusinessRules" boolean,"eligibleForApply" boolean,"previousAttributes" jsonb,"proposedAttributes" jsonb,"externalCategories" jsonb,"categoryMetadataAvailable" boolean) LOOP
      INSERT INTO commerce_catalog_sync_preview_rows(catalog_sync_preview_row_id,catalog_sync_preview_id,row_number,external_product_id,external_variant_id,external_sku,product_name,description,currency_code,unit_price_minor,active,source_updated_at,canonical_product_id,canonical_product_version_no,commerce_product_mapping_id,mapping_version_no,proposed_action,reason,has_dependent_business_rules,eligible_for_apply,previous_attributes,proposed_attributes,external_categories,category_metadata_available)
      VALUES(generate_runtime_id('CSR'),v_preview,r."rowNumber",btrim(r."externalProductId"),NULLIF(btrim(r."externalVariantId"),''),NULLIF(btrim(r."externalSku"),''),btrim(r."productName"),NULLIF(btrim(r.description),''),upper(btrim(r."currencyCode")),r."unitPriceMinor",COALESCE(r.active,true),r."sourceUpdatedAt",NULLIF(btrim(r."canonicalProductId"),''),r."canonicalProductVersionNo",NULLIF(btrim(r."mappingId"),''),r."mappingVersionNo",upper(btrim(r.action)),NULLIF(btrim(r.reason),''),COALESCE(r."hasDependentBusinessRules",false),COALESCE(r."eligibleForApply",false),r."previousAttributes",r."proposedAttributes",COALESCE(r."externalCategories",'[]'::jsonb),COALESCE(r."categoryMetadataAvailable",false));
    END LOOP;
    RETURN v_preview;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(
    p_organization_id varchar,
    p_preview_id varchar,
    p_row_number integer,
    p_product_id varchar,
    p_expected_product_version_no integer,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_preview commerce_catalog_sync_previews%ROWTYPE;
    v_row commerce_catalog_sync_preview_rows%ROWTYPE;
    v_product product%ROWTYPE;
BEGIN
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    SELECT * INTO v_preview
      FROM commerce_catalog_sync_previews
     WHERE catalog_sync_preview_id=p_preview_id AND organization_id=p_organization_id
     FOR UPDATE;
    IF NOT FOUND OR v_preview.status <> 'READY' OR v_preview.expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Catalog preview is unavailable' USING ERRCODE='40001';
    END IF;
    SELECT * INTO v_row
      FROM commerce_catalog_sync_preview_rows
     WHERE catalog_sync_preview_id=v_preview.catalog_sync_preview_id
       AND row_number=p_row_number
     FOR UPDATE;
    IF NOT FOUND OR v_row.proposed_action <> 'CONFLICT' THEN
        RAISE EXCEPTION 'Preview row is not eligible for manual resolution' USING ERRCODE='22023';
    END IF;
    IF v_row.external_product_id IS NULL OR v_row.product_name IS NULL THEN
        RAISE EXCEPTION 'Invalid provider product cannot be resolved manually' USING ERRCODE='22023';
    END IF;
    SELECT * INTO v_product
      FROM product
     WHERE product_id=p_product_id AND organization_id=p_organization_id
       AND product_catalog_id=v_preview.product_catalog_id AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND OR p_expected_product_version_no IS NULL OR v_product.version_no <> p_expected_product_version_no THEN
        RAISE EXCEPTION 'Canonical product changed since preview' USING ERRCODE='40001';
    END IF;
    IF EXISTS (
        SELECT 1 FROM commerce_product_mappings
         WHERE organization_id=p_organization_id
           AND integration_configuration_id=v_preview.integration_configuration_id
           AND store_id IS NOT DISTINCT FROM v_preview.store_id
           AND external_product_id=v_row.external_product_id
           AND external_variant_id IS NOT DISTINCT FROM v_row.external_variant_id
           AND product_id IS DISTINCT FROM v_product.product_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'External identity is already verified for another product' USING ERRCODE='23505';
    END IF;
    UPDATE commerce_catalog_sync_preview_rows
       SET canonical_product_id=v_product.product_id,
           canonical_product_version_no=v_product.version_no,
           resolved_canonical_product_id=v_product.product_id,
           resolved_canonical_product_version_no=v_product.version_no,
           resolved_at=CURRENT_TIMESTAMP,
           resolved_by=v_actor,
           proposed_action='MATCHED',
           eligible_for_apply=true,
           reason='Administrator selected canonical product for ambiguous SKU'
     WHERE catalog_sync_preview_row_id=v_row.catalog_sync_preview_row_id;
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(varchar,varchar,integer,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(varchar,varchar,integer,varchar,integer,varchar) TO "${appRole}";

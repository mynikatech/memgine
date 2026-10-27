-- W230-D: Explicitly link NEW or CONFLICT POS preview rows to an existing canonical Product.
-- No canonical Product merge, deletion, or historical transaction reassignment.
-- The existing Apply function already understands MATCHED preview rows with a canonical Product ID.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(
    p_organization_id varchar,
    p_preview_id varchar,
    p_row_number integer,
    p_product_id varchar,
    p_expected_product_version_no integer,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
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
     WHERE catalog_sync_preview_id = p_preview_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND OR v_preview.status <> 'READY' OR v_preview.expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Catalog preview is unavailable; generate a fresh preview' USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_row
      FROM commerce_catalog_sync_preview_rows
     WHERE catalog_sync_preview_id = v_preview.catalog_sync_preview_id
       AND row_number = p_row_number
     FOR UPDATE;
    IF NOT FOUND OR v_row.proposed_action NOT IN ('NEW','CONFLICT')
       OR NOT v_row.eligible_for_apply AND v_row.proposed_action = 'NEW' THEN
        RAISE EXCEPTION 'Preview row is not eligible for existing Product linking' USING ERRCODE = '22023';
    END IF;
    IF v_row.external_product_id IS NULL OR NULLIF(btrim(v_row.product_name), '') IS NULL
       OR NOT v_row.active THEN
        RAISE EXCEPTION 'Invalid or inactive external Product cannot be linked' USING ERRCODE = '22023';
    END IF;
    IF v_row.proposed_action = 'NEW'
       AND (v_row.commerce_product_mapping_id IS NOT NULL OR v_row.canonical_product_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Preview already has a Product identity; generate a fresh preview' USING ERRCODE = '40001';
    END IF;

    SELECT * INTO v_product FROM product
     WHERE organization_id = p_organization_id AND product_id = p_product_id
       AND NOT is_deleted AND status_id = 'entity-status-product-active'
     FOR UPDATE;
    IF NOT FOUND OR p_expected_product_version_no IS NULL
       OR v_product.version_no <> p_expected_product_version_no THEN
        RAISE EXCEPTION 'Existing Memgine Product changed since selection; retry' USING ERRCODE = '40001';
    END IF;

    -- Catalog-qualified Store identity. Reject if an external Product is already mapped.
    IF EXISTS (
        SELECT 1 FROM commerce_product_mappings m
         WHERE m.organization_id = p_organization_id
           AND m.integration_configuration_id = v_preview.integration_configuration_id
           AND m.store_id IS NOT DISTINCT FROM v_preview.store_id
           AND m.external_catalog_id IS NOT DISTINCT FROM v_preview.external_catalog_id
           AND m.external_product_id = v_row.external_product_id
           AND m.external_variant_id IS NOT DISTINCT FROM v_row.external_variant_id
           AND NOT m.is_deleted
           AND (v_row.commerce_product_mapping_id IS NULL OR
                m.commerce_product_mapping_id <> v_row.commerce_product_mapping_id)
    ) THEN
        RAISE EXCEPTION 'External Product identity is already mapped; regenerate preview' USING ERRCODE = '23505';
    END IF;

    -- Preserve all external attributes in the preview; only resolve canonical identity.
    UPDATE commerce_catalog_sync_preview_rows
       SET canonical_product_id = v_product.product_id,
           canonical_product_version_no = v_product.version_no,
           resolved_canonical_product_id = v_product.product_id,
           resolved_canonical_product_version_no = v_product.version_no,
           resolved_at = CURRENT_TIMESTAMP,
           resolved_by = v_actor,
           proposed_action = 'MATCHED',
           eligible_for_apply = true,
           reason = 'Administrator explicitly linked existing Memgine Product'
     WHERE catalog_sync_preview_row_id = v_row.catalog_sync_preview_row_id;
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(varchar,varchar,integer,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(varchar,varchar,integer,varchar,integer,varchar) TO "${appRole}";

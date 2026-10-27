-- W230-C: canonical Product stores identity, Product code and fallback name only.
-- Replaces the Apply function installed by W230-A (migration 230).
-- No cleanup/backfill: existing canonical Product attributes are left unchanged.
-- POS prices, SKU, description, currency and categories continue in mapping snapshots.
-- No changes to product constraints, Store/catalog identity or Apply idempotency.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_apply_catalog_sync_preview(p_organization_id character varying, p_preview_id character varying, p_idempotency_key character varying, p_actor_user_id character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', '${schemaName}'
AS $function$
DECLARE
    v_actor varchar(64);
    v_preview commerce_catalog_sync_previews%ROWTYPE;
    v_provider varchar(64);
    r commerce_catalog_sync_preview_rows%ROWTYPE;
    v_product varchar(64);
    v_mapping varchar(64);
    v_count integer := 0;
    v_created integer := 0;
    v_mapped integer := 0;
BEGIN
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    IF NULLIF(btrim(p_idempotency_key), '') IS NULL OR length(p_idempotency_key) > 160 THEN
        RAISE EXCEPTION 'A valid idempotency key is required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_preview FROM commerce_catalog_sync_previews
     WHERE catalog_sync_preview_id = p_preview_id AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Catalog preview was not found' USING ERRCODE = '23503'; END IF;
    IF v_preview.status = 'APPLIED' THEN
        IF v_preview.apply_idempotency_key = p_idempotency_key THEN RETURN v_preview.apply_result; END IF;
        RAISE EXCEPTION 'Catalog preview was already applied' USING ERRCODE = '23505';
    END IF;
    IF v_preview.expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Catalog preview has expired; generate a new preview' USING ERRCODE = '22023';
    END IF;
    IF v_preview.status <> 'READY' THEN RAISE EXCEPTION 'Catalog preview is unavailable' USING ERRCODE = '40001'; END IF;
    SELECT upper(provider)::varchar INTO v_provider
      FROM integration_configurations
     WHERE integration_configuration_id = v_preview.integration_configuration_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF v_provider IS NULL THEN RAISE EXCEPTION 'Catalog or integration changed since preview; regenerate preview' USING ERRCODE = '40001'; END IF;
    IF v_provider = 'POYNT' THEN
        IF v_preview.store_id IS NULL OR NULLIF(btrim(v_preview.external_catalog_id), '') IS NULL THEN
            RAISE EXCEPTION 'Poynt preview lacks verified catalog identity; regenerate preview' USING ERRCODE = '40001';
        END IF;
        PERFORM 1
          FROM commerce_store_catalog_sources source
          JOIN poynt_store_catalog_configurations configuration
            ON configuration.organization_id = source.organization_id
           AND configuration.store_id = source.store_id
           AND configuration.integration_configuration_id = source.integration_configuration_id
         WHERE source.organization_id = p_organization_id
           AND source.store_id = v_preview.store_id
           AND source.integration_configuration_id = v_preview.integration_configuration_id
           AND configuration.effective_catalog_id = v_preview.external_catalog_id
         FOR UPDATE OF source, configuration;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verified Store catalog changed since preview; regenerate preview' USING ERRCODE = '40001';
        END IF;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM product_catalog catalog
         WHERE catalog.product_catalog_id = v_preview.product_catalog_id
           AND catalog.organization_id = p_organization_id
           AND catalog.is_active AND NOT catalog.is_deleted
           AND (catalog.integration_configuration_id IS NULL
                OR catalog.integration_configuration_id = v_preview.integration_configuration_id)
    ) THEN RAISE EXCEPTION 'Catalog changed since preview; regenerate preview' USING ERRCODE = '40001'; END IF;
    IF v_preview.store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM stores
         WHERE store_id = v_preview.store_id
           AND organization_id = p_organization_id AND NOT is_deleted
    ) THEN RAISE EXCEPTION 'Store changed since preview; regenerate preview' USING ERRCODE = '40001'; END IF;
    IF EXISTS (
        SELECT 1 FROM commerce_catalog_sync_preview_rows
         WHERE catalog_sync_preview_id = p_preview_id
           AND proposed_action IN ('CONFLICT', 'INVALID')
    ) THEN RAISE EXCEPTION 'Catalog preview has unresolved conflicts or invalid records' USING ERRCODE = '23505'; END IF;

    FOR r IN SELECT * FROM commerce_catalog_sync_preview_rows
               WHERE catalog_sync_preview_id = p_preview_id AND eligible_for_apply
               ORDER BY row_number FOR UPDATE
    LOOP
        IF r.proposed_action NOT IN ('NEW', 'MATCHED', 'UPDATE', 'UNCHANGED') OR NOT r.active THEN CONTINUE; END IF;
        IF r.canonical_product_id IS NOT NULL THEN
            SELECT product_id INTO v_product FROM product
             WHERE product_id = r.canonical_product_id AND organization_id = p_organization_id AND NOT is_deleted
             FOR UPDATE;
            IF NOT FOUND OR (r.canonical_product_version_no IS NOT NULL
                AND (SELECT version_no FROM product WHERE product_id = v_product) <> r.canonical_product_version_no) THEN
                RAISE EXCEPTION 'Canonical product changed since preview; regenerate preview' USING ERRCODE = '40001';
            END IF;
        ELSE
            IF r.proposed_action <> 'NEW' THEN RAISE EXCEPTION 'Preview contains an unsafe product mapping' USING ERRCODE = '23505'; END IF;
            v_product := generate_runtime_id('PRD');
            -- W230-C: canonical identity retains a human-readable fallback name,
            -- but POS-owned attributes live only on each mapping-specific snapshot.
            -- Nullable product attributes are deliberately omitted on creation.
            INSERT INTO product(product_id, organization_id, product_code, product_name, status_id,
                product_catalog_id, created_by, updated_by)
            VALUES(v_product, p_organization_id,
                'POS-' || upper(substr(md5(v_preview.integration_configuration_id || ':' ||
                    coalesce(v_preview.external_catalog_id, '') || ':' || r.external_product_id || ':' ||
                    coalesce(r.external_variant_id, '')), 1, 24)),
                r.product_name, 'entity-status-product-active', v_preview.product_catalog_id,
                p_actor_user_id, p_actor_user_id);
            v_created := v_created + 1;
        END IF;
        IF r.commerce_product_mapping_id IS NOT NULL THEN
            SELECT commerce_product_mapping_id INTO v_mapping FROM commerce_product_mappings
             WHERE commerce_product_mapping_id = r.commerce_product_mapping_id
               AND organization_id = p_organization_id
               AND integration_configuration_id = v_preview.integration_configuration_id
               AND store_id IS NOT DISTINCT FROM v_preview.store_id
               AND external_catalog_id IS NOT DISTINCT FROM v_preview.external_catalog_id
               AND external_product_id = r.external_product_id
               AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id
               AND NOT is_deleted FOR UPDATE;
            IF NOT FOUND OR r.mapping_version_no IS NULL
               OR (SELECT product_id FROM commerce_product_mappings WHERE commerce_product_mapping_id = v_mapping) IS DISTINCT FROM v_product
               OR (SELECT version_no FROM commerce_product_mappings WHERE commerce_product_mapping_id = v_mapping) <> r.mapping_version_no THEN
                RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE = '40001';
            END IF;
            UPDATE commerce_product_mappings
               SET external_sku = r.external_sku, is_active = true, updated_at = CURRENT_TIMESTAMP,
                   updated_by = v_actor, version_no = version_no + 1
             WHERE commerce_product_mapping_id = v_mapping
               AND (external_sku IS DISTINCT FROM r.external_sku OR NOT is_active);
        ELSE
            SELECT commerce_product_mapping_id INTO v_mapping FROM commerce_product_mappings
             WHERE organization_id = p_organization_id
               AND integration_configuration_id = v_preview.integration_configuration_id
               AND store_id IS NOT DISTINCT FROM v_preview.store_id
               AND external_catalog_id IS NOT DISTINCT FROM v_preview.external_catalog_id
               AND external_product_id = r.external_product_id
               AND external_variant_id IS NOT DISTINCT FROM r.external_variant_id
               AND NOT is_deleted FOR UPDATE;
            IF FOUND THEN RAISE EXCEPTION 'Commerce mapping changed since preview; regenerate preview' USING ERRCODE = '40001'; END IF;
            v_mapping := generate_runtime_id('CPM');
            INSERT INTO commerce_product_mappings(commerce_product_mapping_id, organization_id, product_id,
                integration_configuration_id, store_id, external_catalog_id, external_product_id,
                external_variant_id, external_sku, is_active, created_by, updated_by)
            VALUES(v_mapping, p_organization_id, v_product, v_preview.integration_configuration_id,
                v_preview.store_id, v_preview.external_catalog_id, r.external_product_id,
                r.external_variant_id, r.external_sku, true, v_actor, v_actor);
        END IF;
        INSERT INTO commerce_product_snapshots(commerce_product_snapshot_id, organization_id,
            integration_configuration_id, store_id, external_catalog_id, commerce_product_mapping_id,
            external_product_id, external_variant_id, external_sku, product_name, description,
            currency_code, unit_price_minor_snapshot, is_active, source_updated_at,
            external_categories, category_metadata_available, created_by, updated_by)
        VALUES(generate_runtime_id('CPS'), p_organization_id, v_preview.integration_configuration_id,
            v_preview.store_id, v_preview.external_catalog_id, v_mapping, r.external_product_id,
            r.external_variant_id, r.external_sku, r.product_name, r.description, r.currency_code,
            r.unit_price_minor, r.active, r.source_updated_at,
            CASE WHEN r.category_metadata_available THEN COALESCE(r.external_categories, '[]'::jsonb) ELSE NULL END,
            r.category_metadata_available, v_actor, v_actor)
        ON CONFLICT (organization_id, integration_configuration_id, (COALESCE(store_id, '')),
            (COALESCE(external_catalog_id, '')), external_product_id,
            (COALESCE(external_variant_id, ''))) WHERE NOT is_deleted DO UPDATE
        SET commerce_product_mapping_id = v_mapping, external_sku = EXCLUDED.external_sku,
            product_name = EXCLUDED.product_name, description = EXCLUDED.description,
            currency_code = EXCLUDED.currency_code, unit_price_minor_snapshot = EXCLUDED.unit_price_minor_snapshot,
            is_active = EXCLUDED.is_active, source_updated_at = EXCLUDED.source_updated_at,
            external_categories = CASE WHEN EXCLUDED.category_metadata_available
                THEN EXCLUDED.external_categories ELSE commerce_product_snapshots.external_categories END,
            category_metadata_available = commerce_product_snapshots.category_metadata_available
                OR EXCLUDED.category_metadata_available,
            last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor, version_no = commerce_product_snapshots.version_no + 1
        WHERE commerce_product_snapshots.commerce_product_mapping_id IS DISTINCT FROM v_mapping
           OR commerce_product_snapshots.external_sku IS DISTINCT FROM EXCLUDED.external_sku
           OR commerce_product_snapshots.product_name IS DISTINCT FROM EXCLUDED.product_name
           OR commerce_product_snapshots.description IS DISTINCT FROM EXCLUDED.description
           OR commerce_product_snapshots.currency_code IS DISTINCT FROM EXCLUDED.currency_code
           OR commerce_product_snapshots.unit_price_minor_snapshot IS DISTINCT FROM EXCLUDED.unit_price_minor_snapshot
           OR commerce_product_snapshots.is_active IS DISTINCT FROM EXCLUDED.is_active
           OR (EXCLUDED.category_metadata_available AND (
                NOT commerce_product_snapshots.category_metadata_available
                OR NOT (
                    COALESCE(commerce_product_snapshots.external_categories, '[]'::jsonb)
                        @> COALESCE(EXCLUDED.external_categories, '[]'::jsonb)
                    AND COALESCE(EXCLUDED.external_categories, '[]'::jsonb)
                        @> COALESCE(commerce_product_snapshots.external_categories, '[]'::jsonb)
                )
           ));
        v_mapped := v_mapped + 1;
        v_count := v_count + 1;
    END LOOP;
    UPDATE commerce_catalog_sync_previews
       SET status = 'APPLIED', applied_at = CURRENT_TIMESTAMP, applied_by = v_actor,
           apply_idempotency_key = p_idempotency_key,
           apply_result = jsonb_build_object('previewId', p_preview_id, 'createdCount', v_created,
               'appliedCount', v_count, 'mappedCount', v_mapped),
           version_no = version_no + 1
     WHERE catalog_sync_preview_id = p_preview_id;
    RETURN (SELECT apply_result FROM commerce_catalog_sync_previews WHERE catalog_sync_preview_id = p_preview_id);
END;
$function$


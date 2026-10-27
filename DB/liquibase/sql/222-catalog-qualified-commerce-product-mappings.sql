-- Catalog-qualified Commerce mappings and snapshots.
-- Existing rows intentionally remain unresolved when their catalog provenance
-- was not persisted. A current Store assignment is not historical provenance.

ALTER TABLE "${schemaName}".commerce_product_mappings
    ADD COLUMN IF NOT EXISTS external_catalog_id varchar(160);

ALTER TABLE "${schemaName}".commerce_product_snapshots
    ADD COLUMN IF NOT EXISTS external_catalog_id varchar(160);

ALTER TABLE "${schemaName}".commerce_catalog_sync_previews
    ADD COLUMN IF NOT EXISTS external_catalog_id varchar(160);

ALTER TABLE "${schemaName}".commerce_product_mappings
    ADD CONSTRAINT ck_commerce_product_mapping_external_catalog_id
    CHECK (external_catalog_id IS NULL OR NULLIF(btrim(external_catalog_id), '') IS NOT NULL);

ALTER TABLE "${schemaName}".commerce_product_snapshots
    ADD CONSTRAINT ck_commerce_product_snapshot_external_catalog_id
    CHECK (external_catalog_id IS NULL OR NULLIF(btrim(external_catalog_id), '') IS NOT NULL);

ALTER TABLE "${schemaName}".commerce_catalog_sync_previews
    ADD CONSTRAINT ck_catalog_sync_preview_external_catalog_id
    CHECK (external_catalog_id IS NULL OR NULLIF(btrim(external_catalog_id), '') IS NOT NULL);

DROP INDEX IF EXISTS "${schemaName}".ux_commerce_product_mappings_external_identity;
CREATE UNIQUE INDEX ux_commerce_product_mappings_catalog_external_identity
    ON "${schemaName}".commerce_product_mappings (
        organization_id,
        integration_configuration_id,
        COALESCE(store_id, ''),
        COALESCE(external_catalog_id, ''),
        external_product_id,
        COALESCE(external_variant_id, '')
    ) WHERE NOT is_deleted;

DROP INDEX IF EXISTS "${schemaName}".ux_commerce_product_snapshots_external_identity;
CREATE UNIQUE INDEX ux_commerce_product_snapshots_catalog_external_identity
    ON "${schemaName}".commerce_product_snapshots (
        organization_id,
        integration_configuration_id,
        COALESCE(store_id, ''),
        COALESCE(external_catalog_id, ''),
        external_product_id,
        COALESCE(external_variant_id, '')
    ) WHERE NOT is_deleted;

CREATE INDEX ix_commerce_product_mappings_catalog_scope
    ON "${schemaName}".commerce_product_mappings (
        organization_id,
        integration_configuration_id,
        external_catalog_id,
        store_id
    ) WHERE NOT is_deleted;

CREATE INDEX ix_commerce_product_snapshots_catalog_scope
    ON "${schemaName}".commerce_product_snapshots (
        organization_id,
        integration_configuration_id,
        external_catalog_id,
        store_id
    ) WHERE NOT is_deleted;

-- Returns a normalized catalog ID. Poynt writes require an identity verified
-- against the current Store configuration (or, for organization-scoped data,
-- against at least one verified Store configuration). Other providers retain
-- their existing optional catalog semantics.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_validate_mapping_catalog_identity(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
    p_external_catalog_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_provider varchar(64);
    v_catalog_id varchar(160);
BEGIN
    SELECT upper(i.provider)::varchar
      INTO v_provider
      FROM integration_configurations i
     WHERE i.organization_id = p_organization_id
       AND i.integration_configuration_id = p_integration_configuration_id
       AND NOT i.is_deleted;

    IF v_provider IS NULL THEN
        RAISE EXCEPTION 'Commerce integration is not configured for organization'
            USING ERRCODE = '23503';
    END IF;

    v_catalog_id := NULLIF(btrim(p_external_catalog_id), '');
    IF v_catalog_id IS NOT NULL AND length(v_catalog_id) > 160 THEN
        RAISE EXCEPTION 'External catalog identity is invalid' USING ERRCODE = '22023';
    END IF;

    IF v_provider <> 'POYNT' THEN
        RETURN v_catalog_id;
    END IF;

    IF v_catalog_id IS NULL THEN
        RAISE EXCEPTION 'Verified external catalog identity is required for Poynt catalog data'
            USING ERRCODE = '22023';
    END IF;

    IF p_store_id IS NOT NULL THEN
        PERFORM 1
          FROM commerce_store_catalog_sources source
          JOIN poynt_store_catalog_configurations configuration
            ON configuration.organization_id = source.organization_id
           AND configuration.store_id = source.store_id
           AND configuration.integration_configuration_id = source.integration_configuration_id
         WHERE source.organization_id = p_organization_id
           AND source.store_id = p_store_id
           AND source.integration_configuration_id = p_integration_configuration_id
           AND configuration.effective_catalog_id = v_catalog_id
         FOR SHARE OF source, configuration;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Poynt catalog identity is not the selected verified Store catalog'
                USING ERRCODE = '23503';
        END IF;
    ELSE
        PERFORM 1
          FROM commerce_store_catalog_sources source
          JOIN poynt_store_catalog_configurations configuration
            ON configuration.organization_id = source.organization_id
           AND configuration.store_id = source.store_id
           AND configuration.integration_configuration_id = source.integration_configuration_id
         WHERE source.organization_id = p_organization_id
           AND source.integration_configuration_id = p_integration_configuration_id
           AND configuration.effective_catalog_id = v_catalog_id
         ORDER BY source.store_id
         LIMIT 1
         FOR SHARE OF source, configuration;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Poynt catalog identity is not selected and verified for this integration'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN v_catalog_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_mapping(
    p_organization_id varchar,
    p_product_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
    p_external_catalog_id varchar,
    p_external_product_id varchar,
    p_external_variant_id varchar,
    p_external_sku varchar,
    p_active boolean,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_catalog_id varchar(160);
    v_id varchar(64);
    v_existing_product_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user
     WHERE organization_id = p_organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     LIMIT 1;
    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;

    IF NULLIF(btrim(p_product_id), '') IS NULL
       OR NULLIF(btrim(p_external_product_id), '') IS NULL
       OR length(p_product_id) > 64
       OR length(p_external_product_id) > 160
       OR COALESCE(length(p_external_variant_id), 0) > 160
       OR COALESCE(length(p_external_sku), 0) > 160 THEN
        RAISE EXCEPTION 'Invalid commerce product mapping' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM product
         WHERE product_id = p_product_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Product is not active in organization' USING ERRCODE = '23503';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM integration_configurations configuration
          JOIN integration_types type
            ON type.integration_type_id = configuration.integration_type_id
         WHERE configuration.integration_configuration_id = p_integration_configuration_id
           AND configuration.organization_id = p_organization_id
           AND NOT configuration.is_deleted
           AND NOT type.is_deleted
           AND type.integration_type_code IN ('POS', 'ECOMMERCE')
    ) THEN
        RAISE EXCEPTION 'Commerce integration is not configured for organization'
            USING ERRCODE = '23503';
    END IF;

    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM stores
         WHERE store_id = p_store_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Store is not in organization' USING ERRCODE = '23503';
    END IF;

    v_catalog_id := commerce_validate_mapping_catalog_identity(
        p_organization_id,
        p_integration_configuration_id,
        p_store_id,
        p_external_catalog_id
    );

    SELECT commerce_product_mapping_id, product_id
      INTO v_id, v_existing_product_id
      FROM commerce_product_mappings
     WHERE organization_id = p_organization_id
       AND integration_configuration_id = p_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM p_store_id
       AND external_catalog_id IS NOT DISTINCT FROM v_catalog_id
       AND external_product_id = btrim(p_external_product_id)
       AND external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
       AND NOT is_deleted
     FOR UPDATE;

    IF v_id IS NULL THEN
        v_id := generate_runtime_id('CPM');
        INSERT INTO commerce_product_mappings (
            commerce_product_mapping_id, organization_id, product_id,
            integration_configuration_id, store_id, external_catalog_id,
            external_product_id, external_variant_id, external_sku, is_active,
            created_by, updated_by
        ) VALUES (
            v_id, p_organization_id, p_product_id,
            p_integration_configuration_id, p_store_id, v_catalog_id,
            btrim(p_external_product_id), NULLIF(btrim(p_external_variant_id), ''),
            NULLIF(btrim(p_external_sku), ''), COALESCE(p_active, true),
            v_actor_organization_user_id, v_actor_organization_user_id
        );
    ELSIF v_existing_product_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'External catalog product identity is already mapped to another canonical Product'
            USING ERRCODE = '23505';
    ELSE
        UPDATE commerce_product_mappings
           SET external_sku = NULLIF(btrim(p_external_sku), ''),
               is_active = COALESCE(p_active, true),
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_product_mapping_id = v_id;
    END IF;

    RETURN v_id;
END;
$function$;

-- Existing signatures remain for non-Poynt providers. The delegated function
-- rejects Poynt because no verified catalog identity was supplied.
CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_mapping(
    p_organization_id varchar,
    p_product_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
    p_external_product_id varchar,
    p_external_variant_id varchar,
    p_external_sku varchar,
    p_active boolean,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT save_commerce_product_mapping(
        p_organization_id, p_product_id, p_integration_configuration_id, p_store_id,
        NULL::varchar, p_external_product_id, p_external_variant_id, p_external_sku,
        p_active, p_actor_user_id
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_mapping(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
    p_external_product_id varchar,
    p_external_variant_id varchar,
    p_external_sku varchar,
    p_active boolean,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_product_id varchar(64);
BEGIN
    -- Reject Poynt before using historical SKU resolution.
    PERFORM commerce_validate_mapping_catalog_identity(
        p_organization_id, p_integration_configuration_id, p_store_id, NULL
    );

    SELECT mapping.product_id
      INTO v_product_id
      FROM commerce_product_mappings mapping
     WHERE mapping.organization_id = p_organization_id
       AND mapping.integration_configuration_id = p_integration_configuration_id
       AND mapping.store_id IS NOT DISTINCT FROM p_store_id
       AND mapping.external_catalog_id IS NULL
       AND mapping.external_product_id = p_external_product_id
       AND mapping.external_variant_id IS NOT DISTINCT FROM p_external_variant_id
       AND mapping.product_id IS NOT NULL
       AND NOT mapping.is_deleted;

    IF v_product_id IS NULL THEN
        SELECT min(product.product_id)
          INTO v_product_id
          FROM product
         WHERE product.organization_id = p_organization_id
           AND product.product_code = p_external_sku
           AND NOT product.is_deleted
        HAVING count(*) = 1;
    END IF;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'A canonical Product is required for a commerce product mapping'
            USING ERRCODE = '23503';
    END IF;

    RETURN save_commerce_product_mapping(
        p_organization_id, v_product_id, p_integration_configuration_id, p_store_id,
        NULL::varchar, p_external_product_id, p_external_variant_id, p_external_sku,
        p_active, p_actor_user_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
    p_external_catalog_id varchar,
    p_commerce_product_mapping_id varchar,
    p_external_product_id varchar,
    p_external_variant_id varchar,
    p_external_sku varchar,
    p_product_name varchar,
    p_description varchar,
    p_currency_code varchar,
    p_unit_price_minor_snapshot bigint,
    p_active boolean,
    p_source_updated_at timestamp with time zone,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_catalog_id varchar(160);
    v_id varchar(64);
    v_mapping_id varchar(64);
    v_existing_snapshot_mapping_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT organization_user_id INTO v_actor
      FROM organization_user
     WHERE organization_id = p_organization_id AND user_id = p_actor_user_id AND NOT is_deleted
     LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_external_product_id), '') IS NULL
       OR NULLIF(btrim(p_product_name), '') IS NULL
       OR length(p_external_product_id) > 160
       OR COALESCE(length(p_external_variant_id), 0) > 160
       OR COALESCE(length(p_external_sku), 0) > 160
       OR length(p_product_name) > 200
       OR COALESCE(length(p_description), 0) > 2000
       OR p_currency_code !~ '^[A-Z]{3}$'
       OR p_unit_price_minor_snapshot < 0 THEN
        RAISE EXCEPTION 'Invalid commerce product snapshot' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM integration_configurations configuration
          JOIN integration_types type
            ON type.integration_type_id = configuration.integration_type_id
         WHERE configuration.integration_configuration_id = p_integration_configuration_id
           AND configuration.organization_id = p_organization_id
           AND NOT configuration.is_deleted
           AND NOT type.is_deleted
           AND type.integration_type_code IN ('POS', 'ECOMMERCE')
    ) THEN
        RAISE EXCEPTION 'Commerce integration is not configured for organization'
            USING ERRCODE = '23503';
    END IF;

    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM stores
         WHERE store_id = p_store_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Store is not in organization' USING ERRCODE = '23503';
    END IF;

    v_catalog_id := commerce_validate_mapping_catalog_identity(
        p_organization_id, p_integration_configuration_id, p_store_id, p_external_catalog_id
    );
    v_mapping_id := p_commerce_product_mapping_id;
    IF v_mapping_id IS NULL THEN
        SELECT mapping.commerce_product_mapping_id INTO v_mapping_id
          FROM commerce_product_mappings mapping
         WHERE mapping.organization_id = p_organization_id
           AND mapping.integration_configuration_id = p_integration_configuration_id
           AND mapping.store_id IS NOT DISTINCT FROM p_store_id
           AND mapping.external_catalog_id IS NOT DISTINCT FROM v_catalog_id
           AND mapping.external_product_id = btrim(p_external_product_id)
           AND mapping.external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
           AND mapping.is_active AND NOT mapping.is_deleted;
    END IF;
    IF v_mapping_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM commerce_product_mappings mapping
         WHERE mapping.commerce_product_mapping_id = v_mapping_id
           AND mapping.organization_id = p_organization_id
           AND mapping.integration_configuration_id = p_integration_configuration_id
           AND mapping.store_id IS NOT DISTINCT FROM p_store_id
           AND mapping.external_catalog_id IS NOT DISTINCT FROM v_catalog_id
           AND mapping.external_product_id = btrim(p_external_product_id)
           AND mapping.external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
           AND mapping.is_active AND NOT mapping.is_deleted
    ) THEN
        RAISE EXCEPTION 'Commerce product mapping does not match snapshot identity'
            USING ERRCODE = '23503';
    END IF;

    SELECT commerce_product_snapshot_id, commerce_product_mapping_id
      INTO v_id, v_existing_snapshot_mapping_id
      FROM commerce_product_snapshots
     WHERE organization_id = p_organization_id
       AND integration_configuration_id = p_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM p_store_id
       AND external_catalog_id IS NOT DISTINCT FROM v_catalog_id
       AND external_product_id = btrim(p_external_product_id)
       AND external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
       AND NOT is_deleted
     FOR UPDATE;

    IF v_id IS NOT NULL
       AND v_mapping_id IS NULL
       AND v_existing_snapshot_mapping_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM commerce_product_mappings mapping
            WHERE mapping.commerce_product_mapping_id = v_existing_snapshot_mapping_id
              AND mapping.organization_id = p_organization_id
              AND mapping.integration_configuration_id = p_integration_configuration_id
              AND mapping.store_id IS NOT DISTINCT FROM p_store_id
              AND mapping.external_catalog_id IS NOT DISTINCT FROM v_catalog_id
              AND mapping.external_product_id = btrim(p_external_product_id)
              AND mapping.external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
              AND mapping.is_active
              AND NOT mapping.is_deleted
       ) THEN
        RAISE EXCEPTION 'Existing snapshot has an incompatible commerce product mapping'
            USING ERRCODE = '40001';
    END IF;

    IF v_id IS NULL THEN
        v_id := generate_runtime_id('CPS');
        INSERT INTO commerce_product_snapshots(
            commerce_product_snapshot_id, organization_id, integration_configuration_id,
            store_id, external_catalog_id, commerce_product_mapping_id,
            external_product_id, external_variant_id, external_sku, product_name,
            description, currency_code, unit_price_minor_snapshot, is_active,
            source_updated_at, last_synced_at, created_by, updated_by
        ) VALUES (
            v_id, p_organization_id, p_integration_configuration_id,
            p_store_id, v_catalog_id, v_mapping_id,
            btrim(p_external_product_id), NULLIF(btrim(p_external_variant_id), ''),
            NULLIF(btrim(p_external_sku), ''), btrim(p_product_name),
            NULLIF(btrim(p_description), ''), upper(p_currency_code),
            p_unit_price_minor_snapshot, COALESCE(p_active, true), p_source_updated_at,
            CURRENT_TIMESTAMP, v_actor, v_actor
        );
    ELSE
        UPDATE commerce_product_snapshots
           SET commerce_product_mapping_id = COALESCE(v_mapping_id, commerce_product_mapping_id),
               external_sku = NULLIF(btrim(p_external_sku), ''),
               product_name = btrim(p_product_name), description = NULLIF(btrim(p_description), ''),
               currency_code = upper(p_currency_code),
               unit_price_minor_snapshot = p_unit_price_minor_snapshot,
               is_active = COALESCE(p_active, true), source_updated_at = p_source_updated_at,
               last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor, version_no = version_no + 1
         WHERE commerce_product_snapshot_id = v_id;
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar, p_integration_configuration_id varchar, p_store_id varchar,
    p_commerce_product_mapping_id varchar, p_external_product_id varchar,
    p_external_variant_id varchar, p_external_sku varchar, p_product_name varchar,
    p_description varchar, p_currency_code varchar, p_unit_price_minor_snapshot bigint,
    p_active boolean, p_source_updated_at timestamp with time zone, p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT save_commerce_product_snapshot(
        p_organization_id, p_integration_configuration_id, p_store_id, NULL::varchar,
        p_commerce_product_mapping_id, p_external_product_id, p_external_variant_id,
        p_external_sku, p_product_name, p_description, p_currency_code,
        p_unit_price_minor_snapshot, p_active, p_source_updated_at, p_actor_user_id
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar, p_integration_configuration_id varchar, p_store_id varchar,
    p_external_product_id varchar, p_external_variant_id varchar, p_external_sku varchar,
    p_product_name varchar, p_description varchar, p_currency_code varchar,
    p_unit_price_minor_snapshot bigint, p_active boolean,
    p_source_updated_at timestamp with time zone, p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT save_commerce_product_snapshot(
        p_organization_id, p_integration_configuration_id, p_store_id, NULL::varchar,
        NULL::varchar, p_external_product_id, p_external_variant_id, p_external_sku,
        p_product_name, p_description, p_currency_code, p_unit_price_minor_snapshot,
        p_active, p_source_updated_at, p_actor_user_id
    );
$function$;

-- The new overload captures the provider catalog used to fetch the preview.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_product_catalog_id varchar,
    p_store_id varchar,
    p_external_catalog_id varchar,
    p_rows jsonb,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_preview varchar(64);
    v_catalog_id varchar(160);
    v_provider varchar(64);
    r record;
BEGIN
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    IF jsonb_typeof(COALESCE(p_rows, '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(p_rows, '[]'::jsonb)) > 2000 THEN
        RAISE EXCEPTION 'Catalog preview is invalid or exceeds the maximum size' USING ERRCODE = '22023';
    END IF;
    SELECT upper(provider)::varchar INTO v_provider
      FROM integration_configurations
     WHERE integration_configuration_id = p_integration_configuration_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;
    IF v_provider IS NULL THEN RAISE EXCEPTION 'Commerce integration is unavailable' USING ERRCODE = '23503'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM product_catalog
         WHERE product_catalog_id = p_product_catalog_id
           AND organization_id = p_organization_id
           AND NOT is_deleted AND is_active
           AND (integration_configuration_id IS NULL OR integration_configuration_id = p_integration_configuration_id)
    ) THEN RAISE EXCEPTION 'Product catalog is unavailable for this integration' USING ERRCODE = '23503'; END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM stores
         WHERE store_id = p_store_id AND organization_id = p_organization_id AND NOT is_deleted
    ) THEN RAISE EXCEPTION 'Store is not in organization' USING ERRCODE = '23503'; END IF;
    IF v_provider = 'POYNT' AND p_store_id IS NULL THEN
        RAISE EXCEPTION 'A Store-scoped verified Poynt catalog is required for synchronization'
            USING ERRCODE = '22023';
    END IF;
    v_catalog_id := commerce_validate_mapping_catalog_identity(
        p_organization_id, p_integration_configuration_id, p_store_id, p_external_catalog_id
    );
    v_preview := generate_runtime_id('CSP');
    INSERT INTO commerce_catalog_sync_previews(
        catalog_sync_preview_id, organization_id, integration_configuration_id,
        product_catalog_id, store_id, external_catalog_id, expires_at, created_by
    ) VALUES (
        v_preview, p_organization_id, p_integration_configuration_id,
        p_product_catalog_id, p_store_id, v_catalog_id,
        CURRENT_TIMESTAMP + interval '30 minutes', v_actor
    );
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x(
        "rowNumber" integer, "externalProductId" varchar, "externalVariantId" varchar,
        "externalSku" varchar, "productName" varchar, description varchar,
        "currencyCode" varchar, "unitPriceMinor" bigint, active boolean,
        "sourceUpdatedAt" timestamptz, "canonicalProductId" varchar,
        "canonicalProductVersionNo" integer, "mappingId" varchar,
        "mappingVersionNo" integer, action varchar, reason varchar,
        "hasDependentBusinessRules" boolean, "eligibleForApply" boolean,
        "previousAttributes" jsonb, "proposedAttributes" jsonb,
        "externalCategories" jsonb, "categoryMetadataAvailable" boolean
    ) LOOP
        INSERT INTO commerce_catalog_sync_preview_rows(
            catalog_sync_preview_row_id, catalog_sync_preview_id, row_number,
            external_product_id, external_variant_id, external_sku, product_name,
            description, currency_code, unit_price_minor, active, source_updated_at,
            canonical_product_id, canonical_product_version_no,
            commerce_product_mapping_id, mapping_version_no, proposed_action, reason,
            has_dependent_business_rules, eligible_for_apply, previous_attributes,
            proposed_attributes, external_categories, category_metadata_available
        ) VALUES (
            generate_runtime_id('CSR'), v_preview, r."rowNumber",
            btrim(r."externalProductId"), NULLIF(btrim(r."externalVariantId"), ''),
            NULLIF(btrim(r."externalSku"), ''), btrim(r."productName"),
            NULLIF(btrim(r.description), ''), upper(btrim(r."currencyCode")),
            r."unitPriceMinor", COALESCE(r.active, true), r."sourceUpdatedAt",
            NULLIF(btrim(r."canonicalProductId"), ''), r."canonicalProductVersionNo",
            NULLIF(btrim(r."mappingId"), ''), r."mappingVersionNo", upper(btrim(r.action)),
            NULLIF(btrim(r.reason), ''), COALESCE(r."hasDependentBusinessRules", false),
            COALESCE(r."eligibleForApply", false), r."previousAttributes",
            r."proposedAttributes", COALESCE(r."externalCategories", '[]'::jsonb),
            COALESCE(r."categoryMetadataAvailable", false)
        );
    END LOOP;
    RETURN v_preview;
END;
$function$;

-- Existing callers cannot create an unqualified Poynt preview.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(
    p_organization_id varchar, p_integration_configuration_id varchar,
    p_product_catalog_id varchar, p_store_id varchar, p_rows jsonb,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT commerce_create_catalog_sync_preview(
        p_organization_id, p_integration_configuration_id, p_product_catalog_id,
        p_store_id, NULL::varchar, p_rows, p_actor_user_id
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_apply_catalog_sync_preview(
    p_organization_id varchar,
    p_preview_id varchar,
    p_idempotency_key varchar,
    p_actor_user_id varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
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
            INSERT INTO product(product_id, organization_id, product_code, product_name, description, status_id,
                product_catalog_id, sku, base_price_minor, currency_code, created_by, updated_by)
            VALUES(v_product, p_organization_id,
                'POS-' || upper(substr(md5(v_preview.integration_configuration_id || ':' ||
                    coalesce(v_preview.external_catalog_id, '') || ':' || r.external_product_id || ':' ||
                    coalesce(r.external_variant_id, '')), 1, 24)),
                r.product_name, r.description, 'entity-status-product-active', v_preview.product_catalog_id,
                r.external_sku, r.unit_price_minor, r.currency_code, p_actor_user_id, p_actor_user_id);
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
            currency_code, unit_price_minor_snapshot, is_active, source_updated_at, created_by, updated_by)
        VALUES(generate_runtime_id('CPS'), p_organization_id, v_preview.integration_configuration_id,
            v_preview.store_id, v_preview.external_catalog_id, v_mapping, r.external_product_id,
            r.external_variant_id, r.external_sku, r.product_name, r.description, r.currency_code,
            r.unit_price_minor, r.active, r.source_updated_at, v_actor, v_actor)
        ON CONFLICT (organization_id, integration_configuration_id, (COALESCE(store_id, '')),
            (COALESCE(external_catalog_id, '')), external_product_id,
            (COALESCE(external_variant_id, ''))) WHERE NOT is_deleted DO UPDATE
        SET commerce_product_mapping_id = v_mapping, external_sku = EXCLUDED.external_sku,
            product_name = EXCLUDED.product_name, description = EXCLUDED.description,
            currency_code = EXCLUDED.currency_code, unit_price_minor_snapshot = EXCLUDED.unit_price_minor_snapshot,
            is_active = EXCLUDED.is_active, source_updated_at = EXCLUDED.source_updated_at,
            last_synced_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor, version_no = commerce_product_snapshots.version_no + 1
        WHERE commerce_product_snapshots.commerce_product_mapping_id IS DISTINCT FROM v_mapping
           OR commerce_product_snapshots.external_sku IS DISTINCT FROM EXCLUDED.external_sku
           OR commerce_product_snapshots.product_name IS DISTINCT FROM EXCLUDED.product_name
           OR commerce_product_snapshots.description IS DISTINCT FROM EXCLUDED.description
           OR commerce_product_snapshots.currency_code IS DISTINCT FROM EXCLUDED.currency_code
           OR commerce_product_snapshots.unit_price_minor_snapshot IS DISTINCT FROM EXCLUDED.unit_price_minor_snapshot
           OR commerce_product_snapshots.is_active IS DISTINCT FROM EXCLUDED.is_active
           OR commerce_product_snapshots.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at;
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
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_catalog_sync_preview_row(
    p_organization_id varchar,
    p_preview_id varchar,
    p_row_number integer,
    p_product_id varchar,
    p_expected_product_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
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
        RAISE EXCEPTION 'Catalog preview is unavailable' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_row
      FROM commerce_catalog_sync_preview_rows
     WHERE catalog_sync_preview_id = v_preview.catalog_sync_preview_id
       AND row_number = p_row_number
     FOR UPDATE;
    IF NOT FOUND OR v_row.proposed_action <> 'CONFLICT' THEN
        RAISE EXCEPTION 'Preview row is not eligible for manual resolution' USING ERRCODE = '22023';
    END IF;
    IF v_row.external_product_id IS NULL OR v_row.product_name IS NULL THEN
        RAISE EXCEPTION 'Invalid provider product cannot be resolved manually' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_product
      FROM product
     WHERE product_id = p_product_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND OR p_expected_product_version_no IS NULL
       OR v_product.version_no <> p_expected_product_version_no THEN
        RAISE EXCEPTION 'Canonical product changed since preview' USING ERRCODE = '40001';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM commerce_product_mappings mapping
         WHERE mapping.organization_id = p_organization_id
           AND mapping.integration_configuration_id = v_preview.integration_configuration_id
           AND mapping.store_id IS NOT DISTINCT FROM v_preview.store_id
           AND mapping.external_catalog_id IS NOT DISTINCT FROM v_preview.external_catalog_id
           AND mapping.external_product_id = v_row.external_product_id
           AND mapping.external_variant_id IS NOT DISTINCT FROM v_row.external_variant_id
           AND mapping.product_id IS DISTINCT FROM v_product.product_id
           AND NOT mapping.is_deleted
    ) THEN
        RAISE EXCEPTION 'External identity is already verified for another product'
            USING ERRCODE = '23505';
    END IF;
    UPDATE commerce_catalog_sync_preview_rows
       SET canonical_product_id = v_product.product_id,
           canonical_product_version_no = v_product.version_no,
           resolved_canonical_product_id = v_product.product_id,
           resolved_canonical_product_version_no = v_product.version_no,
           resolved_at = CURRENT_TIMESTAMP,
           resolved_by = v_actor,
           proposed_action = 'MATCHED',
           eligible_for_apply = true,
           reason = 'Administrator selected canonical product for ambiguous SKU'
     WHERE catalog_sync_preview_row_id = v_row.catalog_sync_preview_row_id;
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_validate_mapping_catalog_identity(varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_mapping(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_snapshot(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, bigint, boolean, timestamp with time zone, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(varchar, varchar, varchar, varchar, varchar, jsonb, varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".save_commerce_product_mapping(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_commerce_product_snapshot(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, bigint, boolean, timestamp with time zone, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_create_catalog_sync_preview(varchar, varchar, varchar, varchar, varchar, jsonb, varchar) TO "${appRole}";

-- W222: authorized catalog-specific readers. The legacy RETURNS TABLE
-- functions remain unchanged. These functions intentionally do not infer
-- a historical external_catalog_id for pre-W222 NULL rows.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_catalog_product_mappings(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_external_catalog_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    mapping_id varchar, organization_id varchar, product_id varchar,
    integration_configuration_id varchar, store_id varchar,
    external_catalog_id varchar, external_product_id varchar,
    external_variant_id varchar, external_sku varchar, active boolean,
    version_no integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_external_catalog_id), '') IS NULL THEN
        RAISE EXCEPTION 'External catalog identity is required' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT m.commerce_product_mapping_id::varchar, m.organization_id::varchar,
           m.product_id::varchar, m.integration_configuration_id::varchar,
           m.store_id::varchar, m.external_catalog_id::varchar,
           m.external_product_id::varchar, m.external_variant_id::varchar,
           m.external_sku::varchar, m.is_active, m.version_no::integer
      FROM commerce_product_mappings m
     WHERE m.organization_id = p_organization_id
       AND m.integration_configuration_id = p_integration_configuration_id
       AND m.external_catalog_id = btrim(p_external_catalog_id)
       AND NOT m.is_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_catalog_product_snapshots(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_external_catalog_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    snapshot_id varchar, organization_id varchar,
    integration_configuration_id varchar, store_id varchar,
    external_catalog_id varchar, external_product_id varchar,
    external_variant_id varchar, external_sku varchar,
    product_name varchar, description varchar, currency_code varchar,
    unit_price_minor_snapshot bigint, active boolean,
    source_updated_at varchar, last_synced_at varchar, version_no integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_external_catalog_id), '') IS NULL THEN
        RAISE EXCEPTION 'External catalog identity is required' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT s.commerce_product_snapshot_id::varchar, s.organization_id::varchar,
           s.integration_configuration_id::varchar, s.store_id::varchar,
           s.external_catalog_id::varchar, s.external_product_id::varchar,
           s.external_variant_id::varchar, s.external_sku::varchar,
           s.product_name::varchar, s.description::varchar, s.currency_code::varchar,
           s.unit_price_minor_snapshot::bigint, s.is_active,
           s.source_updated_at::varchar, s.last_synced_at::varchar,
           s.version_no::integer
      FROM commerce_product_snapshots s
     WHERE s.organization_id = p_organization_id
       AND s.integration_configuration_id = p_integration_configuration_id
       AND s.external_catalog_id = btrim(p_external_catalog_id)
       AND NOT s.is_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_catalog_product_mappings(varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_catalog_product_snapshots(varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_catalog_product_mappings(varchar, varchar, varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_catalog_product_snapshots(varchar, varchar, varchar, varchar) TO "${appRole}";


-- W222: authoritative Store-qualified eligible Poynt Product mappings.
-- Reused by product-specific Benefit/Offer targeting and provider checkout.
-- Only an exact Store + selected integration + effective catalog match qualifies.
-- Historical NULL catalog provenance never becomes eligible by inference.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_store_eligible_poynt_mappings(
    p_organization_id varchar,
    p_store_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    mapping_id varchar, organization_id varchar, product_id varchar,
    integration_configuration_id varchar, store_id varchar,
    external_catalog_id varchar, external_product_id varchar,
    external_variant_id varchar, external_sku varchar, active boolean,
    version_no integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_store_id), '') IS NULL THEN
        RAISE EXCEPTION 'Store is required for Product eligibility' USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT m.commerce_product_mapping_id::varchar, m.organization_id::varchar,
           m.product_id::varchar, m.integration_configuration_id::varchar,
           m.store_id::varchar, m.external_catalog_id::varchar,
           m.external_product_id::varchar, m.external_variant_id::varchar,
           m.external_sku::varchar, m.is_active, m.version_no::integer
      FROM commerce_store_catalog_sources source
      JOIN poynt_store_catalog_configurations configuration
        ON configuration.organization_id = source.organization_id
       AND configuration.store_id = source.store_id
       AND configuration.integration_configuration_id = source.integration_configuration_id
      JOIN integration_configurations integration
        ON integration.organization_id = source.organization_id
       AND integration.integration_configuration_id = source.integration_configuration_id
       AND upper(integration.provider) = 'POYNT'
       AND NOT integration.is_deleted
      JOIN commerce_product_mappings m
        ON m.organization_id = source.organization_id
       AND m.store_id = source.store_id
       AND m.integration_configuration_id = source.integration_configuration_id
       AND m.external_catalog_id = configuration.effective_catalog_id
       AND NOT m.is_deleted AND m.is_active AND m.product_id IS NOT NULL
      JOIN product p
        ON p.product_id = m.product_id
       AND p.organization_id = source.organization_id
       AND NOT p.is_deleted
     WHERE source.organization_id = p_organization_id
       AND source.store_id = btrim(p_store_id)
       AND NULLIF(btrim(configuration.effective_catalog_id), '') IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_store_eligible_poynt_mappings(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_store_eligible_poynt_mappings(varchar, varchar, varchar) TO "${appRole}";

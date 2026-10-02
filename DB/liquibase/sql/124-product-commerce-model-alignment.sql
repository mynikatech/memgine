-- Canonical Product / Commerce alignment.
-- Product is Memgine's durable business identity. Provider identity remains
-- on commerce_product_mappings and snapshots are linked to that mapping.

ALTER TABLE "${schemaName}".commerce_product_snapshots
    ADD COLUMN IF NOT EXISTS commerce_product_mapping_id varchar(64);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint constraint_row
          JOIN pg_namespace namespace_row
            ON namespace_row.oid = constraint_row.connamespace
         WHERE constraint_row.conname = 'fk_commerce_product_snapshot_mapping'
           AND namespace_row.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".commerce_product_snapshots
            ADD CONSTRAINT fk_commerce_product_snapshot_mapping
            FOREIGN KEY (commerce_product_mapping_id)
            REFERENCES "${schemaName}".commerce_product_mappings(
                commerce_product_mapping_id
            );
    END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS ix_commerce_product_snapshots_mapping
    ON "${schemaName}".commerce_product_snapshots (
        commerce_product_mapping_id,
        last_synced_at DESC
    )
    WHERE NOT is_deleted AND commerce_product_mapping_id IS NOT NULL;

ALTER TABLE "${schemaName}".redemption_transaction_item
    ADD COLUMN IF NOT EXISTS commerce_product_mapping_id varchar(64);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint constraint_row
          JOIN pg_namespace namespace_row
            ON namespace_row.oid = constraint_row.connamespace
         WHERE constraint_row.conname = 'fk_redemption_transaction_item_commerce_mapping'
           AND namespace_row.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".redemption_transaction_item
            ADD CONSTRAINT fk_redemption_transaction_item_commerce_mapping
            FOREIGN KEY (commerce_product_mapping_id)
            REFERENCES "${schemaName}".commerce_product_mappings(
                commerce_product_mapping_id
            );
    END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS ix_redemption_transaction_item_mapping
    ON "${schemaName}".redemption_transaction_item (
        commerce_product_mapping_id
    )
    WHERE commerce_product_mapping_id IS NOT NULL;

-- Reconcile only unambiguous same-organization SKU identities. Product names
-- are intentionally not considered an identity source.
WITH unambiguous_product AS (
    SELECT
        mapping.commerce_product_mapping_id,
        min(product.product_id) AS product_id
      FROM commerce_product_mappings mapping
      JOIN product
        ON product.organization_id = mapping.organization_id
       AND product.product_code = mapping.external_sku
       AND NOT product.is_deleted
     WHERE mapping.product_id IS NULL
       AND NOT mapping.is_deleted
       AND NULLIF(btrim(mapping.external_sku), '') IS NOT NULL
     GROUP BY mapping.commerce_product_mapping_id
    HAVING count(*) = 1
)
UPDATE commerce_product_mappings mapping
   SET product_id = candidate.product_id
  FROM unambiguous_product candidate
 WHERE mapping.commerce_product_mapping_id = candidate.commerce_product_mapping_id
   AND mapping.product_id IS NULL;

-- Snapshots are linked only when their complete existing provider identity
-- resolves to exactly one active mapping.
WITH unambiguous_mapping AS (
    SELECT
        snapshot.commerce_product_snapshot_id,
        min(mapping.commerce_product_mapping_id) AS commerce_product_mapping_id
      FROM commerce_product_snapshots snapshot
      JOIN commerce_product_mappings mapping
        ON mapping.organization_id = snapshot.organization_id
       AND mapping.integration_configuration_id = snapshot.integration_configuration_id
       AND mapping.store_id IS NOT DISTINCT FROM snapshot.store_id
       AND mapping.external_product_id = snapshot.external_product_id
       AND mapping.external_variant_id IS NOT DISTINCT FROM snapshot.external_variant_id
       AND NOT mapping.is_deleted
     WHERE snapshot.commerce_product_mapping_id IS NULL
       AND NOT snapshot.is_deleted
     GROUP BY snapshot.commerce_product_snapshot_id
    HAVING count(*) = 1
)
UPDATE commerce_product_snapshots snapshot
   SET commerce_product_mapping_id = candidate.commerce_product_mapping_id
  FROM unambiguous_mapping candidate
 WHERE snapshot.commerce_product_snapshot_id = candidate.commerce_product_snapshot_id
   AND snapshot.commerce_product_mapping_id IS NULL;

-- PostgreSQL does not allow CREATE OR REPLACE to change a function's
-- RETURNS TABLE shape, so these read-only contracts are recreated below.
DROP FUNCTION IF EXISTS "${schemaName}".get_commerce_product_mappings(varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_commerce_adjustment_mappings(varchar, varchar, varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_commerce_product_snapshots(varchar, varchar);

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_product_mappings(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "mappingId" varchar,
    "organizationId" varchar,
    "productId" varchar,
    "integrationConfigurationId" varchar,
    "storeId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "externalSku" varchar,
    active boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT mapping.commerce_product_mapping_id,
           mapping.organization_id,
           mapping.product_id,
           mapping.integration_configuration_id,
           mapping.store_id,
           mapping.external_product_id,
           mapping.external_variant_id,
           mapping.external_sku,
           mapping.is_active,
           mapping.version_no
      FROM commerce_product_mappings mapping
     WHERE mapping.organization_id = p_organization_id
       AND NOT mapping.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY mapping.product_id NULLS LAST,
              mapping.external_product_id,
              mapping.commerce_product_mapping_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_adjustment_mappings(
    p_organization_id varchar,
    p_adjustment_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "mappingId" varchar,
    "organizationId" varchar,
    "productId" varchar,
    "integrationConfigurationId" varchar,
    "storeId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "externalSku" varchar,
    active boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT mapping.commerce_product_mapping_id,
           mapping.organization_id,
           mapping.product_id,
           mapping.integration_configuration_id,
           mapping.store_id,
           mapping.external_product_id,
           mapping.external_variant_id,
           mapping.external_sku,
           mapping.is_active,
           mapping.version_no
      FROM commerce_adjustment_product_mappings link
      JOIN commerce_product_mappings mapping
        ON mapping.commerce_product_mapping_id = link.commerce_product_mapping_id
      JOIN commerce_adjustments adjustment
        ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
     WHERE adjustment.organization_id = p_organization_id
       AND adjustment.commerce_adjustment_id = p_adjustment_id
       AND NOT adjustment.is_deleted
       AND NOT link.is_deleted
       AND NOT mapping.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY mapping.product_id NULLS LAST,
              mapping.external_product_id,
              mapping.commerce_product_mapping_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_commerce_product_snapshots(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "snapshotId" varchar,
    "organizationId" varchar,
    "mappingId" varchar,
    "productId" varchar,
    "integrationConfigurationId" varchar,
    "storeId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    "externalSku" varchar,
    "productName" varchar,
    description varchar,
    "currencyCode" varchar,
    "unitPriceMinorSnapshot" bigint,
    active boolean,
    "sourceUpdatedAt" text,
    "lastSyncedAt" text,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT snapshot.commerce_product_snapshot_id,
           snapshot.organization_id,
           snapshot.commerce_product_mapping_id,
           mapping.product_id,
           snapshot.integration_configuration_id,
           snapshot.store_id,
           snapshot.external_product_id,
           snapshot.external_variant_id,
           snapshot.external_sku,
           snapshot.product_name,
           snapshot.description,
           snapshot.currency_code,
           snapshot.unit_price_minor_snapshot,
           snapshot.is_active,
           snapshot.source_updated_at::text,
           snapshot.last_synced_at::text,
           snapshot.version_no
      FROM commerce_product_snapshots snapshot
      LEFT JOIN commerce_product_mappings mapping
        ON mapping.commerce_product_mapping_id = snapshot.commerce_product_mapping_id
       AND NOT mapping.is_deleted
     WHERE snapshot.organization_id = p_organization_id
       AND NOT snapshot.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY snapshot.product_name, snapshot.commerce_product_snapshot_id;
$function$;

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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_id varchar(64);
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

    IF NULLIF(btrim(p_product_id), '') IS NULL
       OR NULLIF(btrim(p_external_product_id), '') IS NULL
       OR length(p_product_id) > 64
       OR length(p_external_product_id) > 160
       OR COALESCE(length(p_external_variant_id), 0) > 160
       OR COALESCE(length(p_external_sku), 0) > 160 THEN
        RAISE EXCEPTION 'Invalid commerce product mapping'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM product
         WHERE product_id = p_product_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Product is not active in organization'
            USING ERRCODE = '23503';
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
        SELECT 1
          FROM stores
         WHERE store_id = p_store_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Store is not in organization'
            USING ERRCODE = '23503';
    END IF;

    SELECT commerce_product_mapping_id
      INTO v_id
      FROM commerce_product_mappings
     WHERE organization_id = p_organization_id
       AND integration_configuration_id = p_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM p_store_id
       AND external_product_id = btrim(p_external_product_id)
       AND external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
       AND NOT is_deleted
     FOR UPDATE;

    IF v_id IS NULL THEN
        v_id := generate_runtime_id('CPM');
        INSERT INTO commerce_product_mappings (
            commerce_product_mapping_id,
            organization_id,
            product_id,
            integration_configuration_id,
            store_id,
            external_product_id,
            external_variant_id,
            external_sku,
            is_active,
            created_by,
            updated_by
        ) VALUES (
            v_id,
            p_organization_id,
            p_product_id,
            p_integration_configuration_id,
            p_store_id,
            btrim(p_external_product_id),
            NULLIF(btrim(p_external_variant_id), ''),
            NULLIF(btrim(p_external_sku), ''),
            COALESCE(p_active, true),
            v_actor_organization_user_id,
            v_actor_organization_user_id
        );
    ELSE
        UPDATE commerce_product_mappings
           SET product_id = p_product_id,
               external_sku = NULLIF(btrim(p_external_sku), ''),
               is_active = COALESCE(p_active, true),
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_product_mapping_id = v_id;
    END IF;

    RETURN v_id;
END;
$function$;

-- Compatibility overload for existing callers. It only resolves a Product by
-- a unique same-organization SKU and otherwise refuses to create an unmapped
-- provider identity.
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_product_id varchar(64);
BEGIN
    SELECT mapping.product_id
      INTO v_product_id
      FROM commerce_product_mappings mapping
     WHERE mapping.organization_id = p_organization_id
       AND mapping.integration_configuration_id = p_integration_configuration_id
       AND mapping.store_id IS NOT DISTINCT FROM p_store_id
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
        p_organization_id,
        v_product_id,
        p_integration_configuration_id,
        p_store_id,
        p_external_product_id,
        p_external_variant_id,
        p_external_sku,
        p_active,
        p_actor_user_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
    v_id varchar(64);
    v_mapping_id varchar(64);
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

    IF NULLIF(btrim(p_external_product_id), '') IS NULL
       OR length(p_external_product_id) > 160
       OR COALESCE(length(p_external_variant_id), 0) > 160
       OR COALESCE(length(p_external_sku), 0) > 160
       OR NULLIF(btrim(p_product_name), '') IS NULL
       OR length(p_product_name) > 200
       OR COALESCE(length(p_description), 0) > 2000
       OR p_currency_code !~ '^[A-Z]{3}$'
       OR p_unit_price_minor_snapshot < 0 THEN
        RAISE EXCEPTION 'Invalid commerce product snapshot'
            USING ERRCODE = '22023';
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
        SELECT 1
          FROM stores
         WHERE store_id = p_store_id
           AND organization_id = p_organization_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Store is not in organization'
            USING ERRCODE = '23503';
    END IF;

    v_mapping_id := p_commerce_product_mapping_id;

    IF v_mapping_id IS NULL THEN
        SELECT mapping.commerce_product_mapping_id
          INTO v_mapping_id
          FROM commerce_product_mappings mapping
          JOIN product
            ON product.product_id = mapping.product_id
           AND product.organization_id = p_organization_id
           AND NOT product.is_deleted
         WHERE mapping.organization_id = p_organization_id
           AND mapping.integration_configuration_id = p_integration_configuration_id
           AND mapping.store_id IS NOT DISTINCT FROM p_store_id
           AND mapping.external_product_id = btrim(p_external_product_id)
           AND mapping.external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
           AND mapping.is_active
           AND NOT mapping.is_deleted;
    END IF;

    IF v_mapping_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM commerce_product_mappings mapping
          JOIN product
            ON product.product_id = mapping.product_id
           AND product.organization_id = p_organization_id
           AND NOT product.is_deleted
         WHERE mapping.commerce_product_mapping_id = v_mapping_id
           AND mapping.organization_id = p_organization_id
           AND mapping.integration_configuration_id = p_integration_configuration_id
           AND mapping.store_id IS NOT DISTINCT FROM p_store_id
           AND mapping.external_product_id = btrim(p_external_product_id)
           AND mapping.external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
           AND mapping.is_active
           AND NOT mapping.is_deleted
    ) THEN
        RAISE EXCEPTION 'Commerce product mapping does not match snapshot identity'
            USING ERRCODE = '23503';
    END IF;

    SELECT commerce_product_snapshot_id
      INTO v_id
      FROM commerce_product_snapshots
     WHERE organization_id = p_organization_id
       AND integration_configuration_id = p_integration_configuration_id
       AND store_id IS NOT DISTINCT FROM p_store_id
       AND external_product_id = btrim(p_external_product_id)
       AND external_variant_id IS NOT DISTINCT FROM NULLIF(btrim(p_external_variant_id), '')
       AND NOT is_deleted
     FOR UPDATE;

    IF v_id IS NULL THEN
        v_id := generate_runtime_id('CPS');
        INSERT INTO commerce_product_snapshots (
            commerce_product_snapshot_id,
            organization_id,
            integration_configuration_id,
            store_id,
            commerce_product_mapping_id,
            external_product_id,
            external_variant_id,
            external_sku,
            product_name,
            description,
            currency_code,
            unit_price_minor_snapshot,
            is_active,
            source_updated_at,
            last_synced_at,
            created_by,
            updated_by
        ) VALUES (
            v_id,
            p_organization_id,
            p_integration_configuration_id,
            p_store_id,
            v_mapping_id,
            btrim(p_external_product_id),
            NULLIF(btrim(p_external_variant_id), ''),
            NULLIF(btrim(p_external_sku), ''),
            btrim(p_product_name),
            NULLIF(btrim(p_description), ''),
            upper(p_currency_code),
            p_unit_price_minor_snapshot,
            COALESCE(p_active, true),
            p_source_updated_at,
            CURRENT_TIMESTAMP,
            v_actor_organization_user_id,
            v_actor_organization_user_id
        );
    ELSE
        UPDATE commerce_product_snapshots
           SET commerce_product_mapping_id = COALESCE(
                   v_mapping_id,
                   commerce_product_mapping_id
               ),
               external_sku = NULLIF(btrim(p_external_sku), ''),
               product_name = btrim(p_product_name),
               description = NULLIF(btrim(p_description), ''),
               currency_code = upper(p_currency_code),
               unit_price_minor_snapshot = p_unit_price_minor_snapshot,
               is_active = COALESCE(p_active, true),
               source_updated_at = p_source_updated_at,
               last_synced_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_product_snapshot_id = v_id;
    END IF;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_commerce_product_snapshot(
    p_organization_id varchar,
    p_integration_configuration_id varchar,
    p_store_id varchar,
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
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT save_commerce_product_snapshot(
        p_organization_id,
        p_integration_configuration_id,
        p_store_id,
        NULL::varchar,
        p_external_product_id,
        p_external_variant_id,
        p_external_sku,
        p_product_name,
        p_description,
        p_currency_code,
        p_unit_price_minor_snapshot,
        p_active,
        p_source_updated_at,
        p_actor_user_id
    );
$function$;

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
       OR (v_requires_product AND COALESCE(cardinality(p_mapping_ids), 0) = 0)
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
    v_adjustment_id varchar(64);
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
        RAISE EXCEPTION 'Pending redemption item is unavailable'
            USING ERRCODE = '23503';
    END IF;

    IF v_item.item_type = 'BENEFIT' THEN
        SELECT adjustment.commerce_adjustment_id
          INTO v_adjustment_id
          FROM benefit_commerce_adjustments link
          JOIN commerce_adjustments adjustment
            ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
         WHERE link.organization_id = p_organization_id
           AND link.benefit_id = v_item.benefit_id
           AND NOT link.is_deleted
           AND NOT adjustment.is_deleted
           AND adjustment.is_active
           AND adjustment.adjustment_type LIKE 'PRODUCT_%';
    ELSE
        SELECT adjustment.commerce_adjustment_id
          INTO v_adjustment_id
          FROM offer_commerce_adjustments link
          JOIN commerce_adjustments adjustment
            ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
         WHERE link.organization_id = p_organization_id
           AND link.offer_id = v_item.offer_id
           AND NOT link.is_deleted
           AND NOT adjustment.is_deleted
           AND adjustment.is_active
           AND adjustment.adjustment_type LIKE 'PRODUCT_%';
    END IF;

    IF v_adjustment_id IS NULL OR NOT EXISTS (
        SELECT 1
          FROM commerce_adjustment_product_mappings link
          JOIN commerce_product_mappings mapping
            ON mapping.commerce_product_mapping_id = link.commerce_product_mapping_id
          JOIN product
            ON product.product_id = mapping.product_id
           AND product.organization_id = p_organization_id
           AND NOT product.is_deleted
         WHERE link.commerce_adjustment_id = v_adjustment_id
           AND link.commerce_product_mapping_id = p_mapping_id
           AND NOT link.is_deleted
           AND mapping.organization_id = p_organization_id
           AND mapping.is_active
           AND NOT mapping.is_deleted
    ) THEN
        RAISE EXCEPTION 'Selected POS product does not apply to redemption item'
            USING ERRCODE = '23503';
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
        RAISE EXCEPTION 'Redemption transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF t.store_id IS NOT NULL AND t.store_id IS DISTINCT FROM p_store_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another store'
            USING ERRCODE = '42501';
    END IF;

    IF t.staff_id IS NOT NULL AND t.staff_id IS DISTINCT FROM p_staff_id THEN
        RAISE EXCEPTION 'Redemption transaction belongs to another staff context'
            USING ERRCODE = '42501';
    END IF;

    IF t.status <> 'PENDING'
       OR (t.expires_at IS NOT NULL
           AND t.expires_at <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
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
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        v_reason := CASE
            WHEN i.item_type = 'BENEFIT' THEN counter_benefit_rejection(
                p_organization_id,
                t.subscription_id,
                i.benefit_id
            )
            ELSE counter_offer_rejection(
                p_organization_id,
                t.subscription_id,
                i.offer_id,
                p_store_id
            )
        END;

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505';
        END IF;
    END LOOP;

    SELECT c0.*
      INTO c
      FROM commerce_transaction_redemptions link
      JOIN commerce_transactions c0
        ON c0.commerce_transaction_id = link.commerce_transaction_id
     WHERE link.redemption_transaction_id = t.redemption_transaction_id
       AND NOT link.is_deleted
       AND NOT c0.is_deleted
     FOR UPDATE OF c0;

    IF FOUND THEN
        RETURN QUERY
        SELECT c.commerce_transaction_id,
               NULL::varchar,
               c.integration_configuration_id,
               c.status;
        RETURN;
    END IF;

    SELECT route.provider_code, route.integration_configuration_id
      INTO v_provider, v_integration
      FROM commerce_payment_provider_routes route
      LEFT JOIN integration_configurations integration
        ON integration.integration_configuration_id = route.integration_configuration_id
       AND integration.organization_id = route.organization_id
       AND NOT integration.is_deleted
      LEFT JOIN entity_status integration_status
        ON integration_status.entity_status_id = integration.integration_status_id
      LEFT JOIN statuses integration_state
        ON integration_state.status_id = integration_status.status_id
     WHERE route.organization_id = p_organization_id
       AND route.source_channel = 'COUNTER'
       AND route.is_enabled
       AND NOT route.is_deleted
       AND (route.store_id = p_store_id OR route.store_id IS NULL)
       AND route.provider_code IN ('TEST', 'POYNT')
       AND (
            route.provider_code = 'TEST'
            OR (
                integration.integration_configuration_id IS NOT NULL
                AND upper(integration.provider) = route.provider_code
                AND integration_status.is_active
                AND integration_state.status_code = 'ACTIVE'
            )
       )
     ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END,
              route.commerce_payment_provider_route_id
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
    ) VALUES (
        c.commerce_transaction_id,
        p_organization_id,
        p_store_id,
        (
            SELECT organization_membership.user_id
              FROM subscriptions subscription
              JOIN organization_user organization_membership
                ON organization_membership.organization_user_id = subscription.organization_user_id
             WHERE subscription.subscription_id = t.subscription_id
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
    ) VALUES (
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
            SELECT adjustment.*
              INTO a
              FROM benefit_commerce_adjustments link
              JOIN commerce_adjustments adjustment
                ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
             WHERE link.organization_id = p_organization_id
               AND link.benefit_id = i.benefit_id
               AND NOT link.is_deleted
               AND NOT adjustment.is_deleted
               AND adjustment.is_active
               AND adjustment.adjustment_type IN (
                   'PRODUCT_FREE',
                   'PRODUCT_PERCENT_OFF',
                   'PRODUCT_FIXED_OFF',
                   'PRODUCT_SPECIAL_PRICE'
               );
        ELSE
            SELECT adjustment.*
              INTO a
              FROM offer_commerce_adjustments link
              JOIN commerce_adjustments adjustment
                ON adjustment.commerce_adjustment_id = link.commerce_adjustment_id
             WHERE link.organization_id = p_organization_id
               AND link.offer_id = i.offer_id
               AND NOT link.is_deleted
               AND NOT adjustment.is_deleted
               AND adjustment.is_active
               AND adjustment.adjustment_type IN (
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

        IF i.commerce_product_mapping_id IS NULL THEN
            SELECT count(*)
              INTO v_mapping_count
              FROM commerce_adjustment_product_mappings mapping_link
              JOIN commerce_product_mappings mapping
                ON mapping.commerce_product_mapping_id = mapping_link.commerce_product_mapping_id
              JOIN product
                ON product.product_id = mapping.product_id
               AND product.organization_id = p_organization_id
               AND NOT product.is_deleted
             WHERE mapping_link.commerce_adjustment_id = a.commerce_adjustment_id
               AND NOT mapping_link.is_deleted
               AND mapping.organization_id = p_organization_id
               AND mapping.is_active
               AND NOT mapping.is_deleted
               AND mapping.product_id IS NOT NULL;

            IF v_mapping_count = 0 THEN
                RAISE EXCEPTION 'Selected % has no active canonical POS product mapping', lower(i.item_type)
                    USING ERRCODE = '23503';
            ELSIF v_mapping_count > 1 THEN
                RAISE EXCEPTION 'Selected % requires an explicit POS product selection', lower(i.item_type)
                    USING ERRCODE = '22023';
            END IF;

            SELECT mapping.*
              INTO m
              FROM commerce_adjustment_product_mappings mapping_link
              JOIN commerce_product_mappings mapping
                ON mapping.commerce_product_mapping_id = mapping_link.commerce_product_mapping_id
              JOIN product
                ON product.product_id = mapping.product_id
               AND product.organization_id = p_organization_id
               AND NOT product.is_deleted
             WHERE mapping_link.commerce_adjustment_id = a.commerce_adjustment_id
               AND NOT mapping_link.is_deleted
               AND mapping.organization_id = p_organization_id
               AND mapping.is_active
               AND NOT mapping.is_deleted
               AND mapping.product_id IS NOT NULL;

            UPDATE redemption_transaction_item
               SET commerce_product_mapping_id = m.commerce_product_mapping_id,
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id = i.redemption_transaction_item_id;
        ELSE
            SELECT mapping.*
              INTO m
              FROM commerce_adjustment_product_mappings mapping_link
              JOIN commerce_product_mappings mapping
                ON mapping.commerce_product_mapping_id = mapping_link.commerce_product_mapping_id
              JOIN product
                ON product.product_id = mapping.product_id
               AND product.organization_id = p_organization_id
               AND NOT product.is_deleted
             WHERE mapping_link.commerce_adjustment_id = a.commerce_adjustment_id
               AND mapping.commerce_product_mapping_id = i.commerce_product_mapping_id
               AND NOT mapping_link.is_deleted
               AND mapping.organization_id = p_organization_id
               AND mapping.is_active
               AND NOT mapping.is_deleted
               AND mapping.product_id IS NOT NULL;

            IF m.commerce_product_mapping_id IS NULL THEN
                RAISE EXCEPTION 'Selected POS product is not an active configured target'
                    USING ERRCODE = '23503';
            END IF;
        END IF;

        SELECT snapshot.product_name,
               snapshot.currency_code,
               snapshot.unit_price_minor_snapshot
          INTO s
          FROM commerce_product_snapshots snapshot
         WHERE snapshot.commerce_product_mapping_id = m.commerce_product_mapping_id
           AND snapshot.organization_id = p_organization_id
           AND snapshot.is_active
           AND NOT snapshot.is_deleted
         ORDER BY snapshot.last_synced_at DESC
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
        ) VALUES (
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
        ) VALUES (
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
    SELECT c.commerce_transaction_id,
           v_provider,
           v_integration,
           'READY_FOR_PROVIDER'::varchar;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_snapshot(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, bigint, boolean, timestamp with time zone, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".save_commerce_product_snapshot(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, bigint, boolean, timestamp with time zone, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".select_counter_redemption_item_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_prepare_counter_redemption_transaction(
    varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_product_mappings(
    varchar, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_adjustment_mappings(
    varchar, varchar, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_commerce_product_snapshots(
    varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".save_commerce_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar
), "${schemaName}".save_commerce_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar
), "${schemaName}".save_commerce_product_snapshot(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar, bigint, boolean, timestamp with time zone, varchar
), "${schemaName}".save_commerce_product_snapshot(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, bigint, boolean, timestamp with time zone, varchar
), "${schemaName}".select_counter_redemption_item_product_mapping(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar
), "${schemaName}".commerce_prepare_counter_redemption_transaction(
    varchar, varchar, varchar, varchar, varchar
), "${schemaName}".get_commerce_product_mappings(
    varchar, varchar
), "${schemaName}".get_commerce_adjustment_mappings(
    varchar, varchar, varchar
), "${schemaName}".get_commerce_product_snapshots(
    varchar, varchar
) TO "${appRole}";

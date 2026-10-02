-- One-time DEV bootstrap: populate Commerce product mappings and snapshots
-- for the two OSC test organizations using the existing Memgine Product catalog.
--
-- IMPORTANT
-- - Generated external_product_id values are provisional DEV/test identifiers:
--       OSC:<product_id>
-- - They are NOT real Poynt product IDs.
-- - The script is idempotent with the current Migration 124 save functions.
-- - external_variant_id is left NULL.
-- - store_id is left NULL (organization-level mapping).
-- - Existing Memgine Product remains the canonical product identity.
-- - When real POS/Poynt IDs become available, reconcile/update these mappings
--   by product_id rather than creating parallel product identities.

BEGIN;

DO $bootstrap$
DECLARE
    r_org record;
    r_product record;

    v_actor_user_id varchar(64);
    v_integration_id varchar(64);
    v_mapping_id varchar(64);
    v_external_product_id varchar(160);
    v_currency_code varchar(3);
BEGIN
    FOR r_org IN
        SELECT *
        FROM (
            VALUES
                (
                    'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303'::varchar,
                    'PCT_4b1d262a676400a08281fc56346400b3'::varchar,
                    'integration-1790537655193'::varchar
                ),
                (
                    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'::varchar,
                    'PCT_70dfed88f1c68e4f18ac32531fda09bf'::varchar,
                    'integration-1790520886277'::varchar
                )
        ) AS configured(organization_id, product_catalog_id, integration_configuration_id)
    LOOP
        -- Resolve an organization user whose user_id can be passed to the
        -- SECURITY DEFINER save functions.
        SELECT ou.user_id
          INTO v_actor_user_id
          FROM memginedev.organization_user ou
         WHERE ou.organization_id = r_org.organization_id
           AND NOT ou.is_deleted
         ORDER BY ou.created_at, ou.organization_user_id
         LIMIT 1;

        IF v_actor_user_id IS NULL THEN
            RAISE EXCEPTION
                'No organization_user found for organization %',
                r_org.organization_id;
        END IF;

        -- Confirm the expected Poynt/POS integration exists for this org.
        SELECT ic.integration_configuration_id
          INTO v_integration_id
          FROM memginedev.integration_configurations ic
          JOIN memginedev.integration_types it
            ON it.integration_type_id = ic.integration_type_id
         WHERE ic.integration_configuration_id = r_org.integration_configuration_id
           AND ic.organization_id = r_org.organization_id
           AND upper(ic.provider) = 'POYNT'
           AND it.integration_type_code = 'POS'
           AND NOT ic.is_deleted
           AND NOT it.is_deleted
         LIMIT 1;

        IF v_integration_id IS NULL THEN
            RAISE EXCEPTION
                'Expected Poynt POS integration % not found for organization %',
                r_org.integration_configuration_id,
                r_org.organization_id;
        END IF;

        -- Confirm the expected OSC catalog belongs to this organization.
        IF NOT EXISTS (
            SELECT 1
              FROM memginedev.product_catalog pc
             WHERE pc.product_catalog_id = r_org.product_catalog_id
               AND pc.organization_id = r_org.organization_id
               AND pc.catalog_name = 'OSC'
               AND NOT pc.is_deleted
        ) THEN
            RAISE EXCEPTION
                'Expected OSC catalog % not found for organization %',
                r_org.product_catalog_id,
                r_org.organization_id;
        END IF;

        FOR r_product IN
            SELECT
                p.product_id,
                p.product_code,
                p.product_name,
                p.description,
                p.sku,
                p.base_price_minor,
                p.currency_code
              FROM memginedev.product p
             WHERE p.organization_id = r_org.organization_id
               AND p.product_catalog_id = r_org.product_catalog_id
               AND NOT p.is_deleted
             ORDER BY p.product_id
        LOOP
            -- Deterministic provisional POS identity for DEV/testing only.
            v_external_product_id := 'OSC:' || r_product.product_id;
            v_currency_code := COALESCE(NULLIF(upper(r_product.currency_code), ''), 'CAD');

            v_mapping_id := memginedev.save_commerce_product_mapping(
                r_org.organization_id,
                r_product.product_id,
                v_integration_id,
                NULL,                              -- store_id: org-level for now
                v_external_product_id,
                NULL,                              -- external_variant_id
                NULLIF(btrim(r_product.sku), ''),
                TRUE,
                v_actor_user_id
            );

            PERFORM memginedev.save_commerce_product_snapshot(
                r_org.organization_id,
                v_integration_id,
                NULL,                              -- store_id
                v_mapping_id,
                v_external_product_id,
                NULL,                              -- external_variant_id
                NULLIF(btrim(r_product.sku), ''),
                r_product.product_name,
                r_product.description,
                v_currency_code,
                COALESCE(r_product.base_price_minor, 0),
                TRUE,
                NULL,                              -- source_updated_at unavailable in bootstrap
                v_actor_user_id
            );
        END LOOP;

        RAISE NOTICE
            'Commerce bootstrap completed for organization %, catalog %, integration %',
            r_org.organization_id,
            r_org.product_catalog_id,
            v_integration_id;
    END LOOP;
END
$bootstrap$;

COMMIT;


-- ---------------------------------------------------------------------------
-- Verification queries
-- ---------------------------------------------------------------------------

-- 1. Expect 113 mappings per test organization.
SELECT
    organization_id,
    COUNT(*) AS mapping_count,
    COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS canonical_product_count,
    COUNT(*) FILTER (WHERE is_active AND NOT is_deleted) AS active_mapping_count
FROM memginedev.commerce_product_mappings
WHERE organization_id IN (
    'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303',
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
)
  AND NOT is_deleted
GROUP BY organization_id
ORDER BY organization_id;


-- 2. Expect 113 snapshots per test organization, all linked to mappings.
SELECT
    organization_id,
    COUNT(*) AS snapshot_count,
    COUNT(*) FILTER (
        WHERE commerce_product_mapping_id IS NOT NULL
    ) AS linked_snapshot_count
FROM memginedev.commerce_product_snapshots
WHERE organization_id IN (
    'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303',
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
)
  AND NOT is_deleted
GROUP BY organization_id
ORDER BY organization_id;


-- 3. Verify Product -> Mapping -> Snapshot integrity.
SELECT
    p.organization_id,
    p.product_id,
    p.product_code,
    p.product_name,
    p.sku,
    m.commerce_product_mapping_id,
    m.external_product_id,
    m.external_sku,
    s.commerce_product_snapshot_id,
    s.unit_price_minor_snapshot,
    s.currency_code
FROM memginedev.product p
JOIN memginedev.commerce_product_mappings m
  ON m.product_id = p.product_id
 AND NOT m.is_deleted
LEFT JOIN memginedev.commerce_product_snapshots s
  ON s.commerce_product_mapping_id = m.commerce_product_mapping_id
 AND NOT s.is_deleted
WHERE p.organization_id IN (
    'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303',
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
)
  AND NOT p.is_deleted
ORDER BY p.organization_id, p.product_name;


-- 4. There should be no mapped product without a snapshot.
SELECT
    m.organization_id,
    m.commerce_product_mapping_id,
    m.product_id,
    m.external_product_id,
    m.external_sku
FROM memginedev.commerce_product_mappings m
LEFT JOIN memginedev.commerce_product_snapshots s
  ON s.commerce_product_mapping_id = m.commerce_product_mapping_id
 AND NOT s.is_deleted
WHERE m.organization_id IN (
    'ORG_820d0ff6-a8f8-4bec-9510-266930e6d303',
    'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
)
  AND NOT m.is_deleted
  AND s.commerce_product_snapshot_id IS NULL
ORDER BY m.organization_id, m.external_sku;

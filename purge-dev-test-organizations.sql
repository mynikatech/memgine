-- ============================================================================
-- DEV ONLY - Physical purge of two test organizations
--
-- Targets:
--   ORG_820d0ff6-a8f8-4bec-9510-266930e6d303
--   ORG_b6df45cc-2747-49c1-b6d9-e25ad7c16d1f
--
-- PURPOSE
--   Physically remove organization-scoped DEV test data and then remove the
--   organization rows themselves.
--
-- SAFETY
--   * Aborts unless current_database() = 'memgine_dev'
--   * Aborts unless schema memginedev exists
--   * Aborts unless BOTH target organization rows exist
--   * Deletes only rows whose organization_id is one of the two target IDs
--   * Does NOT delete global user rows
--   * Uses FK-safe retry passes across organization-scoped tables
--   * Aborts if any organization-scoped rows remain because of unresolved FKs
--
-- IMPORTANT
--   This is intentionally OUTSIDE Liquibase.
-- ============================================================================
\set ON_ERROR_STOP on

BEGIN;

SET LOCAL search_path = memginedev, pg_catalog;

-- ================================================================
-- DEV ONLY - Physical purge of two test organizations
-- ================================================================
-- Targets:
--   ORG_820d0ff6-a8f8-4bec-9510-266930e6d303
--   ORG_b6df45cc-2747-49c1-b6d9-e25ad7c16d1f
--
-- Safety:
-- - DEV DB only
-- - Both orgs must exist
-- - Global users are NOT deleted
-- - Organization rows deleted last
-- - Any unresolved FK dependency aborts the whole transaction
-- ================================================================

DO $$
BEGIN
    IF current_database() <> 'memgine_dev' THEN
        RAISE EXCEPTION
            'DEV purge aborted: current database is %, expected memgine_dev',
            current_database();
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_namespace
        WHERE nspname = 'memginedev'
    ) THEN
        RAISE EXCEPTION
            'DEV purge aborted: schema memginedev does not exist';
    END IF;
END;
$$;

CREATE TEMP TABLE purge_target_organization (
    organization_id varchar(64) PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO purge_target_organization (organization_id)
VALUES
    ('ORG_820d0ff6-a8f8-4bec-9510-266930e6d303'),
    ('ORG_b6df45cc-2747-49c1-b6d9-e25ad7c16d1f');

DO $$
DECLARE
    v_found integer;
BEGIN
    SELECT count(*)
    INTO v_found
    FROM memginedev.organization o
    JOIN purge_target_organization t
      ON t.organization_id = o.organization_id;

    IF v_found <> 2 THEN
        RAISE EXCEPTION
            'DEV purge aborted: expected both target organizations; found % of 2',
            v_found;
    END IF;

    RAISE NOTICE
        'DEV purge targets verified: % organization rows found',
        v_found;
END;
$$;

-- ================================================================
-- Break organization -> published release circular reference
-- ================================================================

UPDATE memginedev.organization
SET published_customer_experience_release_id = NULL
WHERE organization_id IN (
    SELECT organization_id
    FROM purge_target_organization
);

-- ================================================================
-- Redemption transaction children
-- ================================================================

DELETE FROM memginedev.redemption_transaction_item rti
WHERE EXISTS (
    SELECT 1
    FROM memginedev.redemption_transaction rt
    WHERE rt.redemption_transaction_id = rti.redemption_transaction_id
      AND rt.organization_id IN (
          SELECT organization_id
          FROM purge_target_organization
      )
);

DELETE FROM memginedev.redemptions r
WHERE r.benefit_id IN (
    SELECT b.benefit_id
    FROM memginedev.benefits b
    WHERE b.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Commerce transaction children
-- ================================================================

DELETE FROM memginedev.commerce_transaction_adjustments cta
WHERE EXISTS (
    SELECT 1
    FROM memginedev.commerce_transactions ct
    WHERE ct.commerce_transaction_id = cta.commerce_transaction_id
      AND ct.organization_id IN (
          SELECT organization_id
          FROM purge_target_organization
      )
);

DELETE FROM memginedev.commerce_transaction_lines ctl
WHERE EXISTS (
    SELECT 1
    FROM memginedev.commerce_transactions ct
    WHERE ct.commerce_transaction_id = ctl.commerce_transaction_id
      AND ct.organization_id IN (
          SELECT organization_id
          FROM purge_target_organization
      )
);

DELETE FROM memginedev.commerce_transaction_redemptions ctr
WHERE EXISTS (
    SELECT 1
    FROM memginedev.commerce_transactions ct
    WHERE ct.commerce_transaction_id = ctr.commerce_transaction_id
      AND ct.organization_id IN (
          SELECT organization_id
          FROM purge_target_organization
      )
);

-- ================================================================
-- Commerce adjustment children
-- ================================================================

DELETE FROM memginedev.commerce_adjustment_product_mappings capm
WHERE capm.commerce_adjustment_id IN (
    SELECT ca.commerce_adjustment_id
    FROM memginedev.commerce_adjustments ca
    WHERE ca.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Integration configuration children
-- ================================================================

DELETE FROM memginedev.commerce_catalog_sync_states x
WHERE x.integration_configuration_id IN (
    SELECT ic.integration_configuration_id
    FROM memginedev.integration_configurations ic
    WHERE ic.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.commerce_payment_provider_routes x
WHERE x.integration_configuration_id IN (
    SELECT ic.integration_configuration_id
    FROM memginedev.integration_configurations ic
    WHERE ic.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.commerce_provider_catalog_configurations x
WHERE x.integration_configuration_id IN (
    SELECT ic.integration_configuration_id
    FROM memginedev.integration_configurations ic
    WHERE ic.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Payment chain
-- payment_attempts -> payment_intents
-- ================================================================

DELETE FROM memginedev.payment_attempts pa
WHERE pa.payment_intent_id IN (
    SELECT pi.payment_intent_id
    FROM memginedev.payment_intents pi
    WHERE pi.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.payment_intents
WHERE organization_id IN (
    SELECT organization_id
    FROM purge_target_organization
);

-- ================================================================
-- Membership product children
-- ================================================================

DELETE FROM memginedev.membership_offer_applicability_products x
WHERE x.membership_product_id IN (
    SELECT mp.membership_product_id
    FROM memginedev.membership_products mp
    WHERE mp.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.membership_offer_applicability x
WHERE x.source_membership_product_id IN (
        SELECT mp.membership_product_id
        FROM memginedev.membership_products mp
        WHERE mp.organization_id IN (
            SELECT organization_id
            FROM purge_target_organization
        )
    )
   OR x.target_membership_product_id IN (
        SELECT mp.membership_product_id
        FROM memginedev.membership_products mp
        WHERE mp.organization_id IN (
            SELECT organization_id
            FROM purge_target_organization
        )
    );

DELETE FROM memginedev.qr_membership_acquisition_attributions x
WHERE x.membership_product_id IN (
    SELECT mp.membership_product_id
    FROM memginedev.membership_products mp
    WHERE mp.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- membership_product_benefits and subscription_plans use CASCADE

-- ================================================================
-- Staff children
-- ================================================================

DELETE FROM memginedev.staff_pin_credentials x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.staff_store_assignment x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.counter_purchases x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.offer_redemptions x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.qr_scan_history x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.redemptions x
WHERE x.staff_id IN (
    SELECT s.staff_id
    FROM memginedev.staff s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Store children
-- ================================================================

DELETE FROM memginedev.poynt_terminal_bindings x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.qr_codes x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.qr_scan_history x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.counter_purchases x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.offer_redemptions x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.redemptions x
WHERE x.store_id IN (
    SELECT s.store_id
    FROM memginedev.stores s
    WHERE s.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Organization-user dependent rows
-- ================================================================

DELETE FROM memginedev.commerce_provider_payment_attempts x
WHERE x.created_by IN (
    SELECT ou.organization_user_id
    FROM memginedev.organization_user ou
    WHERE ou.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

DELETE FROM memginedev.product_import_batch x
WHERE x.created_by IN (
    SELECT ou.organization_user_id
    FROM memginedev.organization_user ou
    WHERE ou.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- ================================================================
-- Redemption transaction -> subscription dependency
-- ================================================================

DELETE FROM memginedev.redemption_transaction_qr
WHERE organization_id IN (
    SELECT organization_id
    FROM purge_target_organization
);

DELETE FROM memginedev.redemption_transaction
WHERE organization_id IN (
    SELECT organization_id
    FROM purge_target_organization
);

-- ================================================================
-- Subscriptions can now be removed
-- ================================================================

DELETE FROM memginedev.subscriptions x
WHERE x.organization_user_id IN (
    SELECT ou.organization_user_id
    FROM memginedev.organization_user ou
    WHERE ou.organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    )
);

-- organization_user_roles uses CASCADE

-- ================================================================
-- Commerce transaction parents
-- ================================================================

DELETE FROM memginedev.commerce_transactions
WHERE organization_id IN (
    SELECT organization_id
    FROM purge_target_organization
);

-- ================================================================
-- Generic FK-aware deletion for all remaining direct org rows
-- ================================================================

DO $$
DECLARE
    r record;
    v_deleted bigint;
    v_progress bigint;
    v_pass integer := 0;
BEGIN
    LOOP
        v_pass := v_pass + 1;
        v_progress := 0;

        IF v_pass > 100 THEN
            RAISE EXCEPTION
                'DEV purge aborted: exceeded 100 FK-resolution passes';
        END IF;

        FOR r IN
            SELECT c.table_name
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema
             AND t.table_name = c.table_name
            WHERE c.table_schema = 'memginedev'
              AND c.column_name = 'organization_id'
              AND t.table_type = 'BASE TABLE'
              AND c.table_name <> 'organization'
            ORDER BY c.table_name
        LOOP
            BEGIN
                EXECUTE format(
                    'DELETE FROM memginedev.%I
                     WHERE organization_id IN (
                         SELECT organization_id
                         FROM purge_target_organization
                     )',
                    r.table_name
                );

                GET DIAGNOSTICS v_deleted = ROW_COUNT;

                IF v_deleted > 0 THEN
                    v_progress := v_progress + v_deleted;

                    RAISE NOTICE
                        'Pass %, table %, deleted %',
                        v_pass,
                        r.table_name,
                        v_deleted;
                END IF;

            EXCEPTION
                WHEN foreign_key_violation THEN
                    NULL;
            END;
        END LOOP;

        EXIT WHEN v_progress = 0;
    END LOOP;

    RAISE NOTICE
        'Organization-scoped purge passes completed: %',
        v_pass;
END;
$$;

-- ================================================================
-- Verify no direct organization-scoped rows remain
-- ================================================================

DO $$
DECLARE
    r record;
    v_count bigint;
    v_remaining text := '';
BEGIN
    FOR r IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'memginedev'
          AND c.column_name = 'organization_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name <> 'organization'
        ORDER BY c.table_name
    LOOP
        EXECUTE format(
            'SELECT count(*)
             FROM memginedev.%I
             WHERE organization_id IN (
                 SELECT organization_id
                 FROM purge_target_organization
             )',
            r.table_name
        )
        INTO v_count;

        IF v_count > 0 THEN
            v_remaining :=
                v_remaining ||
                CASE
                    WHEN v_remaining = '' THEN ''
                    ELSE '; '
                END ||
                format('%s=%s', r.table_name, v_count);
        END IF;
    END LOOP;

    IF v_remaining <> '' THEN
        RAISE EXCEPTION
            'DEV purge stopped. Remaining organization rows: %',
            v_remaining;
    END IF;
END;
$$;

-- ================================================================
-- Delete organizations LAST
-- ================================================================

DO $$
DECLARE
    v_deleted integer;
BEGIN
    DELETE FROM memginedev.organization
    WHERE organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    IF v_deleted <> 2 THEN
        RAISE EXCEPTION
            'DEV purge aborted: expected 2 organizations, deleted %',
            v_deleted;
    END IF;

    RAISE NOTICE
        'Deleted % organization rows',
        v_deleted;
END;
$$;

-- ================================================================
-- Final verification
-- ================================================================

DO $$
DECLARE
    v_remaining integer;
BEGIN
    SELECT count(*)
    INTO v_remaining
    FROM memginedev.organization
    WHERE organization_id IN (
        SELECT organization_id
        FROM purge_target_organization
    );

    IF v_remaining <> 0 THEN
        RAISE EXCEPTION
            'DEV purge verification failed: % target organizations remain',
            v_remaining;
    END IF;

    RAISE NOTICE 'DEV purge completed successfully';
    RAISE NOTICE 'Both target organizations were physically deleted';
    RAISE NOTICE 'Global user records were intentionally NOT deleted';
END;
$$;

COMMIT;
-- ============================================================================
-- END DEV-ONLY PURGE
-- ============================================================================

-- ============================================================================
-- Memgine Batch 2H - Existing Organization Data Migration Prerequisites
--
-- Database corrections discovered while preparing the one-time existing
-- organization data migration.
--
-- This file intentionally contains no PL/pgSQL DO blocks so that Liquibase
-- can safely execute it with splitStatements=true.
-- ============================================================================


-- ============================================================================
-- STORE CODE LENGTH
-- ============================================================================

ALTER TABLE "${schemaName}"."stores"
    ALTER COLUMN "store_code" TYPE varchar(64);


-- ============================================================================
-- PRODUCT CODE UNIQUENESS
--
-- Product codes are scoped to an organization.
-- ============================================================================

ALTER TABLE "${schemaName}"."product"
    DROP CONSTRAINT IF EXISTS "product_product_code_key";

DROP INDEX IF EXISTS "${schemaName}"."product_product_code_key";


-- ============================================================================
-- ORGANIZATION USER UNIQUENESS
--
-- A user may have multiple relationship types with the same organization,
-- for example EMPLOYEE and CUSTOMER.
-- ============================================================================

ALTER TABLE "${schemaName}"."organization_user"
    DROP CONSTRAINT IF EXISTS "ux_organization_user_organization_user";

DROP INDEX IF EXISTS
    "${schemaName}"."ux_organization_user_organization_user";



-- ============================================================================
-- BENEFIT USAGE RULE ID LENGTH
-- Memgine IDs use varchar(64).
-- ============================================================================

ALTER TABLE "${schemaName}"."benefit_usage_rule"
    ALTER COLUMN "benefit_usage_rule_id" TYPE varchar(64);


-- ============================================================================
-- QR CODE REFERENCE DATA
--
-- QR_CODE is Entity Type 25 in the PDM:
-- ACTIVE, INACTIVE, RETIRED.
-- ============================================================================

INSERT INTO ${schemaName}.entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
VALUES (
    'entity-type-qr-code',
    'QR_CODE',
    'QR Code',
    'Represents a generated QR code used by the Memgine platform.',
    25,
    TRUE
)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-qr-code-active',
    'entity-type-qr-code',
    'status-active',
    1,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-qr-code-inactive',
    'entity-type-qr-code',
    'status-inactive',
    2,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-qr-code-retired',
    'entity-type-qr-code',
    'status-retired',
    3,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


    -- ============================================================================
-- CUSTOMER PREFERENCE REFERENCE DATA
--
-- CUSTOMER_PREFERENCE was omitted from the reference-data model.
-- Supported statuses: ACTIVE, INACTIVE.
-- ============================================================================

INSERT INTO ${schemaName}.entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
SELECT
    'entity-type-customer-preference',
    'CUSTOMER_PREFERENCE',
    'Customer Preference',
    'Represents customer communication and experience preferences.',
    COALESCE(MAX(display_order), 0) + 1,
    TRUE
FROM ${schemaName}.entity_type
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;


INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-preference-active',
    'entity-type-customer-preference',
    'status-active',
    1,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-customer-preference-inactive',
    'entity-type-customer-preference',
    'status-inactive',
    2,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


    -- ============================================================================
-- PREFERENCE TYPE REFERENCE DATA
--
-- PREFERENCE_TYPE reference data was omitted.
-- Supported statuses: ACTIVE, INACTIVE.
-- ============================================================================

INSERT INTO ${schemaName}.entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
SELECT
    'entity-type-preference-type',
    'PREFERENCE_TYPE',
    'Preference Type',
    'Defines supported customer preference types.',
    COALESCE(MAX(display_order), 0) + 1,
    TRUE
FROM ${schemaName}.entity_type
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;


INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-preference-type-active',
    'entity-type-preference-type',
    'status-active',
    1,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


INSERT INTO ${schemaName}.entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES (
    'entity-status-preference-type-inactive',
    'entity-type-preference-type',
    'status-inactive',
    2,
    TRUE,
    FALSE
)
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;


-- ============================================================================
-- REQUIRED PREFERENCE TYPES FROM LEGACY DATA
-- ============================================================================

INSERT INTO ${schemaName}.preference_type (
    preference_type_id,
    preference_type_code,
    preference_type_name,
    data_type,
    default_value,
    description,
    preference_type_status_id,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'preference-type-notifications',
    'NOTIFICATIONS',
    'Notifications',
    'BOOLEAN',
    'true',
    'Controls whether the customer receives notifications.',
    'entity-status-preference-type-active',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    FALSE,
    1
)
ON CONFLICT (preference_type_id) DO UPDATE SET
    preference_type_code = EXCLUDED.preference_type_code,
    preference_type_name = EXCLUDED.preference_type_name,
    data_type = EXCLUDED.data_type,
    default_value = EXCLUDED.default_value,
    description = EXCLUDED.description,
    preference_type_status_id = EXCLUDED.preference_type_status_id,
    is_deleted = FALSE;


INSERT INTO ${schemaName}.preference_type (
    preference_type_id,
    preference_type_code,
    preference_type_name,
    data_type,
    default_value,
    description,
    preference_type_status_id,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'preference-type-marketing-emails',
    'MARKETING_EMAILS',
    'Marketing Emails',
    'BOOLEAN',
    'false',
    'Controls whether the customer receives marketing emails.',
    'entity-status-preference-type-active',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    FALSE,
    1
)
ON CONFLICT (preference_type_id) DO UPDATE SET
    preference_type_code = EXCLUDED.preference_type_code,
    preference_type_name = EXCLUDED.preference_type_name,
    data_type = EXCLUDED.data_type,
    default_value = EXCLUDED.default_value,
    description = EXCLUDED.description,
    preference_type_status_id = EXCLUDED.preference_type_status_id,
    is_deleted = FALSE;
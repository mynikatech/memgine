-- ============================================================
-- Memgine - Platform Default Theme / Layout Templates
--
-- Rerunnable / idempotent DML: YES
--
-- Initial platform templates:
--   Bakery
--   Coffee
--   Salon
--
-- These are reusable platform defaults.
-- Organization-specific branding references these templates.
-- ============================================================

INSERT INTO "${schemaName}"."template" (
    "template_id",
    "template_type_id",
    "template_name",
    "organization_type_id",
    "template_description",
    "template_format",
    "template_definition",
    "template_version",
    "template_status_id",
    "is_default",
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "is_deleted",
    "version_no"
)
VALUES

-- ============================================================
-- Bakery
-- ============================================================
(
    'bakery-v1',
    'template-type-theme-layout',
    'Bakery Default Theme',
    'organization-type-bakery',
    'Default theme and layout configuration for bakery organizations.',
    'JSON',
    '{}'::jsonb,
    1,
    'entity-status-template-active',
    TRUE,
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    FALSE,
    1
),

-- ============================================================
-- Coffee
-- ============================================================
(
    'coffee-v1',
    'template-type-theme-layout',
    'Coffee Default Theme',
    'organization-type-coffee',
    'Default theme and layout configuration for coffee shop organizations.',
    'JSON',
    '{}'::jsonb,
    1,
    'entity-status-template-active',
    TRUE,
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    FALSE,
    1
),

-- ============================================================
-- Salon
-- ============================================================
(
    'salon-v1',
    'template-type-theme-layout',
    'Salon Default Theme',
    'organization-type-salon',
    'Default theme and layout configuration for salon organizations.',
    'JSON',
    '{}'::jsonb,
    1,
    'entity-status-template-active',
    TRUE,
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    CURRENT_TIMESTAMP,
    'user-platform-admin',
    FALSE,
    1
)

ON CONFLICT ("template_id")
DO UPDATE SET
    "template_type_id" = EXCLUDED."template_type_id",
    "template_name" = EXCLUDED."template_name",
    "organization_type_id" = EXCLUDED."organization_type_id",
    "template_description" = EXCLUDED."template_description",
    "template_format" = EXCLUDED."template_format",
    "template_definition" = EXCLUDED."template_definition",
    "template_version" = EXCLUDED."template_version",
    "template_status_id" = EXCLUDED."template_status_id",
    "is_default" = EXCLUDED."is_default",
    "updated_at" = CURRENT_TIMESTAMP,
    "updated_by" = 'user-platform-admin',
    "is_deleted" = FALSE,
    "version_no" = "${schemaName}"."template"."version_no" + 1;
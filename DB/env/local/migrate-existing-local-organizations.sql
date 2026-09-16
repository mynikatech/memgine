-- Memgine one-time DEV migration from browser localStorage
-- Generated from the 2026-09-16 export.
--
-- IMPORTANT:
--   * DEV/local only. Do NOT add this file to the Liquibase master/includeAll path.
--   * Existing PostgreSQL rows are not overwritten.
--   * Migrates two source-backed UI-created organizations and bootstraps three original client-demo organizations.
--   * Toronto Bakery is intentionally excluded because it already exists in PostgreSQL.
--   * Deleted historical organizations are intentionally excluded.
--
-- Source-data provenance:
--   Sunil's Cafe and Choubey's Bakery are migrated from actual localStorage
--   Organization aggregates.
--   Glow Studio, Steep n Sip and Sunrise Bakery were original frontend mock/demo
--   businesses. Their missing mandatory Organization master fields use explicit
--   DEV bootstrap values so the client-demo businesses survive the server migration.
--   Glow's existing source-backed store is also preserved.
--
-- Run against memgine_dev after normal Liquibase migrations have completed.

BEGIN;

-- Safety guard: this script is specifically for the DEV schema.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.schemata
        WHERE schema_name = 'memginedev'
    ) THEN
        RAISE EXCEPTION 'memginedev schema does not exist; aborting DEV migration';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM memginedev."user"
        WHERE user_id = 'user-platform-admin'
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Required DEV actor user-platform-admin does not exist';
    END IF;
END
$$;


-- ---------------------------------------------------------------------------
-- Sunil's Cafe (org-1788708163950-7xzs4dyq)
-- Source: browser localStorage export
-- ---------------------------------------------------------------------------

INSERT INTO memginedev.organization (
    organization_id,
    organization_code,
    organization_name,
    published_customer_experience_release_id,
    organization_display_name,
    legal_name,
    organization_type_id,
    organization_status_id,
    primary_email,
    primary_phone,
    website_url,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'org-1788708163950-7xzs4dyq',
    '1788708163950-7XZS4D',
    'Sunil''s Cafe',
    NULL,
    'Sunil''s Cafe',
    NULL,
    'organization-type-coffee',
    'entity-status-org-active',
    'test1@test.com',
    '+15234295252',
    'https://yourcoffeehouse.example',
    '2026-09-06T15:22:43.950Z'::timestamptz,
    'user-platform-admin',
    '2026-09-06T15:24:20.037Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    4
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id,
    organization_id,
    registration_number,
    gst_number,
    support_email,
    support_phone,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    about_organization,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'organization-details-1788708163950-hyiwm0zs',
    'org-1788708163950-7xzs4dyq',
    NULL,
    NULL,
    'hello@yourcoffeehouse.example',
    NULL,
    '',
    NULL,
    '',
    '',
    '',
    '',
    'A welcoming coffee house serving freshly prepared coffee, handcrafted drinks and café favourites in comfortable spaces designed for everyday moments.',
    '2026-09-06T15:22:43.950Z'::timestamptz,
    'user-platform-admin',
    '2026-09-06T15:22:43.950Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    1
)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id,
    organization_id,
    branding_name,
    theme_template_id,
    primary_color,
    secondary_color,
    accent_color,
    logo_url,
    dark_theme_logo_url,
    favicon_url,
    splash_screen_image_url,
    branding_status_id,
    tagline,
    hero_image_url,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'organization-branding-1788708163950-w92nfv0p',
    'org-1788708163950-7xzs4dyq',
    'Sunil''s Cafe',
    'coffee-v1',
    '#2563EB',
    '#64748B',
    '#FFFFFF',
    'https://placeholder.memgine.app/logos/coffee.png',
    NULL,
    NULL,
    NULL,
    'entity-status-org-branding-active',
    NULL,
    NULL,
    '2026-09-06T15:22:43.950Z'::timestamptz,
    'user-platform-admin',
    '2026-09-06T15:22:43.950Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    1
)
ON CONFLICT (organization_branding_id) DO NOTHING;


-- NOTE: Choubey's legacy logo/dark-logo are base64 data URIs larger than
-- organization_branding.logo_url/dark_theme_logo_url varchar(500).
-- They are intentionally left NULL here; the original localStorage export remains unchanged.

-- ---------------------------------------------------------------------------
-- Choubey's Bakery (org-1788708324971-hcia1i0a)
-- Source: browser localStorage export
-- ---------------------------------------------------------------------------

INSERT INTO memginedev.organization (
    organization_id,
    organization_code,
    organization_name,
    published_customer_experience_release_id,
    organization_display_name,
    legal_name,
    organization_type_id,
    organization_status_id,
    primary_email,
    primary_phone,
    website_url,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'org-1788708324971-hcia1i0a',
    '1788708324971-HCIA1I',
    'Choubey''s Bakery',
    NULL,
    'Choubey''s Bakery One',
    NULL,
    'organization-type-bakery',
    'entity-status-org-active',
    'test@test1.com',
    '+14985294581',
    'https://yourbakery.example',
    '2026-09-06T15:25:24.971Z'::timestamptz,
    'user-platform-admin',
    '2026-09-06T16:14:15.473Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    4
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id,
    organization_id,
    registration_number,
    gst_number,
    support_email,
    support_phone,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    about_organization,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'organization-details-1788708324972-n08v2if4',
    'org-1788708324971-hcia1i0a',
    NULL,
    NULL,
    'hello@yourbakery.example',
    '+14985294581',
    'tfdssddd',
    NULL,
    'Yellowknife',
    'NT',
    '67797980',
    'CA',
    'A neighbourhood bakery serving freshly baked bread, pastries, cakes and seasonal favourites made for everyday moments and special occasions. Testing',
    '2026-09-06T15:25:24.971Z'::timestamptz,
    'user-platform-admin',
    '2026-09-06T15:25:24.971Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    1
)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id,
    organization_id,
    branding_name,
    theme_template_id,
    primary_color,
    secondary_color,
    accent_color,
    logo_url,
    dark_theme_logo_url,
    favicon_url,
    splash_screen_image_url,
    branding_status_id,
    tagline,
    hero_image_url,
    created_at,
    created_by,
    updated_at,
    updated_by,
    is_deleted,
    version_no
)
VALUES (
    'organization-branding-1788708324972-y09ijom4',
    'org-1788708324971-hcia1i0a',
    'Choubey''s Bakery',
    'bakery-v1',
    '#A16207',
    '#D97706',
    '#F97316',
    NULL,
    NULL,
    NULL,
    NULL,
    'entity-status-org-branding-active',
    'A Coffee can fix your Mind.',
    NULL,
    '2026-09-06T15:25:24.971Z'::timestamptz,
    'user-platform-admin',
    '2026-09-10T11:24:51.952Z'::timestamptz,
    'user-platform-admin',
    FALSE,
    7
)
ON CONFLICT (organization_branding_id) DO NOTHING;



-- ===========================================================================
-- Administration function normalization:
--   Liquibase 043 defines ensure_default_organization_admin(p_organization_id varchar(64))
--   with one argument. The function itself supplies user-org-admin/user-platform-admin.
--
-- Template FK normalization:
--   Legacy frontend theme id 'coffee-chain-v1' is mapped to the actual
--   memginedev.template.template_id 'coffee-v1'.
--   'bakery-v1' and 'salon-v1' already match the database template IDs.
--
-- CLIENT-DEMO ORGANIZATIONS
-- These three were frontend mock/demo organizations, not UI-created
-- Organization aggregates. Their missing mandatory master fields therefore use
-- explicit DEV bootstrap values. Existing source IDs are preserved where known.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Glow Studio
-- Source-backed ID/branding: org-glow / branding-org-glow
-- Master/details mandatory values marked DEV bootstrap.
-- ---------------------------------------------------------------------------
INSERT INTO memginedev.organization (
    organization_id, organization_code, organization_name,
    published_customer_experience_release_id, organization_display_name,
    legal_name, organization_type_id, organization_status_id,
    primary_email, primary_phone, website_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'org-glow', 'GLOW-DEMO', 'Glow Studio',
    NULL, 'Glow Studio',
    NULL, 'organization-type-salon', 'entity-status-org-active',
    'demo+glow@mynikatech.in', '+10000000001', NULL,
    '2026-09-10 07:26:00.514', 'user-platform-admin',
    '2026-09-10 09:04:04.643', 'user-platform-admin',
    FALSE, 3
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id, organization_id, registration_number, gst_number,
    support_email, support_phone, address_line1, address_line2,
    city, state, postal_code, country, about_organization,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'details-org-glow', 'org-glow', NULL, NULL,
    'demo+glow@mynikatech.in', NULL,
    'West Side Mall Road', NULL, 'Toronto', 'ON', '31313132', 'CA',
    'DEV bootstrap organization details for the original Glow Studio client-demo dataset.',
    '2026-09-10 07:26:00.514', 'user-platform-admin',
    '2026-09-10 09:04:04.643', 'user-platform-admin', FALSE, 1
)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id, organization_id, branding_name, theme_template_id,
    primary_color, secondary_color, accent_color, logo_url,
    dark_theme_logo_url, favicon_url, splash_screen_image_url,
    branding_status_id, tagline, hero_image_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'branding-org-glow', 'org-glow', 'Glow Studio', 'salon-v1',
    '#DB2777', '#65A30D', '#CA8A04', NULL,
    NULL, NULL, NULL,
    'entity-status-org-branding-active', NULL, NULL,
    '2026-09-10 07:26:00.514', 'user-platform-admin',
    '2026-09-10 09:04:04.643', 'user-platform-admin', FALSE, 3
)
ON CONFLICT (organization_branding_id) DO NOTHING;

-- Preserve the source-backed Glow Studio store that can be represented directly
-- by the current PDM without inventing dependent User records.
INSERT INTO memginedev.stores (
    store_id, organization_id, store_code, store_name, store_type_id,
    phone_number, email_address, address_line1, address_line2,
    city, state, postal_code, country, timezone, store_status_id,
    opening_date, closing_date, created_at, created_by, updated_at, updated_by,
    is_deleted, version_no
)
VALUES (
    'store-1789025209574', 'org-glow', 'GLOW-STORE-001',
    'West Side Mall Store', 'store-type-branch',
    '+14324242342', NULL, 'West Side Mall Road', NULL,
    'Toronto', 'ON', '31313132', 'CA', 'America/Toronto',
    'entity-status-store-active', NULL, NULL,
    '2026-09-10 07:27:36.847', 'user-platform-admin',
    '2026-09-10 07:27:36.847', 'user-platform-admin',
    FALSE, 1
)
ON CONFLICT (store_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Steep n Sip
-- Source-backed ID: org-steep-sip (from its mock product dataset).
-- No Organization/details/branding aggregate existed in the export.
-- ---------------------------------------------------------------------------
INSERT INTO memginedev.organization (
    organization_id, organization_code, organization_name,
    published_customer_experience_release_id, organization_display_name,
    legal_name, organization_type_id, organization_status_id,
    primary_email, primary_phone, website_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'org-steep-sip', 'STEEP-SIP-DEMO', 'Steep n Sip',
    NULL, 'Steep n Sip',
    NULL, 'organization-type-coffee', 'entity-status-org-active',
    'demo+steepsip@mynikatech.in', '+10000000002', NULL,
    '2026-09-07 07:28:39.272', 'user-platform-admin',
    '2026-09-07 07:28:39.272', 'user-platform-admin',
    FALSE, 1
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id, organization_id, registration_number, gst_number,
    support_email, support_phone, address_line1, address_line2,
    city, state, postal_code, country, about_organization,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'details-org-steep-sip', 'org-steep-sip', NULL, NULL,
    'demo+steepsip@mynikatech.in', NULL,
    'DEV demo address', NULL, 'Toronto', 'ON', '00000', 'CA',
    'DEV bootstrap organization details for the original Steep n Sip client-demo dataset.',
    '2026-09-07 07:28:39.272', 'user-platform-admin',
    '2026-09-07 07:28:39.272', 'user-platform-admin', FALSE, 1
)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id, organization_id, branding_name, theme_template_id,
    primary_color, secondary_color, accent_color, logo_url,
    dark_theme_logo_url, favicon_url, splash_screen_image_url,
    branding_status_id, tagline, hero_image_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'branding-org-steep-sip', 'org-steep-sip', 'Steep n Sip', 'coffee-v1',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    'entity-status-org-branding-active', NULL, NULL,
    '2026-09-07 07:28:39.272', 'user-platform-admin',
    '2026-09-07 07:28:39.272', 'user-platform-admin', FALSE, 1
)
ON CONFLICT (organization_branding_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sunrise Bakery
-- No Sunrise record was present in the supplied localStorage export.
-- This is therefore an explicit DEV bootstrap aggregate only.
-- ---------------------------------------------------------------------------
INSERT INTO memginedev.organization (
    organization_id, organization_code, organization_name,
    published_customer_experience_release_id, organization_display_name,
    legal_name, organization_type_id, organization_status_id,
    primary_email, primary_phone, website_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'org-sunrise-bakery', 'SUNRISE-DEMO', 'Sunrise Bakery',
    NULL, 'Sunrise Bakery',
    NULL, 'organization-type-bakery', 'entity-status-org-active',
    'demo+sunrise@mynikatech.in', '+10000000003', NULL,
    CURRENT_TIMESTAMP, 'user-platform-admin',
    CURRENT_TIMESTAMP, 'user-platform-admin',
    FALSE, 1
)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id, organization_id, registration_number, gst_number,
    support_email, support_phone, address_line1, address_line2,
    city, state, postal_code, country, about_organization,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'details-org-sunrise', 'org-sunrise-bakery', NULL, NULL,
    'demo+sunrise@mynikatech.in', NULL,
    'DEV demo address', NULL, 'Toronto', 'ON', '00000', 'CA',
    'DEV bootstrap organization details for the original Sunrise Bakery client-demo business.',
    CURRENT_TIMESTAMP, 'user-platform-admin',
    CURRENT_TIMESTAMP, 'user-platform-admin', FALSE, 1
)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id, organization_id, branding_name, theme_template_id,
    primary_color, secondary_color, accent_color, logo_url,
    dark_theme_logo_url, favicon_url, splash_screen_image_url,
    branding_status_id, tagline, hero_image_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
)
VALUES (
    'branding-org-sunrise', 'org-sunrise-bakery', 'Sunrise Bakery', 'bakery-v1',
    NULL, NULL, NULL, NULL, NULL, NULL, NULL,
    'entity-status-org-branding-active', NULL, NULL,
    CURRENT_TIMESTAMP, 'user-platform-admin',
    CURRENT_TIMESTAMP, 'user-platform-admin', FALSE, 1
)
ON CONFLICT (organization_branding_id) DO NOTHING;


-- Ensure the standard DEV organization admin is associated with migrated orgs.
-- Function 043 is idempotent and resolves the ADMIN role/entity status in PostgreSQL.
SELECT memginedev.ensure_default_organization_admin('org-1788708163950-7xzs4dyq');

SELECT memginedev.ensure_default_organization_admin('org-1788708324971-hcia1i0a');

SELECT memginedev.ensure_default_organization_admin('org-glow');

SELECT memginedev.ensure_default_organization_admin('org-steep-sip');

SELECT memginedev.ensure_default_organization_admin('org-sunrise-bakery');

COMMIT;

-- Verification
SELECT
    organization_id,
    organization_code,
    organization_name,
    organization_display_name,
    organization_status_id,
    primary_email,
    primary_phone,
    is_deleted,
    version_no
FROM memginedev.organization
WHERE organization_id IN (
    'org-1788708163950-7xzs4dyq',
    'org-1788708324971-hcia1i0a',
    'org-glow',
    'org-steep-sip',
    'org-sunrise-bakery'
)
ORDER BY organization_name;
-- 052-2h-existing-organization-data-migration.sql
-- Memgine Batch 2H - one-time DEV migration from preserved browser AsyncStorage/localStorage.
-- Generated from the 2026-09-17 browser export and current PostgreSQL physical-schema extracts.
--
-- IMPORTANT
-- 1. DEV/local migration only. Keep outside the normal Liquibase includeAll/master path unless
--    you intentionally wrap it as a DEV-only changeset.
-- 2. Idempotent by source primary IDs: existing PostgreSQL rows are never overwritten.
-- 3. Includes Choubey's Bakery plus the three requested demo organizations:
--       Glow Studio, Steep n Sip, Sunrise Bakery.
-- 4. Toronto Bakery already exists in PostgreSQL and its newer PostgreSQL business data is authoritative.
--    Legacy browser Store/Product business rows for Toronto are intentionally not inserted by this script.
-- 5. Deleted historical organizations are intentionally excluded.
-- 6. Legacy Offer promotion images are base64 data URIs larger than offer.promotion_image_url
--    varchar(500). Offer rows are preserved using a deterministic legacy:// marker; the original
--    image bytes remain in the preserved browser export and must later be uploaded as assets.
-- 7. Source audit identities such as staff IDs / "..." / "system" are normalized to the
--    existing DEV actor user-platform-admin where the physical FK requires user(user_id).
-- 8. membership_product_benefits audit columns require organization_user IDs, so this script
--    resolves the standard organization admin membership rather than writing a user ID.

BEGIN;
SET search_path TO memginedev, public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name='memginedev') THEN
        RAISE EXCEPTION 'memginedev schema does not exist';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM memginedev."user"
        WHERE user_id='user-platform-admin' AND is_deleted=FALSE
    ) THEN
        RAISE EXCEPTION 'Required DEV actor user-platform-admin does not exist';
    END IF;
END $$;

-- Resolve a generic legacy status (for example status-active) to the entity-specific status
-- required by current PDM tables.
CREATE OR REPLACE FUNCTION pg_temp.memgine_2h_entity_status(
    p_entity_type_code text,
    p_legacy_status_id text
) RETURNS varchar
LANGUAGE sql
STABLE
AS $$
    SELECT es.entity_status_id
    FROM memginedev.entity_status es
    JOIN memginedev.entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN memginedev.statuses s ON s.status_id = es.status_id
    WHERE upper(et.entity_type_code) = upper(p_entity_type_code)
      AND (
          es.entity_status_id = p_legacy_status_id
          OR s.status_id = p_legacy_status_id
          OR upper(s.status_code) =
             upper(regexp_replace(coalesce(p_legacy_status_id,''), '^(entity-status-[^-]+-|status-|.*-status-)', ''))
      )
      AND es.is_active = TRUE
    ORDER BY CASE WHEN es.entity_status_id = p_legacy_status_id THEN 0 ELSE 1 END
    LIMIT 1
$$;

-- ============================================================================
-- ORGANIZATION MASTER / DETAILS / BRANDING
-- ============================================================================

-- Choubey's Bakery: source-backed organization aggregate.
INSERT INTO memginedev.organization (
    organization_id, organization_code, organization_name,
    published_customer_experience_release_id, organization_display_name,
    legal_name, organization_type_id, organization_status_id,
    primary_email, primary_phone, website_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES (
    'org-1788708324971-hcia1i0a','1788708324971-HCIA1I','Choubey''s Bakery',
    NULL,'Choubey''s Bakery One',NULL,'organization-type-bakery','entity-status-org-active',
    'test@test1.com','+14985294581','https://yourbakery.example',
    '2026-09-06T15:25:24.971Z'::timestamp,'user-platform-admin',
    '2026-09-06T16:14:15.473Z'::timestamp,'user-platform-admin',FALSE,4
) ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id, organization_id, registration_number, gst_number,
    support_email, support_phone, address_line1, address_line2, city, state,
    postal_code, country, about_organization,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES (
    'organization-details-1788708324972-n08v2if4','org-1788708324971-hcia1i0a',
    NULL,NULL,'hello@yourbakery.example','+14985294581','tfdssddd',NULL,
    'Yellowknife','NT','67797980','CA',
    'A neighbourhood bakery serving freshly baked bread, pastries, cakes and seasonal favourites made for everyday moments and special occasions. Testing',
    '2026-09-06T15:25:24.971Z'::timestamp,'user-platform-admin',
    '2026-09-06T15:25:24.971Z'::timestamp,'user-platform-admin',FALSE,1
) ON CONFLICT (organization_details_id) DO NOTHING;

-- Choubey legacy base64 branding images exceed current varchar(500); keep URLs NULL.
INSERT INTO memginedev.organization_branding (
    organization_branding_id, organization_id, branding_name, theme_template_id,
    primary_color, secondary_color, accent_color, logo_url, dark_theme_logo_url,
    favicon_url, splash_screen_image_url, branding_status_id, tagline, hero_image_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES (
    'organization-branding-1788708324972-y09ijom4','org-1788708324971-hcia1i0a',
    'Choubey''s Bakery','bakery-v1','#A16207','#D97706','#F97316',
    NULL,NULL,NULL,NULL,'entity-status-org-branding-active','A Coffee can fix your Mind.',NULL,
    '2026-09-06T15:25:24.971Z'::timestamp,'user-platform-admin',
    '2026-09-10T11:24:51.952Z'::timestamp,'user-platform-admin',FALSE,7
) ON CONFLICT (organization_branding_id) DO NOTHING;

-- Requested demo organizations. These bootstrap values come from the previously prepared
-- DEV migration because the frontend mock records do not contain complete Organization masters.
INSERT INTO memginedev.organization (
    organization_id, organization_code, organization_name,
    published_customer_experience_release_id, organization_display_name,
    legal_name, organization_type_id, organization_status_id,
    primary_email, primary_phone, website_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES
('org-glow','GLOW-DEMO','Glow Studio',NULL,'Glow Studio',NULL,'organization-type-salon',
 'entity-status-org-active','demo+glow@mynikatech.in','+10000000001',NULL,
 '2026-09-10 07:26:00.514'::timestamp,'user-platform-admin',
 '2026-09-10 09:04:04.643'::timestamp,'user-platform-admin',FALSE,3),
('org-steep-sip','STEEP-SIP-DEMO','Steep n Sip',NULL,'Steep n Sip',NULL,'organization-type-coffee',
 'entity-status-org-active','demo+steepsip@mynikatech.in','+10000000002',NULL,
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',FALSE,1),
('org-sunrise-bakery','SUNRISE-DEMO','Sunrise Bakery',NULL,'Sunrise Bakery',NULL,'organization-type-bakery',
 'entity-status-org-active','demo+sunrise@mynikatech.in','+10000000003',NULL,
 CURRENT_TIMESTAMP,'user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin',FALSE,1)
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO memginedev.organization_details (
    organization_details_id, organization_id, registration_number, gst_number,
    support_email, support_phone, address_line1, address_line2, city, state,
    postal_code, country, about_organization,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES
('details-org-glow','org-glow',NULL,NULL,'demo+glow@mynikatech.in',NULL,
 'West Side Mall Road',NULL,'Toronto','ON','31313132','CA',
 'DEV bootstrap organization details for the original Glow Studio client-demo dataset.',
 '2026-09-10 07:26:00.514'::timestamp,'user-platform-admin',
 '2026-09-10 09:04:04.643'::timestamp,'user-platform-admin',FALSE,1),
('details-org-steep-sip','org-steep-sip',NULL,NULL,'demo+steepsip@mynikatech.in',NULL,
 'DEV demo address',NULL,'Toronto','ON','00000','CA',
 'DEV bootstrap organization details for the original Steep n Sip client-demo dataset.',
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',FALSE,1),
('details-org-sunrise','org-sunrise-bakery',NULL,NULL,'demo+sunrise@mynikatech.in',NULL,
 'DEV demo address',NULL,'Toronto','ON','00000','CA',
 'DEV bootstrap organization details for the original Sunrise Bakery client-demo business.',
 CURRENT_TIMESTAMP,'user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin',FALSE,1)
ON CONFLICT (organization_details_id) DO NOTHING;

INSERT INTO memginedev.organization_branding (
    organization_branding_id, organization_id, branding_name, theme_template_id,
    primary_color, secondary_color, accent_color, logo_url, dark_theme_logo_url,
    favicon_url, splash_screen_image_url, branding_status_id, tagline, hero_image_url,
    created_at, created_by, updated_at, updated_by, is_deleted, version_no
) VALUES
('branding-org-glow','org-glow','Glow Studio','salon-v1','#DB2777','#65A30D','#CA8A04',
 NULL,NULL,NULL,NULL,'entity-status-org-branding-active',NULL,NULL,
 '2026-09-10 07:26:00.514'::timestamp,'user-platform-admin',
 '2026-09-10 09:04:04.643'::timestamp,'user-platform-admin',FALSE,3),
('branding-org-steep-sip','org-steep-sip','Steep n Sip','coffee-v1',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,'entity-status-org-branding-active',NULL,NULL,
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',
 '2026-09-07 07:28:39.272'::timestamp,'user-platform-admin',FALSE,1),
('branding-org-sunrise','org-sunrise-bakery','Sunrise Bakery','bakery-v1',
 NULL,NULL,NULL,NULL,NULL,NULL,NULL,'entity-status-org-branding-active',NULL,NULL,
 CURRENT_TIMESTAMP,'user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin',FALSE,1)
ON CONFLICT (organization_branding_id) DO NOTHING;

SELECT memginedev.ensure_default_organization_admin('org-1788708324971-hcia1i0a');
SELECT memginedev.ensure_default_organization_admin('org-glow');
SELECT memginedev.ensure_default_organization_admin('org-steep-sip');
SELECT memginedev.ensure_default_organization_admin('org-sunrise-bakery');
SELECT memginedev.ensure_default_organization_admin('org-20260915-vawpee5r');



-- ============================================================================
-- STORES
-- ============================================================================

INSERT INTO memginedev.stores (
 store_id,organization_id,store_code,store_name,store_type_id,phone_number,email_address,
 address_line1,address_line2,city,state,postal_code,country,timezone,store_status_id,
 opening_date,closing_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'store-1788763175550','org-1788708324971-hcia1i0a','1788708324971-HCIA1I0A-STORE-001','Toronto Mall',
 'store-type-branch','+14341414124',NULL,'tfdssddd',NULL,
 'Yellowknife','NT','67797980','CA','America/Toronto',
 pg_temp.memgine_2h_entity_status('STORE','status-active'),
 NULL,NULL,'2026-09-07T06:40:19.279Z'::timestamp,'user-platform-admin',
 '2026-09-12T19:11:11.835Z'::timestamp,'user-platform-admin',FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO memginedev.stores (
 store_id,organization_id,store_code,store_name,store_type_id,phone_number,email_address,
 address_line1,address_line2,city,state,postal_code,country,timezone,store_status_id,
 opening_date,closing_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'store-1789025209574','org-glow','GLOW-STORE-001','West Side Mall Store',
 'store-type-branch','+14324242342',NULL,'West Side Mall Road',NULL,
 'Toronto','ON','31313132','CA','America/Toronto',
 pg_temp.memgine_2h_entity_status('STORE','status-active'),
 NULL,NULL,'2026-09-10T07:27:36.847Z'::timestamp,'user-platform-admin',
 '2026-09-10T07:27:36.847Z'::timestamp,'user-platform-admin',FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (store_id) DO NOTHING;


-- ============================================================================
-- PRODUCTS
-- ============================================================================

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-1788708324971-hcia1i0a-001','org-1788708324971-hcia1i0a','PROD-001','Cappuccino','Freshly prepared cappuccino.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin','2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-1788708324971-hcia1i0a-002','org-1788708324971-hcia1i0a','PROD-002','Croissant','Fresh butter croissant.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin','2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-1788708324971-hcia1i0a-003','org-1788708324971-hcia1i0a','PROD-003','Chocolate Cake','Chocolate cake slice.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin','2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-1788708324971-hcia1i0a-004','org-1788708324971-hcia1i0a','PROD-004','Grilled Sandwich','Freshly prepared grilled sandwich.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin','2026-09-07T07:21:29.966Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-glow-001','org-glow','PROD-001','Cappuccino','Freshly prepared cappuccino.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin','2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-glow-002','org-glow','PROD-002','Croissant','Fresh butter croissant.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin','2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-glow-003','org-glow','PROD-003','Chocolate Cake','Chocolate cake slice.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin','2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-glow-004','org-glow','PROD-004','Grilled Sandwich','Freshly prepared grilled sandwich.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin','2026-09-10T07:28:12.868Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-steep-sip-001','org-steep-sip','PROD-001','Cappuccino','Freshly prepared cappuccino.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin','2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-steep-sip')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-steep-sip-002','org-steep-sip','PROD-002','Croissant','Fresh butter croissant.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin','2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-steep-sip')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-steep-sip-003','org-steep-sip','PROD-003','Chocolate Cake','Chocolate cake slice.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin','2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-steep-sip')
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO memginedev.product (
 product_id,organization_id,product_code,product_name,description,status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'product-org-steep-sip-004','org-steep-sip','PROD-004','Grilled Sandwich','Freshly prepared grilled sandwich.',
 pg_temp.memgine_2h_entity_status('PRODUCT','status-active'),
 '2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin','2026-09-07T07:28:39.272Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-steep-sip')
ON CONFLICT (product_id) DO NOTHING;






-- ============================================================================
-- USERS / ORGANIZATION USERS (customers + employees)
-- ============================================================================

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-1788765439762','USR-000001','Sunil',NULL,'Agarwal',
 'Sunil Agarwal',NULL,'+17184014141',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-inactive'),
 '2026-09-07T07:17:19.762Z'::timestamp,'user-platform-admin','2026-09-08T17:52:49.064Z'::timestamp,'user-platform-admin',
 FALSE,5
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762');

SELECT
    c.conname,
    pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'memginedev'
  AND t.relname = 'organization_user'
  AND c.contype = 'u';

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'org-user-1788765439774','org-1788708324971-hcia1i0a','user-1788765439762','organization-user-type-employee',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-07'::date,'2026-09-07T07:17:19.774Z'::timestamp,'user-platform-admin','2026-09-07T07:17:19.774Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-1788765439762','USR-000001','Sunil',NULL,'Agarwal',
 'Sunil Agarwal',NULL,'+17184014141',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-inactive'),
 '2026-09-07T07:17:19.762Z'::timestamp,'user-platform-admin','2026-09-08T17:52:49.064Z'::timestamp,'user-platform-admin',
 FALSE,5
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'org-user-mtsn813v-la0ik','org-1788708324971-hcia1i0a','user-1788765439762','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-08'::date,'2026-09-08T12:25:56.635Z'::timestamp,'user-platform-admin','2026-09-08T12:25:56.635Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-1788765439762')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtsoynym-3v36gi','USR-000002','John',NULL,'Smith',
 'John Smith',NULL,'+12434465475',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin','2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'org-user-mtsoynym-3n6t32','org-1788708324971-hcia1i0a','user-mtsoynym-3v36gi','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-08'::date,'2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin','2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtsp1pdp-2j6jgh','USR-000003','test',NULL,'User',
 'test User','test1@gmail.com','+13425254364',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-08T13:17:00.733Z'::timestamp,'user-platform-admin','2026-09-08T13:17:00.733Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsp1pdp-2j6jgh');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'org-user-mtsp1pdq-b9q35n','org-1788708324971-hcia1i0a','user-mtsp1pdp-2j6jgh','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-08'::date,'2026-09-08T13:17:00.734Z'::timestamp,'user-platform-admin','2026-09-08T13:17:00.734Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsp1pdp-2j6jgh')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtsul0vl-zn5yhf','USR-000004','fafafa',NULL,'afafaf',
 'fafafa afafaf','fafa@sfsfs.com','+13324341414',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-08T15:52:00.177Z'::timestamp,'user-platform-admin','2026-09-08T15:52:00.177Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsul0vl-zn5yhf');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-001','org-1788708324971-hcia1i0a','user-mtsul0vl-zn5yhf','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-08'::date,'2026-09-08T15:52:00.178Z'::timestamp,'user-platform-admin','2026-09-08T15:52:00.178Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsul0vl-zn5yhf')
ON CONFLICT (organization_user_id) DO NOTHING;

-- SKIPPED organization_user 1788708324971-HCIA1I0A-CUSTOMER-002: source user cust_mttv0q33_1 absent from memgine:users.

-- SKIPPED organization_user 1788708324971-HCIA1I0A-CUSTOMER-003: source user cust_mttxgf1j_1 absent from memgine:users.

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mttyzrri-6rj70c','USR-000005','Kapil',NULL,'Shah',
 'Kapil Shah',NULL,'13487389410',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T10:43:12.846Z'::timestamp,'user-platform-admin','2026-09-09T10:43:12.846Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttyzrri-6rj70c');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-004','org-1788708324971-hcia1i0a','user-mttyzrri-6rj70c','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T10:43:12.846Z'::timestamp,'user-platform-admin','2026-09-09T10:43:12.846Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttyzrri-6rj70c')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mttz1yd5-yh42rw','USR-000006','kapil',NULL,'ahah',
 'kapil ahah',NULL,'12342343252',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T10:44:54.713Z'::timestamp,'user-platform-admin','2026-09-09T10:44:54.713Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttz1yd5-yh42rw');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-005','org-1788708324971-hcia1i0a','user-mttz1yd5-yh42rw','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T10:44:54.713Z'::timestamp,'user-platform-admin','2026-09-09T10:44:54.713Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttz1yd5-yh42rw')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mttzrhcy-a2vvuc','USR-000007','taylor',NULL,'swift',
 'taylor swift','test1@test.com','+12389493048',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:04:45.730Z'::timestamp,'user-platform-admin','2026-09-09T11:04:45.730Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzrhcy-a2vvuc');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-006','org-1788708324971-hcia1i0a','user-mttzrhcy-a2vvuc','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:04:45.731Z'::timestamp,'user-platform-admin','2026-09-09T11:04:45.731Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzrhcy-a2vvuc')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mttzt03i-atdile','USR-000008','prem',NULL,'ranjan',
 'prem ranjan',NULL,'12840923843',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:05:56.670Z'::timestamp,'user-platform-admin','2026-09-09T11:05:56.670Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzt03i-atdile');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-007','org-1788708324971-hcia1i0a','user-mttzt03i-atdile','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:05:56.671Z'::timestamp,'user-platform-admin','2026-09-09T11:05:56.671Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mttzt03i-atdile')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtu04o5e-vt05v4','USR-000009','rqwerqw',NULL,'qrqrq',
 'rqwerqw qrqrq',NULL,'14324324532',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:15:01.058Z'::timestamp,'user-platform-admin','2026-09-09T11:15:01.058Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu04o5e-vt05v4');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-008','org-1788708324971-hcia1i0a','user-mtu04o5e-vt05v4','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:15:01.059Z'::timestamp,'user-platform-admin','2026-09-09T11:15:01.059Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu04o5e-vt05v4')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtu0bg1o-ukp7w1','USR-000010','dad',NULL,'dasdsad',
 'dad dasdsad',NULL,'12312413414',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:20:17.147Z'::timestamp,'user-platform-admin','2026-09-09T11:20:17.147Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0bg1o-ukp7w1');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-009','org-1788708324971-hcia1i0a','user-mtu0bg1o-ukp7w1','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:20:17.148Z'::timestamp,'user-platform-admin','2026-09-09T11:20:17.148Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0bg1o-ukp7w1')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtu0kdtu-hm1gwd','USR-000011','Suhas',NULL,'Jha',
 'Suhas Jha',NULL,'+15252352523',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:27:14.178Z'::timestamp,'user-platform-admin','2026-09-09T11:27:14.178Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0kdtu-hm1gwd');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-010','org-1788708324971-hcia1i0a','user-mtu0kdtu-hm1gwd','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:27:14.178Z'::timestamp,'user-platform-admin','2026-09-09T11:27:14.178Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu0kdtu-hm1gwd')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtu1381t-dzmjpu','USR-000012','fgfhakd',NULL,'afafafa',
 'fgfhakd afafafa',NULL,'+14324343243',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T11:41:53.153Z'::timestamp,'user-platform-admin','2026-09-09T11:41:53.153Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu1381t-dzmjpu');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-011','org-1788708324971-hcia1i0a','user-mtu1381t-dzmjpu','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T11:41:53.154Z'::timestamp,'user-platform-admin','2026-09-09T11:41:53.154Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu1381t-dzmjpu')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtu2b5o2-56bwd8','USR-000013','ererqr',NULL,'rqrqr',
 'ererqr rqrqr',NULL,'+14534567899',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-09T12:16:02.930Z'::timestamp,'user-platform-admin','2026-09-09T12:16:02.930Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu2b5o2-56bwd8');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-012','org-1788708324971-hcia1i0a','user-mtu2b5o2-56bwd8','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-09'::date,'2026-09-09T12:16:02.931Z'::timestamp,'user-platform-admin','2026-09-09T12:16:02.931Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtu2b5o2-56bwd8')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtwrkefl-9mfs1d','USR-000016','Gopi',NULL,'Suresh',
 'Gopi Suresh',NULL,'13432432432',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-11T09:38:36.945Z'::timestamp,'user-platform-admin','2026-09-11T09:38:36.945Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwrkefl-9mfs1d');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-013','org-1788708324971-hcia1i0a','user-mtwrkefl-9mfs1d','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-11'::date,'2026-09-11T09:38:36.946Z'::timestamp,'user-platform-admin','2026-09-11T09:38:36.946Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwrkefl-9mfs1d')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtwwetxe-jr18vq','USR-000017','jiansh',NULL,'shah',
 'jiansh shah',NULL,'13487239048',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-11T11:54:15.170Z'::timestamp,'user-platform-admin','2026-09-11T11:54:15.170Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwwetxe-jr18vq');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 '1788708324971-HCIA1I0A-CUSTOMER-014','org-1788708324971-hcia1i0a','user-mtwwetxe-jr18vq','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-11'::date,'2026-09-11T11:54:15.171Z'::timestamp,'user-platform-admin','2026-09-11T11:54:15.171Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwwetxe-jr18vq')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtv7gmzz-j7xf33','USR-000014','Jacob',NULL,'Martin',
 'Jacob Martin',NULL,'+13543563545',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-10T07:28:02.927Z'::timestamp,'user-platform-admin','2026-09-10T07:28:02.927Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7gmzz-j7xf33');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'GLOW-EMPLOYEE-001','org-glow','user-mtv7gmzz-j7xf33','organization-user-type-employee',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-10'::date,'2026-09-10T07:28:02.940Z'::timestamp,'user-platform-admin','2026-09-10T07:28:02.940Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7gmzz-j7xf33')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtv7i7sn-e852zf','USR-000015','Mary',NULL,'Kom',
 'Mary Kom',NULL,'+15544332211',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-10T07:29:16.535Z'::timestamp,'user-platform-admin','2026-09-10T07:29:16.535Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7i7sn-e852zf');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'GLOW-CUSTOMER-001','org-glow','user-mtv7i7sn-e852zf','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-10'::date,'2026-09-10T07:29:16.536Z'::timestamp,'user-platform-admin','2026-09-10T07:29:16.536Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtv7i7sn-e852zf')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mtsoynym-3v36gi','USR-000002','John',NULL,'Smith',
 'John Smith',NULL,'+12434465475',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin','2026-09-08T13:14:38.926Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'GLOW-CUSTOMER-002','org-glow','user-mtsoynym-3v36gi','organization-user-type-customer',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-10'::date,'2026-09-10T07:39:57.599Z'::timestamp,'user-platform-admin','2026-09-10T07:39:57.599Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi')
ON CONFLICT (organization_user_id) DO NOTHING;

INSERT INTO memginedev."user" (
 user_id,user_code,first_name,middle_name,last_name,display_name,primary_email,primary_phone,
 preferred_language_id,user_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'user-mu58cm83-950y66','USR-000019','Kapil',NULL,'Shah',
 'Kapil Shah',NULL,'+12414142524',NULL,
 pg_temp.memgine_2h_entity_status('USER','status-active'),
 '2026-09-17T07:50:36.675Z'::timestamp,'user-platform-admin','2026-09-17T07:50:36.675Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE NOT EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mu58cm83-950y66');

INSERT INTO memginedev.organization_user (
 organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,
 joining_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'STEEP-SIP-DEMO-EMPLOYEE-001','org-steep-sip','user-mu58cm83-950y66','organization-user-type-employee',
 pg_temp.memgine_2h_entity_status('ORGANIZATION_USER','status-active'),
 '2026-09-17'::date,'2026-09-17T07:50:36.713Z'::timestamp,'user-platform-admin','2026-09-17T07:50:36.713Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-steep-sip')
  AND EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mu58cm83-950y66')
ON CONFLICT (organization_user_id) DO NOTHING;


-- ============================================================================
-- STAFF
-- ============================================================================

INSERT INTO memginedev.staff (
 staff_id,organization_user_id,staff_code,organization_id,role_id,designation,store_id,
 joining_date,relieving_date,staff_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'staff-1788765416533','org-user-1788765439774','1788708324971-HCIA1I0A-STORE-001-STAFF-001','org-1788708324971-hcia1i0a',
 (SELECT role_id FROM memginedev.role WHERE upper(role_code)=upper('STAFF') LIMIT 1),
 'manager','store-1788763175550','2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('STAFF','status-active'),
 '2026-09-07T07:17:28.761Z'::timestamp,'user-platform-admin','2026-09-07T07:20:18.291Z'::timestamp,'user-platform-admin',
 FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='org-user-1788765439774')
  AND ('store-1788763175550' IS NULL OR EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550'))
ON CONFLICT (staff_id) DO NOTHING;

INSERT INTO memginedev.staff (
 staff_id,organization_user_id,staff_code,organization_id,role_id,designation,store_id,
 joining_date,relieving_date,staff_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'staff-1789025263374','GLOW-EMPLOYEE-001','GLOW-GLOW-STORE-001-STAFF-001','org-glow',
 (SELECT role_id FROM memginedev.role WHERE upper(role_code)=upper('STAFF') LIMIT 1),
 NULL,'store-1789025209574','2026-09-10'::date,NULL,
 pg_temp.memgine_2h_entity_status('STAFF','status-active'),
 '2026-09-10T07:28:09.514Z'::timestamp,'user-platform-admin','2026-09-10T07:28:09.514Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='GLOW-EMPLOYEE-001')
  AND ('store-1789025209574' IS NULL OR EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1789025209574'))
ON CONFLICT (staff_id) DO NOTHING;


-- ============================================================================
-- BENEFITS + BENEFIT USAGE RULES
-- ============================================================================

INSERT INTO memginedev.benefits (
 benefit_id,benefit_code,benefit_name,display_name,benefit_category_id,benefit_type_id,description,
 benefit_status_id,product_id,retail_price,cost,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no,organization_id
) SELECT
 'benefit-1788766124617','BENEFIT-001','Free filter Coffee','Free filter Coffee',
 'benefit-category-reward','benefit-type-free-item',NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT','status-active'),
 CASE WHEN 'product-org-1788708324971-hcia1i0a-001' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.product WHERE product_id='product-org-1788708324971-hcia1i0a-001')
      THEN 'product-org-1788708324971-hcia1i0a-001' ELSE NULL END,
 1.99,1.0,'2026-09-07'::date,NULL,
 '2026-09-07T07:28:44.617Z'::timestamp,'user-platform-admin','2026-09-11T06:09:18.841Z'::timestamp,'user-platform-admin',
 FALSE,4,'org-1788708324971-hcia1i0a'
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (benefit_id) DO NOTHING;

INSERT INTO memginedev.benefits (
 benefit_id,benefit_code,benefit_name,display_name,benefit_category_id,benefit_type_id,description,
 benefit_status_id,product_id,retail_price,cost,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no,organization_id
) SELECT
 'benefit-1788766539093','HCIA1I0A-BENEFIT-001','cake discount','cake discount',
 'benefit-category-discount','benefit-type-percentage',NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT','status-active'),
 CASE WHEN 'product-org-1788708324971-hcia1i0a-003' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.product WHERE product_id='product-org-1788708324971-hcia1i0a-003')
      THEN 'product-org-1788708324971-hcia1i0a-003' ELSE NULL END,
 NULL,NULL,'2026-09-07'::date,NULL,
 '2026-09-07T07:35:39.093Z'::timestamp,'user-platform-admin','2026-09-07T07:35:39.093Z'::timestamp,'user-platform-admin',
 FALSE,1,'org-1788708324971-hcia1i0a'
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (benefit_id) DO NOTHING;

INSERT INTO memginedev.benefits (
 benefit_id,benefit_code,benefit_name,display_name,benefit_category_id,benefit_type_id,description,
 benefit_status_id,product_id,retail_price,cost,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no,organization_id
) SELECT
 'benefit-1789025752938','GLOW-BENEFIT-001','Monthly Signature Facial','Monthly Signature Facial',
 'benefit-category-reward','benefit-type-free-item',NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT','status-active'),
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.product WHERE product_id=NULL)
      THEN NULL ELSE NULL END,
 NULL,NULL,'2026-09-10'::date,NULL,
 '2026-09-10T07:35:52.938Z'::timestamp,'user-platform-admin','2026-09-10T07:35:52.938Z'::timestamp,'user-platform-admin',
 FALSE,1,'org-glow'
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (benefit_id) DO NOTHING;

INSERT INTO memginedev.benefits (
 benefit_id,benefit_code,benefit_name,display_name,benefit_category_id,benefit_type_id,description,
 benefit_status_id,product_id,retail_price,cost,effective_date,expiry_date,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no,organization_id
) SELECT
 'benefit-1789025817232','GLOW-BENEFIT-002','15% off all products','15% off all products',
 'benefit-category-discount','benefit-type-percentage',NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT','status-active'),
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.product WHERE product_id=NULL)
      THEN NULL ELSE NULL END,
 NULL,NULL,'2026-09-10'::date,NULL,
 '2026-09-10T07:36:57.232Z'::timestamp,'user-platform-admin','2026-09-10T07:36:57.232Z'::timestamp,'user-platform-admin',
 FALSE,1,'org-glow'
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (benefit_id) DO NOTHING;

INSERT INTO memginedev.benefit_usage_rule (
 benefit_usage_rule_id,benefit_id,rule_name,frequency_type,frequency_interval,usage_limit,
 window_start_time,window_end_time,applicable_days,time_zone,effective_date,expiry_date,
 benefit_usage_rule_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'benefit-rule-1789105946408-2sprlf','benefit-1788766124617','Free filter Coffee Usage Rule','DAILY',
 1,1,('2026-09-07'::date + '00:00'::time),('2026-09-07'::date + '23:00'::time),'MON,TUE,WED,THU,FRI,SAT,SUN','America/Toronto',
 '2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT_USAGE_RULE','status-active'),
 '2026-09-11T05:52:26.408Z'::timestamp,'user-platform-admin','2026-09-11T05:52:26.408Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
ON CONFLICT (benefit_usage_rule_id) DO NOTHING;

INSERT INTO memginedev.benefit_usage_rule (
 benefit_usage_rule_id,benefit_id,rule_name,frequency_type,frequency_interval,usage_limit,
 window_start_time,window_end_time,applicable_days,time_zone,effective_date,expiry_date,
 benefit_usage_rule_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'benefit-rule-1789106004605-c6ei7a','benefit-1788766539093','cake discount Usage Rule','YEARLY',
 1,1,NULL,NULL,NULL,NULL,
 '2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('BENEFIT_USAGE_RULE','status-active'),
 '2026-09-11T05:53:24.605Z'::timestamp,'user-platform-admin','2026-09-11T05:53:24.605Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
ON CONFLICT (benefit_usage_rule_id) DO NOTHING;


-- ============================================================================
-- MEMBERSHIP PRODUCTS + PLANS + BENEFIT ASSIGNMENTS
-- ============================================================================

INSERT INTO memginedev.membership_products (
 membership_product_id,organization_id,membership_product_code,membership_product_name,display_name,
 product_category_id,product_type_id,description,product_status_id,effective_date,expiry_date,tier,tier_sequence,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-product-1788769068771','org-1788708324971-hcia1i0a','MEMBERSHIP-001','ARTISAN PASS',
 'ARTISAN PASS','product-category-membership','product-type-individual',NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT','status-active'),
 '2026-09-07'::date,NULL,NULL,
 NULL,
 '2026-09-07T08:17:48.771Z'::timestamp,'user-platform-admin','2026-09-07T08:22:37.135Z'::timestamp,'user-platform-admin',
 FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (membership_product_id) DO NOTHING;

INSERT INTO memginedev.subscription_plans (
 subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,description,
 subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,
 effective_date,expiry_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-plan-1788769068771','membership-product-1788769068771','PLAN-178876906877','SILVER',
 NULL,1,'YEAR',
 79.99,'currency-cad',
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION_PLAN','status-active'),
 '2026-09-07'::date,NULL,'2026-09-07T08:17:48.771Z'::timestamp,'user-platform-admin',
 '2026-09-07T08:21:38.684Z'::timestamp,'user-platform-admin',FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788769068771')
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1788769068771-benefit-1788766124617','membership-product-1788769068771','benefit-1788766124617',1,FALSE,'2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-07T08:17:48.771Z'::timestamp,ou.organization_user_id,'2026-09-07T08:22:37.135Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-1788708324971-hcia1i0a'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788769068771')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1788769068771-benefit-1788766539093','membership-product-1788769068771','benefit-1788766539093',2,FALSE,'2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-07T08:17:48.771Z'::timestamp,ou.organization_user_id,'2026-09-07T08:22:37.135Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-1788708324971-hcia1i0a'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788769068771')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;

INSERT INTO memginedev.membership_products (
 membership_product_id,organization_id,membership_product_code,membership_product_name,display_name,
 product_category_id,product_type_id,description,product_status_id,effective_date,expiry_date,tier,tier_sequence,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-product-1788770000083','org-1788708324971-hcia1i0a','HCIA1I0A-MEMBERSHIP-001','ARTISAN PASS',
 NULL,'product-category-membership','product-type-individual',NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT','status-active'),
 '2026-09-07'::date,NULL,NULL,
 NULL,
 '2026-09-07T08:33:20.083Z'::timestamp,'user-platform-admin','2026-09-07T08:34:00.942Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (membership_product_id) DO NOTHING;

INSERT INTO memginedev.subscription_plans (
 subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,description,
 subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,
 effective_date,expiry_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-plan-1788770000084','membership-product-1788770000083','HCIA1I0A-MEMBER-001-PLAN-001','GOLD',
 NULL,1,'YEAR',
 89.99,'currency-cad',
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION_PLAN','status-active'),
 '2026-09-07'::date,NULL,'2026-09-07T08:33:20.083Z'::timestamp,'user-platform-admin',
 '2026-09-07T08:34:00.942Z'::timestamp,'user-platform-admin',FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788770000083')
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1788770000083-benefit-1788766124617','membership-product-1788770000083','benefit-1788766124617',1,FALSE,'2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-07T08:33:20.083Z'::timestamp,ou.organization_user_id,'2026-09-07T08:34:00.942Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-1788708324971-hcia1i0a'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788770000083')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1788770000083-benefit-1788766539093','membership-product-1788770000083','benefit-1788766539093',2,FALSE,'2026-09-07'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-07T08:33:20.083Z'::timestamp,ou.organization_user_id,'2026-09-07T08:34:00.942Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-1788708324971-hcia1i0a'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1788770000083')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;

INSERT INTO memginedev.membership_products (
 membership_product_id,organization_id,membership_product_code,membership_product_name,display_name,
 product_category_id,product_type_id,description,product_status_id,effective_date,expiry_date,tier,tier_sequence,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-product-1789025847660','org-glow','GLOW-MEMBERSHIP-001','RADIANCE',
 'RADIANCE','product-category-membership','product-type-individual',NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT','status-active'),
 '2026-09-10'::date,NULL,NULL,
 NULL,
 '2026-09-10T07:37:27.660Z'::timestamp,'user-platform-admin','2026-09-10T07:38:32.006Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-glow')
ON CONFLICT (membership_product_id) DO NOTHING;

INSERT INTO memginedev.subscription_plans (
 subscription_plan_id,membership_product_id,subscription_plan_code,subscription_plan_name,description,
 subscription_period,subscription_period_unit,price,currency_id,subscription_plan_status_id,
 effective_date,expiry_date,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'membership-plan-1789025847660','membership-product-1789025847660','GLOW-MEMBERSHIP-001-PLAN-001','SILVER',
 NULL,1,'MONTH',
 19.99,'currency-cad',
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION_PLAN','status-active'),
 '2026-09-10'::date,NULL,'2026-09-10T07:37:27.660Z'::timestamp,'user-platform-admin',
 '2026-09-10T07:38:32.006Z'::timestamp,'user-platform-admin',FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1789025847660')
ON CONFLICT (subscription_plan_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1789025847660-benefit-1789025752938','membership-product-1789025847660','benefit-1789025752938',1,FALSE,'2026-09-10'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-10T07:37:27.660Z'::timestamp,ou.organization_user_id,'2026-09-10T07:38:32.006Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-glow'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1789025847660')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1789025752938')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;

INSERT INTO memginedev.membership_product_benefits (
 membership_product_benefit_id,membership_product_id,benefit_id,display_sequence,mandatory_benefit,
 effective_from,effective_to,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'migration-membership-product-1789025847660-benefit-1789025817232','membership-product-1789025847660','benefit-1789025817232',2,FALSE,'2026-09-10'::date,NULL,
 pg_temp.memgine_2h_entity_status('MEMBERSHIP_PRODUCT_BENEFIT','status-active'),
 '2026-09-10T07:37:27.660Z'::timestamp,ou.organization_user_id,'2026-09-10T07:38:32.006Z'::timestamp,ou.organization_user_id,FALSE,1
FROM memginedev.organization_user ou
WHERE ou.organization_id='org-glow'
  AND ou.user_id='user-org-admin'
  AND ou.is_deleted=FALSE
  AND EXISTS (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id='membership-product-1789025847660')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1789025817232')
ORDER BY ou.organization_user_id
LIMIT 1
ON CONFLICT (membership_product_benefit_id) DO NOTHING;


-- ============================================================================
-- OFFERS + OFFER USAGE RULES
-- ============================================================================

INSERT INTO memginedev.offer (
 offer_id,organization_id,offer_code,offer_name,description,membership_product_id,store_id,
 promotion_image_url,badge_text,availability_text,cta_label,cta_type,cta_target,discount_percentage,
 effective_date,expiry_date,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'offer-1788868333045-00te2d','org-1788708324971-hcia1i0a','1788708324971-HCIA1I0A-OFFER-001','Weekend Croissant Combo','Any Coffee Paired with a freshly baked butter Croissant',
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id=NULL)
      THEN NULL ELSE NULL END,
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 'legacy://asyncstorage/offer/offer-1788868333045-00te2d/promotion-image',NULL,'This weekend only','Redeem Now',
 'REDEEM_OFFER',NULL,
 NULL,
 '2026-09-08'::date,NULL,
 pg_temp.memgine_2h_entity_status('OFFER','status-active'),
 '2026-09-08T11:52:13.045Z'::timestamp,'user-platform-admin','2026-09-12T17:58:25.866Z'::timestamp,'user-platform-admin',
 FALSE,8
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (offer_id) DO NOTHING;

INSERT INTO memginedev.offer (
 offer_id,organization_id,offer_code,offer_name,description,membership_product_id,store_id,
 promotion_image_url,badge_text,availability_text,cta_label,cta_type,cta_target,discount_percentage,
 effective_date,expiry_date,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'offer-1789041711299-ncdfay','org-1788708324971-hcia1i0a','1788708324971-HCIA1I0A-OFFER-002','Membership Discount','Get 20% off on membership subscription',
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.membership_products WHERE membership_product_id=NULL)
      THEN NULL ELSE NULL END,
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 'legacy://asyncstorage/offer/offer-1789041711299-ncdfay/promotion-image','LIMITED TIME','Till 31st March 2027','Redeem Now',
 'REDEEM_OFFER',NULL,
 NULL,
 '2026-09-10'::date,NULL,
 pg_temp.memgine_2h_entity_status('OFFER','status-active'),
 '2026-09-10T12:01:51.299Z'::timestamp,'user-platform-admin','2026-09-11T07:49:07.311Z'::timestamp,'user-platform-admin',
 FALSE,5
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (offer_id) DO NOTHING;

INSERT INTO memginedev.offer_usage_rule (
 offer_usage_rule_id,offer_id,rule_name,frequency_type,frequency_interval,usage_limit,
 window_start_time,window_end_time,applicable_days,time_zone,effective_date,expiry_date,
 offer_usage_rule_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'offer-rule-1789111614064-bxw16j','offer-1788868333045-00te2d','Weekend Croissant Combo','WEEKLY',
 1,2,NULL,NULL,'SAT,SUN,FRI','America/Toronto',
 '2026-09-08'::date,NULL,
 pg_temp.memgine_2h_entity_status('OFFER_USAGE_RULE','status-active'),
 '2026-09-11T07:26:54.064Z'::timestamp,'user-platform-admin','2026-09-12T17:58:24.736Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.offer WHERE offer_id='offer-1788868333045-00te2d')
ON CONFLICT (offer_usage_rule_id) DO NOTHING;

INSERT INTO memginedev.offer_usage_rule (
 offer_usage_rule_id,offer_id,rule_name,frequency_type,frequency_interval,usage_limit,
 window_start_time,window_end_time,applicable_days,time_zone,effective_date,expiry_date,
 offer_usage_rule_status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'offer-rule-1789111674223-f0s9qo','offer-1789041711299-ncdfay','Membership Discount Usage Rule','ONE_TIME',
 1,1,NULL,NULL,NULL,NULL,
 '2026-09-10'::date,NULL,
 pg_temp.memgine_2h_entity_status('OFFER_USAGE_RULE','status-active'),
 '2026-09-11T07:27:54.223Z'::timestamp,'user-platform-admin','2026-09-11T07:49:05.352Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.offer WHERE offer_id='offer-1789041711299-ncdfay')
ON CONFLICT (offer_usage_rule_id) DO NOTHING;


-- ============================================================================
-- NOTIFICATION / INTEGRATION CONFIGURATION
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM memginedev.organization
        WHERE organization_id = 'org-1788708324971-hcia1i0a'
          AND is_deleted = FALSE
    )
    AND NOT EXISTS (
        SELECT 1
        FROM memginedev.notification_configurations
        WHERE organization_id = 'org-1788708324971-hcia1i0a'
          AND is_deleted = FALSE
    )
    THEN
        PERFORM memginedev.save_organization_notification_configuration(
            'org-1788708324971-hcia1i0a',
            'Default Notifications',
            TRUE,
            TRUE,
            TRUE,
            TRUE,
            TRUE,
            'entity-status-notifiy-config-active',
            1,
            'user-platform-admin'
        );
    END IF;
END
$$;

-- ============================================================================
-- SUBSCRIPTIONS
-- ============================================================================

INSERT INTO memginedev.subscriptions (
 subscription_id,subscription_number,subscription_plan_id,organization_user_id,
 subscription_date,start_date,end_date,subscription_status_id,total_amount,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'sub-1788957665778-3x52dk','SUB-2026-57665778','membership-plan-1788769068771','org-user-mtsoynym-3n6t32',
 '2026-09-09'::date,'2026-09-09'::date,'2027-09-09'::date,
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION','status-active'),
 79.99,'2026-09-09T12:41:05.778Z'::timestamp,'user-platform-admin','2026-09-09T12:41:05.778Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.subscription_plans WHERE subscription_plan_id='membership-plan-1788769068771')
  AND EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='org-user-mtsoynym-3n6t32')
ON CONFLICT (subscription_id) DO NOTHING;

INSERT INTO memginedev.subscriptions (
 subscription_id,subscription_number,subscription_plan_id,organization_user_id,
 subscription_date,start_date,end_date,subscription_status_id,total_amount,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'sub-1788968093641-wue0s5','SUB-2026-68093641','membership-plan-1788770000084','org-user-mtsoynym-3n6t32',
 '2026-09-09'::date,'2026-09-09'::date,'2027-09-09'::date,
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION','status-active'),
 89.99,'2026-09-09T15:34:53.641Z'::timestamp,'user-platform-admin','2026-09-09T15:34:53.641Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.subscription_plans WHERE subscription_plan_id='membership-plan-1788770000084')
  AND EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='org-user-mtsoynym-3n6t32')
ON CONFLICT (subscription_id) DO NOTHING;

INSERT INTO memginedev.subscriptions (
 subscription_id,subscription_number,subscription_plan_id,organization_user_id,
 subscription_date,start_date,end_date,subscription_status_id,total_amount,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'sub-1789026023965-g8be80','SUB-2026-26023964','membership-plan-1789025847660','GLOW-CUSTOMER-002',
 '2026-09-10'::date,'2026-09-10'::date,'2026-10-10'::date,
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION','status-active'),
 19.99,'2026-09-10T07:40:23.965Z'::timestamp,'user-platform-admin','2026-09-10T07:40:23.965Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.subscription_plans WHERE subscription_plan_id='membership-plan-1789025847660')
  AND EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='GLOW-CUSTOMER-002')
ON CONFLICT (subscription_id) DO NOTHING;

INSERT INTO memginedev.subscriptions (
 subscription_id,subscription_number,subscription_plan_id,organization_user_id,
 subscription_date,start_date,end_date,subscription_status_id,total_amount,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'sub-1789119519511-vv58g6','SUB-2026-19519511','membership-plan-1788769068771','1788708324971-HCIA1I0A-CUSTOMER-013',
 '2026-09-11'::date,'2026-09-11'::date,'2027-09-11'::date,
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION','status-active'),
 79.99,'2026-09-11T09:38:39.511Z'::timestamp,'user-platform-admin','2026-09-11T09:38:39.511Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.subscription_plans WHERE subscription_plan_id='membership-plan-1788769068771')
  AND EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='1788708324971-HCIA1I0A-CUSTOMER-013')
ON CONFLICT (subscription_id) DO NOTHING;

INSERT INTO memginedev.subscriptions (
 subscription_id,subscription_number,subscription_plan_id,organization_user_id,
 subscription_date,start_date,end_date,subscription_status_id,total_amount,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'sub-1789127657428-zloykw','SUB-2026-27657427','membership-plan-1788769068771','1788708324971-HCIA1I0A-CUSTOMER-014',
 '2026-09-11'::date,'2026-09-11'::date,'2027-09-11'::date,
 pg_temp.memgine_2h_entity_status('SUBSCRIPTION','status-active'),
 79.99,'2026-09-11T11:54:17.428Z'::timestamp,'user-platform-admin','2026-09-11T11:54:17.428Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.subscription_plans WHERE subscription_plan_id='membership-plan-1788769068771')
  AND EXISTS (SELECT 1 FROM memginedev.organization_user WHERE organization_user_id='1788708324971-HCIA1I0A-CUSTOMER-014')
ON CONFLICT (subscription_id) DO NOTHING;


-- ============================================================================
-- BENEFIT REDEMPTIONS
-- ============================================================================

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1788973651257-8s80yf','RDM-2026-1788973651257-8S80YF','sub-1788957665778-3x52dk','benefit-1788766539093',
 'store-1788763175550',
 CASE WHEN 'staff-dev-owner' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-dev-owner')
      THEN 'staff-dev-owner' ELSE NULL END,
 '2026-09-09T17:07:31.257Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: OTP',
 '2026-09-09T17:07:31.257Z'::timestamp,'user-platform-admin','2026-09-09T17:07:31.257Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1788957665778-3x52dk')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1788973978200-oq226v','RDM-2026-1788973978200-OQ226V','sub-1788957665778-3x52dk','benefit-1788766124617',
 'store-1788763175550',
 CASE WHEN 'staff-dev-owner' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-dev-owner')
      THEN 'staff-dev-owner' ELSE NULL END,
 '2026-09-09T17:12:58.200Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: QR',
 '2026-09-09T17:12:58.200Z'::timestamp,'user-platform-admin','2026-09-09T17:12:58.200Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1788957665778-3x52dk')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1788974989622-jwjhqu','RDM-2026-1788974989622-JWJHQU','sub-1788968093641-wue0s5','benefit-1788766124617',
 'store-1788763175550',
 CASE WHEN 'staff-dev-owner' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-dev-owner')
      THEN 'staff-dev-owner' ELSE NULL END,
 '2026-09-09T17:29:49.621Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: QR',
 '2026-09-09T17:29:49.621Z'::timestamp,'user-platform-admin','2026-09-09T17:29:49.621Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1788968093641-wue0s5')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1788974989622-yww4hv','RDM-2026-1788974989622-YWW4HV','sub-1788968093641-wue0s5','benefit-1788766539093',
 'store-1788763175550',
 CASE WHEN 'staff-dev-owner' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-dev-owner')
      THEN 'staff-dev-owner' ELSE NULL END,
 '2026-09-09T17:29:49.622Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: QR',
 '2026-09-09T17:29:49.622Z'::timestamp,'user-platform-admin','2026-09-09T17:29:49.622Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1788968093641-wue0s5')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1789145399081-ibmcsc','RDM-2026-1789145399081-IBMCSC','sub-1789127657428-zloykw','benefit-1788766124617',
 'store-1788763175550',
 CASE WHEN 'staff-1788765416533' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-1788765416533')
      THEN 'staff-1788765416533' ELSE NULL END,
 '2026-09-11T16:49:59.081Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: QR',
 '2026-09-11T16:49:59.081Z'::timestamp,'user-platform-admin','2026-09-11T16:49:59.081Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1789127657428-zloykw')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766124617')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;

INSERT INTO memginedev.redemptions (
 redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
 redemption_datetime,quantity,redemption_status_id,remarks,
 created_at,created_by,updated_at,updated_by,version_no
) SELECT
 'redemption-1789145399081-tjdkeg','RDM-2026-1789145399081-TJDKEG','sub-1789127657428-zloykw','benefit-1788766539093',
 'store-1788763175550',
 CASE WHEN 'staff-1788765416533' IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.staff WHERE staff_id='staff-1788765416533')
      THEN 'staff-1788765416533' ELSE NULL END,
 '2026-09-11T16:49:59.081Z'::timestamp,1,
 pg_temp.memgine_2h_entity_status('REDEMPTION','status-success'),
 'Legacy method: QR',
 '2026-09-11T16:49:59.081Z'::timestamp,'user-platform-admin','2026-09-11T16:49:59.081Z'::timestamp,'user-platform-admin',1
WHERE EXISTS (SELECT 1 FROM memginedev.subscriptions WHERE subscription_id='sub-1789127657428-zloykw')
  AND EXISTS (SELECT 1 FROM memginedev.benefits WHERE benefit_id='benefit-1788766539093')
  AND EXISTS (SELECT 1 FROM memginedev.stores WHERE store_id='store-1788763175550')
ON CONFLICT (redemption_id) DO NOTHING;


-- ============================================================================
-- QR CODES
-- ============================================================================

INSERT INTO memginedev.qr_codes (
 qr_code_id,organization_id,qr_code_name,qr_code_type_id,qr_code_token,target_entity_type,
 target_entity_id,placement_name,store_id,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'qr-test-business-membership-001','org-1788708324971-hcia1i0a','Test Business Membership QR','QR_BUSINESS_MEMBERSHIPS','test-membership-qr-001',
 'membership_product','membership-product-1788769068771','Stage 3 Test',
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 pg_temp.memgine_2h_entity_status('QR_CODE','status-active'),
 '2026-09-11T10:00:00.000Z'::timestamp,'user-platform-admin','2026-09-11T10:00:00.000Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (qr_code_id) DO NOTHING;

INSERT INTO memginedev.qr_codes (
 qr_code_id,organization_id,qr_code_name,qr_code_type_id,qr_code_token,target_entity_type,
 target_entity_id,placement_name,store_id,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'qr-benefit-mtx660r8-c883fa4e2af8','org-1788708324971-hcia1i0a','Benefit Redemption QR','QR_BENEFIT_REDEMPTION','c883fa4e2af8f5c63b2b2ed5c60ff5c5',
 'subscription-benefit-redemption','sub-1789127657428-zloykw',NULL,
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 pg_temp.memgine_2h_entity_status('QR_CODE','status-active'),
 '2026-09-11T16:27:20.276Z'::timestamp,'user-platform-admin','2026-09-11T16:27:20.276Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (qr_code_id) DO NOTHING;

INSERT INTO memginedev.qr_codes (
 qr_code_id,organization_id,qr_code_name,qr_code_type_id,qr_code_token,target_entity_type,
 target_entity_id,placement_name,store_id,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'qr-offer-mtx9g5us-04be2e8c0a7c','org-1788708324971-hcia1i0a','Offer Redemption QR','QR_OFFER_REDEMPTION','04be2e8c0a7c190872733d89cd1082d7',
 'offer-redemption','offer-1788868333045-00te2d',NULL,
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 pg_temp.memgine_2h_entity_status('QR_CODE','status-active'),
 '2026-09-11T17:59:12.291Z'::timestamp,'user-platform-admin','2026-09-11T17:59:12.291Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (qr_code_id) DO NOTHING;

INSERT INTO memginedev.qr_codes (
 qr_code_id,organization_id,qr_code_name,qr_code_type_id,qr_code_token,target_entity_type,
 target_entity_id,placement_name,store_id,status_id,created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'qr-offer-mtxahlz3-699089f36e14','org-1788708324971-hcia1i0a','Offer Redemption QR','QR_OFFER_REDEMPTION','699089f36e14e4bf5c9cbb9e78933c31',
 'offer-redemption','offer-1788868333045-00te2d',NULL,
 CASE WHEN NULL IS NOT NULL AND EXISTS
      (SELECT 1 FROM memginedev.stores WHERE store_id=NULL)
      THEN NULL ELSE NULL END,
 pg_temp.memgine_2h_entity_status('QR_CODE','status-active'),
 '2026-09-11T18:28:19.455Z'::timestamp,'user-platform-admin','2026-09-11T18:28:19.455Z'::timestamp,'user-platform-admin',
 FALSE,1
WHERE EXISTS (SELECT 1 FROM memginedev.organization WHERE organization_id='org-1788708324971-hcia1i0a')
ON CONFLICT (qr_code_id) DO NOTHING;


-- ============================================================================
-- CUSTOMER PREFERENCES
-- ============================================================================

INSERT INTO memginedev.customer_preference (
 customer_preference_id,user_id,preference_type_id,preference_value,preference_status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'CUSTOMER-PREF-user-mtwwetxe-jr18vq-notifications','user-mtwwetxe-jr18vq','preference-type-notifications','true',
 pg_temp.memgine_2h_entity_status('CUSTOMER_PREFERENCE','preference-status-active'),
 '2026-09-12T17:11:14.981Z'::timestamp,'user-platform-admin','2026-09-12T17:11:15.899Z'::timestamp,'user-platform-admin',
 FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwwetxe-jr18vq')
ON CONFLICT (customer_preference_id) DO NOTHING;

INSERT INTO memginedev.customer_preference (
 customer_preference_id,user_id,preference_type_id,preference_value,preference_status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'CUSTOMER-PREF-user-mtwwetxe-jr18vq-marketing-emails','user-mtwwetxe-jr18vq','preference-type-marketing-emails','false',
 pg_temp.memgine_2h_entity_status('CUSTOMER_PREFERENCE','preference-status-active'),
 '2026-09-12T17:11:17.646Z'::timestamp,'user-platform-admin','2026-09-12T17:11:18.356Z'::timestamp,'user-platform-admin',
 FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtwwetxe-jr18vq')
ON CONFLICT (customer_preference_id) DO NOTHING;

INSERT INTO memginedev.customer_preference (
 customer_preference_id,user_id,preference_type_id,preference_value,preference_status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'CUSTOMER-PREF-user-mtsoynym-3v36gi-notifications','user-mtsoynym-3v36gi','preference-type-notifications','true',
 pg_temp.memgine_2h_entity_status('CUSTOMER_PREFERENCE','preference-status-active'),
 '2026-09-10T17:08:09.496Z'::timestamp,'user-platform-admin','2026-09-10T17:08:10.920Z'::timestamp,'user-platform-admin',
 FALSE,2
WHERE EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi')
ON CONFLICT (customer_preference_id) DO NOTHING;

INSERT INTO memginedev.customer_preference (
 customer_preference_id,user_id,preference_type_id,preference_value,preference_status_id,
 created_at,created_by,updated_at,updated_by,is_deleted,version_no
) SELECT
 'CUSTOMER-PREF-user-mtsoynym-3v36gi-marketing-emails','user-mtsoynym-3v36gi','preference-type-marketing-emails','false',
 pg_temp.memgine_2h_entity_status('CUSTOMER_PREFERENCE','preference-status-active'),
 '2026-09-10T17:08:11.715Z'::timestamp,'user-platform-admin','2026-09-10T17:08:16.501Z'::timestamp,'user-platform-admin',
 FALSE,4
WHERE EXISTS (SELECT 1 FROM memginedev."user" WHERE user_id='user-mtsoynym-3v36gi')
ON CONFLICT (customer_preference_id) DO NOTHING;


-- ============================================================================
-- INTENTIONALLY NOT SILENTLY MIGRATED
-- ============================================================================
-- The browser export also contains:
--   * memgine:offer-redemptions
--       Current physical redemptions table is benefit/subscription based and has no offer_id.
--       No compatible offer-redemption physical table was returned by the supplied schema metadata.
--   * memgine:organization:*:referrals
--       referral requires referral_program_id, but the export contains no referral_program master.
--       A program is NOT invented here.
--   * memgine:organization:*:user-acquisitions
--   * memgine:qr-membership-acquisition-attributions
--   * memgine:qr-scan-history
--       These depend on acquisition / qr_scan_history structures not fully covered by the supplied
--       physical-schema extracts, so they remain in the preserved export for a later targeted migration.
--   * customer-experience-releases
--       Large release snapshots are preserved in the export. They are not inserted here because their
--       nested customer-experience dependency graph was not fully included in the supplied metadata.
--
-- This is deliberate reconciliation, not data deletion.

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT organization_id, organization_name, is_deleted, version_no
FROM memginedev.organization
WHERE organization_id IN (
 'org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r'
)
ORDER BY organization_name;

SELECT 'stores' entity, count(*) rows FROM memginedev.stores
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
UNION ALL
SELECT 'products',count(*) FROM memginedev.product
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
UNION ALL
SELECT 'organization_users',count(*) FROM memginedev.organization_user
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
UNION ALL
SELECT 'benefits',count(*) FROM memginedev.benefits
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
UNION ALL
SELECT 'membership_products',count(*) FROM memginedev.membership_products
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
UNION ALL
SELECT 'offers',count(*) FROM memginedev.offer
WHERE organization_id IN ('org-1788708324971-hcia1i0a','org-glow','org-steep-sip','org-sunrise-bakery','org-20260915-vawpee5r')
ORDER BY entity;

SELECT subscription_id,subscription_number,organization_user_id,subscription_plan_id,subscription_status_id
FROM memginedev.subscriptions
WHERE subscription_id IN (
 'sub-1788957665778-3x52dk','sub-1788968093641-wue0s5','sub-1789026023965-g8be80',
 'sub-1789119519511-vv58g6','sub-1789127657428-zloykw'
)
ORDER BY subscription_id;

SELECT redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,redemption_status_id
FROM memginedev.redemptions
WHERE redemption_id IN (
 'redemption-1788973651257-8s80yf','redemption-1788973978200-oq226v',
 'redemption-1788974989622-jwjhqu','redemption-1788974989622-yww4hv',
 'redemption-1789145399081-ibmcsc','redemption-1789145399081-tjdkeg'
)
ORDER BY redemption_id
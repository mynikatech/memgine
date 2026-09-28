-- =============================================================================
-- Coffee Chain template alignment
--
-- Aligns the database template identifier with the frozen Coffee Chain
-- frontend definition. The legacy coffee-v1 row is retained for organizations
-- that already reference it, but is never a default after this migration.
-- =============================================================================

-- Retire the obsolete default before installing the canonical replacement.
-- A referenced legacy template remains active for compatibility; an unused one
-- is marked inactive. Neither case hard-deletes historical data.
UPDATE "${schemaName}"."template" AS legacy
SET
    "is_default" = FALSE,
    "template_status_id" = CASE
        WHEN EXISTS (
            SELECT 1
            FROM "${schemaName}"."organization_branding" AS branding
            WHERE branding."theme_template_id" = legacy."template_id"
        ) THEN legacy."template_status_id"
        ELSE 'entity-status-template-inactive'
    END,
    "updated_at" = CURRENT_TIMESTAMP,
    "updated_by" = 'user-platform-admin',
    "version_no" = legacy."version_no" + 1
WHERE legacy."template_id" = 'coffee-v1'
  AND (
      legacy."is_default" IS DISTINCT FROM FALSE
      OR (
          NOT EXISTS (
              SELECT 1
              FROM "${schemaName}"."organization_branding" AS branding
              WHERE branding."theme_template_id" = legacy."template_id"
          )
          AND legacy."template_status_id" IS DISTINCT FROM 'entity-status-template-inactive'
      )
  );

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
VALUES (
    'coffee-chain-v1',
    'template-type-theme-layout',
    'Coffee Chain Default Theme',
    'organization-type-coffee',
    'Default theme and layout configuration for coffee chain organizations.',
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

CREATE OR REPLACE FUNCTION "${schemaName}".create_organization(
    p_organization jsonb,
    p_details jsonb,
    p_branding jsonb,
    p_actor_user_id varchar(64)
)
RETURNS TABLE (
    organization_id varchar(64),
    organization_details_id varchar(64),
    organization_branding_id varchar(64)
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_organization_id varchar(64);
    v_organization_details_id varchar(64);
    v_organization_branding_id varchar(64);
    v_organization_code varchar(64);
    v_organization_type_id varchar(40) := NULLIF(trim(p_organization->>'organizationTypeId'), '');
    v_default_template_id varchar(40);
    v_default_template_ids varchar(40)[];
    v_requested_template_id varchar(40) := NULLIF(trim(p_branding->>'themeTemplateId'), '');
    v_org_seq bigint;
    v_primary_phone varchar(20);
    v_support_phone varchar(20);
BEGIN
    IF p_actor_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u
        WHERE u.user_id = p_actor_user_id AND u.is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Invalid actor user_id: %', p_actor_user_id
            USING ERRCODE = '23503';
    END IF;

    IF NULLIF(trim(p_organization->>'name'), '') IS NULL THEN
        RAISE EXCEPTION 'Organization name is required'
            USING ERRCODE = '22023';
    END IF;

    IF v_organization_type_id IS NULL THEN
        RAISE EXCEPTION 'Organization type is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(t.template_id ORDER BY t.template_id)
      INTO v_default_template_ids
      FROM "${schemaName}"."template" t
      JOIN "${schemaName}"."entity_status" es
        ON es.entity_status_id = t.template_status_id
       AND es.is_active = TRUE
      JOIN "${schemaName}"."statuses" s
        ON s.status_id = es.status_id
     WHERE t.organization_type_id = v_organization_type_id
       AND t.is_default = TRUE
       AND t.is_deleted = FALSE
       AND s.status_code = 'ACTIVE';

    IF COALESCE(cardinality(v_default_template_ids), 0) = 0 THEN
        RAISE EXCEPTION
            'No active default template is configured for organization type ''%''.',
            v_organization_type_id
            USING ERRCODE = '22023';
    END IF;

    IF cardinality(v_default_template_ids) > 1 THEN
        RAISE EXCEPTION
            'Multiple active default templates are configured for organization type ''%''.',
            v_organization_type_id
            USING ERRCODE = '22023';
    END IF;

    v_default_template_id := v_default_template_ids[1];

    IF v_requested_template_id IS DISTINCT FROM v_default_template_id THEN
        RAISE EXCEPTION
            'Theme template ''%'' is not the active default template for organization type ''%''.',
            COALESCE(v_requested_template_id, ''), v_organization_type_id
            USING ERRCODE = '22023';
    END IF;

    v_organization_id := "${schemaName}".generate_runtime_id('ORG');
    v_organization_details_id := "${schemaName}".generate_runtime_id('ODT');
    v_organization_branding_id := "${schemaName}".generate_runtime_id('OBR');
    v_org_seq := "${schemaName}".next_business_sequence('ORGANIZATION', 'GLOBAL');
    v_organization_code := (
        'ORG_' || "${schemaName}".business_name_fragment(p_organization->>'name')
        || '_' || lpad(v_org_seq::text, 4, '0')
    )::varchar(64);

    v_primary_phone := COALESCE(p_organization#>>'{primaryPhone,callingCode}', '')
                       || COALESCE(p_organization#>>'{primaryPhone,number}', '');

    IF NULLIF(TRIM(p_details#>>'{supportPhone,number}'), '') IS NULL THEN
        v_support_phone := NULL;
    ELSE
        v_support_phone := COALESCE(p_details#>>'{supportPhone,callingCode}', '')
                           || TRIM(p_details#>>'{supportPhone,number}');
    END IF;

    INSERT INTO "${schemaName}"."organization" (
        organization_id, organization_code, organization_name,
        published_customer_experience_release_id, organization_display_name,
        legal_name, organization_type_id, organization_status_id,
        primary_email, primary_phone, primary_phone_country_id,
        primary_phone_calling_code, website_url,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_id, v_organization_code, p_organization->>'name', NULL,
        NULLIF(p_organization->>'displayName', ''), NULL,
        v_organization_type_id, 'entity-status-org-active',
        p_organization->>'primaryEmail', v_primary_phone,
        NULLIF(p_organization#>>'{primaryPhone,countryId}', ''),
        NULLIF(p_organization#>>'{primaryPhone,callingCode}', ''),
        NULLIF(p_organization->>'website', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    INSERT INTO "${schemaName}"."organization_details" (
        organization_details_id, organization_id, registration_number, gst_number,
        support_email, support_phone, support_phone_country_id,
        support_phone_calling_code, address_line1, address_line2, city, state,
        postal_code, country, about_organization,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_details_id, v_organization_id,
        NULLIF(p_details->>'registrationNumber', ''),
        NULLIF(p_details->>'gstNumber', ''),
        NULLIF(p_details->>'supportEmail', ''),
        v_support_phone,
        CASE WHEN v_support_phone IS NULL THEN NULL ELSE NULLIF(p_details#>>'{supportPhone,countryId}', '') END,
        CASE WHEN v_support_phone IS NULL THEN NULL ELSE NULLIF(p_details#>>'{supportPhone,callingCode}', '') END,
        COALESCE(p_details#>>'{address,line1}', ''),
        NULLIF(p_details#>>'{address,line2}', ''),
        COALESCE(p_details#>>'{address,city}', ''),
        COALESCE(p_details#>>'{address,region}', ''),
        COALESCE(p_details#>>'{address,postalCode}', ''),
        COALESCE(p_details#>>'{address,countryCode}', ''),
        NULLIF(p_details->>'aboutOrganization', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    INSERT INTO "${schemaName}"."organization_branding" (
        organization_branding_id, organization_id, branding_name, theme_template_id,
        primary_color, secondary_color, accent_color, logo_url,
        dark_theme_logo_url, favicon_url, splash_screen_image_url,
        branding_status_id, tagline, hero_image_url,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_organization_branding_id, v_organization_id,
        p_branding->>'brandingName', v_requested_template_id,
        NULLIF(p_branding->>'primaryColor', ''),
        NULLIF(p_branding->>'secondaryColor', ''),
        NULLIF(p_branding->>'accentColor', ''),
        NULLIF(p_branding->>'logoUrl', ''),
        NULLIF(p_branding->>'darkThemeLogoUrl', ''),
        NULLIF(p_branding->>'faviconUrl', ''),
        NULLIF(p_branding->>'splashScreenImageUrl', ''),
        'entity-status-org-branding-active',
        NULLIF(p_branding->>'tagline', ''),
        NULLIF(p_branding->>'heroImageUrl', ''),
        CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
        FALSE, 1
    );

    RETURN QUERY SELECT v_organization_id, v_organization_details_id, v_organization_branding_id;
END;
$function$;

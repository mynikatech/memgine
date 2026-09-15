-- Memgine Organization functions
-- Rerunnable / idempotent DDL: YES

DROP FUNCTION IF EXISTS "${schemaName}".create_organization(
    jsonb,
    jsonb,
    jsonb,
    varchar
);

CREATE OR REPLACE FUNCTION "${schemaName}".create_organization(
    p_organization jsonb,
    p_details jsonb,
    p_branding jsonb,
    p_actor_user_id varchar(40)
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
    v_primary_phone varchar(20);
    v_support_phone varchar(20);
BEGIN
    IF p_actor_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."user" u
        WHERE u."user_id" = p_actor_user_id
          AND u."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION 'Invalid actor user_id: %', p_actor_user_id
            USING ERRCODE = '23503';
    END IF;

    v_organization_id := p_organization->>'id';
    v_organization_details_id := p_details->>'id';
    v_organization_branding_id := p_branding->>'id';

    v_primary_phone :=
        COALESCE(p_organization#>>'{primaryPhone,callingCode}', '') ||
        COALESCE(p_organization#>>'{primaryPhone,number}', '');

    -- Support phone is optional.
    -- Do not persist only the calling code when no phone number exists.
    IF NULLIF(TRIM(p_details#>>'{supportPhone,number}'), '') IS NULL THEN
        v_support_phone := NULL;
    ELSE
        v_support_phone :=
            COALESCE(p_details#>>'{supportPhone,callingCode}', '') ||
            TRIM(p_details#>>'{supportPhone,number}');
    END IF;

    INSERT INTO "${schemaName}"."organization" (
        "organization_id",
        "organization_code",
        "organization_name",
        "published_customer_experience_release_id",
        "organization_display_name",
        "legal_name",
        "organization_type_id",
        "organization_status_id",
        "primary_email",
        "primary_phone",
        "website_url",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_organization_id,
        p_organization->>'code',
        p_organization->>'name',
        NULL,
        NULLIF(p_organization->>'displayName', ''),
        NULL,
        p_organization->>'organizationTypeId',

        -- Initial organization status is controlled by the server/DB.
        -- Incoming DTO status is intentionally ignored during CREATE.
        'entity-status-org-active',

        p_organization->>'primaryEmail',
        v_primary_phone,
        NULLIF(p_organization->>'website', ''),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );

    INSERT INTO "${schemaName}"."organization_details" (
        "organization_details_id",
        "organization_id",
        "registration_number",
        "gst_number",
        "support_email",
        "support_phone",
        "address_line1",
        "address_line2",
        "city",
        "state",
        "postal_code",
        "country",
        "about_organization",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_organization_details_id,
        v_organization_id,
        NULLIF(p_details->>'registrationNumber', ''),
        NULLIF(p_details->>'gstNumber', ''),
        NULLIF(p_details->>'supportEmail', ''),
        v_support_phone,
        COALESCE(p_details#>>'{address,line1}', ''),
        NULLIF(p_details#>>'{address,line2}', ''),
        COALESCE(p_details#>>'{address,city}', ''),
        COALESCE(p_details#>>'{address,region}', ''),
        COALESCE(p_details#>>'{address,postalCode}', ''),
        COALESCE(p_details#>>'{address,countryCode}', ''),
        NULLIF(p_details->>'aboutOrganization', ''),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );

    INSERT INTO "${schemaName}"."organization_branding" (
        "organization_branding_id",
        "organization_id",
        "branding_name",
        "theme_template_id",
        "primary_color",
        "secondary_color",
        "accent_color",
        "logo_url",
        "dark_theme_logo_url",
        "favicon_url",
        "splash_screen_image_url",
        "branding_status_id",
        "tagline",
        "hero_image_url",
        "created_at",
        "created_by",
        "updated_at",
        "updated_by",
        "is_deleted",
        "version_no"
    )
    VALUES (
        v_organization_branding_id,
        v_organization_id,
        p_branding->>'brandingName',
        p_branding->>'themeTemplateId',
        NULLIF(p_branding->>'primaryColor', ''),
        NULLIF(p_branding->>'secondaryColor', ''),
        NULLIF(p_branding->>'accentColor', ''),
        NULLIF(p_branding->>'logoUrl', ''),
        NULLIF(p_branding->>'darkThemeLogoUrl', ''),
        NULLIF(p_branding->>'faviconUrl', ''),
        NULLIF(p_branding->>'splashScreenImageUrl', ''),

        -- Initial branding status is controlled by the server/DB.
        -- Incoming DTO status is intentionally ignored during CREATE.
        'entity-status-org-branding-active',

        NULLIF(p_branding->>'tagline', ''),
        NULLIF(p_branding->>'heroImageUrl', ''),
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );

    RETURN QUERY
    SELECT
        v_organization_id,
        v_organization_details_id,
        v_organization_branding_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".create_organization(
    jsonb,
    jsonb,
    jsonb,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".create_organization(
    jsonb,
    jsonb,
    jsonb,
    varchar
) TO "${appRole}";
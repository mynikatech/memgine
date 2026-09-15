-- ============================================================
-- Memgine - Update Organization Aggregate
--
-- Rerunnable / idempotent DDL: YES
--
-- Supports partial updates of:
--   organization
--   organization_details
--   organization_branding
--
-- Multiple supplied sections execute atomically.
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".update_organization(
    p_organization_id varchar(64),
    p_organization jsonb,
    p_details jsonb,
    p_branding jsonb,
    p_actor_user_id varchar(40)
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_primary_phone varchar(20);
    v_support_phone varchar(20);
BEGIN

    -- --------------------------------------------------------
    -- Validate actor
    -- --------------------------------------------------------

    IF p_actor_user_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."user" u
        WHERE u."user_id" = p_actor_user_id
          AND u."is_deleted" = FALSE
    ) THEN
        RAISE EXCEPTION 'Invalid actor user_id: %', p_actor_user_id
            USING ERRCODE = '23503';
    END IF;

    -- --------------------------------------------------------
    -- Validate organization
    -- --------------------------------------------------------

    IF p_organization_id IS NULL
       OR NOT EXISTS (
            SELECT 1
            FROM "${schemaName}"."organization" o
            WHERE o."organization_id" = p_organization_id
              AND o."is_deleted" = FALSE
       )
    THEN
        RAISE EXCEPTION 'Organization not found: %', p_organization_id
            USING ERRCODE = 'P0002';
    END IF;

    -- --------------------------------------------------------
    -- Organization
    -- --------------------------------------------------------

    IF p_organization IS NOT NULL THEN

        IF p_organization->>'id' <> p_organization_id THEN
            RAISE EXCEPTION
                'Organization payload id does not match organization_id';
        END IF;

        v_primary_phone :=
            COALESCE(
                p_organization#>>'{primaryPhone,callingCode}',
                ''
            ) ||
            COALESCE(
                p_organization#>>'{primaryPhone,number}',
                ''
            );

        UPDATE "${schemaName}"."organization"
        SET
            "organization_code" =
                p_organization->>'code',

            "organization_name" =
                p_organization->>'name',

            "organization_display_name" =
                NULLIF(p_organization->>'displayName', ''),

            "organization_type_id" =
                p_organization->>'organizationTypeId',

            "organization_status_id" =
                p_organization->>'organizationStatusId',

            "primary_email" =
                p_organization->>'primaryEmail',

            "primary_phone" =
                v_primary_phone,

            "website_url" =
                NULLIF(p_organization->>'website', ''),

            "updated_at" =
                CURRENT_TIMESTAMP,

            "updated_by" =
                p_actor_user_id,

            "version_no" =
                "version_no" + 1

        WHERE "organization_id" = p_organization_id
          AND "is_deleted" = FALSE;

    END IF;

    -- --------------------------------------------------------
    -- Organization Details
    -- --------------------------------------------------------

    IF p_details IS NOT NULL THEN

        IF p_details->>'organizationId' <> p_organization_id THEN
            RAISE EXCEPTION
                'Organization details organizationId does not match organization_id';
        END IF;

        IF NULLIF(
            TRIM(p_details#>>'{supportPhone,number}'),
            ''
        ) IS NULL THEN

            v_support_phone := NULL;

        ELSE

            v_support_phone :=
                COALESCE(
                    p_details#>>'{supportPhone,callingCode}',
                    ''
                ) ||
                TRIM(
                    p_details#>>'{supportPhone,number}'
                );

        END IF;

        UPDATE "${schemaName}"."organization_details"
        SET
            "registration_number" =
                NULLIF(p_details->>'registrationNumber', ''),

            "gst_number" =
                NULLIF(p_details->>'gstNumber', ''),

            "support_email" =
                NULLIF(p_details->>'supportEmail', ''),

            "support_phone" =
                v_support_phone,

            "address_line1" =
                COALESCE(
                    p_details#>>'{address,line1}',
                    ''
                ),

            "address_line2" =
                NULLIF(
                    p_details#>>'{address,line2}',
                    ''
                ),

            "city" =
                COALESCE(
                    p_details#>>'{address,city}',
                    ''
                ),

            "state" =
                COALESCE(
                    p_details#>>'{address,region}',
                    ''
                ),

            "postal_code" =
                COALESCE(
                    p_details#>>'{address,postalCode}',
                    ''
                ),

            "country" =
                COALESCE(
                    p_details#>>'{address,countryCode}',
                    ''
                ),

            "about_organization" =
                NULLIF(
                    p_details->>'aboutOrganization',
                    ''
                ),

            "updated_at" =
                CURRENT_TIMESTAMP,

            "updated_by" =
                p_actor_user_id,

            "version_no" =
                "version_no" + 1

        WHERE "organization_details_id" =
                p_details->>'id'
          AND "organization_id" =
                p_organization_id
          AND "is_deleted" = FALSE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Organization details not found for organization: %',
                p_organization_id
                USING ERRCODE = 'P0002';
        END IF;

    END IF;

    -- --------------------------------------------------------
    -- Organization Branding
    -- --------------------------------------------------------

    IF p_branding IS NOT NULL THEN

        IF p_branding->>'organizationId' <> p_organization_id THEN
            RAISE EXCEPTION
                'Organization branding organizationId does not match organization_id';
        END IF;

        UPDATE "${schemaName}"."organization_branding"
        SET
            "branding_name" =
                p_branding->>'brandingName',

            "theme_template_id" =
                p_branding->>'themeTemplateId',

            "branding_status_id" =
                p_branding->>'brandingStatusId',

            "primary_color" =
                NULLIF(p_branding->>'primaryColor', ''),

            "secondary_color" =
                NULLIF(p_branding->>'secondaryColor', ''),

            "accent_color" =
                NULLIF(p_branding->>'accentColor', ''),

            "logo_url" =
                NULLIF(p_branding->>'logoUrl', ''),

            "dark_theme_logo_url" =
                NULLIF(p_branding->>'darkThemeLogoUrl', ''),

            "favicon_url" =
                NULLIF(p_branding->>'faviconUrl', ''),

            "splash_screen_image_url" =
                NULLIF(
                    p_branding->>'splashScreenImageUrl',
                    ''
                ),

            "tagline" =
                NULLIF(p_branding->>'tagline', ''),

            "hero_image_url" =
                NULLIF(p_branding->>'heroImageUrl', ''),

            "updated_at" =
                CURRENT_TIMESTAMP,

            "updated_by" =
                p_actor_user_id,

            "version_no" =
                "version_no" + 1

        WHERE "organization_branding_id" =
                p_branding->>'id'
          AND "organization_id" =
                p_organization_id
          AND "is_deleted" = FALSE;

        IF NOT FOUND THEN
            RAISE EXCEPTION
                'Organization branding not found for organization: %',
                p_organization_id
                USING ERRCODE = 'P0002';
        END IF;

    END IF;

    RETURN TRUE;

END;
$function$;


REVOKE ALL ON FUNCTION "${schemaName}".update_organization(
    varchar,
    jsonb,
    jsonb,
    jsonb,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".update_organization(
    varchar,
    jsonb,
    jsonb,
    jsonb,
    varchar
) TO "${appRole}";
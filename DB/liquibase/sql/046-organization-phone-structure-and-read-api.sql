-- ============================================================
-- Memgine - Organization structured phone + API read contract
--
-- Rerunnable / idempotent DDL: YES
--
-- Purpose:
--   1. Preserve structured phone metadata required by API DTOs.
--   2. Keep existing primary_phone/support_phone storage semantics.
--   3. Preserve the existing create/update function contracts.
--   4. Preserve the validation/business rules from 020/042.
--   5. Return camelCase JSON matching frontend domain contracts.
--
-- IMPORTANT:
--   Existing primary_phone/support_phone continue to store:
--       callingCode + number
--
--   The new columns preserve countryId and callingCode separately.
--   We deliberately DO NOT rewrite/split existing phone values.
--
--   This avoids making an unsafe assumption that every +1 number
--   belongs to Canada.
-- ============================================================


-- ============================================================
-- 1. STRUCTURED PHONE METADATA
-- ============================================================

ALTER TABLE "${schemaName}"."organization"
    ADD COLUMN IF NOT EXISTS "primary_phone_country_id" varchar(64),
    ADD COLUMN IF NOT EXISTS "primary_phone_calling_code" varchar(10);


ALTER TABLE "${schemaName}"."organization_details"
    ADD COLUMN IF NOT EXISTS "support_phone_country_id" varchar(64),
    ADD COLUMN IF NOT EXISTS "support_phone_calling_code" varchar(10);


-- ============================================================
-- 2. CREATE ORGANIZATION
--
-- Preserve the contract and behaviour from 020.
-- Existing combined phone storage remains unchanged.
-- Structured metadata is additionally persisted.
-- ============================================================

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


    v_organization_id :=
        p_organization->>'id';

    v_organization_details_id :=
        p_details->>'id';

    v_organization_branding_id :=
        p_branding->>'id';


    -- --------------------------------------------------------
    -- Phone storage
    --
    -- Preserve existing DB semantics:
    -- primary_phone = callingCode + number
    -- --------------------------------------------------------

    v_primary_phone :=
        COALESCE(
            p_organization#>>'{primaryPhone,callingCode}',
            ''
        ) ||
        COALESCE(
            p_organization#>>'{primaryPhone,number}',
            ''
        );


    -- Support phone is optional.
    -- Never persist calling code alone.

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


    -- --------------------------------------------------------
    -- Organization
    -- --------------------------------------------------------

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
        "primary_phone_country_id",
        "primary_phone_calling_code",
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
        NULLIF(
            p_organization->>'displayName',
            ''
        ),
        NULL,
        p_organization->>'organizationTypeId',

        -- Server/DB controls initial lifecycle.
        'entity-status-org-active',

        p_organization->>'primaryEmail',

        v_primary_phone,

        NULLIF(
            p_organization#>>'{primaryPhone,countryId}',
            ''
        ),

        NULLIF(
            p_organization#>>'{primaryPhone,callingCode}',
            ''
        ),

        NULLIF(
            p_organization->>'website',
            ''
        ),

        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );


    -- --------------------------------------------------------
    -- Organization Details
    -- --------------------------------------------------------

    INSERT INTO "${schemaName}"."organization_details" (
        "organization_details_id",
        "organization_id",
        "registration_number",
        "gst_number",
        "support_email",
        "support_phone",
        "support_phone_country_id",
        "support_phone_calling_code",
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

        NULLIF(
            p_details->>'registrationNumber',
            ''
        ),

        NULLIF(
            p_details->>'gstNumber',
            ''
        ),

        NULLIF(
            p_details->>'supportEmail',
            ''
        ),

        v_support_phone,

        CASE
            WHEN v_support_phone IS NULL THEN NULL
            ELSE NULLIF(
                p_details#>>'{supportPhone,countryId}',
                ''
            )
        END,

        CASE
            WHEN v_support_phone IS NULL THEN NULL
            ELSE NULLIF(
                p_details#>>'{supportPhone,callingCode}',
                ''
            )
        END,

        COALESCE(
            p_details#>>'{address,line1}',
            ''
        ),

        NULLIF(
            p_details#>>'{address,line2}',
            ''
        ),

        COALESCE(
            p_details#>>'{address,city}',
            ''
        ),

        COALESCE(
            p_details#>>'{address,region}',
            ''
        ),

        COALESCE(
            p_details#>>'{address,postalCode}',
            ''
        ),

        COALESCE(
            p_details#>>'{address,countryCode}',
            ''
        ),

        NULLIF(
            p_details->>'aboutOrganization',
            ''
        ),

        CURRENT_TIMESTAMP,
        p_actor_user_id,
        CURRENT_TIMESTAMP,
        p_actor_user_id,
        FALSE,
        1
    );


    -- --------------------------------------------------------
    -- Organization Branding
    -- --------------------------------------------------------

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

        NULLIF(
            p_branding->>'primaryColor',
            ''
        ),

        NULLIF(
            p_branding->>'secondaryColor',
            ''
        ),

        NULLIF(
            p_branding->>'accentColor',
            ''
        ),

        NULLIF(
            p_branding->>'logoUrl',
            ''
        ),

        NULLIF(
            p_branding->>'darkThemeLogoUrl',
            ''
        ),

        NULLIF(
            p_branding->>'faviconUrl',
            ''
        ),

        NULLIF(
            p_branding->>'splashScreenImageUrl',
            ''
        ),

        -- Server/DB controls initial branding lifecycle.
        'entity-status-org-branding-active',

        NULLIF(
            p_branding->>'tagline',
            ''
        ),

        NULLIF(
            p_branding->>'heroImageUrl',
            ''
        ),

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


-- ============================================================
-- 3. UPDATE ORGANIZATION
--
-- Preserve 042 validation and partial-update behaviour.
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
                NULLIF(
                    p_organization->>'displayName',
                    ''
                ),

            "organization_type_id" =
                p_organization->>'organizationTypeId',

            -- Preserve 042 behaviour.
            -- Generic lifecycle hard-block remains a later batch.
            "organization_status_id" =
                p_organization->>'organizationStatusId',

            "primary_email" =
                p_organization->>'primaryEmail',

            "primary_phone" =
                v_primary_phone,

            "primary_phone_country_id" =
                NULLIF(
                    p_organization#>>'{primaryPhone,countryId}',
                    ''
                ),

            "primary_phone_calling_code" =
                NULLIF(
                    p_organization#>>'{primaryPhone,callingCode}',
                    ''
                ),

            "website_url" =
                NULLIF(
                    p_organization->>'website',
                    ''
                ),

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
                NULLIF(
                    p_details->>'registrationNumber',
                    ''
                ),

            "gst_number" =
                NULLIF(
                    p_details->>'gstNumber',
                    ''
                ),

            "support_email" =
                NULLIF(
                    p_details->>'supportEmail',
                    ''
                ),

            "support_phone" =
                v_support_phone,

            "support_phone_country_id" =
                CASE
                    WHEN v_support_phone IS NULL THEN NULL
                    ELSE NULLIF(
                        p_details#>>'{supportPhone,countryId}',
                        ''
                    )
                END,

            "support_phone_calling_code" =
                CASE
                    WHEN v_support_phone IS NULL THEN NULL
                    ELSE NULLIF(
                        p_details#>>'{supportPhone,callingCode}',
                        ''
                    )
                END,

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
                NULLIF(
                    p_branding->>'primaryColor',
                    ''
                ),

            "secondary_color" =
                NULLIF(
                    p_branding->>'secondaryColor',
                    ''
                ),

            "accent_color" =
                NULLIF(
                    p_branding->>'accentColor',
                    ''
                ),

            "logo_url" =
                NULLIF(
                    p_branding->>'logoUrl',
                    ''
                ),

            "dark_theme_logo_url" =
                NULLIF(
                    p_branding->>'darkThemeLogoUrl',
                    ''
                ),

            "favicon_url" =
                NULLIF(
                    p_branding->>'faviconUrl',
                    ''
                ),

            "splash_screen_image_url" =
                NULLIF(
                    p_branding->>'splashScreenImageUrl',
                    ''
                ),

            "tagline" =
                NULLIF(
                    p_branding->>'tagline',
                    ''
                ),

            "hero_image_url" =
                NULLIF(
                    p_branding->>'heroImageUrl',
                    ''
                ),

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


-- ============================================================
-- 4. READ - ORGANIZATION
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

    SELECT jsonb_build_object(
        'id',
            o."organization_id",

        'code',
            o."organization_code",

        'name',
            o."organization_name",

        'legalName',
            o."legal_name",

        'displayName',
            o."organization_display_name",

        'organizationTypeId',
            o."organization_type_id",

        'organizationStatusId',
            o."organization_status_id",

        'primaryEmail',
            o."primary_email",

        'primaryPhone',
            jsonb_build_object(
                'countryId',
                    COALESCE(
                        o."primary_phone_country_id",
                        ''
                    ),

                'callingCode',
                    COALESCE(
                        o."primary_phone_calling_code",
                        ''
                    ),

                'number',
                    CASE
                        WHEN
                            o."primary_phone_calling_code" IS NOT NULL
                            AND
                            o."primary_phone_calling_code" <> ''
                            AND
                            o."primary_phone" LIKE
                                o."primary_phone_calling_code" || '%'
                        THEN
                            substring(
                                o."primary_phone"
                                FROM
                                char_length(
                                    o."primary_phone_calling_code"
                                ) + 1
                            )
                        ELSE
                            COALESCE(
                                o."primary_phone",
                                ''
                            )
                    END
            ),

        'website',
            o."website_url",

        'publishedCustomerExperienceReleaseId',
            o."published_customer_experience_release_id",

        'createdAt',
            o."created_at",

        'createdBy',
            o."created_by",

        'updatedAt',
            o."updated_at",

        'updatedBy',
            o."updated_by",

        'isDeleted',
            o."is_deleted",

        'versionNo',
            o."version_no"
    )

    FROM "${schemaName}"."organization" o

    WHERE o."organization_id" = p_organization_id
      AND o."is_deleted" = FALSE;

$function$;


-- ============================================================
-- 5. READ - ORGANIZATION LIST
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organizations()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id',
                    o."organization_id",

                'code',
                    o."organization_code",

                'name',
                    o."organization_name",

                'legalName',
                    o."legal_name",

                'displayName',
                    o."organization_display_name",

                'organizationTypeId',
                    o."organization_type_id",

                'organizationStatusId',
                    o."organization_status_id",

                'primaryEmail',
                    o."primary_email",

                'primaryPhone',
                    jsonb_build_object(
                        'countryId',
                            COALESCE(
                                o."primary_phone_country_id",
                                ''
                            ),

                        'callingCode',
                            COALESCE(
                                o."primary_phone_calling_code",
                                ''
                            ),

                        'number',
                            CASE
                                WHEN
                                    o."primary_phone_calling_code" IS NOT NULL
                                    AND
                                    o."primary_phone_calling_code" <> ''
                                    AND
                                    o."primary_phone" LIKE
                                        o."primary_phone_calling_code" || '%'
                                THEN
                                    substring(
                                        o."primary_phone"
                                        FROM
                                        char_length(
                                            o."primary_phone_calling_code"
                                        ) + 1
                                    )
                                ELSE
                                    COALESCE(
                                        o."primary_phone",
                                        ''
                                    )
                            END
                    ),

                'website',
                    o."website_url",

                'publishedCustomerExperienceReleaseId',
                    o."published_customer_experience_release_id",

                'createdAt',
                    o."created_at",

                'createdBy',
                    o."created_by",

                'updatedAt',
                    o."updated_at",

                'updatedBy',
                    o."updated_by",

                'isDeleted',
                    o."is_deleted",

                'versionNo',
                    o."version_no"
            )
            ORDER BY
                o."organization_name",
                o."organization_code"
        ),
        '[]'::jsonb
    )

    FROM "${schemaName}"."organization" o

    WHERE o."is_deleted" = FALSE;

$function$;


-- ============================================================
-- 6. READ - ORGANIZATION DETAILS
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_details(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

    SELECT jsonb_build_object(
        'id',
            d."organization_details_id",

        'organizationId',
            d."organization_id",

        'registrationNumber',
            COALESCE(
                d."registration_number",
                ''
            ),

        'gstNumber',
            COALESCE(
                d."gst_number",
                ''
            ),

        'supportEmail',
            COALESCE(
                d."support_email",
                ''
            ),

        'supportPhone',
            jsonb_build_object(
                'countryId',
                    COALESCE(
                        d."support_phone_country_id",
                        ''
                    ),

                'callingCode',
                    COALESCE(
                        d."support_phone_calling_code",
                        ''
                    ),

                'number',
                    CASE
                        WHEN d."support_phone" IS NULL THEN ''

                        WHEN
                            d."support_phone_calling_code" IS NOT NULL
                            AND
                            d."support_phone_calling_code" <> ''
                            AND
                            d."support_phone" LIKE
                                d."support_phone_calling_code" || '%'
                        THEN
                            substring(
                                d."support_phone"
                                FROM
                                char_length(
                                    d."support_phone_calling_code"
                                ) + 1
                            )

                        ELSE
                            d."support_phone"
                    END
            ),

        'aboutOrganization',
            COALESCE(
                d."about_organization",
                ''
            ),

        'address',
            jsonb_build_object(
                'line1',
                    COALESCE(
                        d."address_line1",
                        ''
                    ),

                'line2',
                    COALESCE(
                        d."address_line2",
                        ''
                    ),

                'city',
                    COALESCE(
                        d."city",
                        ''
                    ),

                'region',
                    COALESCE(
                        d."state",
                        ''
                    ),

                'postalCode',
                    COALESCE(
                        d."postal_code",
                        ''
                    ),

                'countryCode',
                    COALESCE(
                        d."country",
                        ''
                    )
            ),

        'createdAt',
            d."created_at",

        'createdBy',
            d."created_by",

        'updatedAt',
            d."updated_at",

        'updatedBy',
            d."updated_by",

        'isDeleted',
            d."is_deleted",

        'versionNo',
            d."version_no"
    )

    FROM "${schemaName}"."organization_details" d

    WHERE d."organization_id" = p_organization_id
      AND d."is_deleted" = FALSE;

$function$;


-- ============================================================
-- 7. READ - ORGANIZATION BRANDING
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_branding(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

    SELECT jsonb_build_object(
        'id',
            b."organization_branding_id",

        'organizationId',
            b."organization_id",

        'brandingName',
            b."branding_name",

        'themeTemplateId',
            b."theme_template_id",

        'brandingStatusId',
            b."branding_status_id",

        'logoUrl',
            b."logo_url",

        'darkThemeLogoUrl',
            b."dark_theme_logo_url",

        'faviconUrl',
            b."favicon_url",

        'splashScreenImageUrl',
            b."splash_screen_image_url",

        'primaryColor',
            b."primary_color",

        'secondaryColor',
            b."secondary_color",

        'accentColor',
            b."accent_color",

        'tagline',
            b."tagline",

        'heroImageUrl',
            b."hero_image_url",

        'createdAt',
            b."created_at",

        'createdBy',
            b."created_by",

        'updatedAt',
            b."updated_at",

        'updatedBy',
            b."updated_by",

        'isDeleted',
            b."is_deleted",

        'versionNo',
            b."version_no"
    )

    FROM "${schemaName}"."organization_branding" b

    WHERE b."organization_id" = p_organization_id
      AND b."is_deleted" = FALSE;

$function$;


-- ============================================================
-- 8. READ - ORGANIZATION AGGREGATE
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_aggregate(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$

    SELECT jsonb_build_object(
        'organization',
            "${schemaName}".get_organization(
                p_organization_id
            ),

        'details',
            "${schemaName}".get_organization_details(
                p_organization_id
            ),

        'branding',
            "${schemaName}".get_organization_branding(
                p_organization_id
            )
    )

    WHERE "${schemaName}".get_organization(
        p_organization_id
    ) IS NOT NULL;

$function$;


-- ============================================================
-- 9. READ FUNCTION PERMISSIONS
-- ============================================================

REVOKE ALL ON FUNCTION "${schemaName}".get_organization(
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization(
    varchar
) TO "${appRole}";


REVOKE ALL ON FUNCTION "${schemaName}".get_organizations()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organizations()
TO "${appRole}";


REVOKE ALL ON FUNCTION "${schemaName}".get_organization_details(
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_details(
    varchar
) TO "${appRole}";


REVOKE ALL ON FUNCTION "${schemaName}".get_organization_branding(
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_branding(
    varchar
) TO "${appRole}";


REVOKE ALL ON FUNCTION "${schemaName}".get_organization_aggregate(
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_aggregate(
    varchar
) TO "${appRole}";
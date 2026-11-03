ALTER TABLE "${schemaName}".organization_branding
    ADD COLUMN IF NOT EXISTS theme_experience_config jsonb;

CREATE OR REPLACE FUNCTION
"${schemaName}".validate_theme_experience(p_config jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_key text;
    v_boolean_key text;
    v_preset text;
BEGIN
    IF p_config IS NULL OR p_config = 'null'::jsonb THEN
        RETURN;
    END IF;

    IF jsonb_typeof(p_config) <> 'object' THEN
        RAISE EXCEPTION 'Theme experience must be an object'
            USING ERRCODE = '22023';
    END IF;

    IF p_config ? 'featureImageUrl'
    AND jsonb_typeof(p_config -> 'featureImageUrl') <> 'null'
    THEN
        IF jsonb_typeof(p_config -> 'featureImageUrl') <> 'string'
        OR length(p_config ->> 'featureImageUrl') > 2048
        OR btrim(p_config ->> 'featureImageUrl') = ''
        THEN
            RAISE EXCEPTION 'Invalid theme feature image URL'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_config) LOOP
        IF v_key NOT IN (
            'enabled',
            'headerEnabled',
            'announcementEnabled',
            'featureEnabled',
            'membershipAccentEnabled',
            'artStyle',
            'featureTitle',
            'featureSubtitle',
            'animationPreset',
            'animationDurationMs'
        ) THEN
            RAISE EXCEPTION 'Unsupported theme experience field: %',
                v_key USING ERRCODE = '22023';
        END IF;
    END LOOP;

    FOREACH v_boolean_key IN ARRAY ARRAY[
        'enabled',
        'headerEnabled',
        'announcementEnabled',
        'featureEnabled',
        'membershipAccentEnabled'
    ] LOOP
        IF p_config ? v_boolean_key
           AND jsonb_typeof(p_config -> v_boolean_key) <> 'boolean'
        THEN
            RAISE EXCEPTION 'Theme experience % must be boolean',
                v_boolean_key USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF p_config ? 'artStyle' AND (
        jsonb_typeof(p_config -> 'artStyle') <> 'string'
        OR p_config ->> 'artStyle' NOT IN (
            'NONE','LIGHTS','GIFT','STARS',
            'HEARTS','FLORAL','CONFETTI','ABSTRACT'
        )
    ) THEN
        RAISE EXCEPTION 'Invalid theme artStyle'
            USING ERRCODE = '22023';
    END IF;

    IF p_config ? 'animationPreset' THEN
        IF jsonb_typeof(p_config -> 'animationPreset') <> 'string'
           OR p_config ->> 'animationPreset' NOT IN (
               'NONE',
               'SOFT_SPARKLES',
               'GLOW_BURST',
               'FLOATING_PARTICLES',
               'SHIMMER_SWEEP',
               'CONFETTI_POP',
               'TWINKLING_LIGHTS',
               'PETAL_DRIFT',
               'RIBBON_REVEAL',
               'STAR_TRAIL',
               'GENTLE_PULSE'
           )
        THEN
            RAISE EXCEPTION 'Invalid theme animation preset'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_config ? 'animationDurationMs' THEN
        IF jsonb_typeof(p_config -> 'animationDurationMs') <> 'number'
           OR (p_config ->> 'animationDurationMs') !~ '^[0-9]+$'
        THEN
            RAISE EXCEPTION 'Animation duration must be an integer'
                USING ERRCODE = '22023';
        END IF;

        IF (p_config ->> 'animationDurationMs')::integer
           NOT BETWEEN 1500 AND 3000
        THEN
            RAISE EXCEPTION 'Animation duration must be 1500-3000 ms'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    FOREACH v_key IN ARRAY ARRAY[
        'featureTitle', 'featureSubtitle'
    ] LOOP
        IF p_config ? v_key AND (
            jsonb_typeof(p_config -> v_key) <> 'string'
            OR length(p_config ->> v_key) > 160
        ) THEN
            RAISE EXCEPTION 'Invalid theme experience text: %',
                v_key USING ERRCODE = '22023';
        END IF;
    END LOOP;
END;
$function$;

-- Validate any existing stored values when deploying to a database
-- that may already contain the optional column.
DO $validation$
DECLARE
    v_config jsonb;
BEGIN
    FOR v_config IN
        SELECT theme_experience_config
        FROM "${schemaName}".organization_branding
        WHERE theme_experience_config IS NOT NULL
    LOOP
        PERFORM "${schemaName}".validate_theme_experience(v_config);
    END LOOP;
END;
$validation$;

CREATE OR REPLACE FUNCTION
"${schemaName}".save_organization_branding_draft(
    p_organization_id varchar,
    p_branding jsonb,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_version integer;
    v_theme_code varchar(64);
    v_decoration jsonb;
    v_experience jsonb;
BEGIN
    IF NOT can_administer_organization(
        p_organization_id, p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_branding IS NULL
       OR (p_branding ->> 'organizationId')
          IS DISTINCT FROM p_organization_id
    THEN
        RAISE EXCEPTION 'Branding organizationId does not match'
            USING ERRCODE = '22023';
    END IF;

    PERFORM branding_v2_validate_complete_branding(p_branding);

    v_version := NULLIF(p_branding ->> 'versionNo', '')::integer;

    IF v_version IS NULL OR v_version < 1 THEN
        RAISE EXCEPTION 'Branding version is required'
            USING ERRCODE = '22023';
    END IF;

    v_theme_code :=
        NULLIF(lower(btrim(p_branding ->> 'platformThemeCode')), '');

    IF v_theme_code IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM "${schemaName}".platform_branding_themes
           WHERE theme_code = v_theme_code
             AND publication_status = 'PUBLISHED'
             AND is_active
       )
    THEN
        RAISE EXCEPTION 'Selected platform theme is unavailable'
            USING ERRCODE = '22023';
    END IF;

    v_decoration :=
        NULLIF(p_branding -> 'decoration', 'null'::jsonb);

    PERFORM branding_v2_validate_decoration(v_decoration);

    v_experience :=
        NULLIF(p_branding -> 'themeExperience', 'null'::jsonb);

    IF p_branding ? 'themeExperience' THEN
        PERFORM "${schemaName}".validate_theme_experience(v_experience);
    END IF;

    UPDATE "${schemaName}".organization_branding
    SET
        primary_color = p_branding ->> 'primaryColor',
        secondary_color = p_branding ->> 'secondaryColor',
        accent_color = p_branding ->> 'accentColor',
        background_color = p_branding ->> 'backgroundColor',
        text_color = p_branding ->> 'textColor',
        background_image_url =
            NULLIF(btrim(p_branding ->> 'backgroundImageUrl'), ''),
        announcement_enabled =
            (p_branding ->> 'announcementEnabled')::boolean,
        announcement_message =
            NULLIF(btrim(p_branding ->> 'announcementMessage'), ''),
        announcement_style =
            upper(btrim(p_branding ->> 'announcementStyle')),
        announcement_background_color =
            NULLIF(btrim(p_branding ->> 'announcementBackgroundColor'), ''),
        announcement_text_color =
            NULLIF(btrim(p_branding ->> 'announcementTextColor'), ''),
        announcement_link_url =
            NULLIF(btrim(p_branding ->> 'announcementLinkUrl'), ''),
        announcement_starts_at =
            NULLIF(btrim(p_branding ->> 'announcementStartsAt'), '')::timestamptz,
        announcement_ends_at =
            NULLIF(btrim(p_branding ->> 'announcementEndsAt'), '')::timestamptz,
        platform_branding_theme_code = v_theme_code,
        decoration_config = v_decoration,

        theme_experience_config = CASE
            WHEN p_branding ? 'themeExperience' THEN v_experience
            ELSE theme_experience_config
        END,

        branding_draft_saved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE organization_id = p_organization_id
      AND organization_branding_id = p_branding ->> 'id'
      AND version_no = v_version
      AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Organization branding changed or not found'
            USING ERRCODE = '40001';
    END IF;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION
"${schemaName}".get_organization_branding(
    p_organization_id varchar(64)
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $function$
    SELECT jsonb_build_object(
        'id', b.organization_branding_id,
        'organizationId', b.organization_id,
        'brandingName', b.branding_name,
        'themeTemplateId', b.theme_template_id,
        'brandingStatusId', b.branding_status_id,
        'logoUrl', b.logo_url,
        'darkThemeLogoUrl', b.dark_theme_logo_url,
        'faviconUrl', b.favicon_url,
        'splashScreenImageUrl', b.splash_screen_image_url,
        'primaryColor', b.primary_color,
        'secondaryColor', b.secondary_color,
        'accentColor', b.accent_color,
        'backgroundColor', b.background_color,
        'textColor', b.text_color,
        'backgroundImageUrl', b.background_image_url,
        'platformThemeCode', b.platform_branding_theme_code,
        'decoration', b.decoration_config,
        'themeExperience', b.theme_experience_config,
        'announcementEnabled', b.announcement_enabled,
        'announcementMessage', b.announcement_message,
        'announcementStyle', b.announcement_style,
        'announcementBackgroundColor', b.announcement_background_color,
        'announcementTextColor', b.announcement_text_color,
        'announcementLinkUrl', b.announcement_link_url,
        'announcementStartsAt', b.announcement_starts_at,
        'announcementEndsAt', b.announcement_ends_at,
        'tagline', b.tagline,
        'heroImageUrl', b.hero_image_url,
        'createdAt', b.created_at,
        'createdBy', b.created_by,
        'updatedAt', b.updated_at,
        'updatedBy', b.updated_by,
        'draftSavedAt', b.branding_draft_saved_at,
        'isDeleted', b.is_deleted,
        'versionNo', b.version_no
    )
    FROM "${schemaName}".organization_branding b
    WHERE b.organization_id = p_organization_id
      AND NOT b.is_deleted;
$function$;

REVOKE ALL ON FUNCTION
"${schemaName}".save_organization_branding_draft(
    varchar, jsonb, varchar
)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
"${schemaName}".save_organization_branding_draft(
    varchar, jsonb, varchar
)
TO "${appRole}";

REVOKE ALL ON FUNCTION
"${schemaName}".validate_theme_experience(jsonb)
FROM PUBLIC;
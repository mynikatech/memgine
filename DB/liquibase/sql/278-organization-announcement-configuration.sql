-- W278: persist and return the Org Admin multi-announcement configuration.
-- Preserves existing single-announcement columns for backward compatibility.
-- Review current environment function definitions before applying to other schemas.

ALTER TABLE "memginedev".organization_branding
    ADD COLUMN IF NOT EXISTS announcement_configuration jsonb;

CREATE OR REPLACE FUNCTION "memginedev".get_organization_branding(p_organization_id character varying)
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
        'announcementConfiguration', b.announcement_configuration,
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
    FROM "memginedev".organization_branding b
    WHERE b.organization_id = p_organization_id
      AND NOT b.is_deleted;
$function$;

CREATE OR REPLACE FUNCTION "memginedev".save_organization_branding_draft(
    p_organization_id character varying,
    p_branding jsonb,
    p_actor_user_id character varying
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'memginedev'
AS $function$
DECLARE
    v_version integer;
    v_theme_code varchar(64);
    v_decoration jsonb;
    v_experience jsonb;
    v_announcements jsonb;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_branding IS NULL
       OR (p_branding ->> 'organizationId') IS DISTINCT FROM p_organization_id
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

    v_theme_code := NULLIF(lower(btrim(p_branding ->> 'platformThemeCode')), '');
    IF v_theme_code IS NOT NULL
       AND NOT EXISTS (
           SELECT 1 FROM "memginedev".platform_branding_themes
           WHERE theme_code = v_theme_code
             AND publication_status = 'PUBLISHED'
             AND is_active
       )
    THEN
        RAISE EXCEPTION 'Selected platform theme is unavailable'
            USING ERRCODE = '22023';
    END IF;

    v_decoration := NULLIF(p_branding -> 'decoration', 'null'::jsonb);
    PERFORM branding_v2_validate_decoration(v_decoration);

    v_experience := NULLIF(p_branding -> 'themeExperience', 'null'::jsonb);
    IF p_branding ? 'themeExperience' THEN
        PERFORM "memginedev".validate_theme_experience(v_experience);
    END IF;

    -- Never silently erase a previously saved configuration if old clients omit it.
    v_announcements := NULLIF(p_branding -> 'announcementConfiguration', 'null'::jsonb);
    IF p_branding ? 'announcementConfiguration'
       AND v_announcements IS NOT NULL
       AND jsonb_typeof(v_announcements) <> 'object'
    THEN
        RAISE EXCEPTION 'Announcement configuration must be an object'
            USING ERRCODE = '22023';
    END IF;

    UPDATE "memginedev".organization_branding
    SET
        primary_color = p_branding ->> 'primaryColor',
        secondary_color = p_branding ->> 'secondaryColor',
        accent_color = p_branding ->> 'accentColor',
        background_color = p_branding ->> 'backgroundColor',
        text_color = p_branding ->> 'textColor',
        background_image_url = NULLIF(btrim(p_branding ->> 'backgroundImageUrl'), ''),
        announcement_enabled = (p_branding ->> 'announcementEnabled')::boolean,
        announcement_message = NULLIF(btrim(p_branding ->> 'announcementMessage'), ''),
        announcement_style = upper(btrim(p_branding ->> 'announcementStyle')),
        announcement_background_color = NULLIF(btrim(p_branding ->> 'announcementBackgroundColor'), ''),
        announcement_text_color = NULLIF(btrim(p_branding ->> 'announcementTextColor'), ''),
        announcement_link_url = NULLIF(btrim(p_branding ->> 'announcementLinkUrl'), ''),
        announcement_starts_at = NULLIF(btrim(p_branding ->> 'announcementStartsAt'), '')::timestamptz,
        announcement_ends_at = NULLIF(btrim(p_branding ->> 'announcementEndsAt'), '')::timestamptz,
        announcement_configuration = CASE
            WHEN p_branding ? 'announcementConfiguration' THEN v_announcements
            ELSE announcement_configuration
        END,
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

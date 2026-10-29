-- Branding V2 is additive. Customer-visible publication remains the existing
-- Customer Experience Proposed Preview -> Publish lifecycle. This migration
-- deliberately does not introduce a second branding draft or publish flow.

ALTER TABLE "${schemaName}".organization_branding
    ADD COLUMN IF NOT EXISTS background_color varchar(7) NOT NULL DEFAULT '#FFFFFF',
    ADD COLUMN IF NOT EXISTS text_color varchar(7) NOT NULL DEFAULT '#1F2937',
    ADD COLUMN IF NOT EXISTS background_image_url varchar(1000),
    ADD COLUMN IF NOT EXISTS announcement_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS announcement_message varchar(500),
    ADD COLUMN IF NOT EXISTS announcement_style varchar(16) NOT NULL DEFAULT 'STATIC',
    ADD COLUMN IF NOT EXISTS announcement_background_color varchar(7),
    ADD COLUMN IF NOT EXISTS announcement_text_color varchar(7),
    ADD COLUMN IF NOT EXISTS announcement_link_url varchar(1000),
    ADD COLUMN IF NOT EXISTS announcement_starts_at timestamptz,
    ADD COLUMN IF NOT EXISTS announcement_ends_at timestamptz;

ALTER TABLE "${schemaName}".organization_branding
    ADD CONSTRAINT ck_organization_branding_v2_background_color
        CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT ck_organization_branding_v2_text_color
        CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
    ADD CONSTRAINT ck_organization_branding_v2_background_image_reference
        CHECK (background_image_url IS NULL OR btrim(background_image_url) <> ''),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_style
        CHECK (announcement_style IN ('STATIC', 'FADE', 'SLIDE', 'TICKER')),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_message
        CHECK (
            NOT announcement_enabled
            OR NULLIF(btrim(announcement_message), '') IS NOT NULL
        ),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_background_color
        CHECK (
            announcement_background_color IS NULL
            OR announcement_background_color ~ '^#[0-9A-Fa-f]{6}$'
        ),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_text_color
        CHECK (
            announcement_text_color IS NULL
            OR announcement_text_color ~ '^#[0-9A-Fa-f]{6}$'
        ),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_link_https
        CHECK (
            announcement_link_url IS NULL
            OR announcement_link_url ~ '^https://[^[:space:]]+$'
        ),
    ADD CONSTRAINT ck_organization_branding_v2_announcement_schedule
        CHECK (
            announcement_starts_at IS NULL
            OR announcement_ends_at IS NULL
            OR announcement_ends_at > announcement_starts_at
        );

-- Custom themes are reusable organization-owned authoring records. A chosen
-- theme's resolved values will later be copied into the Customer Experience
-- release snapshot, so historical releases never depend on mutable theme rows.
CREATE TABLE "${schemaName}".organization_branding_custom_themes (
    organization_branding_custom_theme_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    theme_name varchar(100) NOT NULL,
    theme_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_organization_branding_custom_theme_name
        CHECK (btrim(theme_name) <> ''),
    CONSTRAINT ck_organization_branding_custom_theme_object
        CHECK (jsonb_typeof(theme_json) = 'object'),
    CONSTRAINT ck_organization_branding_custom_theme_version
        CHECK (version_no >= 1)
);

CREATE UNIQUE INDEX uq_organization_branding_custom_theme_name
    ON "${schemaName}".organization_branding_custom_themes (organization_id, lower(theme_name))
    WHERE NOT is_deleted;

-- Validates a reusable visual theme. Its contract is deliberately narrow:
-- five required colours plus an optional background image reference. Customer
-- Experience branding owns announcements and all organization identity/media.
CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_validate_theme(
    p_theme jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_field text;
    v_color text;
BEGIN
    IF p_theme IS NULL OR jsonb_typeof(p_theme) <> 'object' THEN
        RAISE EXCEPTION 'Branding theme must be an object' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_theme) AS key_name
        WHERE key_name NOT IN (
            'primaryColor',
            'secondaryColor',
            'accentColor',
            'backgroundColor',
            'textColor',
            'backgroundImageUrl'
        )
    ) THEN
        RAISE EXCEPTION
            'Branding theme contains unsupported fields'
            USING ERRCODE = '22023';
    END IF;

    FOREACH v_field IN ARRAY ARRAY[
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'backgroundColor',
        'textColor'
    ] LOOP
        IF NOT (p_theme ? v_field)
           OR jsonb_typeof(p_theme -> v_field) <> 'string'
           OR NULLIF(btrim(p_theme ->> v_field), '') IS NULL THEN
            RAISE EXCEPTION 'Branding theme requires a nonblank % value', v_field
                USING ERRCODE = '22023';
        END IF;

        v_color := btrim(p_theme ->> v_field);
        IF v_color !~ '^#[0-9A-Fa-f]{6}$' THEN
            RAISE EXCEPTION 'Branding theme % must use #RRGGBB', v_field
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF p_theme ? 'backgroundImageUrl'
       AND jsonb_typeof(p_theme -> 'backgroundImageUrl') <> 'null'
       AND (
           jsonb_typeof(p_theme -> 'backgroundImageUrl') <> 'string'
           OR NULLIF(btrim(p_theme ->> 'backgroundImageUrl'), '') IS NULL
       ) THEN
        RAISE EXCEPTION
            'Theme backgroundImageUrl must be a nonblank string or JSON null'
            USING ERRCODE = '22023';
    END IF;
END;
$function$;

-- This is deliberately STABLE, not IMMUTABLE: timestamp text is parsed as
-- timestamptz. It validates a complete branding snapshot payload.
CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_validate_complete_branding(
    p_branding jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_start timestamptz;
    v_end timestamptz;
    v_value text;
    v_theme jsonb;
BEGIN
    IF p_branding IS NULL OR jsonb_typeof(p_branding) <> 'object' THEN
        RAISE EXCEPTION 'Branding must be an object' USING ERRCODE = '22023';
    END IF;

    v_theme := jsonb_build_object(
        'primaryColor', p_branding -> 'primaryColor',
        'secondaryColor', p_branding -> 'secondaryColor',
        'accentColor', p_branding -> 'accentColor',
        'backgroundColor', p_branding -> 'backgroundColor',
        'textColor', p_branding -> 'textColor'
    );

    IF p_branding ? 'backgroundImageUrl' THEN
        v_theme := v_theme || jsonb_build_object(
            'backgroundImageUrl', p_branding -> 'backgroundImageUrl'
        );
    END IF;

    PERFORM branding_v2_validate_theme(v_theme);

    IF NOT (p_branding ? 'announcementEnabled')
       OR jsonb_typeof(p_branding -> 'announcementEnabled') <> 'boolean' THEN
        RAISE EXCEPTION 'Branding requires a boolean announcementEnabled value'
            USING ERRCODE = '22023';
    END IF;

    IF NOT (p_branding ? 'announcementStyle')
       OR jsonb_typeof(p_branding -> 'announcementStyle') <> 'string'
       OR upper(btrim(p_branding ->> 'announcementStyle'))
          NOT IN ('STATIC', 'FADE', 'SLIDE', 'TICKER') THEN
        RAISE EXCEPTION 'Branding announcementStyle is invalid'
            USING ERRCODE = '22023';
    END IF;

    IF COALESCE((p_branding ->> 'announcementEnabled')::boolean, false)
       AND (
           jsonb_typeof(p_branding -> 'announcementMessage') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementMessage'), '') IS NULL
       ) THEN
        RAISE EXCEPTION 'An enabled announcement requires a nonblank message'
            USING ERRCODE = '22023';
    END IF;

    FOREACH v_value IN ARRAY ARRAY[
        CASE WHEN p_branding ? 'announcementBackgroundColor'
            THEN p_branding ->> 'announcementBackgroundColor' END,
        CASE WHEN p_branding ? 'announcementTextColor'
            THEN p_branding ->> 'announcementTextColor' END
    ] LOOP
        IF v_value IS NOT NULL AND btrim(v_value) = '' THEN
            RAISE EXCEPTION 'Announcement colour overrides cannot be blank'
                USING ERRCODE = '22023';
        END IF;
        IF v_value IS NOT NULL AND btrim(v_value) !~ '^#[0-9A-Fa-f]{6}$' THEN
            RAISE EXCEPTION 'Announcement colour overrides must use #RRGGBB'
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF p_branding ? 'backgroundImageUrl'
       AND jsonb_typeof(p_branding -> 'backgroundImageUrl') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'backgroundImageUrl') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'backgroundImageUrl'), '') IS NULL THEN
            RAISE EXCEPTION 'backgroundImageUrl must be a nonblank string when supplied'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_branding ? 'announcementLinkUrl'
       AND jsonb_typeof(p_branding -> 'announcementLinkUrl') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementLinkUrl') <> 'string'
           OR btrim(p_branding ->> 'announcementLinkUrl') !~ '^https://[^[:space:]]+$' THEN
            RAISE EXCEPTION 'Announcement link must use HTTPS'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_branding ? 'announcementStartsAt'
       AND jsonb_typeof(p_branding -> 'announcementStartsAt') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementStartsAt') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementStartsAt'), '') IS NULL THEN
            RAISE EXCEPTION 'announcementStartsAt must be a nonblank timestamptz when supplied'
                USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_start := (p_branding ->> 'announcementStartsAt')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'announcementStartsAt is invalid' USING ERRCODE = '22023';
        END;
    END IF;

    IF p_branding ? 'announcementEndsAt'
       AND jsonb_typeof(p_branding -> 'announcementEndsAt') <> 'null' THEN
        IF jsonb_typeof(p_branding -> 'announcementEndsAt') <> 'string'
           OR NULLIF(btrim(p_branding ->> 'announcementEndsAt'), '') IS NULL THEN
            RAISE EXCEPTION 'announcementEndsAt must be a nonblank timestamptz when supplied'
                USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_end := (p_branding ->> 'announcementEndsAt')::timestamptz;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'announcementEndsAt is invalid' USING ERRCODE = '22023';
        END;
    END IF;

    IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_end <= v_start THEN
        RAISE EXCEPTION 'Announcement end must be after announcement start'
            USING ERRCODE = '22023';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_list_custom_themes(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE ("id" varchar, "name" varchar, "theme" jsonb, "versionNo" integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}"."user" u
           WHERE u.user_id = p_actor_user_id AND NOT u.is_deleted
       ) THEN
        RAISE EXCEPTION 'Authenticated actor user is required' USING ERRCODE = '42501';
    END IF;
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT theme.organization_branding_custom_theme_id, theme.theme_name,
           theme.theme_json, theme.version_no
    FROM "${schemaName}".organization_branding_custom_themes theme
    WHERE theme.organization_id = p_organization_id AND NOT theme.is_deleted
    ORDER BY lower(theme.theme_name), theme.organization_branding_custom_theme_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_save_custom_theme(
    p_organization_id varchar,
    p_theme_id varchar,
    p_name varchar,
    p_theme jsonb,
    p_version_no integer,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_id varchar(64);
BEGIN
    IF NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}"."user" u
           WHERE u.user_id = p_actor_user_id AND NOT u.is_deleted
       ) THEN
        RAISE EXCEPTION 'Authenticated actor user is required' USING ERRCODE = '42501';
    END IF;
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_name), '') IS NULL OR length(btrim(p_name)) > 100 THEN
        RAISE EXCEPTION 'Custom theme name is invalid' USING ERRCODE = '22023';
    END IF;

    PERFORM branding_v2_validate_theme(p_theme);

    IF NULLIF(btrim(p_theme_id), '') IS NULL THEN
        v_id := generate_runtime_id('BTH');
        INSERT INTO "${schemaName}".organization_branding_custom_themes (
            organization_branding_custom_theme_id, organization_id, theme_name,
            theme_json, created_by, updated_by
        ) VALUES (
            v_id, p_organization_id, btrim(p_name), p_theme,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        IF p_version_no IS NULL OR p_version_no < 1 THEN
            RAISE EXCEPTION 'Custom theme version is required for update'
                USING ERRCODE = '22023';
        END IF;
        UPDATE "${schemaName}".organization_branding_custom_themes
        SET theme_name = btrim(p_name), theme_json = p_theme,
            updated_by = p_actor_user_id, updated_at = CURRENT_TIMESTAMP,
            version_no = version_no + 1
        WHERE organization_branding_custom_theme_id = p_theme_id
          AND organization_id = p_organization_id
          AND NOT is_deleted
          AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Custom theme changed or was not found'
                USING ERRCODE = '40001';
        END IF;
        v_id := p_theme_id;
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".branding_v2_delete_custom_theme(
    p_organization_id varchar,
    p_theme_id varchar,
    p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}"."user" u
           WHERE u.user_id = p_actor_user_id AND NOT u.is_deleted
       ) THEN
        RAISE EXCEPTION 'Authenticated actor user is required' USING ERRCODE = '42501';
    END IF;
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_theme_id), '') IS NULL OR p_version_no IS NULL OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Custom theme id and version are required' USING ERRCODE = '22023';
    END IF;

    UPDATE "${schemaName}".organization_branding_custom_themes
    SET is_deleted = true, updated_by = p_actor_user_id,
        updated_at = CURRENT_TIMESTAMP, version_no = version_no + 1
    WHERE organization_branding_custom_theme_id = p_theme_id
      AND organization_id = p_organization_id
      AND NOT is_deleted
      AND version_no = p_version_no;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Custom theme changed or was not found'
            USING ERRCODE = '40001';
    END IF;
    RETURN true;
END;
$function$;

-- Preserve the existing signature and every legacy response key.
CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_branding(
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
        'isDeleted', b.is_deleted,
        'versionNo', b.version_no
    )
    FROM "${schemaName}".organization_branding b
    WHERE b.organization_id = p_organization_id AND NOT b.is_deleted;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".branding_v2_validate_theme(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".branding_v2_validate_complete_branding(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".branding_v2_list_custom_themes(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".branding_v2_save_custom_theme(varchar, varchar, varchar, jsonb, integer, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".branding_v2_delete_custom_theme(varchar, varchar, integer, varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".branding_v2_list_custom_themes(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".branding_v2_save_custom_theme(varchar, varchar, varchar, jsonb, integer, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".branding_v2_delete_custom_theme(varchar, varchar, integer, varchar) TO "${appRole}";

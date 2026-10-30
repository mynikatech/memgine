-- Stage 2A: permit the additional announcement animations while preserving all
-- existing Branding V2 validation rules. Supersedes the function in migration 240.
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
          NOT IN ('STATIC', 'FADE', 'SLIDE', 'TICKER', 'TYPEWRITER', 'REVEAL', 'PULSE') THEN
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

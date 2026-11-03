-- W274: Extend existing platform theme validation.
-- Preserve the legacy decoration configuration and five-colour contract.
-- Theme Experience is optional for existing published platform themes.

CREATE OR REPLACE FUNCTION
"${schemaName}".branding_v2_validate_theme(p_theme jsonb)
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
        RAISE EXCEPTION 'Branding theme must be an object'
            USING ERRCODE = '22023';
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
            'backgroundImageUrl',
            'decoration',
            'themeExperience'
        )
    ) THEN
        RAISE EXCEPTION 'Branding theme contains unsupported fields'
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
           OR NULLIF(btrim(p_theme ->> v_field), '') IS NULL
        THEN
            RAISE EXCEPTION 'Branding theme requires a nonblank % value',
                v_field USING ERRCODE = '22023';
        END IF;

        v_color := btrim(p_theme ->> v_field);

        IF v_color !~ '^#[0-9A-Fa-f]{6}$' THEN
            RAISE EXCEPTION 'Branding theme % must use #RRGGBB',
                v_field USING ERRCODE = '22023';
        END IF;
    END LOOP;

    IF p_theme ? 'backgroundImageUrl'
       AND jsonb_typeof(p_theme -> 'backgroundImageUrl') <> 'null'
       AND (
           jsonb_typeof(p_theme -> 'backgroundImageUrl') <> 'string'
           OR NULLIF(btrim(p_theme ->> 'backgroundImageUrl'), '') IS NULL
       )
    THEN
        RAISE EXCEPTION
            'Theme backgroundImageUrl must be a nonblank string or null'
            USING ERRCODE = '22023';
    END IF;

    IF p_theme ? 'decoration' THEN
        PERFORM branding_v2_validate_decoration(
            p_theme -> 'decoration'
        );
    END IF;

    IF p_theme ? 'themeExperience' THEN
        PERFORM "${schemaName}".validate_theme_experience(
            p_theme -> 'themeExperience'
        );
    END IF;
END;
$function$;
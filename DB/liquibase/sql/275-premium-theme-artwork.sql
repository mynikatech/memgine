-- W275: additive extension of existing W273 validator; W272-274 remain unchanged.
CREATE OR REPLACE FUNCTION "${schemaName}".validate_theme_experience(p_config jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_key text;
    v_boolean_key text;
BEGIN
    IF p_config IS NULL OR p_config = 'null'::jsonb THEN
        RETURN;
    END IF;

    IF jsonb_typeof(p_config) <> 'object' THEN
        RAISE EXCEPTION 'Theme experience must be an object'
            USING ERRCODE = '22023';
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
            'featureImageUrl',
            'artPack',
            'featureLayout',
            'announcementBackgroundColor',
            'announcementTextColor',
            'featureBackgroundColor',
            'featureTextColor',
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

    -- W273 addition: optional uploaded/hosted artwork reference.
    -- JSON null is valid; non-null values must be nonempty strings <=2048 chars.
    IF p_config ? 'featureImageUrl'
       AND jsonb_typeof(p_config -> 'featureImageUrl') <> 'null'
    THEN
        IF jsonb_typeof(p_config -> 'featureImageUrl') <> 'string'
           OR length(p_config ->> 'featureImageUrl') > 2048
           OR btrim(p_config ->> 'featureImageUrl') = ''
        THEN
            RAISE EXCEPTION 'Invalid theme featureImageUrl'
                USING ERRCODE = '22023';
        END IF;
    END IF;
    -- W275: Optional data-driven artwork pack and placement-specific colours.
    IF p_config ? 'artPack'
       AND jsonb_typeof(p_config -> 'artPack') <> 'null'
       AND (
           jsonb_typeof(p_config -> 'artPack') <> 'string'
           OR p_config ->> 'artPack' NOT IN (
               'NONE', 'CHRISTMAS_CLASSIC', 'DIWALI_GOLD',
               'NEW_YEAR_CELEBRATION', 'VALENTINE_ROMANCE',
               'GENERIC_CELEBRATION', 'CUSTOM'
           )
       )
    THEN
        RAISE EXCEPTION 'Invalid theme artPack' USING ERRCODE = '22023';
    END IF;

    IF p_config ? 'featureLayout'
       AND jsonb_typeof(p_config -> 'featureLayout') <> 'null'
       AND (
           jsonb_typeof(p_config -> 'featureLayout') <> 'string'
           OR p_config ->> 'featureLayout' NOT IN (
               'SEAMLESS_BACKGROUND', 'BANNER_STRIP'
           )
       )
    THEN
        RAISE EXCEPTION 'Invalid theme featureLayout' USING ERRCODE = '22023';
    END IF;

    FOREACH v_key IN ARRAY ARRAY[
        'announcementBackgroundColor', 'announcementTextColor',
        'featureBackgroundColor', 'featureTextColor'
    ] LOOP
        IF p_config ? v_key
           AND jsonb_typeof(p_config -> v_key) <> 'null'
           AND (
              jsonb_typeof(p_config -> v_key) <> 'string'
              OR (p_config ->> v_key) !~ '^#[0-9a-fA-F]{6}$'
           )
        THEN
            RAISE EXCEPTION 'Invalid theme artwork colour: %', v_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;
END;
$function$;

-- Forward-only change: migration 241 was already applied.
-- Replace the old seven-argument draft-save function with the six-argument
-- server-generated-theme-code variant, without changing existing theme rows.

DROP FUNCTION "${schemaName}".platform_branding_theme_save_draft(
    varchar, varchar, varchar, varchar, jsonb, integer, varchar
);

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_save_draft(p_theme_id varchar, p_name varchar, p_description varchar, p_theme jsonb, p_version_no integer, p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_id varchar(64);
    v_code varchar(64);
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    IF NULLIF(btrim(p_name), '') IS NULL OR length(btrim(p_name)) > 100 OR length(COALESCE(p_description, '')) > 500 THEN
        RAISE EXCEPTION 'Theme name or description is invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM branding_v2_validate_theme(p_theme);
    IF NULLIF(btrim(p_theme_id), '') IS NULL THEN
        v_id := generate_runtime_id('PTH');
        -- Theme codes are stable, server-generated identifiers. They intentionally
        -- do not depend on a mutable display name.
        v_code := lower(replace(v_id, '_', '-'));
        INSERT INTO "${schemaName}".platform_branding_themes(platform_branding_theme_id, theme_code, display_name, description, draft_theme_json, created_by, updated_by)
        VALUES(v_id, v_code, btrim(p_name), NULLIF(btrim(p_description), ''), p_theme, p_actor_user_id, p_actor_user_id);
    ELSE
        IF p_version_no IS NULL OR p_version_no < 1 THEN RAISE EXCEPTION 'Theme version is required' USING ERRCODE = '22023'; END IF;
        UPDATE "${schemaName}".platform_branding_themes SET display_name=btrim(p_name), description=NULLIF(btrim(p_description), ''), draft_theme_json=p_theme, updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id, version_no=version_no+1
        WHERE platform_branding_theme_id=p_theme_id AND version_no=p_version_no;
        IF NOT FOUND THEN RAISE EXCEPTION 'Theme changed or was not found' USING ERRCODE='40001'; END IF;
        v_id := p_theme_id;
    END IF;
    RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_save_draft(
    varchar, varchar, varchar, jsonb, integer, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_save_draft(
    varchar, varchar, varchar, jsonb, integer, varchar
) TO "${appRole}";

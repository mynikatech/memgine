CREATE TABLE "${schemaName}".platform_branding_themes (
    platform_branding_theme_id varchar(64) PRIMARY KEY,
    theme_code varchar(64) NOT NULL UNIQUE,
    display_name varchar(100) NOT NULL,
    description varchar(500),
    draft_theme_json jsonb,
    published_theme_json jsonb,
    publication_status varchar(16) NOT NULL DEFAULT 'DRAFT',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    published_at timestamptz,
    published_by varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_platform_branding_theme_code CHECK (theme_code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    CONSTRAINT ck_platform_branding_theme_name CHECK (btrim(display_name) <> ''),
    CONSTRAINT ck_platform_branding_theme_status CHECK (publication_status IN ('DRAFT', 'PUBLISHED')),
    CONSTRAINT ck_platform_branding_theme_version CHECK (version_no >= 1),
    CONSTRAINT ck_platform_branding_theme_publish CHECK (
        (publication_status = 'DRAFT' AND published_theme_json IS NULL)
        OR (publication_status = 'PUBLISHED' AND published_theme_json IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_require_admin(p_actor_user_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF p_actor_user_id IS NULL OR NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform administration is not permitted' USING ERRCODE = '42501';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_list_published()
RETURNS TABLE ("id" varchar, "code" varchar, "displayName" varchar, description varchar, theme jsonb, "versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT platform_branding_theme_id, theme_code, display_name, description, published_theme_json, version_no
    FROM "${schemaName}".platform_branding_themes
    WHERE publication_status = 'PUBLISHED' AND is_active
    ORDER BY lower(display_name), platform_branding_theme_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_get_published(p_theme_id_or_code varchar)
RETURNS TABLE ("id" varchar, "code" varchar, "displayName" varchar, description varchar, theme jsonb, "versionNo" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT platform_branding_theme_id, theme_code, display_name, description, published_theme_json, version_no
    FROM "${schemaName}".platform_branding_themes
    WHERE publication_status = 'PUBLISHED' AND is_active
      AND (platform_branding_theme_id = p_theme_id_or_code OR theme_code = lower(btrim(p_theme_id_or_code)));
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_list_all(p_actor_user_id varchar)
RETURNS TABLE ("id" varchar, "code" varchar, "displayName" varchar, description varchar, "draftTheme" jsonb, "publishedTheme" jsonb, "publicationStatus" varchar, "isActive" boolean, "publishedAt" timestamptz, "versionNo" integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    RETURN QUERY SELECT t.platform_branding_theme_id, t.theme_code, t.display_name, t.description,
        t.draft_theme_json, t.published_theme_json, t.publication_status, t.is_active, t.published_at, t.version_no
    FROM "${schemaName}".platform_branding_themes t ORDER BY lower(t.display_name), t.platform_branding_theme_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_get(p_theme_id_or_code varchar, p_actor_user_id varchar)
RETURNS TABLE ("id" varchar, "code" varchar, "displayName" varchar, description varchar, "draftTheme" jsonb, "publishedTheme" jsonb, "publicationStatus" varchar, "isActive" boolean, "publishedAt" timestamptz, "versionNo" integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    RETURN QUERY SELECT t.platform_branding_theme_id, t.theme_code, t.display_name, t.description,
        t.draft_theme_json, t.published_theme_json, t.publication_status, t.is_active, t.published_at, t.version_no
    FROM "${schemaName}".platform_branding_themes t
    WHERE t.platform_branding_theme_id = p_theme_id_or_code OR t.theme_code = lower(btrim(p_theme_id_or_code));
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_save_draft(p_theme_id varchar, p_code varchar, p_name varchar, p_description varchar, p_theme jsonb, p_version_no integer, p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_id varchar(64); v_code varchar(64);
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    v_code := lower(btrim(p_code));
    IF v_code !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR NULLIF(btrim(p_name), '') IS NULL OR length(btrim(p_name)) > 100 OR length(COALESCE(p_description, '')) > 500 THEN
        RAISE EXCEPTION 'Theme code, name, or description is invalid' USING ERRCODE = '22023';
    END IF;
    PERFORM branding_v2_validate_theme(p_theme);
    IF NULLIF(btrim(p_theme_id), '') IS NULL THEN
        v_id := generate_runtime_id('PTH');
        INSERT INTO "${schemaName}".platform_branding_themes(platform_branding_theme_id, theme_code, display_name, description, draft_theme_json, created_by, updated_by)
        VALUES(v_id, v_code, btrim(p_name), NULLIF(btrim(p_description), ''), p_theme, p_actor_user_id, p_actor_user_id);
    ELSE
        IF p_version_no IS NULL OR p_version_no < 1 THEN RAISE EXCEPTION 'Theme version is required' USING ERRCODE = '22023'; END IF;
        UPDATE "${schemaName}".platform_branding_themes SET theme_code=v_code, display_name=btrim(p_name), description=NULLIF(btrim(p_description), ''), draft_theme_json=p_theme, updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id, version_no=version_no+1
        WHERE platform_branding_theme_id=p_theme_id AND version_no=p_version_no;
        IF NOT FOUND THEN RAISE EXCEPTION 'Theme changed or was not found' USING ERRCODE='40001'; END IF;
        v_id := p_theme_id;
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_publish(p_theme_id varchar, p_version_no integer, p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_draft jsonb;
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    SELECT draft_theme_json INTO v_draft FROM "${schemaName}".platform_branding_themes WHERE platform_branding_theme_id=p_theme_id AND version_no=p_version_no FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Theme changed or was not found' USING ERRCODE='40001'; END IF;
    IF v_draft IS NULL THEN RAISE EXCEPTION 'Theme draft was not found' USING ERRCODE='22023'; END IF;
    PERFORM branding_v2_validate_theme(v_draft);
    UPDATE "${schemaName}".platform_branding_themes SET published_theme_json=v_draft, publication_status='PUBLISHED', published_at=CURRENT_TIMESTAMP, published_by=p_actor_user_id, updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id, version_no=version_no+1 WHERE platform_branding_theme_id=p_theme_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_branding_theme_set_active(p_theme_id varchar, p_version_no integer, p_active boolean, p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_branding_theme_require_admin(p_actor_user_id);
    UPDATE "${schemaName}".platform_branding_themes SET is_active=p_active, updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id, version_no=version_no+1
    WHERE platform_branding_theme_id=p_theme_id AND publication_status='PUBLISHED' AND version_no=p_version_no;
    IF NOT FOUND THEN RAISE EXCEPTION 'Published theme changed or was not found' USING ERRCODE='40001'; END IF;
    RETURN true;
END;
$function$;

INSERT INTO "${schemaName}".platform_branding_themes(platform_branding_theme_id, theme_code, display_name, description, draft_theme_json, published_theme_json, publication_status, is_active, created_by, updated_by, published_at, published_by)
VALUES
('PTH_CLASSIC','classic','Classic','A clean, timeless Memgine palette.','{"primaryColor":"#0F766E","secondaryColor":"#115E59","accentColor":"#F59E0B","backgroundColor":"#FFFFFF","textColor":"#1F2937","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#0F766E","secondaryColor":"#115E59","accentColor":"#F59E0B","backgroundColor":"#FFFFFF","textColor":"#1F2937","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin'),
('PTH_CHRISTMAS','christmas','Christmas','A festive evergreen and cranberry palette.','{"primaryColor":"#166534","secondaryColor":"#14532D","accentColor":"#DC2626","backgroundColor":"#F0FDF4","textColor":"#1F2937","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#166534","secondaryColor":"#14532D","accentColor":"#DC2626","backgroundColor":"#F0FDF4","textColor":"#1F2937","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin'),
('PTH_DIWALI','diwali','Diwali','A warm saffron and plum celebration palette.','{"primaryColor":"#9A3412","secondaryColor":"#7C2D12","accentColor":"#F59E0B","backgroundColor":"#FFF7ED","textColor":"#3B0764","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#9A3412","secondaryColor":"#7C2D12","accentColor":"#F59E0B","backgroundColor":"#FFF7ED","textColor":"#3B0764","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin'),
('PTH_NEW_YEAR','new-year','New Year','A midnight blue and gold celebration palette.','{"primaryColor":"#1D4ED8","secondaryColor":"#172554","accentColor":"#EAB308","backgroundColor":"#EFF6FF","textColor":"#172554","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#1D4ED8","secondaryColor":"#172554","accentColor":"#EAB308","backgroundColor":"#EFF6FF","textColor":"#172554","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin'),
('PTH_VALENTINES_DAY','valentines-day','Valentine''s Day','A rose and berry palette.','{"primaryColor":"#BE123C","secondaryColor":"#881337","accentColor":"#FB7185","backgroundColor":"#FFF1F2","textColor":"#4C0519","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#BE123C","secondaryColor":"#881337","accentColor":"#FB7185","backgroundColor":"#FFF1F2","textColor":"#4C0519","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin'),
('PTH_THANKSGIVING','thanksgiving','Thanksgiving','A harvest palette of maple and wheat.','{"primaryColor":"#9A3412","secondaryColor":"#78350F","accentColor":"#D97706","backgroundColor":"#FFFBEB","textColor":"#451A03","backgroundImageUrl":null}'::jsonb,'{"primaryColor":"#9A3412","secondaryColor":"#78350F","accentColor":"#D97706","backgroundColor":"#FFFBEB","textColor":"#451A03","backgroundImageUrl":null}'::jsonb,'PUBLISHED',true,'user-platform-admin','user-platform-admin',CURRENT_TIMESTAMP,'user-platform-admin')
ON CONFLICT (platform_branding_theme_id) DO NOTHING;

REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_require_admin(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_list_published() FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_get_published(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_list_all(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_get(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_save_draft(varchar,varchar,varchar,varchar,jsonb,integer,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_publish(varchar,integer,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_branding_theme_set_active(varchar,integer,boolean,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_list_published() TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_get_published(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_list_all(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_get(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_save_draft(varchar,varchar,varchar,varchar,jsonb,integer,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_publish(varchar,integer,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_branding_theme_set_active(varchar,integer,boolean,varchar) TO "${appRole}";

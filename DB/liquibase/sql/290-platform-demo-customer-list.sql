-- Read-only Platform Admin listing for active, DEMO-designated customer identities.
CREATE OR REPLACE FUNCTION "${schemaName}".platform_list_demo_customers(
    p_search varchar,
    p_limit integer,
    p_offset integer,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "userId" varchar,
    "displayName" varchar,
    "primaryEmail" varchar,
    "primaryPhone" varchar,
    "isDemo" boolean,
    "otpDeliveryMode" varchar,
    "totalCount" bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_search varchar := NULLIF(lower(btrim(p_search)), '');
    v_search_pattern varchar;
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform DEMO customer administration is not permitted' USING ERRCODE = '42501';
    END IF;

    IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_offset IS NULL OR p_offset < 0 THEN
        RAISE EXCEPTION 'Invalid DEMO customer list page' USING ERRCODE = '22023';
    END IF;
    v_search_pattern := replace(
        replace(
            replace(v_search, E'\\', E'\\\\'),
            '%', E'\\%'
        ),
        '_', E'\\_'
    );
    RETURN QUERY
    SELECT
        u.user_id,
        COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
        u.primary_email,
        u.primary_phone,
        u.is_demo,
        u.otp_delivery_mode,
        count(*) OVER ()::bigint
    FROM "user" u
    WHERE u.is_demo
      AND NOT u.is_deleted
      AND u.user_status_id = 'entity-status-user-active'
      AND (
        v_search IS NULL
        OR lower(COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name), ''))
            LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
        OR lower(COALESCE(u.primary_email, ''))
            LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
        OR lower(COALESCE(u.primary_phone, ''))
            LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
    )
    ORDER BY lower(COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name), '')), u.user_id
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_count_demo_customers(
    p_search varchar,
    p_actor_user_id varchar
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_search varchar := NULLIF(lower(btrim(p_search)), '');
    v_search_pattern varchar;
    v_total bigint;
BEGIN
    IF NOT rbac_has_capability(
        p_actor_user_id,
        NULL,
        'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION
            'Platform DEMO customer administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    v_search_pattern := replace(
        replace(
            replace(v_search, E'\\', E'\\\\'),
            '%', E'\\%'
        ),
        '_', E'\\_'
    );

    SELECT count(*)
    INTO v_total
    FROM "user" u
    WHERE u.is_demo
      AND NOT u.is_deleted
      AND u.user_status_id = 'entity-status-user-active'
      AND (
          v_search IS NULL
          OR lower(COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name), ''))
              LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
          OR lower(COALESCE(u.primary_email, ''))
              LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
          OR lower(COALESCE(u.primary_phone, ''))
              LIKE '%' || v_search_pattern || '%' ESCAPE E'\\'
      );

    RETURN v_total;
END;
$function$;



REVOKE ALL ON FUNCTION "${schemaName}".platform_list_demo_customers(varchar,integer,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_list_demo_customers(varchar,integer,integer,varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION
    "${schemaName}".platform_count_demo_customers(varchar,varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".platform_count_demo_customers(varchar,varchar)
TO "${appRole}";
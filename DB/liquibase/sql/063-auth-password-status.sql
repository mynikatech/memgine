CREATE OR REPLACE FUNCTION "${schemaName}".auth_password_configured(
    p_user_id varchar
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM "${schemaName}".user_credentials c
        JOIN "${schemaName}"."user" u
          ON u.user_id = c.user_id
        WHERE c.user_id = p_user_id
          AND c.password_enabled = TRUE
          AND c.password_hash IS NOT NULL
          AND NOT u.is_deleted
          AND u.user_status_id = 'entity-status-user-active'
    );
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".auth_password_configured(varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".auth_password_configured(varchar)
TO "${appRole}";
-- Persist OTP login proof on the exact authenticated session.
-- This migration extends the established auth implementation without changing
-- the existing auth_resolve_session(varchar) return type or historical migrations.

ALTER TABLE "${schemaName}".authentication_sessions
    ADD COLUMN IF NOT EXISTS otp_authenticated_at timestamp without time zone;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_mark_session_otp_authenticated(
    p_session_id varchar, p_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    UPDATE "${schemaName}".authentication_sessions s
       SET otp_authenticated_at = timezone('UTC', CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP,
           updated_by = s.user_id,
           version_no = s.version_no + 1
     WHERE s.session_id = p_session_id
       AND s.user_id = p_user_id
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP;
    RETURN FOUND;
END;
$function$;

-- Separate function: PostgreSQL cannot CREATE OR REPLACE an existing function
-- while changing its RETURNS TABLE columns. Keep old auth_resolve_session for
-- compatibility with other callers and introduce this five-column read model.
CREATE OR REPLACE FUNCTION "${schemaName}".auth_resolve_session_with_otp(
    p_token_hash varchar
)
RETURNS TABLE (
    session_id varchar,
    user_id varchar,
    display_name varchar,
    expires_at timestamp without time zone,
    otp_authenticated_at timestamp without time zone
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    RETURN QUERY
    UPDATE "${schemaName}".authentication_sessions s
       SET last_seen_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = s.user_id,
           version_no = s.version_no + 1
      FROM "${schemaName}"."user" u
     WHERE s.token_hash = p_token_hash
       AND s.user_id = u.user_id
       AND s.revoked_at IS NULL
       AND s.expires_at > CURRENT_TIMESTAMP
       AND NOT u.is_deleted
       AND u.user_status_id = 'entity-status-user-active'
    RETURNING s.session_id, s.user_id,
        COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
        s.expires_at, s.otp_authenticated_at;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".auth_mark_session_otp_authenticated(varchar, varchar),
    "${schemaName}".auth_resolve_session_with_otp(varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".auth_mark_session_otp_authenticated(varchar, varchar),
    "${schemaName}".auth_resolve_session_with_otp(varchar)
TO "${appRole}";

-- Phase 2A: common authentication, opaque sessions and central OTP challenges.
-- Rerunnable / idempotent: YES.

CREATE TABLE IF NOT EXISTS "${schemaName}".user_credentials (
    user_id varchar(64) PRIMARY KEY,
    password_hash varchar(255),
    password_enabled boolean NOT NULL DEFAULT FALSE,
    failed_attempt_count integer NOT NULL DEFAULT 0,
    locked_until timestamp without time zone,
    password_changed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL,
    version_no integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "${schemaName}".authentication_sessions (
    session_id varchar(64) PRIMARY KEY,
    user_id varchar(64) NOT NULL,
    token_hash char(64) NOT NULL UNIQUE,
    issued_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    last_seen_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at timestamp without time zone,
    client_ip varchar(64),
    user_agent varchar(500),
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_auth_session_expiry CHECK (expires_at > issued_at)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".otp_challenges (
    otp_challenge_id varchar(64) PRIMARY KEY,
    destination varchar(320) NOT NULL,
    destination_region varchar(2),
    purpose varchar(40) NOT NULL,
    delivery_channel varchar(20) NOT NULL,
    provider_code varchar(50) NOT NULL,
    otp_hash char(64) NOT NULL,
    otp_salt varchar(64) NOT NULL,
    context_json jsonb,
    status varchar(20) NOT NULL DEFAULT 'PENDING',
    failed_attempt_count integer NOT NULL DEFAULT 0,
    max_attempt_count integer NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_by varchar(64) NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_otp_purpose CHECK (purpose IN (
        'LOGIN', 'MEMBERSHIP_PURCHASE', 'REDEMPTION',
        'PASSWORD_RESET', 'PHONE_VERIFICATION', 'HIGH_RISK_ACTION'
    )),
    CONSTRAINT ck_otp_channel CHECK (delivery_channel IN ('SMS', 'WHATSAPP', 'EMAIL')),
    CONSTRAINT ck_otp_status CHECK (status IN ('PENDING', 'CONSUMED', 'EXPIRED', 'LOCKED', 'DELIVERY_FAILED')),
    CONSTRAINT ck_otp_attempts CHECK (failed_attempt_count >= 0 AND max_attempt_count > 0),
    CONSTRAINT ck_otp_expiry CHECK (expires_at > created_at)
);

DO $ddl$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_credentials_user'
        AND conrelid = '"${schemaName}".user_credentials'::regclass) THEN
        ALTER TABLE "${schemaName}".user_credentials
            ADD CONSTRAINT fk_user_credentials_user FOREIGN KEY (user_id)
            REFERENCES "${schemaName}"."user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_authentication_sessions_user'
        AND conrelid = '"${schemaName}".authentication_sessions'::regclass) THEN
        ALTER TABLE "${schemaName}".authentication_sessions
            ADD CONSTRAINT fk_authentication_sessions_user FOREIGN KEY (user_id)
            REFERENCES "${schemaName}"."user"(user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_user_primary_phone_e164'
        AND conrelid = '"${schemaName}"."user"'::regclass) THEN
        ALTER TABLE "${schemaName}"."user"
            ADD CONSTRAINT ck_user_primary_phone_e164
            CHECK (primary_phone ~ '^\+[1-9][0-9]{7,14}$') NOT VALID;
    END IF;
END;
$ddl$;

CREATE INDEX IF NOT EXISTS ix_auth_sessions_user_active
    ON "${schemaName}".authentication_sessions (user_id, expires_at, revoked_at);
CREATE INDEX IF NOT EXISTS ix_otp_destination_purpose_created
    ON "${schemaName}".otp_challenges (destination, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_otp_expiry_status
    ON "${schemaName}".otp_challenges (status, expires_at);

CREATE OR REPLACE FUNCTION "${schemaName}".auth_find_identity(p_phone varchar)
RETURNS TABLE (
    user_id varchar, display_name varchar, password_hash varchar,
    password_enabled boolean, failed_attempt_count integer,
    locked_until timestamp without time zone, user_active boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
    SELECT u.user_id,
           COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
           c.password_hash, COALESCE(c.password_enabled, FALSE),
           COALESCE(c.failed_attempt_count, 0), c.locked_until,
           (NOT u.is_deleted AND u.user_status_id = 'entity-status-user-active')
    FROM "${schemaName}"."user" u
    LEFT JOIN "${schemaName}".user_credentials c ON c.user_id = u.user_id
    WHERE u.primary_phone = p_phone
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_record_password_failure(p_user_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    INSERT INTO "${schemaName}".user_credentials
        (user_id, failed_attempt_count, locked_until, created_by, updated_by)
    VALUES (p_user_id, 1, NULL, p_user_id, p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET
        failed_attempt_count = user_credentials.failed_attempt_count + 1,
        locked_until = CASE WHEN user_credentials.failed_attempt_count + 1 >= 5
            THEN CURRENT_TIMESTAMP + interval '15 minutes'
            ELSE user_credentials.locked_until END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_user_id,
        version_no = user_credentials.version_no + 1;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_record_password_success(p_user_id varchar)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $function$
    UPDATE "${schemaName}".user_credentials
    SET failed_attempt_count = 0, locked_until = NULL,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_user_id,
        version_no = version_no + 1
    WHERE user_id = p_user_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_set_password(
    p_user_id varchar, p_password_hash varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    IF p_user_id <> p_actor_user_id OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u WHERE u.user_id = p_user_id
        AND NOT u.is_deleted AND u.user_status_id = 'entity-status-user-active'
    ) THEN
        RAISE EXCEPTION 'Password change is not permitted' USING ERRCODE = '42501';
    END IF;
    INSERT INTO "${schemaName}".user_credentials
        (user_id, password_hash, password_enabled, password_changed_at,
         created_by, updated_by)
    VALUES (p_user_id, p_password_hash, TRUE, CURRENT_TIMESTAMP,
            p_actor_user_id, p_actor_user_id)
    ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash, password_enabled = TRUE,
        password_changed_at = CURRENT_TIMESTAMP, failed_attempt_count = 0,
        locked_until = NULL, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = user_credentials.version_no + 1;
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_create_session(
    p_session_id varchar, p_user_id varchar, p_token_hash varchar,
    p_expires_at timestamp without time zone, p_client_ip varchar,
    p_user_agent varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}"."user" u
        WHERE u.user_id = p_user_id AND NOT u.is_deleted
          AND u.user_status_id = 'entity-status-user-active') THEN
        RAISE EXCEPTION 'Active user not found' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO "${schemaName}".authentication_sessions
        (session_id, user_id, token_hash, expires_at, client_ip, user_agent,
         created_by, updated_by)
    VALUES (p_session_id, p_user_id, p_token_hash, p_expires_at,
            p_client_ip, left(p_user_agent, 500), p_user_id, p_user_id);
    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_resolve_session(p_token_hash varchar)
RETURNS TABLE (session_id varchar, user_id varchar, display_name varchar,
    expires_at timestamp without time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    RETURN QUERY
    UPDATE "${schemaName}".authentication_sessions s
       SET last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
           updated_by = s.user_id, version_no = s.version_no + 1
      FROM "${schemaName}"."user" u
     WHERE s.token_hash = p_token_hash AND s.user_id = u.user_id
       AND s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
       AND NOT u.is_deleted AND u.user_status_id = 'entity-status-user-active'
    RETURNING s.session_id, s.user_id,
        COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
        s.expires_at;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_revoke_session(
    p_token_hash varchar, p_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    UPDATE "${schemaName}".authentication_sessions s
       SET revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id, version_no = s.version_no + 1
     WHERE s.token_hash = p_token_hash AND s.user_id = p_user_id
       AND s.revoked_at IS NULL;
    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".auth_effective_access(p_user_id varchar)
RETURNS TABLE (organization_id varchar, organization_name varchar,
    role_code varchar, capability_code varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
    SELECT NULL::varchar, NULL::varchar, r.role_code, p.privilege_code
    FROM "${schemaName}".platform_user_role pur
    JOIN "${schemaName}".role r ON r.role_id = pur.role_id
    JOIN "${schemaName}".role_privileges rp ON rp.role_id = r.role_id
    JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
    WHERE pur.user_id = p_user_id AND NOT pur.is_deleted
      AND pur.status_id = 'entity-status-platfrm-user-role-active'
      AND pur.effective_from <= CURRENT_TIMESTAMP
      AND (pur.effective_to IS NULL OR pur.effective_to > CURRENT_TIMESTAMP)
      AND r.role_status_id = 'entity-status-role-active'
      AND p.privilege_status_id = 'entity-status-privilege-active'
    UNION ALL
    SELECT ou.organization_id, o.organization_name, r.role_code, p.privilege_code
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}".organization o ON o.organization_id = ou.organization_id
    JOIN "${schemaName}".organization_user_roles our
      ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    JOIN "${schemaName}".role_privileges rp ON rp.role_id = r.role_id
    JOIN "${schemaName}".privileges p ON p.privilege_id = rp.privilege_id
    WHERE ou.user_id = p_user_id AND NOT ou.is_deleted
      AND ou.organization_user_status_id = 'entity-status-org-user-active'
      AND NOT o.is_deleted AND o.organization_status_id = 'entity-status-org-active'
      AND NOT our.is_deleted
      AND our.assignment_status_id = 'entity-status-org-user-role-active'
      AND our.effective_from <= CURRENT_TIMESTAMP
      AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
      AND r.role_status_id = 'entity-status-role-active'
      AND p.privilege_status_id = 'entity-status-privilege-active';
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_create_challenge(
    p_challenge_id varchar, p_destination varchar, p_destination_region varchar,
    p_purpose varchar, p_channel varchar, p_provider varchar, p_otp_hash varchar,
    p_otp_salt varchar, p_context_json jsonb, p_expires_at timestamp without time zone,
    p_max_attempts integer, p_cooldown_seconds integer
)
RETURNS timestamp without time zone
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_destination || '|' || p_purpose, 0)
    );

    IF EXISTS (
        SELECT 1 FROM "${schemaName}".otp_challenges c
        WHERE c.destination = p_destination AND c.purpose = p_purpose
          AND c.created_at > CURRENT_TIMESTAMP - make_interval(secs => p_cooldown_seconds)
          AND c.status IN ('PENDING', 'CONSUMED')
    ) THEN
        RAISE EXCEPTION 'OTP request cooldown is active' USING ERRCODE = 'P0001';
    END IF;
    UPDATE "${schemaName}".otp_challenges c SET status = 'EXPIRED',
        updated_at = CURRENT_TIMESTAMP, updated_by = 'auth-system',
        version_no = c.version_no + 1
    WHERE c.destination = p_destination AND c.purpose = p_purpose
      AND c.status = 'PENDING';
    INSERT INTO "${schemaName}".otp_challenges
        (otp_challenge_id, destination, destination_region, purpose,
         delivery_channel, provider_code, otp_hash, otp_salt, context_json,
         max_attempt_count, expires_at, created_by, updated_by)
    VALUES (p_challenge_id, p_destination, p_destination_region, p_purpose,
        p_channel, p_provider, p_otp_hash, p_otp_salt, p_context_json,
        p_max_attempts, p_expires_at, 'auth-system', 'auth-system');
    RETURN CURRENT_TIMESTAMP + make_interval(secs => p_cooldown_seconds);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_get_challenge(p_challenge_id varchar)
RETURNS TABLE (challenge_id varchar, destination varchar, purpose varchar,
    channel varchar, provider_code varchar, otp_hash varchar, otp_salt varchar,
    status varchar, failed_attempt_count integer, max_attempt_count integer,
    expires_at timestamp without time zone)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $function$
    SELECT c.otp_challenge_id, c.destination, c.purpose,
        c.delivery_channel, c.provider_code, c.otp_hash, c.otp_salt,
        c.status, c.failed_attempt_count, c.max_attempt_count, c.expires_at
    FROM "${schemaName}".otp_challenges c
    WHERE c.otp_challenge_id = p_challenge_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_record_failure(p_challenge_id varchar)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
DECLARE v_attempts integer;
BEGIN
    UPDATE "${schemaName}".otp_challenges c
       SET failed_attempt_count = c.failed_attempt_count + 1,
           status = CASE WHEN c.failed_attempt_count + 1 >= c.max_attempt_count
                         THEN 'LOCKED' ELSE c.status END,
           updated_at = CURRENT_TIMESTAMP, updated_by = 'auth-system',
           version_no = c.version_no + 1
     WHERE c.otp_challenge_id = p_challenge_id AND c.status = 'PENDING'
    RETURNING c.failed_attempt_count INTO v_attempts;
    RETURN COALESCE(v_attempts, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_consume_challenge(
    p_challenge_id varchar, p_purpose varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    UPDATE "${schemaName}".otp_challenges c
       SET status = 'CONSUMED', consumed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP, updated_by = 'auth-system',
           version_no = c.version_no + 1
     WHERE c.otp_challenge_id = p_challenge_id AND c.purpose = p_purpose
       AND c.status = 'PENDING' AND c.expires_at > CURRENT_TIMESTAMP
       AND c.failed_attempt_count < c.max_attempt_count;
    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_mark_delivery_failed(p_challenge_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
    UPDATE "${schemaName}".otp_challenges
       SET status = 'DELIVERY_FAILED', updated_at = CURRENT_TIMESTAMP,
           updated_by = 'auth-system', version_no = version_no + 1
     WHERE otp_challenge_id = p_challenge_id AND status = 'PENDING';
    RETURN FOUND;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".user_credentials,
    "${schemaName}".authentication_sessions, "${schemaName}".otp_challenges FROM PUBLIC;
REVOKE ALL ON TABLE "${schemaName}".user_credentials,
    "${schemaName}".authentication_sessions, "${schemaName}".otp_challenges FROM "${appRole}";

REVOKE ALL ON FUNCTION "${schemaName}".auth_find_identity(varchar),
    "${schemaName}".auth_record_password_failure(varchar),
    "${schemaName}".auth_record_password_success(varchar),
    "${schemaName}".auth_set_password(varchar, varchar, varchar),
    "${schemaName}".auth_create_session(varchar, varchar, varchar, timestamp without time zone, varchar, varchar),
    "${schemaName}".auth_resolve_session(varchar),
    "${schemaName}".auth_revoke_session(varchar, varchar),
    "${schemaName}".auth_effective_access(varchar),
    "${schemaName}".otp_create_challenge(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, jsonb, timestamp without time zone, integer, integer),
    "${schemaName}".otp_get_challenge(varchar),
    "${schemaName}".otp_record_failure(varchar),
    "${schemaName}".otp_consume_challenge(varchar, varchar),
    "${schemaName}".otp_mark_delivery_failed(varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".auth_find_identity(varchar),
    "${schemaName}".auth_record_password_failure(varchar),
    "${schemaName}".auth_record_password_success(varchar),
    "${schemaName}".auth_set_password(varchar, varchar, varchar),
    "${schemaName}".auth_create_session(varchar, varchar, varchar, timestamp without time zone, varchar, varchar),
    "${schemaName}".auth_resolve_session(varchar),
    "${schemaName}".auth_revoke_session(varchar, varchar),
    "${schemaName}".auth_effective_access(varchar),
    "${schemaName}".otp_create_challenge(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, jsonb, timestamp without time zone, integer, integer),
    "${schemaName}".otp_get_challenge(varchar),
    "${schemaName}".otp_record_failure(varchar),
    "${schemaName}".otp_consume_challenge(varchar, varchar),
    "${schemaName}".otp_mark_delivery_failed(varchar) TO "${appRole}";

-- Phase 2A follow-up: align OTP database-generated timestamps with UTC.
-- Rerunnable / idempotent: YES.
--
-- OtpService uses Clock.systemUTC() and supplies expires_at as a UTC LocalDateTime.
-- otp_challenges stores timestamp without time zone, so all database-generated
-- OTP timestamps must also be written/compared as UTC local timestamps.

ALTER TABLE "${schemaName}".otp_challenges
    ALTER COLUMN created_at
        SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    ALTER COLUMN updated_at
        SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE OR REPLACE FUNCTION "${schemaName}".otp_create_challenge(
    p_challenge_id varchar,
    p_destination varchar,
    p_destination_region varchar,
    p_purpose varchar,
    p_channel varchar,
    p_provider varchar,
    p_otp_hash varchar,
    p_otp_salt varchar,
    p_context_json jsonb,
    p_expires_at timestamp without time zone,
    p_max_attempts integer,
    p_cooldown_seconds integer
)
RETURNS timestamp without time zone
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_destination || '|' || p_purpose, 0)
    );

    IF EXISTS (
        SELECT 1
        FROM "${schemaName}".otp_challenges c
        WHERE c.destination = p_destination
          AND c.purpose = p_purpose
          AND c.created_at >
              (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
              - make_interval(secs => p_cooldown_seconds)
          AND c.status IN ('PENDING', 'CONSUMED')
    ) THEN
        RAISE EXCEPTION 'OTP request cooldown is active'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE "${schemaName}".otp_challenges c
       SET status = 'EXPIRED',
           updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_by = 'auth-system',
           version_no = c.version_no + 1
     WHERE c.destination = p_destination
       AND c.purpose = p_purpose
       AND c.status = 'PENDING';

    INSERT INTO "${schemaName}".otp_challenges (
        otp_challenge_id,
        destination,
        destination_region,
        purpose,
        delivery_channel,
        provider_code,
        otp_hash,
        otp_salt,
        context_json,
        max_attempt_count,
        expires_at,
        created_by,
        updated_by
    )
    VALUES (
        p_challenge_id,
        p_destination,
        p_destination_region,
        p_purpose,
        p_channel,
        p_provider,
        p_otp_hash,
        p_otp_salt,
        p_context_json,
        p_max_attempts,
        p_expires_at,
        'auth-system',
        'auth-system'
    );

    RETURN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
           + make_interval(secs => p_cooldown_seconds);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_record_failure(
    p_challenge_id varchar
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_attempts integer;
BEGIN
    UPDATE "${schemaName}".otp_challenges c
       SET failed_attempt_count = c.failed_attempt_count + 1,
           status = CASE
                        WHEN c.failed_attempt_count + 1 >= c.max_attempt_count
                            THEN 'LOCKED'
                        ELSE c.status
                    END,
           updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_by = 'auth-system',
           version_no = c.version_no + 1
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.status = 'PENDING'
    RETURNING c.failed_attempt_count
         INTO v_attempts;

    RETURN COALESCE(v_attempts, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_consume_challenge(
    p_challenge_id varchar,
    p_purpose varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    UPDATE "${schemaName}".otp_challenges c
       SET status = 'CONSUMED',
           consumed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_by = 'auth-system',
           version_no = c.version_no + 1
     WHERE c.otp_challenge_id = p_challenge_id
       AND c.purpose = p_purpose
       AND c.status = 'PENDING'
       AND c.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
       AND c.failed_attempt_count < c.max_attempt_count;

    RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_mark_delivery_failed(
    p_challenge_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    UPDATE "${schemaName}".otp_challenges
       SET status = 'DELIVERY_FAILED',
           updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
           updated_by = 'auth-system',
           version_no = version_no + 1
     WHERE otp_challenge_id = p_challenge_id
       AND status = 'PENDING';

    RETURN FOUND;
END;
$function$;
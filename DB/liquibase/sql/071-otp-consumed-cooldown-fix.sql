-- Phase 2E-1 follow-up:
-- Allow a new OTP immediately after a previous OTP for the same destination
-- and purpose has already been successfully consumed.
--
-- Cooldown still applies while a previous OTP is PENDING, preventing rapid
-- resend/duplicate challenge creation.
--
-- Rerunnable / idempotent: YES.

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
          AND c.status = 'PENDING'
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
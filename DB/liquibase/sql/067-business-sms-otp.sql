-- Phase 2E-1: business SMS OTP context for purchase/redemption.
-- Migration 067 has NOT been applied yet and may be edited in place.
-- Central OTP destination is already generic: otp_challenges.destination varchar(320).

-- Extend the central OTP purpose constraint for business-event OTP purposes.
ALTER TABLE "${schemaName}".otp_challenges
    DROP CONSTRAINT IF EXISTS ck_otp_purpose;

ALTER TABLE "${schemaName}".otp_challenges
    ADD CONSTRAINT ck_otp_purpose CHECK (purpose IN (
        'LOGIN',
        'MEMBERSHIP_PURCHASE',
        'REDEMPTION',
        'PASSWORD_RESET',
        'PHONE_VERIFICATION',
        'HIGH_RISK_ACTION',
        'MEMBERSHIP_QR_PURCHASE_VERIFY',
        'COUNTER_PURCHASE_VERIFY',
        'COUNTER_REDEMPTION_VERIFY',
        'APP_MEMBERSHIP_PURCHASE_VERIFY'
    ));

CREATE TABLE IF NOT EXISTS "${schemaName}".business_otp_context (
    business_otp_context_id varchar(64) PRIMARY KEY,
    otp_challenge_id varchar(64) NOT NULL UNIQUE
        REFERENCES "${schemaName}".otp_challenges(otp_challenge_id),
    purpose varchar(64) NOT NULL,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64)
        REFERENCES "${schemaName}".stores(store_id),
    plan_id varchar(64),
    subscription_id varchar(64),
    user_id varchar(64)
        REFERENCES "${schemaName}"."user"(user_id),
    staff_id varchar(64)
        REFERENCES "${schemaName}".staff(staff_id),
    normalized_phone varchar(320) NOT NULL,
    benefit_ids jsonb,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL
    DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

ALTER TABLE "${schemaName}".business_otp_context
    ALTER COLUMN created_at
    SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE OR REPLACE FUNCTION "${schemaName}".business_otp_create_context(
    p_id varchar,
    p_challenge varchar,
    p_purpose varchar,
    p_org varchar,
    p_store varchar,
    p_plan varchar,
    p_subscription varchar,
    p_user varchar,
    p_staff varchar,
    p_phone varchar,
    p_benefits jsonb,
    p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".otp_challenges c
        WHERE c.otp_challenge_id = p_challenge
          AND c.purpose = p_purpose
          AND c.destination = p_phone
          AND c.delivery_channel = 'SMS'
          AND c.status = 'PENDING'
          AND c.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
    ) THEN
        RAISE EXCEPTION 'Business verification is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".business_otp_context (
        business_otp_context_id,
        otp_challenge_id,
        purpose,
        organization_id,
        store_id,
        plan_id,
        subscription_id,
        user_id,
        staff_id,
        normalized_phone,
        benefit_ids,
        payload
    )
    VALUES (
        p_id,
        p_challenge,
        p_purpose,
        p_org,
        p_store,
        p_plan,
        p_subscription,
        p_user,
        p_staff,
        p_phone,
        p_benefits,
        COALESCE(p_payload, '{}'::jsonb)
    );

    RETURN TRUE;
END;
$function$;

-- Resolve only a centrally verified/consumed OTP whose business context
-- has not yet been consumed. This does NOT burn the business authorization.
CREATE OR REPLACE FUNCTION "${schemaName}".business_otp_resolve_context(
    p_challenge varchar,
    p_purpose varchar
)
RETURNS TABLE (
    organization_id varchar,
    store_id varchar,
    plan_id varchar,
    subscription_id varchar,
    user_id varchar,
    staff_id varchar,
    normalized_phone varchar,
    benefit_ids jsonb,
    payload jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        c.organization_id,
        c.store_id,
        c.plan_id,
        c.subscription_id,
        c.user_id,
        c.staff_id,
        c.normalized_phone,
        c.benefit_ids,
        c.payload
    FROM "${schemaName}".business_otp_context c
    JOIN "${schemaName}".otp_challenges o
      ON o.otp_challenge_id = c.otp_challenge_id
    WHERE c.otp_challenge_id = p_challenge
      AND c.purpose = p_purpose
      AND c.consumed_at IS NULL
      AND o.purpose = p_purpose
      AND o.destination = c.normalized_phone
      AND o.status = 'CONSUMED'
    LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".business_otp_consume_context(
    p_challenge varchar,
    p_purpose varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    UPDATE "${schemaName}".business_otp_context c
       SET consumed_at = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
     WHERE c.otp_challenge_id = p_challenge
       AND c.purpose = p_purpose
       AND c.consumed_at IS NULL
       AND EXISTS (
           SELECT 1
           FROM "${schemaName}".otp_challenges o
           WHERE o.otp_challenge_id = c.otp_challenge_id
             AND o.purpose = p_purpose
             AND o.destination = c.normalized_phone
             AND o.status = 'CONSUMED'
       );

    RETURN FOUND;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".business_otp_context FROM PUBLIC;
REVOKE ALL ON TABLE "${schemaName}".business_otp_context FROM "${appRole}";

REVOKE ALL ON FUNCTION
    "${schemaName}".business_otp_create_context(
        varchar,varchar,varchar,varchar,varchar,varchar,
        varchar,varchar,varchar,varchar,jsonb,jsonb
    ),
    "${schemaName}".business_otp_resolve_context(varchar,varchar),
    "${schemaName}".business_otp_consume_context(varchar,varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".business_otp_create_context(
        varchar,varchar,varchar,varchar,varchar,varchar,
        varchar,varchar,varchar,varchar,jsonb,jsonb
    ),
    "${schemaName}".business_otp_resolve_context(varchar,varchar),
    "${schemaName}".business_otp_consume_context(varchar,varchar)
TO "${appRole}";
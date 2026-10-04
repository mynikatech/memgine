-- 141-customer-self-registration.sql
CREATE OR REPLACE FUNCTION "${schemaName}".auth_register_customer_user(
    p_phone varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_primary_email varchar
)
RETURNS TABLE ("userId" varchar, "displayName" varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_phone varchar := btrim(p_phone);
    v_first_name varchar := btrim(p_first_name);
    v_last_name varchar := btrim(p_last_name);
    v_email varchar := NULLIF(lower(btrim(p_primary_email)), '');
    v_user_id varchar(64);
    v_user_code varchar(64);
    v_display_name varchar(255);
BEGIN
    IF v_phone IS NULL
       OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
       OR NULLIF(v_first_name, '') IS NULL
       OR length(v_first_name) > 100
       OR NULLIF(v_last_name, '') IS NULL
       OR length(v_last_name) > 100
       OR (v_email IS NOT NULL AND length(v_email) > 254) THEN
        RAISE EXCEPTION 'Invalid registration details'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

    IF EXISTS (
        SELECT 1 FROM "user" u
         WHERE u.primary_phone = v_phone
           AND NOT u.is_deleted
    ) THEN
        RAISE EXCEPTION 'A Memgine account already exists for this mobile number'
            USING ERRCODE = '23505';
    END IF;

    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1 FROM "user" u
         WHERE lower(u.primary_email) = v_email
           AND NOT u.is_deleted
    ) THEN
        RAISE EXCEPTION 'A Memgine account already exists for this email'
            USING ERRCODE = '23505';
    END IF;

    v_user_id := generate_runtime_id('USR');
    v_user_code := generate_user_code(v_first_name, v_last_name);
    v_display_name := v_first_name || ' ' || v_last_name;

    INSERT INTO "user" (
        user_id, user_code, first_name, middle_name, last_name, display_name,
        primary_email, primary_phone, preferred_language_id, user_status_id,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_user_id, v_user_code, v_first_name, NULL, v_last_name, v_display_name,
        v_email, v_phone, NULL, 'entity-status-user-active',
        CURRENT_TIMESTAMP, v_user_id, CURRENT_TIMESTAMP, v_user_id, FALSE, 1
    );

    RETURN QUERY SELECT v_user_id, v_display_name;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".auth_register_customer_user(
    varchar, varchar, varchar, varchar
) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".auth_register_customer_user(
            varchar, varchar, varchar, varchar
        ) TO "${appRole}";
    END IF;
END
$grant$;

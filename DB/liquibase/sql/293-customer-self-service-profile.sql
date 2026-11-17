    -- Authenticated, Memgine-level customer profile editing.  These functions are
    -- intentionally independent of organization relationships.

    ALTER TABLE "${schemaName}".otp_challenges
        DROP CONSTRAINT IF EXISTS ck_otp_purpose;
    ALTER TABLE "${schemaName}".otp_challenges
        ADD CONSTRAINT ck_otp_purpose CHECK (purpose IN (
            'LOGIN', 'MEMBERSHIP_PURCHASE', 'REDEMPTION', 'PASSWORD_RESET',
            'PHONE_VERIFICATION', 'HIGH_RISK_ACTION',
            'MEMBERSHIP_QR_PURCHASE_VERIFY', 'COUNTER_PURCHASE_VERIFY',
            'COUNTER_REDEMPTION_VERIFY', 'APP_MEMBERSHIP_PURCHASE_VERIFY',
            'CUSTOMER_PHONE_CHANGE_OLD', 'CUSTOMER_PHONE_CHANGE_NEW'
        ));

    -- Registration already serializes phone creation. These partial unique indexes
    -- extend that protection to self-service changes and active email identities.
    CREATE UNIQUE INDEX IF NOT EXISTS ux_user_active_primary_phone
        ON "${schemaName}"."user" (primary_phone) WHERE NOT is_deleted;

    CREATE OR REPLACE FUNCTION "${schemaName}".customer_get_self_profile(p_user_id varchar)
    RETURNS TABLE("userId" varchar, "firstName" varchar, "middleName" varchar,
                "lastName" varchar, "displayName" varchar, "primaryEmail" varchar,
                "primaryPhone" varchar, "versionNo" integer)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
    AS $function$
    BEGIN
        RETURN QUERY
        SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.display_name,
            u.primary_email, u.primary_phone, u.version_no
        FROM "user" u
        WHERE u.user_id = p_user_id
        AND NOT u.is_deleted
        AND u.user_status_id = 'entity-status-user-active';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer profile is unavailable' USING ERRCODE = 'P0002';
        END IF;

    END;
    $function$;

    CREATE OR REPLACE FUNCTION "${schemaName}".customer_save_self_profile(
        p_user_id varchar, p_first_name varchar, p_middle_name varchar,
        p_last_name varchar, p_primary_email varchar, p_expected_version integer
    )
    RETURNS TABLE("userId" varchar, "firstName" varchar, "middleName" varchar,
                "lastName" varchar, "displayName" varchar, "primaryEmail" varchar,
                "primaryPhone" varchar, "versionNo" integer)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
    AS $function$
    DECLARE
        v_first varchar := NULLIF(btrim(p_first_name), '');
        v_middle varchar := NULLIF(btrim(p_middle_name), '');
        v_last varchar := NULLIF(btrim(p_last_name), '');
        v_email varchar := NULLIF(lower(btrim(p_primary_email)), '');
        v_previous_email varchar;
    BEGIN
        IF p_user_id IS NULL OR p_user_id = '' OR p_expected_version IS NULL
        OR v_first IS NULL OR length(v_first) > 100
        OR (v_middle IS NOT NULL AND length(v_middle) > 100)
        OR v_last IS NULL OR length(v_last) > 100
        OR (v_email IS NOT NULL AND (length(v_email) > 254
                OR v_email !~ E'^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')) THEN
            RAISE EXCEPTION 'Invalid customer profile fields' USING ERRCODE = '22023';
        END IF;

        SELECT u.primary_email INTO v_previous_email
        FROM "user" u
        WHERE u.user_id = p_user_id AND NOT u.is_deleted
        AND u.user_status_id = 'entity-status-user-active'
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer profile is unavailable' USING ERRCODE = 'P0002';
        END IF;

        RETURN QUERY
        UPDATE "user" u
        SET first_name = v_first,
            middle_name = v_middle,
            last_name = v_last,
            display_name = concat_ws(' ', v_first, v_middle, v_last),
            primary_email = v_email,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_user_id,
            version_no = u.version_no + 1
        WHERE u.user_id = p_user_id
        AND u.version_no = p_expected_version
        RETURNING u.user_id, u.first_name, u.middle_name, u.last_name, u.display_name,
                u.primary_email, u.primary_phone, u.version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer profile was changed elsewhere; refresh and try again' USING ERRCODE = '40001';
        END IF;

        IF v_email IS NULL AND v_previous_email IS NOT NULL THEN
            UPDATE support_notification_user_settings
            SET email_opted_in = FALSE, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = p_user_id;
        END IF;
    END;
    $function$;

    CREATE OR REPLACE FUNCTION "${schemaName}".customer_confirm_self_phone_change(
        p_user_id varchar, p_expected_old_phone varchar, p_new_phone varchar
    )
    RETURNS TABLE("userId" varchar, "firstName" varchar, "middleName" varchar,
                "lastName" varchar, "displayName" varchar, "primaryEmail" varchar,
                "primaryPhone" varchar, "versionNo" integer)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
    AS $function$
    BEGIN
        IF p_user_id IS NULL OR p_user_id = '' OR p_expected_old_phone IS NULL OR p_expected_old_phone = ''
        OR p_new_phone IS NULL OR p_new_phone !~ E'^[+][1-9][0-9]{7,14}$' THEN
            RAISE EXCEPTION 'Invalid mobile number change' USING ERRCODE = '22023';
        END IF;

        PERFORM pg_advisory_xact_lock(hashtextextended(p_new_phone, 0));

        PERFORM 1 FROM "user" u
        WHERE u.user_id = p_user_id AND NOT u.is_deleted
        AND u.user_status_id = 'entity-status-user-active'
        AND u.primary_phone = p_expected_old_phone
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Customer mobile number changed; restart verification' USING ERRCODE = '40001';
        END IF;
        IF EXISTS (SELECT 1 FROM "user" u WHERE u.primary_phone = p_new_phone
                    AND u.user_id <> p_user_id AND NOT u.is_deleted) THEN
            RAISE EXCEPTION 'A Memgine account already exists for this mobile number' USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        UPDATE "user" u
        SET primary_phone = p_new_phone, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_user_id, version_no = u.version_no + 1
        WHERE u.user_id = p_user_id
        RETURNING u.user_id, u.first_name, u.middle_name, u.last_name, u.display_name,
                u.primary_email, u.primary_phone, u.version_no;
    END;
    $function$;

    CREATE OR REPLACE FUNCTION "${schemaName}".otp_get_phone_change_context(
        p_challenge_id varchar, p_user_id varchar
    )
    RETURNS TABLE(destination varchar, purpose varchar, status varchar, context_json jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
    AS $function$
        SELECT c.destination, c.purpose, c.status, c.context_json
        FROM otp_challenges c
        WHERE c.otp_challenge_id = p_challenge_id
        AND c.context_json ->> 'customerUserId' = p_user_id
    $function$;

    REVOKE ALL ON FUNCTION "${schemaName}".customer_get_self_profile(varchar),
        "${schemaName}".customer_save_self_profile(varchar,varchar,varchar,varchar,varchar,integer),
        "${schemaName}".customer_confirm_self_phone_change(varchar,varchar,varchar),
        "${schemaName}".otp_get_phone_change_context(varchar,varchar) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION "${schemaName}".customer_get_self_profile(varchar),
        "${schemaName}".customer_save_self_profile(varchar,varchar,varchar,varchar,varchar,integer),
        "${schemaName}".customer_confirm_self_phone_change(varchar,varchar,varchar),
        "${schemaName}".otp_get_phone_change_context(varchar,varchar) TO "${appRole}";

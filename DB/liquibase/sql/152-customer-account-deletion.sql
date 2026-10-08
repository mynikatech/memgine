-- 152-customer-account-deletion.sql
-- Globally removes a customer identity while retaining immutable financial and
-- operational history through the existing stable user and relationship keys.

CREATE OR REPLACE FUNCTION "${schemaName}".auth_delete_customer_account(
    p_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_original_phone varchar(20);
    v_deleted_phone varchar(20);
    v_deleted_email varchar(254);
    v_deleted_user_code varchar(64);
    v_suffix integer := 0;
BEGIN
    IF NULLIF(btrim(p_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Customer account deletion is unavailable'
            USING ERRCODE = '22023';
    END IF;

    -- Serialize a global identity deletion and retain the row for the records
    -- which legitimately reference it.
    SELECT u.primary_phone
      INTO v_original_phone
      FROM "${schemaName}"."user" u
     WHERE u.user_id = p_user_id
       AND NOT u.is_deleted
       AND u.user_status_id = 'entity-status-user-active'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer account is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    -- This self-service route is customer-only. Any active platform role or
    -- active non-customer organization relationship must be administered
    -- through the appropriate business or platform process.
    IF EXISTS (
        SELECT 1
          FROM "${schemaName}".platform_user_role pur
         WHERE pur.user_id = p_user_id
           AND NOT pur.is_deleted
           AND pur.status_id = 'entity-status-platfrm-user-role-active'
           AND pur.effective_from <= CURRENT_TIMESTAMP
           AND (pur.effective_to IS NULL OR pur.effective_to > CURRENT_TIMESTAMP)
    ) OR EXISTS (
        SELECT 1
          FROM "${schemaName}".organization_user ou
         WHERE ou.user_id = p_user_id
           AND NOT ou.is_deleted
           AND ou.organization_user_status_id = 'entity-status-org-user-active'
           AND ou.organization_user_type_id <> 'organization-user-type-customer'
    ) OR EXISTS (
        SELECT 1
          FROM "${schemaName}".staff s
          JOIN "${schemaName}".organization_user ou
            ON ou.organization_user_id = s.organization_user_id
         WHERE ou.user_id = p_user_id
           AND NOT s.is_deleted
           AND s.staff_status_id = 'entity-status-staff-active'
    ) THEN
        RAISE EXCEPTION 'Privileged or staff accounts cannot be deleted through customer account deletion'
            USING ERRCODE = '42501';
    END IF;

    -- Keep the old phone reusable, including on schemas that enforce the
    -- existing E.164 check. The generated value is non-PII and unique.
    LOOP
        v_deleted_phone :=
            '+' || CASE WHEN v_suffix = 0 THEN '999' ELSE '998' END ||
            substring(translate(md5(p_user_id || ':' || v_suffix::text), 'abcdef', '012345') FROM 1 FOR 12);
        EXIT WHEN NOT EXISTS (
            SELECT 1
              FROM "${schemaName}"."user" u
             WHERE u.primary_phone = v_deleted_phone
               AND u.user_id <> p_user_id
        );
        v_suffix := v_suffix + 1;
        IF v_suffix > 1 THEN
            RAISE EXCEPTION 'Customer account deletion identity could not be allocated'
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    v_deleted_email := 'deleted+' || md5(p_user_id) || '@deleted.memgine.invalid';
    v_deleted_user_code := 'DEL-' || substring(md5(p_user_id) FROM 1 FOR 24);

    UPDATE "${schemaName}".authentication_sessions s
       SET revoked_at = COALESCE(s.revoked_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id,
           version_no = s.version_no + 1
     WHERE s.user_id = p_user_id
       AND s.revoked_at IS NULL;

    UPDATE "${schemaName}".user_credentials c
       SET password_hash = NULL,
           password_enabled = FALSE,
           failed_attempt_count = 0,
           locked_until = NULL,
           password_changed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id,
           version_no = c.version_no + 1
     WHERE c.user_id = p_user_id;

    -- Customer links are soft-deleted so historical subscriptions, payments,
    -- redemptions and audit records retain their stable relationship keys.
    UPDATE "${schemaName}".organization_user ou
       SET is_deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id,
           version_no = ou.version_no + 1
     WHERE ou.user_id = p_user_id
       AND ou.organization_user_type_id = 'organization-user-type-customer'
       AND NOT ou.is_deleted;

    -- These are non-financial, customer-owned values and are safe to remove.
    DELETE FROM "${schemaName}".customer_preference cp
     WHERE cp.user_id = p_user_id;

    DELETE FROM "${schemaName}".notifications n
     WHERE n.recipient_user_id = p_user_id;

    -- OTP rows are not financial history and must not retain the old contact
    -- destination after an account deletion. Pending challenges are expired.
    UPDATE "${schemaName}".otp_challenges o
       SET destination = v_deleted_phone,
           status = CASE WHEN o.status IN ('PENDING', 'DELIVERY_FAILED') THEN 'EXPIRED' ELSE o.status END,
           expires_at = CASE WHEN o.status IN ('PENDING', 'DELIVERY_FAILED')
               THEN LEAST(o.expires_at, CURRENT_TIMESTAMP) ELSE o.expires_at END,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id,
           version_no = o.version_no + 1
     WHERE o.destination = v_original_phone;

    UPDATE "${schemaName}".business_otp_context b
       SET normalized_phone = v_deleted_phone,
           payload = CASE WHEN b.consumed_at IS NULL THEN '{}'::jsonb ELSE b.payload END
     WHERE b.user_id = p_user_id
        OR b.normalized_phone = v_original_phone;

    UPDATE "${schemaName}"."user" u
       SET user_code = v_deleted_user_code,
           first_name = 'Deleted',
           middle_name = NULL,
           last_name = NULL,
           display_name = 'Deleted account',
           primary_email = v_deleted_email,
           primary_phone = v_deleted_phone,
           preferred_language_id = NULL,
           user_status_id = 'entity-status-user-inactive',
           otp_delivery_mode = 'DEFAULT',
           is_deleted = TRUE,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_user_id,
           version_no = u.version_no + 1
     WHERE u.user_id = p_user_id;

    RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".auth_delete_customer_account(varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".auth_delete_customer_account(varchar)
            TO "${appRole}";
    END IF;
END
$grant$;

-- Platform Admin organization maintenance. Rerunnable / idempotent: YES.
-- These SECURITY DEFINER entry points keep the Phase 1 owner-role guard intact.

CREATE OR REPLACE FUNCTION "${schemaName}".platform_list_organization_administrative_users(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    assignment_id varchar,
    organization_user_id varchar,
    organization_id varchar,
    user_id varchar,
    first_name varchar,
    last_name varchar,
    display_name varchar,
    primary_email varchar,
    primary_phone varchar,
    role_code varchar,
    assignment_status_id varchar,
    effective_from timestamp without time zone,
    effective_to timestamp without time zone
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Platform organization maintenance is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
    ) THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;

    RETURN QUERY
    SELECT
        our.organization_user_role_id,
        ou.organization_user_id,
        ou.organization_id,
        u.user_id,
        u.first_name,
        u.last_name,
        COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
        u.primary_email,
        u.primary_phone,
        r.role_code,
        our.assignment_status_id,
        our.effective_from,
        our.effective_to
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".organization_user_roles our
        ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    WHERE ou.organization_id = p_organization_id
      AND NOT ou.is_deleted
      AND ou.organization_user_status_id = 'entity-status-org-user-active'
      AND NOT u.is_deleted
      AND u.user_status_id = 'entity-status-user-active'
      AND NOT our.is_deleted
      AND our.assignment_status_id = 'entity-status-org-user-role-active'
      AND our.effective_from <= CURRENT_TIMESTAMP
      AND (our.effective_to IS NULL OR our.effective_to > CURRENT_TIMESTAMP)
      AND r.role_id IN ('role-owner', 'role-admin')
      AND r.role_status_id = 'entity-status-role-active'
    ORDER BY COALESCE(u.display_name, u.first_name), r.role_code;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_organization_administrative_user(
    p_organization_id varchar,
    p_user_id varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_primary_email varchar,
    p_primary_phone varchar,
    p_role_code varchar,
    p_effective_from timestamp without time zone,
    p_effective_to timestamp without time zone,
    p_actor_user_id varchar
)
RETURNS TABLE (
    assignment_id varchar,
    organization_user_id varchar,
    organization_id varchar,
    user_id varchar,
    first_name varchar,
    last_name varchar,
    display_name varchar,
    primary_email varchar,
    primary_phone varchar,
    role_code varchar,
    assignment_status_id varchar,
    effective_from timestamp without time zone,
    effective_to timestamp without time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id varchar(64) := NULLIF(trim(p_user_id), '');
    v_organization_user_id varchar(64);
    v_role_id varchar(64);
    v_other_role_id varchar(64);
    v_user_type_id varchar(64);
    v_phone varchar(20) := regexp_replace(COALESCE(trim(p_primary_phone), ''), '[^0-9+]', '', 'g');
    v_assignment_id varchar(64);
    v_effective_from timestamp without time zone := COALESCE(p_effective_from, CURRENT_TIMESTAMP);
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Platform organization maintenance is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
    ) THEN
        RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002';
    END IF;

    IF p_role_code = 'BUSINESS_OWNER' THEN
        v_role_id := 'role-owner';
        v_other_role_id := 'role-admin';
        v_user_type_id := 'organization-user-type-owner';
    ELSIF p_role_code = 'ORG_ADMIN' THEN
        v_role_id := 'role-admin';
        v_other_role_id := 'role-owner';
        v_user_type_id := 'organization-user-type-admin';
    ELSE
        RAISE EXCEPTION 'Administrative role must be BUSINESS_OWNER or ORG_ADMIN'
            USING ERRCODE = '22023';
    END IF;

    IF NULLIF(trim(p_first_name), '') IS NULL OR length(trim(p_first_name)) > 100
       OR length(COALESCE(trim(p_last_name), '')) > 100
       OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
       OR (NULLIF(trim(p_primary_email), '') IS NOT NULL AND
           (length(trim(p_primary_email)) > 254 OR
            lower(trim(p_primary_email)) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
       OR (p_effective_to IS NOT NULL AND p_effective_to <= v_effective_from) THEN
        RAISE EXCEPTION 'Invalid administrative user fields or effective date range'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

    IF v_user_id IS NULL THEN
        SELECT u.user_id INTO v_user_id
        FROM "${schemaName}"."user" u
        WHERE u.primary_phone = v_phone
        ORDER BY u.is_deleted, u.user_id
        LIMIT 1 FOR UPDATE;

        IF v_user_id IS NULL THEN
            v_user_id := gen_random_uuid()::text;
            INSERT INTO "${schemaName}"."user" (
                user_id, user_code, first_name, last_name, display_name,
                primary_email, primary_phone, preferred_language_id,
                user_status_id, created_by, updated_by
            ) VALUES (
                v_user_id,
                'USR-' || left(replace(v_user_id, '-', ''), 26),
                trim(p_first_name), NULLIF(trim(p_last_name), ''),
                concat_ws(' ', trim(p_first_name), NULLIF(trim(p_last_name), '')),
                NULLIF(lower(trim(p_primary_email)), ''), v_phone, 'language-en',
                'entity-status-user-active', p_actor_user_id, p_actor_user_id
            );
        ELSE
            -- Reused global identities retain their existing profile data.
            UPDATE "${schemaName}"."user" AS u
            SET user_status_id = 'entity-status-user-active', is_deleted = FALSE,
                updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
                version_no = u.version_no + 1
            WHERE u.user_id = v_user_id
              AND (u.is_deleted OR u.user_status_id <> 'entity-status-user-active');
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1
            FROM "${schemaName}".organization_user ou
            JOIN "${schemaName}".organization_user_roles our
              ON our.organization_user_id = ou.organization_user_id
            WHERE ou.organization_id = p_organization_id
              AND ou.user_id = v_user_id
              AND our.role_id IN ('role-owner', 'role-admin')
              AND NOT ou.is_deleted AND NOT our.is_deleted
        ) THEN
            RAISE EXCEPTION 'Administrative organization user not found'
                USING ERRCODE = 'P0002';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM "${schemaName}"."user" u
            WHERE u.user_id = v_user_id AND u.primary_phone = v_phone
        ) THEN
            RAISE EXCEPTION 'Phone is the immutable identity for an existing user'
                USING ERRCODE = '22023';
        END IF;

        UPDATE "${schemaName}"."user" AS u
        SET first_name = trim(p_first_name),
            last_name = NULLIF(trim(p_last_name), ''),
            display_name = concat_ws(' ', trim(p_first_name), NULLIF(trim(p_last_name), '')),
            primary_email = NULLIF(lower(trim(p_primary_email)), ''),
            user_status_id = 'entity-status-user-active', is_deleted = FALSE,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = u.version_no + 1
        WHERE u.user_id = v_user_id;
    END IF;

    SELECT ou.organization_user_id INTO v_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id
      AND ou.user_id = v_user_id
      AND ou.organization_user_type_id IN (
          'organization-user-type-owner', 'organization-user-type-admin'
      )
    ORDER BY ou.is_deleted, ou.organization_user_id
    LIMIT 1 FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        v_organization_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id,
            joining_date, created_by, updated_by
        ) VALUES (
            v_organization_user_id, p_organization_id, v_user_id,
            v_user_type_id, 'entity-status-org-user-active', CURRENT_DATE,
            p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user AS ou
        SET organization_user_type_id = v_user_type_id,
            organization_user_status_id = 'entity-status-org-user-active',
            is_deleted = FALSE, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = ou.version_no + 1
        WHERE ou.organization_user_id = v_organization_user_id;
    END IF;

    v_assignment_id := "${schemaName}".rbac_ensure_organization_base_role(
        v_organization_user_id, v_role_id, p_actor_user_id
    );

    UPDATE "${schemaName}".organization_user_roles AS our
    SET effective_from = v_effective_from,
        effective_to = p_effective_to,
        assignment_reason = 'Platform Admin organization maintenance',
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = our.version_no + 1
    WHERE our.organization_user_role_id = v_assignment_id;

    UPDATE "${schemaName}".organization_user_roles AS our
    SET assignment_status_id = 'entity-status-org-user-role-revoked',
        effective_to = CASE
            WHEN our.effective_from < CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
            ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
        version_no = our.version_no + 1
    WHERE our.organization_user_id = v_organization_user_id
      AND our.role_id = v_other_role_id
      AND NOT our.is_deleted
      AND our.assignment_status_id <> 'entity-status-org-user-role-revoked';

    RETURN QUERY
    SELECT
        our.organization_user_role_id,
        ou.organization_user_id,
        ou.organization_id,
        u.user_id,
        u.first_name,
        u.last_name,
        COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
        u.primary_email,
        u.primary_phone,
        r.role_code,
        our.assignment_status_id,
        our.effective_from,
        our.effective_to
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".organization_user_roles our
      ON our.organization_user_id = ou.organization_user_id
    JOIN "${schemaName}".role r ON r.role_id = our.role_id
    WHERE ou.organization_user_id = v_organization_user_id
      AND our.organization_user_role_id = v_assignment_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".platform_list_organization_administrative_users(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_save_organization_administrative_user(varchar, varchar, varchar, varchar, varchar, varchar, varchar, timestamp without time zone, timestamp without time zone, varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".platform_list_organization_administrative_users(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_save_organization_administrative_user(varchar, varchar, varchar, varchar, varchar, varchar, varchar, timestamp without time zone, timestamp without time zone, varchar) TO "${appRole}";

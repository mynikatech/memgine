
-- Migration 289
-- Fix DEMO customer designation failing because
-- customer_support_requests has no is_deleted column.
-- Preserve all existing REAL-organization eligibility safeguards.

CREATE OR REPLACE FUNCTION "${schemaName}".platform_set_customer_demo(
    p_user_id varchar,
    p_is_demo boolean,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(
        p_actor_user_id,
        NULL,
        'PLATFORM_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION
            'Platform DEMO customer administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    PERFORM 1
      FROM "user" u
     WHERE u.user_id = p_user_id
       AND NOT u.is_deleted
       AND u.user_status_id = 'entity-status-user-active'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Active customer identity was not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF p_is_demo AND (
        EXISTS (
            SELECT 1
              FROM organization_user ou
              JOIN organization o
                ON o.organization_id = ou.organization_id
             WHERE ou.user_id = p_user_id
               AND NOT ou.is_deleted
               AND NOT o.is_deleted
               AND NOT o.is_demo
        )
        OR EXISTS (
            SELECT 1
              FROM commerce_transactions ct
              JOIN organization o
                ON o.organization_id = ct.organization_id
             WHERE ct.customer_user_id = p_user_id
               AND NOT ct.is_deleted
               AND NOT o.is_deleted
               AND NOT o.is_demo
        )
        OR EXISTS (
            SELECT 1
              FROM customer_support_requests sr
              JOIN organization o
                ON o.organization_id = sr.organization_id
             WHERE sr.customer_user_id = p_user_id
               AND NOT o.is_deleted
               AND NOT o.is_demo
        )
    ) THEN
        RAISE EXCEPTION
            'Customer has relationships or transactions with a REAL organization'
            USING ERRCODE = '23505';
    END IF;

    UPDATE "user"
       SET is_demo = p_is_demo,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE user_id = p_user_id;

    RETURN TRUE;
END;
$function$;

-- Preserve the application role's execution permission.
REVOKE ALL ON FUNCTION "${schemaName}".platform_set_customer_demo(
    varchar, boolean, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".platform_set_customer_demo(
    varchar, boolean, varchar
) TO "${appRole}";

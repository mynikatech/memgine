
-- Migration 316
-- Explain demo-account purchase restrictions correctly.
--
-- Preserve:
-- 1. Existing Boolean purchase eligibility implementation.
-- 2. Membership agreement's existing active-relationship allowance,
--    except where the demo-account purchase restriction applies.
-- 3. Existing eligibility reason codes and messages.
-- 4. Existing function signature and permissions.
--
-- No existing functions are dropped.
-- No existing data is modified.

CREATE OR REPLACE FUNCTION "${schemaName}".customer_membership_purchase_eligibility(
    p_organization_id varchar,
    p_customer_user_id varchar
)
RETURNS TABLE (
    "eligible" boolean,
    "reasonCode" varchar,
    "message" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    -- 1. Validate required context.
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL THEN
        RETURN QUERY SELECT
            FALSE,
            'MEMBERSHIP_INVALID_CONTEXT'::varchar,
            'Customer identity or business is unavailable'::text;
        RETURN;
    END IF;

    -- 2. Demo-account restriction.
    --
    -- Demo customers may purchase memberships only from demo businesses.
    -- Check this before the active-relationship allowance so the wrapper
    -- cannot report eligibility contrary to the purchase restriction.
    --
    -- This does not change the authoritative Boolean eligibility function.
    IF EXISTS (
        SELECT 1
        FROM "user" u
        JOIN organization o
          ON o.organization_id = p_organization_id
        WHERE u.user_id = p_customer_user_id
          AND COALESCE(u.is_demo, FALSE)
          AND NOT COALESCE(o.is_demo, FALSE)
    ) THEN
        RETURN QUERY SELECT
            FALSE,
            'MEMBERSHIP_DEMO_ACCOUNT_RESTRICTED'::varchar,
            'This demonstration account cannot purchase memberships from this business. Please sign in with a regular customer account.'::text;
        RETURN;
    END IF;

    -- 3. Preserve existing agreement validation behavior.
    --
    -- Active customer relationship allowance remains intact,
    -- subject to the demo-account restriction checked above.
    IF customer_has_active_relationship(
           p_organization_id,
           p_customer_user_id
       )
       OR customer_can_start_membership_purchase(
           p_organization_id,
           p_customer_user_id
       )
    THEN
        RETURN QUERY SELECT
            TRUE,
            'ELIGIBLE'::varchar,
            NULL::text;
        RETURN;
    END IF;

    -- 4. Inactive customer.
    IF NOT customer_is_active_global_user(
        p_customer_user_id
    ) THEN
        RETURN QUERY SELECT
            FALSE,
            'MEMBERSHIP_USER_INACTIVE'::varchar,
            'Your account is currently unavailable for membership purchases. Please contact support.'::text;
        RETURN;
    END IF;

    -- 5. Inactive or unavailable business.
    IF NOT EXISTS (
        SELECT 1
        FROM organization o
        JOIN entity_status es
          ON es.entity_status_id = o.organization_status_id
        JOIN statuses s
          ON s.status_id = es.status_id
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted
          AND es.is_active
          AND s.status_code = 'ACTIVE'
    ) THEN
        RETURN QUERY SELECT
            FALSE,
            'MEMBERSHIP_BUSINESS_UNAVAILABLE'::varchar,
            'This business is currently unavailable for membership purchases.'::text;
        RETURN;
    END IF;

    -- 6. Staff/admin of this business cannot purchase
    -- its memberships using their staff/admin identity.
    IF EXISTS (
        SELECT 1
        FROM organization_user ou
        JOIN organization_user_types outype
          ON outype.organization_user_type_id =
             ou.organization_user_type_id
        JOIN entity_status es
          ON es.entity_status_id =
             ou.organization_user_status_id
        JOIN statuses s
          ON s.status_id = es.status_id
        WHERE ou.organization_id = p_organization_id
          AND ou.user_id = p_customer_user_id
          AND NOT ou.is_deleted
          AND es.is_active
          AND s.status_code = 'ACTIVE'
          AND outype.organization_user_type_code
              IN ('EMPLOYEE', 'ADMIN', 'OWNER')
    ) THEN
        RETURN QUERY SELECT
            FALSE,
            'MEMBERSHIP_OWN_BUSINESS_STAFF'::varchar,
            'Your account is registered as staff or an administrator of this business. Membership purchases from this business aren''t available for this account. You can still purchase memberships from other businesses on Memgine.'::text;
        RETURN;
    END IF;

    -- 7. Fallback for other relationship/eligibility failures.
    RETURN QUERY SELECT
        FALSE,
        'MEMBERSHIP_RELATIONSHIP_NOT_ELIGIBLE'::varchar,
        'Membership purchase is unavailable for this business with your current account. Please contact support if you need assistance.'::text;

END;
$function$;

-- Preserve application execution permissions.
REVOKE ALL ON FUNCTION
    "${schemaName}".customer_membership_purchase_eligibility(
        varchar,
        varchar
    )
FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = '${appRole}'
    ) THEN
        GRANT EXECUTE ON FUNCTION
            "${schemaName}".customer_membership_purchase_eligibility(
                varchar,
                varchar
            )
        TO "${appRole}";
    END IF;
END;
$grant$;

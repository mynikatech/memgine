-- Membership agreement-specific eligibility diagnostic.
-- Does not change the authoritative Boolean purchase-eligibility function.
-- Retains the existing MembershipAgreementOperations allowance for an active
-- customer relationship, pending a separate authorization-rule review.
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
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_customer_user_id), '') IS NULL THEN
        RETURN QUERY SELECT FALSE, 'MEMBERSHIP_INVALID_CONTEXT'::varchar,
            'Customer identity or business is unavailable'::text;
        RETURN;
    END IF;

    -- Preserve the agreement validator's existing accepted cases exactly.
    IF customer_has_active_relationship(p_organization_id, p_customer_user_id)
       OR customer_can_start_membership_purchase(p_organization_id, p_customer_user_id)
    THEN
        RETURN QUERY SELECT TRUE, 'ELIGIBLE'::varchar, NULL::text;
        RETURN;
    END IF;

    IF NOT customer_is_active_global_user(p_customer_user_id) THEN
        RETURN QUERY SELECT FALSE, 'MEMBERSHIP_USER_INACTIVE'::varchar,
            'Your account is currently unavailable for membership purchases. Please contact support.'::text;
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM organization o
        JOIN entity_status es ON es.entity_status_id = o.organization_status_id
        JOIN statuses s ON s.status_id = es.status_id
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted AND es.is_active AND s.status_code = 'ACTIVE'
    ) THEN
        RETURN QUERY SELECT FALSE, 'MEMBERSHIP_BUSINESS_UNAVAILABLE'::varchar,
            'This business is currently unavailable for membership purchases.'::text;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM organization_user ou
        JOIN organization_user_types outype
          ON outype.organization_user_type_id = ou.organization_user_type_id
        JOIN entity_status es
          ON es.entity_status_id = ou.organization_user_status_id
        JOIN statuses s ON s.status_id = es.status_id
        WHERE ou.organization_id = p_organization_id
          AND ou.user_id = p_customer_user_id
          AND NOT ou.is_deleted AND es.is_active AND s.status_code = 'ACTIVE'
          AND outype.organization_user_type_code IN ('EMPLOYEE', 'ADMIN', 'OWNER')
    ) THEN
        RETURN QUERY SELECT FALSE, 'MEMBERSHIP_OWN_BUSINESS_STAFF'::varchar,
            'Your account is registered as staff or an administrator of this business. Membership purchases from this business aren''t available for this account. You can still purchase memberships from other businesses on Memgine.'::text;
        RETURN;
    END IF;

    -- An existing inactive/deleted/noncustomer relationship or other
    -- eligibility failure must not be mislabeled as staff/admin.
    RETURN QUERY SELECT FALSE, 'MEMBERSHIP_RELATIONSHIP_NOT_ELIGIBLE'::varchar,
        'Membership purchase is unavailable for this business with your current account. Please contact support if you need assistance.'::text;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".customer_membership_purchase_eligibility(varchar, varchar) FROM PUBLIC;
DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".customer_membership_purchase_eligibility(varchar, varchar) TO "${appRole}";
    END IF;
END;
$grant$;

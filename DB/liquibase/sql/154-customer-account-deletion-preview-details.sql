-- 154-customer-account-deletion-preview-details.sql
-- Customer-facing detail rows for active memberships shown before account deletion.
-- Read-only: this does not cancel, refund, delete, or mutate subscriptions.

CREATE OR REPLACE FUNCTION "${schemaName}".auth_customer_account_deletion_active_subscriptions(
    p_user_id varchar
)
RETURNS TABLE (
    "subscriptionId" varchar,
    "organizationName" varchar,
    "membershipProductName" varchar,
    "subscriptionPlanName" varchar,
    "startDate" text,
    "endDate" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        s.subscription_id,
        o.organization_name,
        COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name),
        sp.subscription_plan_name,
        s.start_date::text,
        s.end_date::text
      FROM "${schemaName}".subscriptions s
      JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = s.organization_user_id
      JOIN "${schemaName}".organization o
        ON o.organization_id = ou.organization_id
      JOIN "${schemaName}".subscription_plans sp
        ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN "${schemaName}".membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
       AND mp.organization_id = ou.organization_id
      JOIN "${schemaName}".entity_status ses
        ON ses.entity_status_id = s.subscription_status_id
      JOIN "${schemaName}".statuses ss
        ON ss.status_id = ses.status_id
     WHERE ou.user_id = p_user_id
       AND ou.organization_user_type_id = 'organization-user-type-customer'
       AND NOT ou.is_deleted
       AND NOT o.is_deleted
       AND NOT s.is_deleted
       AND NOT sp.is_deleted
       AND NOT mp.is_deleted
       AND ss.status_code = 'ACTIVE'
       AND s.start_date <= CURRENT_DATE
       AND s.end_date >= CURRENT_DATE
     ORDER BY
        o.organization_name,
        COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name),
        sp.subscription_plan_name,
        s.end_date,
        s.subscription_id;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".auth_customer_account_deletion_active_subscriptions(varchar)
FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION
            "${schemaName}".auth_customer_account_deletion_active_subscriptions(varchar)
        TO "${appRole}";
    END IF;
END
$grant$;

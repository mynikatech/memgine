-- 153-customer-account-deletion-preview.sql
-- Read-only, authoritative deletion preview. A subscription is active when its
-- status is ACTIVE and its effective period has not ended.

CREATE OR REPLACE FUNCTION "${schemaName}".auth_customer_account_deletion_preview(
    p_user_id varchar
)
RETURNS TABLE (
    "hasActiveSubscriptions" boolean,
    "activeSubscriptionCount" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        COUNT(*) > 0,
        COUNT(*)::integer
      FROM "${schemaName}".subscriptions s
      JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = s.organization_user_id
      JOIN "${schemaName}".entity_status ses
        ON ses.entity_status_id = s.subscription_status_id
      JOIN "${schemaName}".statuses ss
        ON ss.status_id = ses.status_id
     WHERE ou.user_id = p_user_id
       AND ou.organization_user_type_id = 'organization-user-type-customer'
       AND NOT ou.is_deleted
       AND NOT s.is_deleted
       AND ss.status_code = 'ACTIVE'
       AND s.start_date <= CURRENT_DATE
       AND s.end_date >= CURRENT_DATE;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".auth_customer_account_deletion_preview(varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".auth_customer_account_deletion_preview(varchar)
            TO "${appRole}";
    END IF;
END
$grant$;

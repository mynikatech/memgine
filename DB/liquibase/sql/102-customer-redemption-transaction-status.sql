CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_redemption_transaction_status(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_user_id varchar
)
RETURNS TABLE(
    "transactionId" varchar,
    status varchar,
    "expiresAt" text,
    "completedAt" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT redemption.redemption_transaction_id::varchar,
           CASE
               WHEN redemption.status = 'PENDING'
                    AND redemption.expires_at <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                   THEN 'EXPIRED'
               ELSE redemption.status
           END::varchar,
           redemption.expires_at::text,
           redemption.completed_at::text
      FROM redemption_transaction redemption
      JOIN subscriptions subscription
        ON subscription.subscription_id = redemption.subscription_id
       AND NOT subscription.is_deleted
      JOIN organization_user organization_user
        ON organization_user.organization_user_id = subscription.organization_user_id
       AND NOT organization_user.is_deleted
      JOIN organization_user_types organization_user_type
        ON organization_user_type.organization_user_type_id = organization_user.organization_user_type_id
      JOIN entity_status relationship_status
        ON relationship_status.entity_status_id = organization_user.organization_user_status_id
      JOIN statuses relationship_status_code
        ON relationship_status_code.status_id = relationship_status.status_id
     WHERE redemption.redemption_transaction_id = p_transaction_id
       AND redemption.organization_id = p_organization_id
       AND organization_user.organization_id = p_organization_id
       AND organization_user.user_id = p_user_id
       AND organization_user_type.organization_user_type_code = 'CUSTOMER'
       AND relationship_status_code.status_code = 'ACTIVE';
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_redemption_transaction_status(varchar, varchar, varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_redemption_transaction_status(varchar, varchar, varchar) TO "${appRole}";
    END IF;
END;
$grant$;

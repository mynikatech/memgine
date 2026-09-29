CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_redemption_item_status(
    p_organization_id varchar,
    p_subscription_id varchar,
    p_user_id varchar
)
RETURNS TABLE(
    "itemId" varchar,
    "itemType" varchar,
    status varchar,
    "displayReason" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_membership_product_id varchar;
BEGIN
    SELECT subscription_plan.membership_product_id
      INTO v_membership_product_id
      FROM subscriptions subscription
      JOIN organization_user organization_user
        ON organization_user.organization_user_id = subscription.organization_user_id
       AND NOT organization_user.is_deleted
      JOIN organization_user_types organization_user_type
        ON organization_user_type.organization_user_type_id = organization_user.organization_user_type_id
      JOIN "user" customer
        ON customer.user_id = organization_user.user_id
       AND NOT customer.is_deleted
      JOIN entity_status customer_status
        ON customer_status.entity_status_id = customer.user_status_id
      JOIN statuses customer_status_code
        ON customer_status_code.status_id = customer_status.status_id
      JOIN entity_status relationship_status
        ON relationship_status.entity_status_id = organization_user.organization_user_status_id
      JOIN statuses relationship_status_code
        ON relationship_status_code.status_id = relationship_status.status_id
     JOIN subscription_plans subscription_plan
        ON subscription_plan.subscription_plan_id = subscription.subscription_plan_id
     WHERE subscription.subscription_id = p_subscription_id
       AND organization_user.organization_id = p_organization_id
       AND organization_user.user_id = p_user_id
       AND organization_user_type.organization_user_type_code = 'CUSTOMER'
       AND customer_status_code.status_code = 'ACTIVE'
       AND relationship_status_code.status_code = 'ACTIVE'
       AND NOT subscription.is_deleted;

    IF v_membership_product_id IS NULL THEN
        RAISE EXCEPTION 'Customer subscription is not available' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH candidates AS (
        SELECT benefit.benefit_id::varchar AS item_id,
               'BENEFIT'::varchar AS item_type,
               counter_benefit_rejection(
                   p_organization_id,
                   p_subscription_id,
                   benefit.benefit_id
               ) AS rejection_reason
          FROM membership_product_benefits membership_benefit
          JOIN benefits benefit
            ON benefit.benefit_id = membership_benefit.benefit_id
           AND benefit.organization_id = p_organization_id
           AND NOT benefit.is_deleted
         WHERE membership_benefit.membership_product_id = v_membership_product_id
           AND NOT membership_benefit.is_deleted

        UNION ALL

        SELECT offer.offer_id::varchar AS item_id,
               'OFFER'::varchar AS item_type,
               counter_offer_rejection(
                   p_organization_id,
                   p_subscription_id,
                   offer.offer_id,
                   NULL
               ) AS rejection_reason
          FROM offer
         WHERE offer.organization_id = p_organization_id
           AND NOT offer.is_deleted
           AND (
               offer.membership_product_id IS NULL
               OR offer.membership_product_id = v_membership_product_id
           )
    ), classified AS (
        SELECT item_id,
               item_type,
               CASE
                   WHEN rejection_reason IS NULL THEN 'AVAILABLE'
                   WHEN rejection_reason ILIKE '%usage limit has been reached%'
                       THEN 'LIMIT_REACHED'
                   WHEN rejection_reason ILIKE '%not available today%'
                       THEN 'UNAVAILABLE_TODAY'
                   WHEN rejection_reason ILIKE '%outside its valid period%'
                       THEN 'UNAVAILABLE'
                   WHEN rejection_reason ILIKE '%not active for this membership%'
                       THEN 'NOT_APPLICABLE'
                   ELSE 'INACTIVE'
               END::varchar AS item_status
          FROM candidates
    )
    SELECT item_id,
           item_type,
           item_status,
           CASE item_status
               WHEN 'LIMIT_REACHED' THEN 'Usage limit reached'
               WHEN 'UNAVAILABLE_TODAY' THEN 'Unavailable today'
               WHEN 'UNAVAILABLE' THEN 'Unavailable right now'
               WHEN 'NOT_APPLICABLE' THEN 'Not available with this membership'
               WHEN 'INACTIVE' THEN 'Unavailable'
               ELSE NULL
           END::varchar
      FROM classified
     ORDER BY item_type, item_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_redemption_item_status(varchar, varchar, varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_redemption_item_status(varchar, varchar, varchar) TO "${appRole}";
    END IF;
END;
$grant$;

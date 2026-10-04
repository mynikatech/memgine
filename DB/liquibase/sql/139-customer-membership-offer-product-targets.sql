CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_purchase_offer_product_targets(
    p_organization_id varchar,
    p_customer_user_id varchar
)
RETURNS TABLE (
    "offerId" varchar,
    "displayName" varchar,
    "membershipProductId" varchar,
    "targetSubscriptionPlanId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT DISTINCT
        o.offer_id,
        o.offer_name, 
        mp.membership_product_id,
        a.target_subscription_plan_id
      FROM membership_offer_applicability a
      JOIN offer o
        ON o.offer_id = a.offer_id
      JOIN membership_products mp
        ON mp.organization_id = a.organization_id
      JOIN entity_status mpes
        ON mpes.entity_status_id = mp.product_status_id
      JOIN statuses mps
        ON mps.status_id = mpes.status_id
     WHERE a.organization_id = p_organization_id
       AND a.behavior = 'PURCHASE_DISCOUNT'
       AND a.is_active
       AND NOT a.is_deleted
       AND NOT o.is_deleted
       AND NOT mp.is_deleted
       AND mpes.is_active
       AND mps.status_code = 'ACTIVE'
       AND customer_membership_purchase_offer_available(
           p_organization_id,
           p_customer_user_id,
           a.offer_id
       )
       AND (
           a.membership_target_mode = 'ALL_MEMBERSHIP_PRODUCTS'
           OR EXISTS (
               SELECT 1
                 FROM membership_offer_applicability_products ap
                WHERE ap.membership_offer_applicability_id =
                      a.membership_offer_applicability_id
                  AND ap.organization_id = p_organization_id
                  AND ap.membership_product_id = mp.membership_product_id
                  AND NOT ap.is_deleted
           )
       )
     ORDER BY mp.membership_product_id, o.offer_id;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_membership_purchase_offer_product_targets(
    varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_membership_purchase_offer_product_targets(
    varchar, varchar
) TO "${appRole}";

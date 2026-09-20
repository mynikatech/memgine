-- Counter-specific subscription read.
-- Removes dependency on Org Admin subscription authorization.
-- Rerunnable / idempotent: YES.

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_subscriptions(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar,
    "subscriptionNumber" varchar,
    "organizationUserId" varchar,
    "customerName" text,
    "customerEmail" varchar,
    "customerPhone" varchar,
    "subscriptionPlanName" varchar,
    "subscriptionPlanCode" varchar,
    "membershipProductName" varchar,
    "subscriptionDate" text,
    "startDate" text,
    "endDate" text,
    "subscriptionStatusId" varchar,
    "statusCode" varchar,
    "statusName" varchar,
    "totalAmount" double precision,
    "currencyCode" varchar,
    "createdAt" text,
    "userId" varchar,
    "subscriptionPlanId" varchar,
    "membershipProductId" varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$

    SELECT
        s.subscription_id,
        s.subscription_number,
        ou.organization_user_id,

        COALESCE(
            NULLIF(trim(u.display_name), ''),
            NULLIF(
                trim(
                    concat_ws(
                        ' ',
                        u.first_name,
                        u.middle_name,
                        u.last_name
                    )
                ),
                ''
            ),
            u.user_code
        ) AS "customerName",

        u.primary_email,
        u.primary_phone,

        sp.subscription_plan_name,
        sp.subscription_plan_code,

        COALESCE(
            NULLIF(mp.display_name, ''),
            mp.membership_product_name
        ) AS "membershipProductName",

        s.subscription_date::text,
        s.start_date::text,
        s.end_date::text,

        s.subscription_status_id,
        st.status_code,
        st.status_name,

        s.total_amount::double precision,
        c.currency_code,
        s.created_at::text,

        u.user_id,
        sp.subscription_plan_id,
        mp.membership_product_id

    FROM "${schemaName}".subscriptions s

    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = s.organization_user_id

    JOIN "${schemaName}"."user" u
      ON u.user_id = ou.user_id

    JOIN "${schemaName}".subscription_plans sp
      ON sp.subscription_plan_id = s.subscription_plan_id

    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = sp.membership_product_id
     AND mp.organization_id = p_organization_id

    JOIN "${schemaName}".currencies c
      ON c.currency_id = sp.currency_id

    JOIN "${schemaName}".entity_status es
      ON es.entity_status_id = s.subscription_status_id

    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id

    WHERE ou.organization_id = p_organization_id

      AND "${schemaName}".rbac_has_capability(
          p_actor_user_id,
          p_organization_id,
          'COUNTER_ACCESS'
      )

      AND s.is_deleted = false
      AND ou.is_deleted = false
      AND u.is_deleted = false
      AND sp.is_deleted = false
      AND mp.is_deleted = false

    ORDER BY
        s.subscription_date DESC,
        s.subscription_id;

$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".get_counter_subscriptions(
        varchar,
        varchar
    )
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_counter_subscriptions(
        varchar,
        varchar
    )
TO "${appRole}";
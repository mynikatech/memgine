-- Counter subscription-scoped benefit read.
-- Keeps Org Admin benefit management separate from Counter redemption access.
-- Rerunnable / idempotent: YES.

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_subscription_benefits(
    p_organization_id varchar,
    p_subscription_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
    "benefitStatusId" varchar,
    "productId" varchar,
    "retailPrice" numeric,
    cost numeric,
    "effectiveDate" text,
    "expiryDate" text,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$

    SELECT
        b.benefit_id,
        b.organization_id,
        b.benefit_code,
        b.benefit_name,
        b.display_name,
        b.benefit_category_id,
        b.benefit_type_id,
        b.description,
        b.benefit_status_id,
        b.product_id,
        b.retail_price,
        b.cost,
        b.effective_date::text,
        b.expiry_date::text,
        b.created_at::text,
        b.created_by,
        b.updated_at::text,
        b.updated_by,
        b.is_deleted,
        b.version_no

    FROM "${schemaName}".subscriptions s

    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = s.organization_user_id

    JOIN "${schemaName}".subscription_plans sp
      ON sp.subscription_plan_id = s.subscription_plan_id

    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = sp.membership_product_id
     AND mp.organization_id = p_organization_id

    JOIN "${schemaName}".membership_product_benefits mpb
      ON mpb.membership_product_id = mp.membership_product_id
     AND mpb.is_deleted = false

    JOIN "${schemaName}".benefits b
      ON b.benefit_id = mpb.benefit_id
     AND b.organization_id = p_organization_id

    WHERE s.subscription_id = p_subscription_id
      AND ou.organization_id = p_organization_id
      AND s.is_deleted = false
      AND ou.is_deleted = false
      AND mp.is_deleted = false
      AND sp.is_deleted = false
      AND b.is_deleted = false

      AND "${schemaName}".rbac_has_capability(
          p_actor_user_id,
          p_organization_id,
          'COUNTER_ACCESS'
      )

    ORDER BY b.benefit_name, b.benefit_code;

$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".get_counter_subscription_benefits(
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_counter_subscription_benefits(
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";
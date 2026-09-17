-- Batch 2I: read-only Org Admin subscription and redemption projections.
-- CREATE OR REPLACE is safely rerunnable. Organization membership is checked
-- both by the caller and inside each function.

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_subscriptions_admin(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "subscriptionNumber" varchar, "organizationUserId" varchar,
    "customerName" text, "customerEmail" varchar, "customerPhone" varchar,
    "subscriptionPlanName" varchar, "subscriptionPlanCode" varchar,
    "membershipProductName" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "statusCode" varchar, "statusName" varchar, "totalAmount" double precision,
    "currencyCode" varchar, "createdAt" text
)
LANGUAGE sql STABLE AS $function$
    SELECT s.subscription_id, s.subscription_number, ou.organization_user_id,
        COALESCE(NULLIF(trim(u.display_name), ''),
                 NULLIF(trim(concat_ws(' ', u.first_name, u.middle_name, u.last_name)), ''),
                 u.user_code),
        u.primary_email, u.primary_phone, sp.subscription_plan_name,
        sp.subscription_plan_code,
        COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name),
        s.subscription_date::text, s.start_date::text, s.end_date::text,
        s.subscription_status_id, st.status_code, st.status_name,
        s.total_amount::double precision, c.currency_code, s.created_at::text
    FROM "${schemaName}".subscriptions s
    JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = s.organization_user_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".subscription_plans sp
        ON sp.subscription_plan_id = s.subscription_plan_id
    JOIN "${schemaName}".membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
       AND mp.organization_id = ou.organization_id
    JOIN "${schemaName}".currencies c ON c.currency_id = sp.currency_id
    JOIN "${schemaName}".entity_status es
        ON es.entity_status_id = s.subscription_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE ou.organization_id = p_organization_id AND s.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY s.subscription_date DESC, s.subscription_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_redemptions_admin(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "redemptionNumber" varchar, "subscriptionId" varchar,
    "subscriptionNumber" varchar, "customerName" text,
    "customerEmail" varchar, "customerPhone" varchar,
    "benefitId" varchar, "benefitName" varchar, "benefitCode" varchar,
    "storeId" varchar, "storeName" varchar, "storeCode" varchar,
    "staffId" varchar, "staffName" text, "staffCode" varchar,
    "redemptionDateTime" text, quantity integer, "redemptionStatusId" varchar,
    "statusCode" varchar, "statusName" varchar, remarks varchar,
    "createdAt" text, "createdBy" varchar, "updatedAt" text,
    "updatedBy" varchar, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT r.redemption_id, r.redemption_number, s.subscription_id,
        s.subscription_number,
        COALESCE(NULLIF(trim(u.display_name), ''),
                 NULLIF(trim(concat_ws(' ', u.first_name, u.middle_name, u.last_name)), ''),
                 u.user_code),
        u.primary_email, u.primary_phone, b.benefit_id,
        COALESCE(NULLIF(b.display_name, ''), b.benefit_name), b.benefit_code,
        store.store_id, store.store_name, store.store_code,
        staff.staff_id,
        COALESCE(NULLIF(trim(su.display_name), ''),
                 NULLIF(trim(concat_ws(' ', su.first_name, su.middle_name, su.last_name)), ''),
                 su.user_code),
        staff.staff_code, r.redemption_datetime::text, r.quantity,
        r.redemption_status_id, st.status_code, st.status_name,
        r.remarks, r.created_at::text, r.created_by,
        r.updated_at::text, r.updated_by, r.version_no
    FROM "${schemaName}".redemptions r
    JOIN "${schemaName}".subscriptions s ON s.subscription_id = r.subscription_id
    JOIN "${schemaName}".organization_user ou
        ON ou.organization_user_id = s.organization_user_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".benefits b ON b.benefit_id = r.benefit_id
        AND b.organization_id = ou.organization_id
    JOIN "${schemaName}".stores store ON store.store_id = r.store_id
        AND store.organization_id = ou.organization_id
    LEFT JOIN "${schemaName}".staff staff ON staff.staff_id = r.staff_id
        AND staff.organization_id = ou.organization_id
    LEFT JOIN "${schemaName}".organization_user sou
        ON sou.organization_user_id = staff.organization_user_id
    LEFT JOIN "${schemaName}"."user" su ON su.user_id = sou.user_id
    JOIN "${schemaName}".entity_status es
        ON es.entity_status_id = r.redemption_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE ou.organization_id = p_organization_id AND s.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
    ORDER BY r.redemption_datetime DESC, r.redemption_id;
$function$;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_subscriptions_admin(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_redemptions_admin(varchar, varchar) TO "${appRole}";
    END IF;
END $grant$;

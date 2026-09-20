-- Phase 2E-1 follow-up:
-- Counter-specific customer and redemption reads.
--
-- Counter access is authorized through COUNTER_ACCESS rather than
-- organization-administration permissions.
--
-- Rerunnable / idempotent: YES.

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_customers(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "organizationUserId" varchar,
    "organizationId" varchar,
    "organizationName" text,
    "userId" varchar,
    "userCode" varchar,
    "firstName" varchar,
    "middleName" varchar,
    "lastName" varchar,
    "displayName" varchar,
    "primaryEmail" varchar,
    "primaryPhone" varchar,
    "userStatusId" varchar,
    "userStatusName" varchar,
    "organizationUserTypeId" varchar,
    "organizationUserStatusId" varchar,
    "relationshipStatusName" varchar,
    "joiningDate" text,
    "subscriptionCount" integer,
    "membershipName" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        ou.organization_user_id,
        o.organization_id,
        COALESCE(
            NULLIF(o.organization_display_name, ''),
            o.organization_name
        )::text,
        u.user_id,
        u.user_code,
        u.first_name,
        u.middle_name,
        u.last_name,
        u.display_name,
        u.primary_email,
        u.primary_phone,
        u.user_status_id,
        us.status_name,
        ou.organization_user_type_id,
        ou.organization_user_status_id,
        os.status_name,
        ou.joining_date::text,

        (
            SELECT count(*)::integer
            FROM "${schemaName}".subscriptions s
            WHERE s.organization_user_id = ou.organization_user_id
              AND s.is_deleted = false
        ),

        (
            SELECT string_agg(
                DISTINCT COALESCE(
                    NULLIF(mp.display_name, ''),
                    mp.membership_product_name
                ),
                ', '
            )
            FROM "${schemaName}".subscriptions s
            JOIN "${schemaName}".subscription_plans sp
              ON sp.subscription_plan_id = s.subscription_plan_id
            JOIN "${schemaName}".membership_products mp
              ON mp.membership_product_id = sp.membership_product_id
            WHERE s.organization_user_id = ou.organization_user_id
              AND s.is_deleted = false
        )

    FROM "${schemaName}".organization_user ou

    JOIN "${schemaName}".organization o
      ON o.organization_id = ou.organization_id

    JOIN "${schemaName}"."user" u
      ON u.user_id = ou.user_id

    JOIN "${schemaName}".organization_user_types ot
      ON ot.organization_user_type_id = ou.organization_user_type_id

    JOIN "${schemaName}".entity_status ues
      ON ues.entity_status_id = u.user_status_id

    JOIN "${schemaName}".statuses us
      ON us.status_id = ues.status_id

    JOIN "${schemaName}".entity_status oes
      ON oes.entity_status_id = ou.organization_user_status_id

    JOIN "${schemaName}".statuses os
      ON os.status_id = oes.status_id

    JOIN "${schemaName}".entity_status ges
      ON ges.entity_status_id = o.organization_status_id

    JOIN "${schemaName}".statuses gs
      ON gs.status_id = ges.status_id

    WHERE ou.organization_id = p_organization_id

      AND "${schemaName}".rbac_has_capability(
          p_actor_user_id,
          p_organization_id,
          'COUNTER_ACCESS'
      )

      AND ot.organization_user_type_code = 'CUSTOMER'

      AND ou.is_deleted = false
      AND u.is_deleted = false
      AND o.is_deleted = false

      AND us.status_code = 'ACTIVE'
      AND os.status_code = 'ACTIVE'
      AND gs.status_code = 'ACTIVE'

    ORDER BY
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
        ),
        u.user_id;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_redemptions(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar,
    "redemptionNumber" varchar,
    "subscriptionId" varchar,
    "subscriptionNumber" varchar,
    "customerName" text,
    "customerEmail" varchar,
    "customerPhone" varchar,
    "benefitId" varchar,
    "benefitName" varchar,
    "benefitCode" varchar,
    "storeId" varchar,
    "storeName" varchar,
    "storeCode" varchar,
    "staffId" varchar,
    "staffName" text,
    "staffCode" varchar,
    "redemptionDateTime" text,
    quantity integer,
    "redemptionStatusId" varchar,
    "statusCode" varchar,
    "statusName" varchar,
    remarks varchar,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "versionNo" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        r.redemption_id,
        r.redemption_number,
        s.subscription_id,
        s.subscription_number,

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
        ),

        u.primary_email,
        u.primary_phone,

        b.benefit_id,
        COALESCE(
            NULLIF(b.display_name, ''),
            b.benefit_name
        ),
        b.benefit_code,

        store.store_id,
        store.store_name,
        store.store_code,

        staff.staff_id,

        COALESCE(
            NULLIF(trim(su.display_name), ''),
            NULLIF(
                trim(
                    concat_ws(
                        ' ',
                        su.first_name,
                        su.middle_name,
                        su.last_name
                    )
                ),
                ''
            ),
            su.user_code
        ),

        staff.staff_code,

        r.redemption_datetime::text,
        r.quantity,
        r.redemption_status_id,
        st.status_code,
        st.status_name,
        r.remarks,
        r.created_at::text,
        r.created_by,
        r.updated_at::text,
        r.updated_by,
        r.version_no

    FROM "${schemaName}".redemptions r

    JOIN "${schemaName}".subscriptions s
      ON s.subscription_id = r.subscription_id

    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = s.organization_user_id

    JOIN "${schemaName}"."user" u
      ON u.user_id = ou.user_id

    JOIN "${schemaName}".benefits b
      ON b.benefit_id = r.benefit_id
     AND b.organization_id = ou.organization_id

    JOIN "${schemaName}".stores store
      ON store.store_id = r.store_id
     AND store.organization_id = ou.organization_id

    LEFT JOIN "${schemaName}".staff staff
      ON staff.staff_id = r.staff_id
     AND staff.organization_id = ou.organization_id

    LEFT JOIN "${schemaName}".organization_user sou
      ON sou.organization_user_id = staff.organization_user_id

    LEFT JOIN "${schemaName}"."user" su
      ON su.user_id = sou.user_id

    JOIN "${schemaName}".entity_status es
      ON es.entity_status_id = r.redemption_status_id

    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id

    WHERE ou.organization_id = p_organization_id

      AND "${schemaName}".rbac_has_capability(
          p_actor_user_id,
          p_organization_id,
          'COUNTER_ACCESS'
      )

      AND s.is_deleted = false

    ORDER BY
        r.redemption_datetime DESC,
        r.redemption_id;
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".get_counter_customers(varchar, varchar),
    "${schemaName}".get_counter_redemptions(varchar, varchar)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_counter_customers(varchar, varchar),
    "${schemaName}".get_counter_redemptions(varchar, varchar)
TO "${appRole}";
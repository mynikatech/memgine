CREATE OR REPLACE FUNCTION "${schemaName}".customer_purchase_subscription_authenticated(
    p_organization_id varchar,
    p_plan_id varchar,
    p_customer_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar,
    "subscriptionDate" text, "startDate" text, "endDate" text,
    "subscriptionStatusId" varchar, "totalAmount" double precision,
    "currencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
    v_organization_user_id varchar;
    v_customer_type_id varchar;
    v_active_relationship_status_id varchar;
    v_primary_phone varchar;
BEGIN
    IF NULLIF(trim(p_organization_id), '') IS NULL
       OR NULLIF(trim(p_plan_id), '') IS NULL
       OR NULLIF(trim(p_customer_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Membership purchase is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT u.primary_phone
      INTO v_primary_phone
      FROM "${schemaName}"."user" u
     WHERE u.user_id = p_customer_user_id
       AND NOT u.is_deleted
       AND u.user_status_id = 'entity-status-user-active';

    IF v_primary_phone IS NULL THEN
        RAISE EXCEPTION 'Customer account is unavailable'
            USING ERRCODE = 'P0002';
    END IF;

    /*
     * Coordinate with the existing link_customer_for_purchase path,
     * which serializes customer identity/relationship creation using
     * the normalized unique phone.
     */
    PERFORM pg_advisory_xact_lock(
        hashtextextended(v_primary_phone, 0)
    );

    IF NOT EXISTS (
        SELECT 1
          FROM "${schemaName}".organization o
          JOIN "${schemaName}".entity_status es
            ON es.entity_status_id = o.organization_status_id
          JOIN "${schemaName}".statuses s
            ON s.status_id = es.status_id
         WHERE o.organization_id = p_organization_id
           AND NOT o.is_deleted
           AND s.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Organization is unavailable'
            USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id
      INTO STRICT v_customer_type_id
      FROM "${schemaName}".organization_user_types
     WHERE organization_user_type_code = 'CUSTOMER'
       AND is_active = TRUE;

    SELECT es.entity_status_id
      INTO STRICT v_active_relationship_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses s
        ON s.status_id = es.status_id
     WHERE et.entity_type_code = 'ORGANIZATION_USER'
       AND s.status_code = 'ACTIVE'
       AND es.is_active = TRUE;

    /*
     * Prefer an existing active relationship.
     */
    SELECT ou.organization_user_id
      INTO v_organization_user_id
      FROM "${schemaName}".organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = p_customer_user_id
       AND ou.organization_user_type_id = v_customer_type_id
       AND NOT ou.is_deleted
       AND ou.organization_user_status_id = v_active_relationship_status_id
     ORDER BY ou.organization_user_id
     LIMIT 1
     FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        /*
         * A previous inactive/deleted relationship must not be
         * silently reactivated by a purchase.
         */
        IF EXISTS (
            SELECT 1
              FROM "${schemaName}".organization_user ou
             WHERE ou.organization_id = p_organization_id
               AND ou.user_id = p_customer_user_id
               AND ou.organization_user_type_id = v_customer_type_id
        ) THEN
            RAISE EXCEPTION 'Customer relationship is unavailable'
                USING ERRCODE = '42501';
        END IF;

        v_organization_user_id := gen_random_uuid()::text;

        INSERT INTO "${schemaName}".organization_user (
            organization_user_id,
            organization_id,
            user_id,
            organization_user_type_id,
            organization_user_status_id,
            joining_date,
            created_by,
            updated_by
        ) VALUES (
            v_organization_user_id,
            p_organization_id,
            p_customer_user_id,
            v_customer_type_id,
            v_active_relationship_status_id,
            CURRENT_DATE,
            p_customer_user_id,
            p_customer_user_id
        );
    END IF;

    RETURN QUERY
    SELECT *
      FROM "${schemaName}".purchase_membership_subscription(
          p_organization_id,
          p_plan_id,
          p_customer_user_id,
          NULL,
          NULL,
          NULL,
          NULL,
          p_customer_user_id
      );
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".customer_purchase_subscription_authenticated(
        varchar, varchar, varchar
    )
FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = '${appRole}'
    ) THEN
        GRANT EXECUTE ON FUNCTION
            "${schemaName}".customer_purchase_subscription_authenticated(
                varchar, varchar, varchar
            )
        TO "${appRole}";
    END IF;
END $grant$;
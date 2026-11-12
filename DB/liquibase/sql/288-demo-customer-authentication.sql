-- Platform-managed DEMO customer identities. Existing users remain REAL.
ALTER TABLE "${schemaName}"."user"
    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT FALSE;

-- Preserve the existing registration contract while making the normal-user
-- default explicit for installations whose table default was customized.
CREATE OR REPLACE FUNCTION "${schemaName}".auth_register_customer_user(
    p_phone varchar, p_first_name varchar, p_last_name varchar, p_primary_email varchar
)
RETURNS TABLE ("userId" varchar, "displayName" varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_phone varchar := btrim(p_phone);
    v_first_name varchar := btrim(p_first_name);
    v_last_name varchar := btrim(p_last_name);
    v_email varchar := NULLIF(lower(btrim(p_primary_email)), '');
    v_user_id varchar(64);
    v_user_code varchar(64);
    v_display_name varchar(255);
BEGIN
    IF v_phone IS NULL OR v_phone !~ '^\+[1-9][0-9]{7,14}$'
       OR NULLIF(v_first_name, '') IS NULL OR length(v_first_name) > 100
       OR NULLIF(v_last_name, '') IS NULL OR length(v_last_name) > 100
       OR (v_email IS NOT NULL AND length(v_email) > 254) THEN
        RAISE EXCEPTION 'Invalid registration details' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));
    IF EXISTS (SELECT 1 FROM "user" u WHERE u.primary_phone = v_phone AND NOT u.is_deleted) THEN
        RAISE EXCEPTION 'A Memgine account already exists for this mobile number' USING ERRCODE = '23505';
    END IF;
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM "user" u WHERE lower(u.primary_email) = v_email AND NOT u.is_deleted) THEN
        RAISE EXCEPTION 'A Memgine account already exists for this email' USING ERRCODE = '23505';
    END IF;
    v_user_id := generate_runtime_id('USR');
    v_user_code := generate_user_code(v_first_name, v_last_name);
    v_display_name := v_first_name || ' ' || v_last_name;
    INSERT INTO "user" (
        user_id, user_code, first_name, middle_name, last_name, display_name,
        primary_email, primary_phone, preferred_language_id, user_status_id, is_demo,
        created_at, created_by, updated_at, updated_by, is_deleted, version_no
    ) VALUES (
        v_user_id, v_user_code, v_first_name, NULL, v_last_name, v_display_name,
        v_email, v_phone, NULL, 'entity-status-user-active', FALSE,
        CURRENT_TIMESTAMP, v_user_id, CURRENT_TIMESTAMP, v_user_id, FALSE, 1
    );
    RETURN QUERY SELECT v_user_id, v_display_name;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_demo_customer_lookup(
    p_phone varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    "userId" varchar, "displayName" varchar, "primaryEmail" varchar,
    "primaryPhone" varchar, "isDemo" boolean, "otpDeliveryMode" varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform DEMO customer administration is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT u.user_id, COALESCE(u.display_name, concat_ws(' ', u.first_name, u.last_name))::varchar,
           u.primary_email, u.primary_phone, u.is_demo, u.otp_delivery_mode
      FROM "user" u
     WHERE u.primary_phone = btrim(p_phone)
       AND NOT u.is_deleted
     ORDER BY u.user_id
     LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_set_customer_demo(
    p_user_id varchar, p_is_demo boolean, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform DEMO customer administration is not permitted' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM "user" u
     WHERE u.user_id = p_user_id AND NOT u.is_deleted
       AND u.user_status_id = 'entity-status-user-active'
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active customer identity was not found' USING ERRCODE = 'P0002';
    END IF;
    IF p_is_demo AND (
        EXISTS (
            SELECT 1 FROM organization_user ou JOIN organization o ON o.organization_id = ou.organization_id
             WHERE ou.user_id = p_user_id AND NOT ou.is_deleted AND NOT o.is_deleted AND NOT o.is_demo
        ) OR EXISTS (
            SELECT 1 FROM commerce_transactions ct JOIN organization o ON o.organization_id = ct.organization_id
             WHERE ct.customer_user_id = p_user_id AND NOT ct.is_deleted AND NOT o.is_deleted AND NOT o.is_demo
        ) OR EXISTS (
            SELECT 1 FROM customer_support_requests sr JOIN organization o ON o.organization_id = sr.organization_id
             WHERE sr.customer_user_id = p_user_id AND NOT sr.is_deleted AND NOT o.is_deleted AND NOT o.is_demo
        )
    ) THEN
        RAISE EXCEPTION 'Customer has relationships or transactions with a REAL organization'
            USING ERRCODE = '23505';
    END IF;
    UPDATE "user" SET is_demo = p_is_demo, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE user_id = p_user_id;
    RETURN TRUE;
END;
$function$;

-- DEMO users can only read or acquire customer access for DEMO organizations.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_can_start_membership_purchase(
    p_organization_id varchar, p_customer_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT customer_is_active_global_user(p_customer_user_id)
       AND EXISTS (
           SELECT 1 FROM organization o
           JOIN entity_status es ON es.entity_status_id = o.organization_status_id
           JOIN statuses s ON s.status_id = es.status_id
          WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
            AND es.is_active AND s.status_code = 'ACTIVE'
            AND (NOT COALESCE((SELECT u.is_demo FROM "user" u WHERE u.user_id = p_customer_user_id), FALSE) OR o.is_demo)
       )
       AND (customer_has_active_relationship(p_organization_id, p_customer_user_id)
            OR NOT EXISTS (SELECT 1 FROM organization_user ou WHERE ou.organization_id = p_organization_id AND ou.user_id = p_customer_user_id));
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_relationships(p_user_id varchar)
RETURNS TABLE (
    "organizationUserId" varchar, "organizationId" varchar, "organizationName" text,
    "userId" varchar, "userCode" varchar, "firstName" varchar, "middleName" varchar,
    "lastName" varchar, "displayName" varchar, "primaryEmail" varchar, "primaryPhone" varchar,
    "userStatusId" varchar, "userStatusName" varchar, "organizationUserTypeId" varchar,
    "organizationUserStatusId" varchar, "relationshipStatusName" varchar, "joiningDate" text,
    "subscriptionCount" integer, "membershipName" text
) LANGUAGE sql STABLE AS $function$
    SELECT ou.organization_user_id, o.organization_id,
        COALESCE(NULLIF(o.organization_display_name, ''), o.organization_name)::text,
        u.user_id, u.user_code, u.first_name, u.middle_name, u.last_name, u.display_name,
        u.primary_email, u.primary_phone, u.user_status_id, us.status_name,
        ou.organization_user_type_id, ou.organization_user_status_id, os.status_name,
        ou.joining_date::text,
        (SELECT count(*)::integer FROM "${schemaName}".subscriptions s
          WHERE s.organization_user_id = ou.organization_user_id AND NOT s.is_deleted),
        (SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name), ', ')
           FROM "${schemaName}".subscriptions s
           JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
           JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
          WHERE s.organization_user_id = ou.organization_user_id AND NOT s.is_deleted)
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}".organization o ON o.organization_id = ou.organization_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".organization_user_types ot ON ot.organization_user_type_id = ou.organization_user_type_id
    JOIN "${schemaName}".entity_status ues ON ues.entity_status_id = u.user_status_id
    JOIN "${schemaName}".statuses us ON us.status_id = ues.status_id
    JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
    JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
    JOIN "${schemaName}".entity_status ges ON ges.entity_status_id = o.organization_status_id
    JOIN "${schemaName}".statuses gs ON gs.status_id = ges.status_id
    WHERE ou.user_id = p_user_id AND ot.organization_user_type_code = 'CUSTOMER'
      AND NOT ou.is_deleted AND NOT u.is_deleted AND NOT o.is_deleted
      AND us.status_code = 'ACTIVE' AND os.status_code = 'ACTIVE' AND gs.status_code = 'ACTIVE'
      AND (NOT u.is_demo OR o.is_demo)
    ORDER BY o.organization_name, o.organization_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".link_customer_for_purchase(
    p_organization_id varchar, p_first_name varchar, p_last_name varchar,
    p_primary_email varchar, p_primary_phone varchar
) RETURNS varchar LANGUAGE plpgsql AS $function$
DECLARE
    v_phone varchar := trim(p_primary_phone);
    v_email varchar := NULLIF(lower(trim(p_primary_email)), '');
    v_user_id varchar;
    v_org_user_id varchar;
    v_type_id varchar;
    v_user_status varchar;
    v_relation_status varchar;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization o JOIN "${schemaName}".entity_status es ON es.entity_status_id = o.organization_status_id JOIN "${schemaName}".statuses st ON st.status_id = es.status_id WHERE o.organization_id = p_organization_id AND NOT o.is_deleted AND st.status_code = 'ACTIVE')
       OR NULLIF(trim(p_first_name), '') IS NULL OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254) THEN
        RAISE EXCEPTION 'Invalid organization or customer details' USING ERRCODE = '22023';
    END IF;
    SELECT organization_user_type_id INTO STRICT v_type_id FROM "${schemaName}".organization_user_types WHERE organization_user_type_code = 'CUSTOMER' AND is_active = true;
    SELECT es.entity_status_id INTO STRICT v_user_status FROM "${schemaName}".entity_status es JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id JOIN "${schemaName}".statuses st ON st.status_id = es.status_id WHERE et.entity_type_code = 'USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    SELECT es.entity_status_id INTO STRICT v_relation_status FROM "${schemaName}".entity_status es JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id JOIN "${schemaName}".statuses st ON st.status_id = es.status_id WHERE et.entity_type_code = 'ORGANIZATION_USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));
    SELECT user_id INTO v_user_id FROM "${schemaName}"."user" WHERE primary_phone = v_phone AND NOT is_deleted FOR UPDATE;
    IF EXISTS (SELECT 1 FROM "${schemaName}"."user" u JOIN "${schemaName}".organization o ON o.organization_id = p_organization_id WHERE u.user_id = v_user_id AND u.is_demo AND NOT o.is_demo) THEN
        RAISE EXCEPTION 'DEMO customers cannot be linked to a REAL organization' USING ERRCODE = '42501';
    END IF;
    IF v_email IS NOT NULL AND EXISTS (SELECT 1 FROM "${schemaName}"."user" WHERE lower(primary_email) = v_email AND NOT is_deleted AND (v_user_id IS NULL OR user_id <> v_user_id)) THEN
        RAISE EXCEPTION 'Email belongs to another user' USING ERRCODE = '23505';
    END IF;
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}"."user" (user_id,user_code,first_name,last_name,display_name,primary_email,primary_phone,user_status_id,created_by,updated_by)
        VALUES (v_user_id,'USR-' || replace(v_user_id, '-', ''),trim(p_first_name),trim(p_last_name),trim(p_first_name) || ' ' || trim(p_last_name),v_email,v_phone,v_user_status,v_user_id,v_user_id);
    END IF;
    SELECT organization_user_id INTO v_org_user_id FROM "${schemaName}".organization_user WHERE organization_id = p_organization_id AND user_id = v_user_id AND organization_user_type_id = v_type_id ORDER BY is_deleted, organization_user_id LIMIT 1 FOR UPDATE;
    IF v_org_user_id IS NULL THEN
        v_org_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}".organization_user (organization_user_id,organization_id,user_id,organization_user_type_id,organization_user_status_id,created_by,updated_by)
        VALUES (v_org_user_id,p_organization_id,v_user_id,v_type_id,v_relation_status,v_user_id,v_user_id);
    ELSE
        UPDATE "${schemaName}".organization_user SET is_deleted = false, organization_user_status_id = v_relation_status, updated_at = CURRENT_TIMESTAMP, updated_by = v_user_id, version_no = version_no + 1 WHERE organization_user_id = v_org_user_id AND is_deleted = true;
    END IF;
    RETURN v_org_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".platform_demo_customer_lookup(varchar,varchar),
    "${schemaName}".platform_set_customer_demo(varchar,boolean,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_demo_customer_lookup(varchar,varchar),
    "${schemaName}".platform_set_customer_demo(varchar,boolean,varchar) TO "${appRole}";

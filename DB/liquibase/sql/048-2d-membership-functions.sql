-- Batch 2D: organization-owned membership products, plans and benefit assignments.
-- The existing tables and EntityStatus reference data are authoritative.

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_membership_products(p_organization_id varchar)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "membershipProductCode" varchar,
    "membershipProductName" varchar, "displayName" varchar,
    "productCategoryId" varchar, "productTypeId" varchar,
    tier varchar, "tierSequence" integer, description varchar,
    "productStatusId" varchar, "effectiveDate" text, "expiryDate" text,
    "createdAt" text, "createdBy" varchar, "updatedAt" text,
    "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT mp.membership_product_id, mp.organization_id,
        mp.membership_product_code, mp.membership_product_name,
        mp.display_name, mp.product_category_id, mp.product_type_id,
        mp.tier, mp.tier_sequence, mp.description, mp.product_status_id,
        mp.effective_date::text, mp.expiry_date::text,
        mp.created_at::text, mp.created_by, mp.updated_at::text,
        mp.updated_by, mp.is_deleted, mp.version_no
    FROM "${schemaName}".membership_products mp
    WHERE mp.organization_id = p_organization_id AND mp.is_deleted = false
    ORDER BY mp.tier_sequence NULLS LAST, mp.membership_product_name, mp.membership_product_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_subscription_plans(
    p_organization_id varchar, p_membership_product_id varchar
)
RETURNS TABLE (
    id varchar, "membershipProductId" varchar, "subscriptionPlanCode" varchar,
    "subscriptionPlanName" varchar, description varchar,
    "subscriptionPeriod" integer, "subscriptionPeriodUnit" varchar,
    price numeric, "currencyId" varchar, "currencyCode" varchar,
    "subscriptionPlanStatusId" varchar, "effectiveDate" text,
    "expiryDate" text, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT sp.subscription_plan_id, sp.membership_product_id,
        sp.subscription_plan_code, sp.subscription_plan_name, sp.description,
        sp.subscription_period, sp.subscription_period_unit, sp.price,
        sp.currency_id, c.currency_code, sp.subscription_plan_status_id,
        sp.effective_date::text, sp.expiry_date::text,
        sp.created_at::text, sp.created_by, sp.updated_at::text,
        sp.updated_by, sp.is_deleted, sp.version_no
    FROM "${schemaName}".subscription_plans sp
    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = sp.membership_product_id
    JOIN "${schemaName}".currencies c ON c.currency_id = sp.currency_id
    WHERE mp.organization_id = p_organization_id
      AND mp.membership_product_id = p_membership_product_id
      AND mp.is_deleted = false AND sp.is_deleted = false
    ORDER BY sp.subscription_plan_name, sp.subscription_plan_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_membership_benefit_ids(
    p_organization_id varchar, p_membership_product_id varchar
)
RETURNS TABLE ("benefitId" varchar)
LANGUAGE sql STABLE AS $function$
    SELECT link.benefit_id
    FROM "${schemaName}".membership_product_benefits link
    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = link.membership_product_id
    JOIN "${schemaName}".benefits b ON b.benefit_id = link.benefit_id
    WHERE mp.organization_id = p_organization_id
      AND mp.membership_product_id = p_membership_product_id
      AND b.organization_id = p_organization_id
      AND mp.is_deleted = false AND b.is_deleted = false AND link.is_deleted = false
    ORDER BY link.display_sequence, link.membership_product_benefit_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_membership_product(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_display_name varchar, p_category_id varchar, p_type_id varchar,
    p_tier varchar, p_tier_sequence integer, p_description varchar,
    p_status_id varchar, p_effective_date date, p_expiry_date date,
    p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 40
       OR nullif(trim(p_code), '') IS NULL OR length(p_code) > 30
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date
       OR p_tier_sequence < 1 THEN
        RAISE EXCEPTION 'Invalid membership product fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".product_categories
                   WHERE product_category_id = p_category_id AND is_active = true)
       OR NOT EXISTS (SELECT 1 FROM "${schemaName}".product_types
                      WHERE product_type_id = p_type_id AND is_active = true)
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".entity_status es
           JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
           WHERE es.entity_status_id = p_status_id
             AND et.entity_type_code = 'MEMBERSHIP_PRODUCT' AND es.is_active = true
       ) THEN
        RAISE EXCEPTION 'Invalid membership category, type or status' USING ERRCODE = '22023';
    END IF;
    IF p_create THEN
        INSERT INTO "${schemaName}".membership_products (
            membership_product_id, organization_id, membership_product_code,
            membership_product_name, display_name, product_category_id,
            product_type_id, tier, tier_sequence, description, product_status_id,
            effective_date, expiry_date, created_by, updated_by
        ) VALUES (
            p_id, p_organization_id, p_code, p_name, p_display_name, p_category_id,
            p_type_id, p_tier, p_tier_sequence, p_description, p_status_id,
            p_effective_date, p_expiry_date, p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".membership_products SET
            membership_product_code = p_code, membership_product_name = p_name,
            display_name = p_display_name, product_category_id = p_category_id,
            product_type_id = p_type_id, tier = p_tier,
            tier_sequence = p_tier_sequence, description = p_description,
            product_status_id = p_status_id, effective_date = p_effective_date,
            expiry_date = p_expiry_date, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE membership_product_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Membership product not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_subscription_plan(
    p_organization_id varchar, p_membership_product_id varchar, p_id varchar,
    p_code varchar, p_name varchar, p_description varchar, p_period integer,
    p_period_unit varchar, p_price numeric, p_currency_id varchar,
    p_status_id varchar, p_effective_date date, p_expiry_date date,
    p_version_no integer, p_actor_user_id varchar, p_create boolean
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".membership_products
                   WHERE membership_product_id = p_membership_product_id
                     AND organization_id = p_organization_id AND is_deleted = false) THEN
        RAISE EXCEPTION 'Membership product not found in organization' USING ERRCODE = 'P0002';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 40
       OR nullif(trim(p_code), '') IS NULL OR length(p_code) > 30
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_period IS NULL OR p_period < 1 OR nullif(trim(p_period_unit), '') IS NULL
       OR p_price IS NULL OR p_price < 0 OR p_effective_date IS NULL
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid subscription plan fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".currencies
                   WHERE currency_id = p_currency_id AND is_active = true)
       OR NOT EXISTS (
           SELECT 1 FROM "${schemaName}".entity_status es
           JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
           WHERE es.entity_status_id = p_status_id
             AND et.entity_type_code = 'SUBSCRIPTION_PLAN' AND es.is_active = true
       ) THEN
        RAISE EXCEPTION 'Invalid subscription plan currency or status' USING ERRCODE = '22023';
    END IF;
    IF p_create THEN
        INSERT INTO "${schemaName}".subscription_plans (
            subscription_plan_id, membership_product_id, subscription_plan_code,
            subscription_plan_name, description, subscription_period,
            subscription_period_unit, price, currency_id,
            subscription_plan_status_id, effective_date, expiry_date,
            created_by, updated_by
        ) VALUES (
            p_id, p_membership_product_id, p_code, p_name, p_description,
            p_period, p_period_unit, p_price, p_currency_id, p_status_id,
            p_effective_date, p_expiry_date, p_actor_user_id, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".subscription_plans SET
            subscription_plan_code = p_code, subscription_plan_name = p_name,
            description = p_description, subscription_period = p_period,
            subscription_period_unit = p_period_unit, price = p_price,
            currency_id = p_currency_id, subscription_plan_status_id = p_status_id,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE subscription_plan_id = p_id
          AND membership_product_id = p_membership_product_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Subscription plan not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_subscription_plan(
    p_organization_id varchar, p_membership_product_id varchar,
    p_plan_id varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".subscription_plans sp SET
        is_deleted = true, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = sp.version_no + 1
    FROM "${schemaName}".membership_products mp
    WHERE sp.subscription_plan_id = p_plan_id
      AND sp.membership_product_id = p_membership_product_id
      AND mp.membership_product_id = sp.membership_product_id
      AND mp.organization_id = p_organization_id
      AND mp.is_deleted = false AND sp.is_deleted = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Subscription plan not found in organization' USING ERRCODE = 'P0002';
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".assign_organization_membership_benefit(
    p_organization_id varchar, p_membership_product_id varchar,
    p_benefit_id varchar, p_display_sequence integer, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_organization_user_id varchar; v_status_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF p_display_sequence IS NULL OR p_display_sequence < 1 THEN
        RAISE EXCEPTION 'Invalid Benefit display sequence' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".membership_products
                   WHERE membership_product_id = p_membership_product_id
                     AND organization_id = p_organization_id AND is_deleted = false)
       OR NOT EXISTS (SELECT 1 FROM "${schemaName}".benefits
                      WHERE benefit_id = p_benefit_id
                        AND organization_id = p_organization_id AND is_deleted = false
                        AND benefit_status_id IN (
                            SELECT es.entity_status_id
                            FROM "${schemaName}".entity_status es
                            JOIN "${schemaName}".statuses s ON s.status_id = es.status_id
                            WHERE s.status_code = 'ACTIVE'
                        )) THEN
        RAISE EXCEPTION 'Membership product or Benefit does not belong to organization'
            USING ERRCODE = '23503';
    END IF;
    SELECT ou.organization_user_id INTO v_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id AND ou.user_id = p_actor_user_id
      AND ou.is_deleted = false
    LIMIT 1;
    IF v_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Actor has no organization user for Benefit assignment'
            USING ERRCODE = '42501';
    END IF;
    SELECT es.entity_status_id INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses s ON s.status_id = es.status_id
    WHERE et.entity_type_code = 'MEMBERSHIP_PRODUCT_BENEFIT'
      AND s.status_code = 'ACTIVE' AND es.is_active = true
    LIMIT 1;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Active Membership Benefit status is unavailable'
            USING ERRCODE = '22023';
    END IF;
    INSERT INTO "${schemaName}".membership_product_benefits (
        membership_product_benefit_id, membership_product_id, benefit_id,
        display_sequence, mandatory_benefit, status_id, created_by, updated_by
    ) VALUES (
        'mpb-' || md5(p_membership_product_id || ':' || p_benefit_id),
        p_membership_product_id, p_benefit_id, p_display_sequence,
        true, v_status_id,
        v_organization_user_id, v_organization_user_id
    )
    ON CONFLICT (membership_product_id, benefit_id) DO UPDATE SET
        display_sequence = EXCLUDED.display_sequence, is_deleted = false,
        status_id = v_status_id,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_organization_user_id,
        version_no = "${schemaName}".membership_product_benefits.version_no + 1;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_membership_benefit(
    p_organization_id varchar, p_membership_product_id varchar,
    p_benefit_id varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_organization_user_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    SELECT ou.organization_user_id INTO v_organization_user_id
    FROM "${schemaName}".organization_user ou
    WHERE ou.organization_id = p_organization_id AND ou.user_id = p_actor_user_id
      AND ou.is_deleted = false LIMIT 1;
    UPDATE "${schemaName}".membership_product_benefits link SET
        is_deleted = true, updated_at = CURRENT_TIMESTAMP,
        updated_by = v_organization_user_id, version_no = link.version_no + 1
    FROM "${schemaName}".membership_products mp
    WHERE link.membership_product_id = p_membership_product_id
      AND link.benefit_id = p_benefit_id
      AND mp.membership_product_id = link.membership_product_id
      AND mp.organization_id = p_organization_id
      AND mp.is_deleted = false AND link.is_deleted = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership Benefit assignment not found in organization'
            USING ERRCODE = 'P0002';
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_membership_product(
    p_organization_id varchar, p_membership_product_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    UPDATE "${schemaName}".membership_products SET
        is_deleted = true, updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = version_no + 1
    WHERE membership_product_id = p_membership_product_id
      AND organization_id = p_organization_id AND is_deleted = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Membership product not found in organization' USING ERRCODE = 'P0002';
    END IF;
    RETURN true;
END;
$function$;

DO $$
DECLARE f record;
BEGIN
    FOR f IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = '${schemaName}'
          AND p.proname IN (
              'get_organization_membership_products',
              'get_organization_subscription_plans',
              'get_organization_membership_benefit_ids',
              'save_organization_membership_product',
              'save_organization_subscription_plan',
              'delete_organization_subscription_plan',
              'assign_organization_membership_benefit',
              'delete_organization_membership_benefit',
              'delete_organization_membership_product'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
                       '${schemaName}', f.proname, f.args);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',
                       '${schemaName}', f.proname, f.args, '${appRole}');
    END LOOP;
END $$;

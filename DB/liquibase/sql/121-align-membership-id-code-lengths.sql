CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_membership_product(
    p_organization_id varchar,
    p_id varchar,
    p_code varchar,
    p_name varchar,
    p_display_name varchar,
    p_category_id varchar,
    p_type_id varchar,
    p_tier varchar,
    p_tier_sequence integer,
    p_description varchar,
    p_status_id varchar,
    p_effective_date date,
    p_expiry_date date,
    p_version_no integer,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    IF nullif(trim(p_id), '') IS NULL
       OR length(p_id) > 64
       OR nullif(trim(p_code), '') IS NULL
       OR length(p_code) > 64
       OR nullif(trim(p_name), '') IS NULL
       OR length(p_name) > 100
       OR p_effective_date IS NULL
       OR p_expiry_date < p_effective_date
       OR p_tier_sequence < 1 THEN
        RAISE EXCEPTION 'Invalid membership product fields'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".product_categories
        WHERE product_category_id = p_category_id
          AND is_active = true
    )
    OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".product_types
        WHERE product_type_id = p_type_id
          AND is_active = true
    )
    OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et
          ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'MEMBERSHIP_PRODUCT'
          AND es.is_active = true
    ) THEN
        RAISE EXCEPTION 'Invalid membership category, type or status'
            USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        INSERT INTO "${schemaName}".membership_products (
            membership_product_id,
            organization_id,
            membership_product_code,
            membership_product_name,
            display_name,
            product_category_id,
            product_type_id,
            tier,
            tier_sequence,
            description,
            product_status_id,
            effective_date,
            expiry_date,
            created_by,
            updated_by
        )
        VALUES (
            p_id,
            p_organization_id,
            p_code,
            p_name,
            p_display_name,
            p_category_id,
            p_type_id,
            p_tier,
            p_tier_sequence,
            p_description,
            p_status_id,
            p_effective_date,
            p_expiry_date,
            p_actor_user_id,
            p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".membership_products
        SET
            membership_product_code = p_code,
            membership_product_name = p_name,
            display_name = p_display_name,
            product_category_id = p_category_id,
            product_type_id = p_type_id,
            tier = p_tier,
            tier_sequence = p_tier_sequence,
            description = p_description,
            product_status_id = p_status_id,
            effective_date = p_effective_date,
            expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE membership_product_id = p_id
          AND organization_id = p_organization_id
          AND is_deleted = false
          AND version_no = p_version_no;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Membership product not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_subscription_plan(
    p_organization_id varchar,
    p_membership_product_id varchar,
    p_id varchar,
    p_code varchar,
    p_name varchar,
    p_description varchar,
    p_period integer,
    p_period_unit varchar,
    p_price numeric,
    p_currency_id varchar,
    p_status_id varchar,
    p_effective_date date,
    p_expiry_date date,
    p_version_no integer,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".membership_products
        WHERE membership_product_id = p_membership_product_id
          AND organization_id = p_organization_id
          AND is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Membership product not found in organization'
            USING ERRCODE = 'P0002';
    END IF;

    IF nullif(trim(p_id), '') IS NULL
       OR length(p_id) > 64
       OR nullif(trim(p_code), '') IS NULL
       OR length(p_code) > 64
       OR nullif(trim(p_name), '') IS NULL
       OR length(p_name) > 100
       OR p_period IS NULL
       OR p_period < 1
       OR nullif(trim(p_period_unit), '') IS NULL
       OR p_price IS NULL
       OR p_price < 0
       OR p_effective_date IS NULL
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid subscription plan fields'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".currencies
        WHERE currency_id = p_currency_id
          AND is_active = true
    )
    OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et
          ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'SUBSCRIPTION_PLAN'
          AND es.is_active = true
    ) THEN
        RAISE EXCEPTION 'Invalid subscription plan currency or status'
            USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        INSERT INTO "${schemaName}".subscription_plans (
            subscription_plan_id,
            membership_product_id,
            subscription_plan_code,
            subscription_plan_name,
            description,
            subscription_period,
            subscription_period_unit,
            price,
            currency_id,
            subscription_plan_status_id,
            effective_date,
            expiry_date,
            created_by,
            updated_by
        )
        VALUES (
            p_id,
            p_membership_product_id,
            p_code,
            p_name,
            p_description,
            p_period,
            p_period_unit,
            p_price,
            p_currency_id,
            p_status_id,
            p_effective_date,
            p_expiry_date,
            p_actor_user_id,
            p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".subscription_plans
        SET
            subscription_plan_code = p_code,
            subscription_plan_name = p_name,
            description = p_description,
            subscription_period = p_period,
            subscription_period_unit = p_period_unit,
            price = p_price,
            currency_id = p_currency_id,
            subscription_plan_status_id = p_status_id,
            effective_date = p_effective_date,
            expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE subscription_plan_id = p_id
          AND membership_product_id = p_membership_product_id
          AND is_deleted = false
          AND version_no = p_version_no;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Subscription plan not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN true;
END;
$function$;
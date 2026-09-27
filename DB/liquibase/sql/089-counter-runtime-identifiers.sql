-- ============================================================================
-- Memgine - Counter runtime identifiers and hierarchical business numbers
--
-- User ID:
--     USR_<UUID>
--
-- User code:
--     USR_<F2L2>_<000001>
--
-- Organization User ID:
--     OUS_<UUID>
--
-- Subscription ID:
--     SUB_<UUID>
--
-- Subscription number:
--     <ORG_CODE>_SUB_<USER_CODE without USR_>_<001>
--
-- Redemption ID:
--     RDM_<UUID>
--
-- Redemption number:
--     <SUBSCRIPTION_NUMBER>_RDM_<001>
-- ============================================================================


-- ============================================================================
-- 1. Counter prospective customer
-- ============================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_create_prospective_customer(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_first_name varchar,
    p_middle_name varchar,
    p_last_name varchar,
    p_display_name varchar,
    p_primary_email varchar,
    p_primary_phone varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
AS $function$
DECLARE
    v_email varchar := NULLIF(lower(trim(p_primary_email)), '');
    v_phone varchar := trim(p_primary_phone);

    v_user_id varchar(64);
    v_organization_user_id varchar(64);

    v_customer_type_id varchar;
    v_user_status_id varchar;
    v_relationship_status_id varchar;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NULLIF(trim(p_first_name), '') IS NULL
       OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL
       OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL
       OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254)
       OR (p_middle_name IS NOT NULL AND length(p_middle_name) > 100)
       OR (p_display_name IS NOT NULL AND length(p_display_name) > 150)
    THEN
        RAISE EXCEPTION
            'Invalid prospective customer fields'
            USING ERRCODE = '22023';
    END IF;

    SELECT organization_user_type_id
    INTO STRICT v_customer_type_id
    FROM "${schemaName}".organization_user_types
    WHERE organization_user_type_code = 'CUSTOMER'
      AND is_active = true;

    SELECT es.entity_status_id
    INTO STRICT v_user_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'USER'
      AND st.status_code = 'ACTIVE'
      AND es.is_active = true;

    SELECT es.entity_status_id
    INTO STRICT v_relationship_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'ORGANIZATION_USER'
      AND st.status_code = 'ACTIVE'
      AND es.is_active = true;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));

    SELECT user_id
    INTO v_user_id
    FROM "${schemaName}"."user"
    WHERE primary_phone = v_phone
      AND is_deleted = false
    ORDER BY user_id
    LIMIT 1
    FOR UPDATE;

    IF v_email IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM "${schemaName}"."user"
            WHERE lower(primary_email) = v_email
              AND is_deleted = false
              AND (v_user_id IS NULL OR user_id <> v_user_id)
       )
    THEN
        RAISE EXCEPTION
            'Email belongs to another user; resolve identity before linking'
            USING ERRCODE = '23505';
    END IF;

    IF v_user_id IS NULL THEN
        v_user_id := "${schemaName}".generate_runtime_id('USR');

        INSERT INTO "${schemaName}"."user" (
            user_id,
            user_code,
            first_name,
            middle_name,
            last_name,
            display_name,
            primary_email,
            primary_phone,
            user_status_id,
            created_by,
            updated_by
        )
        VALUES (
            v_user_id,
            "${schemaName}".generate_user_code(
                trim(p_first_name),
                trim(p_last_name)
            ),
            trim(p_first_name),
            NULLIF(trim(p_middle_name), ''),
            trim(p_last_name),
            COALESCE(
                NULLIF(trim(p_display_name), ''),
                trim(p_first_name) || ' ' || trim(p_last_name)
            ),
            v_email,
            v_phone,
            v_user_status_id,
            p_actor_user_id,
            p_actor_user_id
        );
    END IF;

    SELECT organization_user_id
    INTO v_organization_user_id
    FROM "${schemaName}".organization_user
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id
      AND organization_user_type_id = v_customer_type_id
    ORDER BY is_deleted, organization_user_id
    LIMIT 1
    FOR UPDATE;

    IF v_organization_user_id IS NULL THEN
        v_organization_user_id :=
            "${schemaName}".generate_runtime_id('OUS');

        INSERT INTO "${schemaName}".organization_user (
            organization_user_id,
            organization_id,
            user_id,
            organization_user_type_id,
            organization_user_status_id,
            created_by,
            updated_by
        )
        VALUES (
            v_organization_user_id,
            p_organization_id,
            v_user_id,
            v_customer_type_id,
            v_relationship_status_id,
            p_actor_user_id,
            p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".organization_user
        SET is_deleted = false,
            organization_user_status_id = v_relationship_status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE organization_user_id = v_organization_user_id
          AND is_deleted = true;
    END IF;

    RETURN v_organization_user_id;
END;
$function$;


-- ============================================================================
-- 2. Counter subscription purchase
-- ============================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_purchase_subscription(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_plan_id varchar,
    p_customer_user_id varchar,
    p_first_name varchar,
    p_last_name varchar,
    p_primary_email varchar,
    p_primary_phone varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "subscriptionId" varchar,
    "organizationUserId" varchar,
    "userId" varchar,
    "subscriptionNumber" varchar,
    "subscriptionPlanId" varchar,
    "subscriptionDate" text,
    "startDate" text,
    "endDate" text,
    "subscriptionStatusId" varchar,
    "totalAmount" double precision,
    "currencyCode" varchar
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_organization_user_id varchar(64);
    v_user_id varchar(64);
    v_user_code varchar(64);
    v_org_code varchar(64);

    v_product_id varchar;
    v_period integer;
    v_unit varchar;
    v_price numeric(12,2);
    v_currency varchar;
    v_status_id varchar;

    v_subscription_id varchar(64);
    v_subscription_number varchar(64);
    v_subscription_number_candidate text;
    v_subscription_seq bigint;

    v_end_date date;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT
        mp.membership_product_id,
        sp.subscription_period,
        sp.subscription_period_unit,
        sp.price,
        c.currency_code,
        o.organization_code
    INTO
        v_product_id,
        v_period,
        v_unit,
        v_price,
        v_currency,
        v_org_code
    FROM "${schemaName}".subscription_plans sp
    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = sp.membership_product_id
    JOIN "${schemaName}".organization o
      ON o.organization_id = mp.organization_id
    JOIN "${schemaName}".currencies c
      ON c.currency_id = sp.currency_id
     AND c.is_active = true
    JOIN "${schemaName}".entity_status pse
      ON pse.entity_status_id = sp.subscription_plan_status_id
    JOIN "${schemaName}".statuses ps
      ON ps.status_id = pse.status_id
    JOIN "${schemaName}".entity_status mse
      ON mse.entity_status_id = mp.product_status_id
    JOIN "${schemaName}".statuses ms
      ON ms.status_id = mse.status_id
    WHERE sp.subscription_plan_id = p_plan_id
      AND mp.organization_id = p_organization_id
      AND sp.is_deleted = false
      AND mp.is_deleted = false
      AND ps.status_code = 'ACTIVE'
      AND ms.status_code = 'ACTIVE'
      AND sp.effective_date <= CURRENT_DATE
      AND (
          sp.expiry_date IS NULL
          OR sp.expiry_date >= CURRENT_DATE
      )
      AND mp.effective_date <= CURRENT_DATE
      AND (
          mp.expiry_date IS NULL
          OR mp.expiry_date >= CURRENT_DATE
      );

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION
            'Membership plan is unavailable for this organization'
            USING ERRCODE = '22023';
    END IF;

    IF v_period < 1
       OR lower(v_unit) NOT IN (
           'day','days',
           'week','weeks',
           'month','months',
           'year','years'
       )
    THEN
        RAISE EXCEPTION
            'Membership plan has an invalid subscription period'
            USING ERRCODE = '22023';
    END IF;

    SELECT es.entity_status_id
    INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'SUBSCRIPTION'
      AND st.status_code = 'ACTIVE'
      AND es.is_active = true;

    IF v_status_id IS NULL THEN
        RAISE EXCEPTION
            'Active subscription status is not configured'
            USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NULL THEN
        v_organization_user_id :=
            "${schemaName}".counter_create_prospective_customer(
                p_organization_id,
                p_store_id,
                p_staff_id,
                p_first_name,
                NULL,
                p_last_name,
                NULL,
                p_primary_email,
                p_primary_phone,
                p_actor_user_id
            );
    ELSE
        SELECT ou.organization_user_id
        INTO v_organization_user_id
        FROM "${schemaName}".organization_user ou
        JOIN "${schemaName}"."user" u
          ON u.user_id = ou.user_id
        JOIN "${schemaName}".organization_user_types ot
          ON ot.organization_user_type_id =
             ou.organization_user_type_id
        JOIN "${schemaName}".entity_status oes
          ON oes.entity_status_id =
             ou.organization_user_status_id
        JOIN "${schemaName}".statuses os
          ON os.status_id = oes.status_id
        WHERE ou.organization_id = p_organization_id
          AND ou.user_id = p_customer_user_id
          AND ot.organization_user_type_code = 'CUSTOMER'
          AND ou.is_deleted = false
          AND u.is_deleted = false
          AND os.status_code = 'ACTIVE'
        FOR UPDATE OF ou;

        IF v_organization_user_id IS NULL THEN
            RAISE EXCEPTION
                'Customer is not active in this organization'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT
        ou.user_id,
        u.user_code
    INTO
        v_user_id,
        v_user_code
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u
      ON u.user_id = ou.user_id
    WHERE ou.organization_user_id = v_organization_user_id
    FOR UPDATE OF ou;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}"."user" u
        JOIN "${schemaName}".entity_status es
          ON es.entity_status_id = u.user_status_id
        JOIN "${schemaName}".statuses st
          ON st.status_id = es.status_id
        WHERE u.user_id = v_user_id
          AND u.is_deleted = false
          AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION
            'Customer account is not active'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "${schemaName}".subscriptions s
        JOIN "${schemaName}".subscription_plans sp
          ON sp.subscription_plan_id = s.subscription_plan_id
        JOIN "${schemaName}".entity_status es
          ON es.entity_status_id = s.subscription_status_id
        JOIN "${schemaName}".statuses st
          ON st.status_id = es.status_id
        WHERE s.organization_user_id = v_organization_user_id
          AND sp.membership_product_id = v_product_id
          AND s.is_deleted = false
          AND st.status_code = 'ACTIVE'
          AND s.end_date >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION
            'Customer already has an active subscription for this membership'
            USING ERRCODE = '23505';
    END IF;

    v_end_date :=
        CURRENT_DATE +
        CASE lower(v_unit)
            WHEN 'day'
                THEN make_interval(days => v_period)
            WHEN 'days'
                THEN make_interval(days => v_period)
            WHEN 'week'
                THEN make_interval(days => v_period * 7)
            WHEN 'weeks'
                THEN make_interval(days => v_period * 7)
            WHEN 'month'
                THEN make_interval(months => v_period)
            WHEN 'months'
                THEN make_interval(months => v_period)
            WHEN 'year'
                THEN make_interval(years => v_period)
            ELSE
                make_interval(years => v_period)
        END;

    v_subscription_id :=
        "${schemaName}".generate_runtime_id('SUB');

    v_subscription_seq :=
        "${schemaName}".next_business_sequence(
            'SUBSCRIPTION',
            v_organization_user_id
        );

    v_subscription_number_candidate :=
        v_org_code
        || '_SUB_'
        || regexp_replace(v_user_code, '^USR_', '')
        || '_'
        || lpad(v_subscription_seq::text, 3, '0');

    IF length(v_subscription_number_candidate) > 64 THEN
        RAISE EXCEPTION
            'Generated subscription number exceeds 64 characters: %',
            v_subscription_number_candidate
            USING ERRCODE = '22023';
    END IF;

    v_subscription_number :=
        v_subscription_number_candidate::varchar(64);

    INSERT INTO "${schemaName}".subscriptions (
        subscription_id,
        subscription_number,
        subscription_plan_id,
        organization_user_id,
        subscription_date,
        start_date,
        end_date,
        subscription_status_id,
        total_amount,
        created_by,
        updated_by
    )
    VALUES (
        v_subscription_id,
        v_subscription_number,
        p_plan_id,
        v_organization_user_id,
        CURRENT_DATE,
        CURRENT_DATE,
        v_end_date,
        v_status_id,
        v_price,
        p_actor_user_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        v_subscription_id,
        v_organization_user_id,
        v_user_id,
        v_subscription_number,
        p_plan_id,
        CURRENT_DATE::text,
        CURRENT_DATE::text,
        v_end_date::text,
        v_status_id,
        v_price::double precision,
        v_currency;
END;
$function$;


-- ============================================================================
-- 3. Redemption
-- ============================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_redeem_benefits(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_subscription_id varchar,
    p_benefit_ids varchar[],
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionId" varchar,
    "benefitId" varchar,
    "redemptionNumber" varchar
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_benefit_id varchar;
    v_redemption_id varchar(64);
    v_redemption_number varchar(64);
    v_redemption_number_candidate text;
    v_subscription_number varchar(64);
    v_status_id varchar;
    v_reason text;
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION
            'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_benefit_ids IS NULL
       OR cardinality(p_benefit_ids) = 0
       OR EXISTS (
            SELECT 1
            FROM unnest(p_benefit_ids) id
            WHERE id IS NULL OR trim(id) = ''
       )
       OR (
            SELECT count(DISTINCT id)
            FROM unnest(p_benefit_ids) id
       ) <> cardinality(p_benefit_ids)
    THEN
        RAISE EXCEPTION
            'Select one or more distinct benefits'
            USING ERRCODE = '22023';
    END IF;

    SELECT s.subscription_number
    INTO v_subscription_number
    FROM "${schemaName}".subscriptions s
    JOIN "${schemaName}".organization_user ou
      ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = p_subscription_id
      AND ou.organization_id = p_organization_id
    FOR UPDATE OF s;

    IF v_subscription_number IS NULL THEN
        RAISE EXCEPTION
            'Subscription not found'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT es.entity_status_id
    INTO v_status_id
    FROM "${schemaName}".entity_status es
    JOIN "${schemaName}".entity_type et
      ON et.entity_type_id = es.entity_type_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE et.entity_type_code = 'REDEMPTION'
      AND st.status_code = 'SUCCESS'
      AND es.is_active = true;

    IF v_status_id IS NULL THEN
        RAISE EXCEPTION
            'Successful redemption status is not configured'
            USING ERRCODE = '22023';
    END IF;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_reason :=
            "${schemaName}".counter_benefit_rejection(
                p_organization_id,
                p_subscription_id,
                v_benefit_id
            );

        IF v_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_reason
                USING ERRCODE = '23505';
        END IF;
    END LOOP;

    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_redemption_id :=
            "${schemaName}".generate_runtime_id('RDM');

        v_seq :=
            "${schemaName}".next_business_sequence(
                'REDEMPTION',
                p_subscription_id
            );

        v_redemption_number_candidate :=
            v_subscription_number
            || '_RDM_'
            || lpad(v_seq::text, 3, '0');

        IF length(v_redemption_number_candidate) > 64 THEN
            RAISE EXCEPTION
                'Generated redemption number exceeds 64 characters: %',
                v_redemption_number_candidate
                USING ERRCODE = '22023';
        END IF;

        v_redemption_number :=
            v_redemption_number_candidate::varchar(64);

        INSERT INTO "${schemaName}".redemptions (
            redemption_id,
            redemption_number,
            subscription_id,
            benefit_id,
            store_id,
            staff_id,
            redemption_status_id,
            created_by,
            updated_by
        )
        VALUES (
            v_redemption_id,
            v_redemption_number,
            p_subscription_id,
            v_benefit_id,
            p_store_id,
            p_staff_id,
            v_status_id,
            p_actor_user_id,
            p_actor_user_id
        );

        RETURN QUERY
        SELECT
            v_redemption_id,
            v_benefit_id,
            v_redemption_number;
    END LOOP;
END;
$function$;
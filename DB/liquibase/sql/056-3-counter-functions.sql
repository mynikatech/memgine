-- Batch 3 Counter transactions. CREATE OR REPLACE and guarded grants are rerunnable.
-- Existing customer reads reuse the Batch 2I/2J functions.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_can_operate(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_actor_user_id varchar
) RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id)
       AND EXISTS (
           SELECT 1 FROM "${schemaName}".stores store
           JOIN "${schemaName}".entity_status es ON es.entity_status_id = store.store_status_id
           JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
           WHERE store.store_id = p_store_id AND store.organization_id = p_organization_id
             AND store.is_deleted = false AND st.status_code = 'ACTIVE'
       ) AND EXISTS (
           SELECT 1 FROM "${schemaName}".staff staff
           JOIN "${schemaName}".entity_status es ON es.entity_status_id = staff.staff_status_id
           JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
           WHERE staff.staff_id = p_staff_id AND staff.organization_id = p_organization_id
             AND staff.is_deleted = false AND st.status_code = 'ACTIVE'
             AND (staff.store_id = p_store_id OR EXISTS (
                 SELECT 1 FROM "${schemaName}".staff_store_assignment assignment
                 JOIN "${schemaName}".entity_status aes ON aes.entity_status_id = assignment.status_id
                 JOIN "${schemaName}".statuses ast ON ast.status_id = aes.status_id
                 WHERE assignment.staff_id = staff.staff_id AND assignment.store_id = p_store_id
                   AND assignment.is_deleted = false AND ast.status_code = 'ACTIVE'
                   AND assignment.effective_date <= CURRENT_DATE
                   AND (assignment.end_date IS NULL OR assignment.end_date >= CURRENT_DATE)
             ))
       );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_staff_name(
    p_organization_id varchar, p_staff_id varchar
) RETURNS text LANGUAGE sql STABLE AS $function$
    SELECT NULLIF(trim(COALESCE(NULLIF(u.display_name, ''),
        concat_ws(' ', u.first_name, u.last_name))), '')
      FROM "${schemaName}".staff s
      JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
     WHERE s.staff_id = p_staff_id AND s.organization_id = p_organization_id
       AND ou.organization_id = p_organization_id AND s.is_deleted = false
       AND ou.is_deleted = false AND u.is_deleted = false;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_subscriptions(
    p_organization_id varchar, p_actor_user_id varchar
) RETURNS TABLE (
    id varchar, "subscriptionNumber" varchar, "organizationUserId" varchar,
    "customerName" text, "customerEmail" varchar, "customerPhone" varchar,
    "subscriptionPlanName" varchar, "subscriptionPlanCode" varchar,
    "membershipProductName" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "statusCode" varchar, "statusName" varchar, "totalAmount" double precision,
    "currencyCode" varchar, "createdAt" text,
    "userId" varchar, "subscriptionPlanId" varchar, "membershipProductId" varchar
) LANGUAGE sql STABLE AS $function$
    SELECT admin.*, ou.user_id, s.subscription_plan_id, sp.membership_product_id
    FROM "${schemaName}".get_organization_subscriptions_admin(p_organization_id, p_actor_user_id) admin
    JOIN "${schemaName}".subscriptions s ON s.subscription_id = admin.id
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_purchase_subscription(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_plan_id varchar, p_customer_user_id varchar, p_first_name varchar,
    p_last_name varchar, p_primary_email varchar, p_primary_phone varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar,
    "subscriptionDate" text, "startDate" text, "endDate" text,
    "subscriptionStatusId" varchar, "totalAmount" double precision,
    "currencyCode" varchar
) LANGUAGE plpgsql AS $function$
DECLARE
    v_organization_user_id varchar;
    v_user_id varchar;
    v_product_id varchar;
    v_period integer;
    v_unit varchar;
    v_price numeric(12,2);
    v_currency varchar;
    v_status_id varchar;
    v_subscription_id varchar;
    v_end_date date;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT mp.membership_product_id, sp.subscription_period, sp.subscription_period_unit,
           sp.price, c.currency_code
      INTO v_product_id, v_period, v_unit, v_price, v_currency
      FROM "${schemaName}".subscription_plans sp
      JOIN "${schemaName}".membership_products mp
        ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".currencies c ON c.currency_id = sp.currency_id AND c.is_active = true
      JOIN "${schemaName}".entity_status pse ON pse.entity_status_id = sp.subscription_plan_status_id
      JOIN "${schemaName}".statuses ps ON ps.status_id = pse.status_id
      JOIN "${schemaName}".entity_status mse ON mse.entity_status_id = mp.product_status_id
      JOIN "${schemaName}".statuses ms ON ms.status_id = mse.status_id
     WHERE sp.subscription_plan_id = p_plan_id AND mp.organization_id = p_organization_id
       AND sp.is_deleted = false AND mp.is_deleted = false
       AND ps.status_code = 'ACTIVE' AND ms.status_code = 'ACTIVE'
       AND sp.effective_date <= CURRENT_DATE AND (sp.expiry_date IS NULL OR sp.expiry_date >= CURRENT_DATE)
       AND mp.effective_date <= CURRENT_DATE AND (mp.expiry_date IS NULL OR mp.expiry_date >= CURRENT_DATE);
    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Membership plan is unavailable for this organization' USING ERRCODE = '22023';
    END IF;
    IF v_period < 1 OR lower(v_unit) NOT IN ('day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years') THEN
        RAISE EXCEPTION 'Membership plan has an invalid subscription period' USING ERRCODE = '22023';
    END IF;
    SELECT es.entity_status_id INTO v_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'SUBSCRIPTION' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Active subscription status is not configured' USING ERRCODE = '22023';
    END IF;

    IF p_customer_user_id IS NULL THEN
        -- The existing identity function serializes by unique phone and never overwrites an existing user.
        v_organization_user_id := "${schemaName}".create_organization_prospective_customer(
            p_organization_id, p_first_name, NULL, p_last_name, NULL,
            p_primary_email, p_primary_phone, p_actor_user_id);
    ELSE
        SELECT ou.organization_user_id INTO v_organization_user_id
          FROM "${schemaName}".organization_user ou
          JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
          JOIN "${schemaName}".organization_user_types ot
            ON ot.organization_user_type_id = ou.organization_user_type_id
          JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
          JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
         WHERE ou.organization_id = p_organization_id AND ou.user_id = p_customer_user_id
           AND ot.organization_user_type_code = 'CUSTOMER'
           AND ou.is_deleted = false AND u.is_deleted = false AND os.status_code = 'ACTIVE'
         FOR UPDATE OF ou;
        IF v_organization_user_id IS NULL THEN
            RAISE EXCEPTION 'Customer is not active in this organization' USING ERRCODE = '22023';
        END IF;
    END IF;
    SELECT ou.user_id INTO v_user_id FROM "${schemaName}".organization_user ou
     WHERE ou.organization_user_id = v_organization_user_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}"."user" u
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = u.user_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE u.user_id = v_user_id AND u.is_deleted = false AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Customer account is not active' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "${schemaName}".subscriptions s
        JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = s.subscription_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE s.organization_user_id = v_organization_user_id
          AND sp.membership_product_id = v_product_id AND s.is_deleted = false
          AND st.status_code = 'ACTIVE' AND s.end_date >= CURRENT_DATE
    ) THEN
        RAISE EXCEPTION 'Customer already has an active subscription for this membership' USING ERRCODE = '23505';
    END IF;
    v_end_date := CURRENT_DATE + CASE lower(v_unit)
        WHEN 'day' THEN make_interval(days => v_period)
        WHEN 'days' THEN make_interval(days => v_period)
        WHEN 'week' THEN make_interval(days => v_period * 7)
        WHEN 'weeks' THEN make_interval(days => v_period * 7)
        WHEN 'month' THEN make_interval(months => v_period)
        WHEN 'months' THEN make_interval(months => v_period)
        WHEN 'year' THEN make_interval(years => v_period)
        ELSE make_interval(years => v_period) END;
    v_subscription_id := gen_random_uuid()::text;
    INSERT INTO "${schemaName}".subscriptions (
        subscription_id, subscription_number, subscription_plan_id, organization_user_id,
        subscription_date, start_date, end_date, subscription_status_id,
        total_amount, created_by, updated_by
    ) VALUES (
        v_subscription_id, 'SUB-' || replace(v_subscription_id, '-', ''),
        p_plan_id, v_organization_user_id, CURRENT_DATE, CURRENT_DATE,
        v_end_date, v_status_id, v_price, p_actor_user_id, p_actor_user_id
    );
    RETURN QUERY SELECT v_subscription_id, v_organization_user_id, v_user_id,
        ('SUB-' || replace(v_subscription_id, '-', ''))::varchar, p_plan_id,
        CURRENT_DATE::text, CURRENT_DATE::text, v_end_date::text,
        v_status_id, v_price::double precision, v_currency;
END;
$function$;

-- NULL means eligible. A non-NULL reason is safe to display to staff.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_benefit_rejection(
    p_organization_id varchar, p_subscription_id varchar, p_benefit_id varchar
) RETURNS text LANGUAGE plpgsql VOLATILE AS $function$
DECLARE
    v_subscription record;
    v_rule record;
    v_window_start timestamp;
    v_count integer;
    v_local_now timestamp;
    v_zone text;
BEGIN
    SELECT s.start_date, s.end_date, sp.membership_product_id, st.status_code
      INTO v_subscription
      FROM "${schemaName}".subscriptions s
      JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN "${schemaName}".organization_user_types ot
        ON ot.organization_user_type_id = ou.organization_user_type_id
      JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
      JOIN "${schemaName}".entity_status ues ON ues.entity_status_id = u.user_status_id
      JOIN "${schemaName}".statuses ust ON ust.status_id = ues.status_id
      JOIN "${schemaName}".entity_status oes
        ON oes.entity_status_id = ou.organization_user_status_id
      JOIN "${schemaName}".statuses ost ON ost.status_id = oes.status_id
      JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN "${schemaName}".entity_status es ON es.entity_status_id = s.subscription_status_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE s.subscription_id = p_subscription_id AND s.is_deleted = false
       AND ou.organization_id = p_organization_id AND ou.is_deleted = false
       AND ot.organization_user_type_code = 'CUSTOMER' AND ost.status_code = 'ACTIVE'
       AND u.is_deleted = false AND ust.status_code = 'ACTIVE'
       AND mp.organization_id = p_organization_id AND mp.is_deleted = false;
    IF NOT FOUND THEN RETURN 'Subscription is not available for this organization'; END IF;
    IF v_subscription.status_code <> 'ACTIVE' OR CURRENT_DATE < v_subscription.start_date
       OR CURRENT_DATE > v_subscription.end_date THEN
        RETURN 'Subscription is not active today';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".membership_product_benefits link
        JOIN "${schemaName}".benefits b ON b.benefit_id = link.benefit_id
        JOIN "${schemaName}".entity_status bes ON bes.entity_status_id = b.benefit_status_id
        JOIN "${schemaName}".statuses bst ON bst.status_id = bes.status_id
        JOIN "${schemaName}".entity_status les ON les.entity_status_id = link.status_id
        JOIN "${schemaName}".statuses lst ON lst.status_id = les.status_id
        WHERE link.membership_product_id = v_subscription.membership_product_id
          AND link.benefit_id = p_benefit_id AND link.is_deleted = false
          AND lst.status_code = 'ACTIVE' AND bst.status_code = 'ACTIVE'
          AND b.organization_id = p_organization_id AND b.is_deleted = false
          AND b.effective_date <= CURRENT_DATE AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
          AND (link.effective_from IS NULL OR link.effective_from <= CURRENT_DATE)
          AND (link.effective_to IS NULL OR link.effective_to >= CURRENT_DATE)
    ) THEN RETURN 'Benefit is not active for this membership'; END IF;

    FOR v_rule IN
        SELECT r.* FROM "${schemaName}".benefit_usage_rule r
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = r.benefit_usage_rule_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE r.benefit_id = p_benefit_id AND r.is_deleted = false AND st.status_code = 'ACTIVE'
    LOOP
        v_zone := COALESCE(NULLIF(trim(v_rule.time_zone), ''), 'UTC');
        BEGIN
            v_local_now := CURRENT_TIMESTAMP AT TIME ZONE v_zone;
        EXCEPTION WHEN invalid_parameter_value THEN
            RETURN 'Benefit usage rule has an invalid time zone';
        END;
        IF v_local_now::date < v_rule.effective_date OR
           (v_rule.expiry_date IS NOT NULL AND v_local_now::date > v_rule.expiry_date) THEN
            RETURN 'Benefit usage rule is outside its valid period';
        END IF;
        IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NOT NULL THEN
            IF (v_rule.window_start_time::time <= v_rule.window_end_time::time AND
               (v_local_now::time < v_rule.window_start_time::time OR v_local_now::time > v_rule.window_end_time::time)) OR
               (v_rule.window_start_time::time > v_rule.window_end_time::time AND
               (v_local_now::time < v_rule.window_start_time::time AND v_local_now::time > v_rule.window_end_time::time)) THEN
                RETURN 'Benefit usage rule is outside its valid period';
            END IF;
        ELSIF (v_rule.window_start_time IS NOT NULL AND v_local_now::time < v_rule.window_start_time::time) OR
              (v_rule.window_end_time IS NOT NULL AND v_local_now::time > v_rule.window_end_time::time) THEN
            RETURN 'Benefit usage rule is outside its valid period';
        END IF;
        IF NULLIF(trim(v_rule.applicable_days), '') IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM regexp_split_to_table(upper(v_rule.applicable_days), '[,; ]+') day
            WHERE day = upper(trim(to_char(v_local_now, 'DAY')))
               OR day = upper(trim(to_char(v_local_now, 'DY')))
        ) THEN RETURN 'Benefit is not available today'; END IF;
        v_window_start := CASE upper(v_rule.frequency_type)
            WHEN 'ONE_TIME' THEN v_subscription.start_date::timestamp
            WHEN 'DAILY' THEN v_local_now - make_interval(days => v_rule.frequency_interval)
            WHEN 'WEEKLY' THEN v_local_now - make_interval(days => 7 * v_rule.frequency_interval)
            WHEN 'MONTHLY' THEN v_local_now - make_interval(months => v_rule.frequency_interval)
            WHEN 'YEARLY' THEN v_local_now - make_interval(years => v_rule.frequency_interval)
            ELSE NULL END;
        IF v_window_start IS NULL OR v_rule.frequency_interval < 1 OR v_rule.usage_limit < 1 THEN
            RETURN 'Benefit usage rule is invalid';
        END IF;
        SELECT COALESCE(sum(r.quantity), 0)::integer INTO v_count
          FROM "${schemaName}".redemptions r
          JOIN "${schemaName}".entity_status es ON es.entity_status_id = r.redemption_status_id
          JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
         WHERE r.subscription_id = p_subscription_id AND r.benefit_id = p_benefit_id
           AND ((r.redemption_datetime AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE v_zone) >= v_window_start
           AND st.status_code = 'SUCCESS';
        IF v_count >= v_rule.usage_limit THEN RETURN 'Benefit usage limit has been reached'; END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_redeem_benefits(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_subscription_id varchar, p_benefit_ids varchar[], p_actor_user_id varchar
) RETURNS TABLE ("redemptionId" varchar, "benefitId" varchar, "redemptionNumber" varchar)
LANGUAGE plpgsql AS $function$
DECLARE
    v_benefit_id varchar;
    v_redemption_id varchar;
    v_status_id varchar;
    v_reason text;
BEGIN
    IF NOT "${schemaName}".counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_benefit_ids IS NULL OR cardinality(p_benefit_ids) = 0 OR
       EXISTS (SELECT 1 FROM unnest(p_benefit_ids) id WHERE id IS NULL OR trim(id) = '') OR
       (SELECT count(DISTINCT id) FROM unnest(p_benefit_ids) id) <> cardinality(p_benefit_ids) THEN
        RAISE EXCEPTION 'Select one or more distinct benefits' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM "${schemaName}".subscriptions s
      WHERE s.subscription_id = p_subscription_id FOR UPDATE;
    SELECT es.entity_status_id INTO v_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
      WHERE et.entity_type_code = 'REDEMPTION' AND st.status_code = 'SUCCESS' AND es.is_active = true;
    IF v_status_id IS NULL THEN
        RAISE EXCEPTION 'Successful redemption status is not configured' USING ERRCODE = '22023';
    END IF;
    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_reason := "${schemaName}".counter_benefit_rejection(p_organization_id, p_subscription_id, v_benefit_id);
        IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%', v_reason USING ERRCODE = '23505'; END IF;
    END LOOP;
    FOREACH v_benefit_id IN ARRAY p_benefit_ids LOOP
        v_redemption_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}".redemptions (
            redemption_id, redemption_number, subscription_id, benefit_id,
            store_id, staff_id, redemption_status_id, created_by, updated_by
        ) VALUES (
            v_redemption_id, 'RDM-' || replace(v_redemption_id, '-', ''),
            p_subscription_id, v_benefit_id, p_store_id, p_staff_id,
            v_status_id, p_actor_user_id, p_actor_user_id
        );
        RETURN QUERY SELECT v_redemption_id, v_benefit_id,
            ('RDM-' || replace(v_redemption_id, '-', ''))::varchar;
    END LOOP;
END;
$function$;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_can_operate(varchar, varchar, varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_staff_name(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_subscriptions(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_purchase_subscription(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_benefit_rejection(varchar, varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_redeem_benefits(varchar, varchar, varchar, varchar, varchar[], varchar) TO "${appRole}";
    END IF;
END $grant$;

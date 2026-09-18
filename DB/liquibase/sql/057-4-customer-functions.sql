-- Batch 4 Customer functions. Definitions and guarded grants are rerunnable.
-- The Local/Dev identity selector is intentionally narrow until authentication exists.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_dev_choices()
RETURNS TABLE ("userId" varchar, "displayName" text)
LANGUAGE sql STABLE AS $function$
    SELECT DISTINCT u.user_id,
        COALESCE(NULLIF(trim(u.display_name), ''),
                 NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.user_code)
    FROM "${schemaName}"."user" u
    JOIN "${schemaName}".organization_user ou ON ou.user_id = u.user_id
    JOIN "${schemaName}".organization o ON o.organization_id = ou.organization_id
    JOIN "${schemaName}".organization_user_types ot
      ON ot.organization_user_type_id = ou.organization_user_type_id
    JOIN "${schemaName}".entity_status ues ON ues.entity_status_id = u.user_status_id
    JOIN "${schemaName}".statuses us ON us.status_id = ues.status_id
    JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
    JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
    JOIN "${schemaName}".entity_status ges ON ges.entity_status_id = o.organization_status_id
    JOIN "${schemaName}".statuses gs ON gs.status_id = ges.status_id
    WHERE ot.organization_user_type_code = 'CUSTOMER' AND ou.is_deleted = false
      AND u.is_deleted = false AND o.is_deleted = false
      AND us.status_code = 'ACTIVE' AND os.status_code = 'ACTIVE'
      AND gs.status_code = 'ACTIVE'
    ORDER BY 2, 1;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".customer_has_active_relationship(
    p_organization_id varchar, p_user_id varchar
) RETURNS boolean LANGUAGE sql STABLE AS $function$
    SELECT EXISTS (
        SELECT 1 FROM "${schemaName}".organization_user ou
        JOIN "${schemaName}".organization o ON o.organization_id = ou.organization_id
        JOIN "${schemaName}".organization_user_types ot
          ON ot.organization_user_type_id = ou.organization_user_type_id
        JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
        JOIN "${schemaName}".entity_status ues ON ues.entity_status_id = u.user_status_id
        JOIN "${schemaName}".statuses us ON us.status_id = ues.status_id
        JOIN "${schemaName}".entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
        JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
        JOIN "${schemaName}".entity_status ges ON ges.entity_status_id = o.organization_status_id
        JOIN "${schemaName}".statuses gs ON gs.status_id = ges.status_id
        WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
          AND ot.organization_user_type_code = 'CUSTOMER'
          AND ou.is_deleted = false AND u.is_deleted = false
          AND o.is_deleted = false AND gs.status_code = 'ACTIVE'
          AND us.status_code = 'ACTIVE' AND os.status_code = 'ACTIVE'
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_relationships(p_user_id varchar)
RETURNS TABLE (
    "organizationUserId" varchar, "organizationId" varchar, "organizationName" text,
    "userId" varchar, "userCode" varchar, "firstName" varchar,
    "middleName" varchar, "lastName" varchar, "displayName" varchar,
    "primaryEmail" varchar, "primaryPhone" varchar, "userStatusId" varchar,
    "userStatusName" varchar, "organizationUserTypeId" varchar,
    "organizationUserStatusId" varchar, "relationshipStatusName" varchar,
    "joiningDate" text, "subscriptionCount" integer, "membershipName" text
) LANGUAGE sql STABLE AS $function$
    SELECT ou.organization_user_id, o.organization_id,
        COALESCE(NULLIF(o.organization_display_name, ''), o.organization_name)::text,
        u.user_id, u.user_code, u.first_name, u.middle_name, u.last_name,
        u.display_name, u.primary_email, u.primary_phone, u.user_status_id,
        us.status_name, ou.organization_user_type_id, ou.organization_user_status_id,
        os.status_name, ou.joining_date::text,
        (SELECT count(*)::integer FROM "${schemaName}".subscriptions s
         WHERE s.organization_user_id = ou.organization_user_id AND s.is_deleted = false),
        (SELECT string_agg(DISTINCT COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name), ', ')
         FROM "${schemaName}".subscriptions s
         JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
         JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
         WHERE s.organization_user_id = ou.organization_user_id AND s.is_deleted = false)
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
      AND ou.is_deleted = false AND u.is_deleted = false AND o.is_deleted = false
      AND us.status_code = 'ACTIVE' AND os.status_code = 'ACTIVE'
      AND gs.status_code = 'ACTIVE'
    ORDER BY o.organization_name, o.organization_id;
$function$;

-- Purchase-only identity/link creation. This is called within the subscription
-- write transaction and never changes the profile of an existing phone owner.
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
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization o
                   JOIN "${schemaName}".entity_status es ON es.entity_status_id = o.organization_status_id
                   JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
                   WHERE o.organization_id = p_organization_id AND o.is_deleted = false
                     AND st.status_code = 'ACTIVE')
       OR NULLIF(trim(p_first_name), '') IS NULL OR length(p_first_name) > 100
       OR NULLIF(trim(p_last_name), '') IS NULL OR length(p_last_name) > 100
       OR NULLIF(v_phone, '') IS NULL OR length(v_phone) > 20
       OR (v_email IS NOT NULL AND length(v_email) > 254) THEN
        RAISE EXCEPTION 'Invalid organization or customer details' USING ERRCODE = '22023';
    END IF;
    SELECT organization_user_type_id INTO STRICT v_type_id
      FROM "${schemaName}".organization_user_types
     WHERE organization_user_type_code = 'CUSTOMER' AND is_active = true;
    SELECT es.entity_status_id INTO STRICT v_user_status
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    SELECT es.entity_status_id INTO STRICT v_relation_status
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'ORGANIZATION_USER' AND st.status_code = 'ACTIVE' AND es.is_active = true;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_phone, 0));
    SELECT user_id INTO v_user_id FROM "${schemaName}"."user"
     WHERE primary_phone = v_phone AND is_deleted = false FOR UPDATE;
    IF v_email IS NOT NULL AND EXISTS (
        SELECT 1 FROM "${schemaName}"."user" WHERE lower(primary_email) = v_email
          AND is_deleted = false AND (v_user_id IS NULL OR user_id <> v_user_id)
    ) THEN
        RAISE EXCEPTION 'Email belongs to another user' USING ERRCODE = '23505';
    END IF;
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}"."user" (
            user_id, user_code, first_name, last_name, display_name,
            primary_email, primary_phone, user_status_id, created_by, updated_by
        ) VALUES (
            v_user_id, 'USR-' || replace(v_user_id, '-', ''), trim(p_first_name),
            trim(p_last_name), trim(p_first_name) || ' ' || trim(p_last_name),
            v_email, v_phone, v_user_status, v_user_id, v_user_id
        );
    END IF;
    SELECT organization_user_id INTO v_org_user_id
      FROM "${schemaName}".organization_user
     WHERE organization_id = p_organization_id AND user_id = v_user_id
       AND organization_user_type_id = v_type_id
     ORDER BY is_deleted, organization_user_id LIMIT 1 FOR UPDATE;
    IF v_org_user_id IS NULL THEN
        v_org_user_id := gen_random_uuid()::text;
        INSERT INTO "${schemaName}".organization_user (
            organization_user_id, organization_id, user_id,
            organization_user_type_id, organization_user_status_id, created_by, updated_by
        ) VALUES (v_org_user_id, p_organization_id, v_user_id, v_type_id,
                  v_relation_status, v_user_id, v_user_id);
    ELSE
        UPDATE "${schemaName}".organization_user
           SET is_deleted = false, organization_user_status_id = v_relation_status,
               updated_at = CURRENT_TIMESTAMP, updated_by = v_user_id,
               version_no = version_no + 1
         WHERE organization_user_id = v_org_user_id AND is_deleted = true;
    END IF;
    RETURN v_org_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".purchase_membership_subscription(
    p_organization_id varchar,
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
        v_organization_user_id := "${schemaName}".link_customer_for_purchase(
            p_organization_id, p_first_name, p_last_name, p_primary_email, p_primary_phone);
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
        v_end_date, v_status_id, v_price,
        COALESCE(p_actor_user_id, v_user_id), COALESCE(p_actor_user_id, v_user_id)
    );
    RETURN QUERY SELECT v_subscription_id, v_organization_user_id, v_user_id,
        ('SUB-' || replace(v_subscription_id, '-', ''))::varchar, p_plan_id,
        CURRENT_DATE::text, CURRENT_DATE::text, v_end_date::text,
        v_status_id, v_price::double precision, v_currency;
END;
$function$;

-- Neither purchase primitive is directly callable by the runtime role.
-- The guarded caller wrappers below run as the migration/function owner.
REVOKE EXECUTE ON FUNCTION "${schemaName}".link_customer_for_purchase(
    varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "${schemaName}".purchase_membership_subscription(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_subscriptions(
    p_organization_id varchar, p_user_id varchar
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
    SELECT s.subscription_id, s.subscription_number, ou.organization_user_id,
        COALESCE(NULLIF(trim(u.display_name), ''),
                 NULLIF(trim(concat_ws(' ', u.first_name, u.middle_name, u.last_name)), ''), u.user_code),
        u.primary_email, u.primary_phone, sp.subscription_plan_name,
        sp.subscription_plan_code,
        COALESCE(NULLIF(mp.display_name, ''), mp.membership_product_name),
        s.subscription_date::text, s.start_date::text, s.end_date::text,
        s.subscription_status_id, st.status_code, st.status_name,
        s.total_amount::double precision, c.currency_code, s.created_at::text,
        u.user_id, sp.subscription_plan_id, mp.membership_product_id
    FROM "${schemaName}".subscriptions s
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
    JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
      AND mp.organization_id = ou.organization_id
    JOIN "${schemaName}".currencies c ON c.currency_id = sp.currency_id
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = s.subscription_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
      AND s.is_deleted = false
      AND "${schemaName}".customer_has_active_relationship(p_organization_id, p_user_id)
    ORDER BY s.subscription_date DESC, s.subscription_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_redemptions(
    p_organization_id varchar, p_user_id varchar
) RETURNS TABLE (
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
) LANGUAGE sql STABLE AS $function$
    SELECT r.redemption_id, r.redemption_number, s.subscription_id,
        s.subscription_number,
        COALESCE(NULLIF(trim(u.display_name), ''),
                 NULLIF(trim(concat_ws(' ', u.first_name, u.middle_name, u.last_name)), ''), u.user_code),
        u.primary_email, u.primary_phone, b.benefit_id,
        COALESCE(NULLIF(b.display_name, ''), b.benefit_name), b.benefit_code,
        store.store_id, store.store_name, store.store_code,
        staff.staff_id,
        COALESCE(NULLIF(trim(su.display_name), ''),
                 NULLIF(trim(concat_ws(' ', su.first_name, su.middle_name, su.last_name)), ''), su.user_code),
        staff.staff_code, r.redemption_datetime::text, r.quantity,
        r.redemption_status_id, st.status_code, st.status_name,
        r.remarks, r.created_at::text, r.created_by,
        r.updated_at::text, r.updated_by, r.version_no
    FROM "${schemaName}".redemptions r
    JOIN "${schemaName}".subscriptions s ON s.subscription_id = r.subscription_id
    JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".benefits b ON b.benefit_id = r.benefit_id
      AND b.organization_id = ou.organization_id
    JOIN "${schemaName}".stores store ON store.store_id = r.store_id
      AND store.organization_id = ou.organization_id
    LEFT JOIN "${schemaName}".staff staff ON staff.staff_id = r.staff_id
      AND staff.organization_id = ou.organization_id
    LEFT JOIN "${schemaName}".organization_user sou ON sou.organization_user_id = staff.organization_user_id
    LEFT JOIN "${schemaName}"."user" su ON su.user_id = sou.user_id
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = r.redemption_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
      AND s.is_deleted = false
      AND "${schemaName}".customer_has_active_relationship(p_organization_id, p_user_id)
    ORDER BY r.redemption_datetime DESC, r.redemption_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_offers(
    p_organization_id varchar, p_user_id varchar
) RETURNS TABLE (
    id varchar, "organizationId" varchar, "offerCode" varchar, "offerName" varchar,
    description varchar, "membershipProductId" varchar, "storeId" varchar,
    "promotionImageUrl" varchar, "badgeText" varchar, "availabilityText" varchar,
    "ctaLabel" varchar, "ctaType" varchar, "ctaTarget" varchar,
    "discountPercentage" double precision, "effectiveDate" text, "expiryDate" text,
    "statusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
) LANGUAGE sql STABLE AS $function$
    SELECT o.offer_id, o.organization_id, o.offer_code, o.offer_name,
        o.description, o.membership_product_id, o.store_id,
        o.promotion_image_url, o.badge_text, o.availability_text,
        o.cta_label, o.cta_type, o.cta_target, o.discount_percentage::double precision,
        o.effective_date::text, o.expiry_date::text, o.status_id,
        o.created_at::text, o.created_by, o.updated_at::text, o.updated_by,
        o.is_deleted, o.version_no
    FROM "${schemaName}".offer o
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = o.status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE o.organization_id = p_organization_id AND o.is_deleted = false
      AND st.status_code = 'ACTIVE' AND o.effective_date <= CURRENT_DATE
      AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_DATE)
      AND (o.membership_product_id IS NULL OR EXISTS (
          SELECT 1 FROM "${schemaName}".subscriptions s
          JOIN "${schemaName}".subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
          JOIN "${schemaName}".organization_user ou ON ou.organization_user_id = s.organization_user_id
          JOIN "${schemaName}".entity_status ses ON ses.entity_status_id = s.subscription_status_id
          JOIN "${schemaName}".statuses ss ON ss.status_id = ses.status_id
          WHERE ou.organization_id = p_organization_id AND ou.user_id = p_user_id
            AND sp.membership_product_id = o.membership_product_id
            AND s.is_deleted = false AND ss.status_code = 'ACTIVE'
            AND s.start_date <= CURRENT_DATE AND s.end_date >= CURRENT_DATE
      ))
      AND "${schemaName}".customer_has_active_relationship(p_organization_id, p_user_id)
    ORDER BY o.offer_name, o.offer_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_join_membership_ids(p_organization_id varchar)
RETURNS TABLE (id varchar) LANGUAGE sql STABLE AS $function$
    SELECT mp.membership_product_id
    FROM "${schemaName}".membership_products mp
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = mp.product_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE mp.organization_id = p_organization_id AND mp.is_deleted = false
      AND st.status_code = 'ACTIVE' AND mp.effective_date <= CURRENT_DATE
      AND (mp.expiry_date IS NULL OR mp.expiry_date >= CURRENT_DATE)
      AND EXISTS (SELECT 1 FROM "${schemaName}".subscription_plans sp
          JOIN "${schemaName}".entity_status pes ON pes.entity_status_id = sp.subscription_plan_status_id
          JOIN "${schemaName}".statuses pst ON pst.status_id = pes.status_id
          WHERE sp.membership_product_id = mp.membership_product_id AND sp.is_deleted = false
            AND pst.status_code = 'ACTIVE' AND sp.effective_date <= CURRENT_DATE
            AND (sp.expiry_date IS NULL OR sp.expiry_date >= CURRENT_DATE))
    ORDER BY mp.tier_sequence NULLS LAST, mp.membership_product_name;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_join_plan_ids(p_organization_id varchar)
RETURNS TABLE (id varchar) LANGUAGE sql STABLE AS $function$
    SELECT sp.subscription_plan_id
    FROM "${schemaName}".subscription_plans sp
    JOIN "${schemaName}".membership_products mp ON mp.membership_product_id = sp.membership_product_id
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = sp.subscription_plan_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE mp.organization_id = p_organization_id AND sp.is_deleted = false
      AND st.status_code = 'ACTIVE' AND sp.effective_date <= CURRENT_DATE
      AND (sp.expiry_date IS NULL OR sp.expiry_date >= CURRENT_DATE)
    ORDER BY sp.subscription_plan_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_join_benefit_ids(p_organization_id varchar)
RETURNS TABLE (id varchar) LANGUAGE sql STABLE AS $function$
    SELECT b.benefit_id FROM "${schemaName}".benefits b
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = b.benefit_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE b.organization_id = p_organization_id AND b.is_deleted = false
      AND st.status_code = 'ACTIVE' AND b.effective_date <= CURRENT_DATE
      AND (b.expiry_date IS NULL OR b.expiry_date >= CURRENT_DATE)
    ORDER BY b.benefit_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_visible_store_ids(p_organization_id varchar)
RETURNS TABLE (id varchar) LANGUAGE sql STABLE AS $function$
    SELECT store.store_id FROM "${schemaName}".stores store
    JOIN "${schemaName}".entity_status es ON es.entity_status_id = store.store_status_id
    JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
    WHERE store.organization_id = p_organization_id AND store.is_deleted = false
      AND st.status_code = 'ACTIVE'
    ORDER BY store.store_name, store.store_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_preference_value(
    p_user_id varchar, p_code varchar
) RETURNS text LANGUAGE sql STABLE AS $function$
    SELECT COALESCE((
        SELECT cp.preference_value
          FROM "${schemaName}".customer_preference cp
          JOIN "${schemaName}".entity_status ces ON ces.entity_status_id = cp.preference_status_id
          JOIN "${schemaName}".statuses cs ON cs.status_id = ces.status_id
         WHERE cp.user_id = p_user_id AND cp.preference_type_id = pt.preference_type_id
           AND cp.is_deleted = false AND cs.status_code = 'ACTIVE'
         ORDER BY cp.updated_at DESC, cp.customer_preference_id DESC LIMIT 1
    ), pt.default_value)
      FROM "${schemaName}".preference_type pt
      JOIN "${schemaName}".entity_status pes ON pes.entity_status_id = pt.preference_type_status_id
      JOIN "${schemaName}".statuses ps ON ps.status_id = pes.status_id
     WHERE pt.preference_type_code = p_code AND pt.is_deleted = false
       AND ps.status_code = 'ACTIVE'
       AND EXISTS (SELECT 1 FROM "${schemaName}"."user" u
           WHERE u.user_id = p_user_id AND u.is_deleted = false);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".set_customer_preference_value(
    p_user_id varchar, p_code varchar, p_value varchar
) RETURNS text LANGUAGE plpgsql AS $function$
DECLARE
    v_type_id varchar;
    v_status_id varchar;
    v_preference_id varchar;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}"."user" u
        WHERE u.user_id = p_user_id AND u.is_deleted = false) THEN
        RAISE EXCEPTION 'Customer not found' USING ERRCODE = '22023';
    END IF;
    IF p_value NOT IN ('true', 'false') OR p_code NOT IN ('NOTIFICATIONS', 'MARKETING_EMAILS') THEN
        RAISE EXCEPTION 'Invalid customer preference' USING ERRCODE = '22023';
    END IF;
    SELECT pt.preference_type_id INTO v_type_id
      FROM "${schemaName}".preference_type pt
      JOIN "${schemaName}".entity_status es ON es.entity_status_id = pt.preference_type_status_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE pt.preference_type_code = p_code AND pt.is_deleted = false AND st.status_code = 'ACTIVE';
    SELECT es.entity_status_id INTO v_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'CUSTOMER_PREFERENCE'
       AND st.status_code = 'ACTIVE' AND es.is_active = true;
    IF v_type_id IS NULL OR v_status_id IS NULL THEN
        RAISE EXCEPTION 'Customer preference is not configured' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id || ':' || v_type_id, 0));
    SELECT cp.customer_preference_id INTO v_preference_id
      FROM "${schemaName}".customer_preference cp
     WHERE cp.user_id = p_user_id AND cp.preference_type_id = v_type_id
       AND cp.is_deleted = false
     ORDER BY cp.updated_at DESC, cp.customer_preference_id DESC LIMIT 1 FOR UPDATE;
    IF v_preference_id IS NULL THEN
        INSERT INTO "${schemaName}".customer_preference (
            customer_preference_id, user_id, preference_type_id, preference_value,
            preference_status_id, created_at, created_by, updated_at, updated_by
        ) VALUES (
            gen_random_uuid()::text, p_user_id, v_type_id, p_value, v_status_id,
            CURRENT_TIMESTAMP, p_user_id, CURRENT_TIMESTAMP, p_user_id
        );
    ELSE
        UPDATE "${schemaName}".customer_preference
           SET preference_value = p_value, preference_status_id = v_status_id,
               updated_at = CURRENT_TIMESTAMP, updated_by = p_user_id,
               version_no = version_no + 1
         WHERE customer_preference_id = v_preference_id;
    END IF;
    RETURN p_value;
END;
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
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    IF NOT "${schemaName}".counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM "${schemaName}".purchase_membership_subscription(
        p_organization_id, p_plan_id, p_customer_user_id, p_first_name,
        p_last_name, p_primary_email, p_primary_phone, p_actor_user_id);
END;
$function$;

-- Batch 4 Local/Dev identity is the selected canonical user ID. Existing
-- customers must select themselves and have an active CUSTOMER relationship.
-- New-customer purchase has no user ID yet; its mocked OTP seam is confined
-- to the development schema until authenticated identity is implemented.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_purchase_subscription(
    p_organization_id varchar, p_plan_id varchar, p_customer_user_id varchar,
    p_first_name varchar, p_last_name varchar, p_primary_email varchar,
    p_primary_phone varchar, p_selected_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar,
    "subscriptionDate" text, "startDate" text, "endDate" text,
    "subscriptionStatusId" varchar, "totalAmount" double precision,
    "currencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    IF '${schemaName}' <> 'memginedev' THEN
        RAISE EXCEPTION 'Customer identity requires authentication' USING ERRCODE = '42501';
    END IF;
    IF p_customer_user_id IS NULL THEN
        IF p_selected_user_id IS NOT NULL
           OR NULLIF(trim(p_first_name), '') IS NULL
           OR NULLIF(trim(p_last_name), '') IS NULL
           OR NULLIF(trim(p_primary_phone), '') IS NULL THEN
            RAISE EXCEPTION 'Verified new customer details are required' USING ERRCODE = '42501';
        END IF;
    ELSIF p_selected_user_id IS DISTINCT FROM p_customer_user_id
       OR NOT "${schemaName}".customer_has_active_relationship(
           p_organization_id, p_customer_user_id) THEN
        RAISE EXCEPTION 'Customer purchase is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY SELECT * FROM "${schemaName}".purchase_membership_subscription(
        p_organization_id, p_plan_id, p_customer_user_id, p_first_name,
        p_last_name, p_primary_email, p_primary_phone, p_selected_user_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION "${schemaName}".customer_purchase_subscription(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "${schemaName}".counter_purchase_subscription(
    varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
    varchar, varchar) FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        REVOKE EXECUTE ON FUNCTION "${schemaName}".link_customer_for_purchase(
            varchar, varchar, varchar, varchar, varchar) FROM "${appRole}";
        REVOKE EXECUTE ON FUNCTION "${schemaName}".purchase_membership_subscription(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar) FROM "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".customer_purchase_subscription(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".counter_purchase_subscription(
            varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar,
            varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_dev_choices() TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".customer_has_active_relationship(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_relationships(varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_subscriptions(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_redemptions(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_offers(varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_join_membership_ids(varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_join_plan_ids(varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_join_benefit_ids(varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_visible_store_ids(varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_preference_value(
            varchar, varchar) TO "${appRole}";
        GRANT EXECUTE ON FUNCTION "${schemaName}".set_customer_preference_value(
            varchar, varchar, varchar) TO "${appRole}";
    END IF;
END $grant$;

-- W270: Evaluate customer/counter Benefit and Offer eligibility against the
-- currently PUBLISHED Customer Experience release. Operational subscription
-- state and successful redemption usage counts remain live.
-- Intentionally retains all existing function names, signatures, and reasons.
-- Fail closed if no published release exists; never fall back to draft tables.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_benefit_rejection(
    p_organization_id varchar, p_subscription_id varchar, p_benefit_id varchar
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_sub record;
    v_snapshot jsonb;
    v_product jsonb;
    v_benefit jsonb;
    v_rule record;
    v_local_now timestamp;
    v_window_start timestamp;
    v_count integer;
    v_zone text;
BEGIN
    SELECT s.start_date, s.end_date, sp.membership_product_id, st.status_code
      INTO v_sub
      FROM subscriptions s
      JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
      JOIN organization_user_types ot ON ot.organization_user_type_id = ou.organization_user_type_id
      JOIN "user" u ON u.user_id = ou.user_id
      JOIN entity_status ues ON ues.entity_status_id = u.user_status_id
      JOIN statuses ust ON ust.status_id = ues.status_id
      JOIN entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
      JOIN statuses ost ON ost.status_id = oes.status_id
      JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN membership_products mp ON mp.membership_product_id = sp.membership_product_id
      JOIN entity_status es ON es.entity_status_id = s.subscription_status_id
      JOIN statuses st ON st.status_id = es.status_id
     WHERE s.subscription_id = p_subscription_id AND NOT s.is_deleted
       AND ou.organization_id = p_organization_id AND NOT ou.is_deleted
       AND ot.organization_user_type_code = 'CUSTOMER' AND ost.status_code = 'ACTIVE'
       AND NOT u.is_deleted AND ust.status_code = 'ACTIVE'
       AND mp.organization_id = p_organization_id AND NOT mp.is_deleted;
    IF NOT FOUND THEN RETURN 'Subscription is not available for this organization'; END IF;
    IF v_sub.status_code <> 'ACTIVE' OR CURRENT_DATE < v_sub.start_date
       OR CURRENT_DATE > v_sub.end_date THEN
        RETURN 'Subscription is not active today';
    END IF;

    SELECT r.snapshot_data INTO v_snapshot
      FROM organization o
      JOIN customer_experience_release r
        ON r.customer_experience_release_id = o.published_customer_experience_release_id
      JOIN entity_status es ON es.entity_status_id = r.release_status_id
      JOIN statuses st ON st.status_id = es.status_id
     WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
       AND NOT r.is_deleted AND st.status_code = 'PUBLISHED';
    IF v_snapshot IS NULL THEN RETURN 'Published Customer Experience is unavailable'; END IF;

    SELECT item INTO v_product
      FROM jsonb_array_elements(COALESCE(v_snapshot->'membershipProducts', '[]'::jsonb)) item
     WHERE item->>'id' = v_sub.membership_product_id LIMIT 1;
    SELECT item INTO v_benefit
      FROM jsonb_array_elements(COALESCE(v_snapshot->'benefits', '[]'::jsonb)) item
     WHERE item->>'id' = p_benefit_id LIMIT 1;
    IF v_product IS NULL OR v_benefit IS NULL OR NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
            COALESCE(v_product->'benefitIds', '[]'::jsonb)
        ) benefit_id WHERE benefit_id = p_benefit_id
    ) THEN
        RETURN 'Benefit is not active for this membership';
    END IF;

    -- Preserve effective-dating checks using frozen fields, not editable rows.
    IF (v_benefit->>'effectiveDate') IS NOT NULL
       AND CURRENT_DATE < (v_benefit->>'effectiveDate')::date THEN
        RETURN 'Benefit is not active for this membership';
    END IF;
    IF (v_benefit->>'expiryDate') IS NOT NULL
       AND CURRENT_DATE > (v_benefit->>'expiryDate')::date THEN
        RETURN 'Benefit is not active for this membership';
    END IF;

    FOR v_rule IN
        SELECT
            item->>'frequencyType' AS frequency_type,
            (item->>'frequencyInterval')::integer AS frequency_interval,
            (item->>'usageLimit')::integer AS usage_limit,
            item->>'timeZone' AS time_zone,
            (item->>'effectiveDate')::date AS effective_date,
            (item->>'expiryDate')::date AS expiry_date,
            (item->>'windowStartTime')::time AS window_start_time,
            (item->>'windowEndTime')::time AS window_end_time,
            item->'applicableDays' AS applicable_days
        FROM jsonb_array_elements(COALESCE(v_snapshot->'benefitUsageRules', '[]'::jsonb)) item
        WHERE item->>'benefitId' = p_benefit_id
          AND COALESCE((item->>'isDeleted')::boolean, false) = false
    LOOP
        v_zone := COALESCE(NULLIF(trim(v_rule.time_zone), ''), 'UTC');
        BEGIN
            v_local_now := CURRENT_TIMESTAMP AT TIME ZONE v_zone;
        EXCEPTION WHEN invalid_parameter_value THEN
            RETURN 'Benefit usage rule has an invalid time zone';
        END;
        IF (v_rule.effective_date IS NOT NULL AND v_local_now::date < v_rule.effective_date)
           OR (v_rule.expiry_date IS NOT NULL AND v_local_now::date > v_rule.expiry_date) THEN
            RETURN 'Benefit usage rule is outside its valid period';
        END IF;
        IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NOT NULL THEN
            IF (v_rule.window_start_time <= v_rule.window_end_time AND
                (v_local_now::time < v_rule.window_start_time OR v_local_now::time > v_rule.window_end_time)) OR
               (v_rule.window_start_time > v_rule.window_end_time AND
                (v_local_now::time < v_rule.window_start_time AND v_local_now::time > v_rule.window_end_time)) THEN
                RETURN 'Benefit usage rule is outside its valid period';
            END IF;
        ELSIF (v_rule.window_start_time IS NOT NULL AND v_local_now::time < v_rule.window_start_time) OR
              (v_rule.window_end_time IS NOT NULL AND v_local_now::time > v_rule.window_end_time) THEN
            RETURN 'Benefit usage rule is outside its valid period';
        END IF;
        IF v_rule.applicable_days IS NOT NULL
           AND jsonb_typeof(v_rule.applicable_days) = 'array'
           AND jsonb_array_length(v_rule.applicable_days) > 0
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(v_rule.applicable_days) day
               WHERE upper(day) IN (
                   upper(trim(to_char(v_local_now, 'DAY'))),
                   upper(trim(to_char(v_local_now, 'DY')))
               )
           ) THEN RETURN 'Benefit is not available today'; END IF;
        v_window_start := CASE upper(v_rule.frequency_type)
            WHEN 'ONE_TIME' THEN v_sub.start_date::timestamp
            WHEN 'DAILY' THEN v_local_now - make_interval(days => v_rule.frequency_interval)
            WHEN 'WEEKLY' THEN v_local_now - make_interval(days => 7 * v_rule.frequency_interval)
            WHEN 'MONTHLY' THEN v_local_now - make_interval(months => v_rule.frequency_interval)
            WHEN 'YEARLY' THEN v_local_now - make_interval(years => v_rule.frequency_interval)
            ELSE NULL END;
        IF v_window_start IS NULL OR v_rule.frequency_interval < 1 OR v_rule.usage_limit < 1 THEN
            RETURN 'Benefit usage rule is invalid';
        END IF;
        SELECT COALESCE(sum(r.quantity), 0)::integer INTO v_count
          FROM redemptions r
          JOIN entity_status es ON es.entity_status_id = r.redemption_status_id
          JOIN statuses st ON st.status_id = es.status_id
         WHERE r.subscription_id = p_subscription_id AND r.benefit_id = p_benefit_id
           AND ((r.redemption_datetime AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE v_zone) >= v_window_start
           AND st.status_code = 'SUCCESS';
        IF v_count >= v_rule.usage_limit THEN RETURN 'Benefit usage limit has been reached'; END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_benefit_rejection(
    p_organization_id varchar, p_subscription_id varchar, p_benefit_id varchar, p_store_id varchar
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_reason text;
    v_snapshot jsonb;
    v_benefit jsonb;
    v_mode text;
BEGIN
    v_reason := counter_benefit_rejection(p_organization_id, p_subscription_id, p_benefit_id);
    IF v_reason IS NOT NULL OR p_store_id IS NULL THEN RETURN v_reason; END IF;
    SELECT r.snapshot_data INTO v_snapshot
      FROM organization o JOIN customer_experience_release r
        ON r.customer_experience_release_id = o.published_customer_experience_release_id
      JOIN entity_status es ON es.entity_status_id = r.release_status_id
      JOIN statuses st ON st.status_id = es.status_id
     WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
       AND NOT r.is_deleted AND st.status_code = 'PUBLISHED';
    IF v_snapshot IS NULL THEN RETURN 'Published Customer Experience is unavailable'; END IF;
    SELECT item INTO v_benefit
      FROM jsonb_array_elements(COALESCE(v_snapshot->'benefits', '[]'::jsonb)) item
     WHERE item->>'id' = p_benefit_id LIMIT 1;
    v_mode := v_benefit->'storeAvailability'->>'mode';
    IF v_mode IS NULL THEN RETURN 'Benefit Store availability is unavailable'; END IF;
    IF v_mode = 'ALL_STORES' THEN RETURN NULL; END IF;
    IF v_mode = 'SELECTED_STORES' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
            COALESCE(v_benefit->'storeAvailability'->'storeIds', '[]'::jsonb)
        ) id WHERE id = p_store_id
    ) THEN RETURN NULL; END IF;
    RETURN 'Benefit is not available at this Store';
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_offer_rejection(
    p_organization_id varchar, p_subscription_id varchar,
    p_offer_id varchar, p_store_id varchar DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_sub record;
    v_snapshot jsonb;
    v_offer jsonb;
    v_rule record;
    v_now timestamp;
    v_window timestamp;
    v_count integer;
    v_zone text;
    v_store_mode text;
BEGIN
    SELECT s.start_date, s.end_date, sp.membership_product_id, ss.status_code
      INTO v_sub FROM subscriptions s
      JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id AND NOT ou.is_deleted
      JOIN organization_user_types ot ON ot.organization_user_type_id=ou.organization_user_type_id
      JOIN "user" u ON u.user_id=ou.user_id AND NOT u.is_deleted
      JOIN entity_status us ON us.entity_status_id=u.user_status_id JOIN statuses ust ON ust.status_id=us.status_id
      JOIN entity_status ous ON ous.entity_status_id=ou.organization_user_status_id JOIN statuses ost ON ost.status_id=ous.status_id
      JOIN subscription_plans sp ON sp.subscription_plan_id=s.subscription_plan_id
      JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id
           AND mp.organization_id=p_organization_id AND NOT mp.is_deleted
      JOIN entity_status ses ON ses.entity_status_id=s.subscription_status_id JOIN statuses ss ON ss.status_id=ses.status_id
     WHERE s.subscription_id=p_subscription_id AND NOT s.is_deleted AND ou.organization_id=p_organization_id
       AND ot.organization_user_type_code='CUSTOMER' AND ust.status_code='ACTIVE' AND ost.status_code='ACTIVE';
    IF NOT FOUND THEN RETURN 'Subscription is not available for this organization'; END IF;
    IF v_sub.status_code <> 'ACTIVE' OR CURRENT_DATE NOT BETWEEN v_sub.start_date AND v_sub.end_date THEN
        RETURN 'Subscription is not active today';
    END IF;

    SELECT r.snapshot_data INTO v_snapshot
      FROM organization o JOIN customer_experience_release r
        ON r.customer_experience_release_id = o.published_customer_experience_release_id
      JOIN entity_status es ON es.entity_status_id = r.release_status_id
      JOIN statuses st ON st.status_id = es.status_id
     WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
       AND NOT r.is_deleted AND st.status_code = 'PUBLISHED';
    IF v_snapshot IS NULL THEN RETURN 'Published Customer Experience is unavailable'; END IF;
    SELECT item INTO v_offer
      FROM jsonb_array_elements(COALESCE(v_snapshot->'offers', '[]'::jsonb)) item
     WHERE item->>'id' = p_offer_id LIMIT 1;
    IF v_offer IS NULL
       OR ((v_offer->>'effectiveDate') IS NOT NULL AND CURRENT_DATE < (v_offer->>'effectiveDate')::date)
       OR ((v_offer->>'expiryDate') IS NOT NULL AND CURRENT_DATE > (v_offer->>'expiryDate')::date)
       OR (NULLIF(v_offer->>'membershipProductId','') IS NOT NULL
           AND v_offer->>'membershipProductId' <> v_sub.membership_product_id) THEN
        RETURN 'Offer is not active for this membership';
    END IF;
    IF p_store_id IS NOT NULL THEN
        v_store_mode := v_offer->'storeAvailability'->>'mode';
        IF v_store_mode = 'SELECTED_STORES' THEN
            IF NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(
                    COALESCE(v_offer->'storeAvailability'->'storeIds','[]'::jsonb)
                ) id WHERE id = p_store_id
            ) THEN RETURN 'Offer is not available at this store'; END IF;
        ELSIF v_store_mode IS NULL AND NULLIF(v_offer->>'storeId','') IS NOT NULL
              AND v_offer->>'storeId' <> p_store_id THEN
            RETURN 'Offer is not available at this store';
        END IF;
    END IF;

    FOR v_rule IN
        SELECT item->>'frequencyType' AS frequency_type,
               (item->>'frequencyInterval')::integer AS frequency_interval,
               (item->>'usageLimit')::integer AS usage_limit,
               item->>'timeZone' AS time_zone,
               (item->>'effectiveDate')::date AS effective_date,
               (item->>'expiryDate')::date AS expiry_date,
               (item->>'windowStartTime')::time AS window_start_time,
               (item->>'windowEndTime')::time AS window_end_time,
               item->'applicableDays' AS applicable_days
          FROM jsonb_array_elements(COALESCE(v_snapshot->'offerUsageRules','[]'::jsonb)) item
         WHERE item->>'offerId' = p_offer_id
           AND COALESCE((item->>'isDeleted')::boolean,false) = false
    LOOP
        v_zone := COALESCE(NULLIF(trim(v_rule.time_zone),''),'UTC');
        BEGIN v_now := CURRENT_TIMESTAMP AT TIME ZONE v_zone;
        EXCEPTION WHEN invalid_parameter_value THEN RETURN 'Offer usage rule has an invalid time zone'; END;
        IF (v_rule.effective_date IS NOT NULL AND v_now::date < v_rule.effective_date)
           OR (v_rule.expiry_date IS NOT NULL AND v_now::date > v_rule.expiry_date) THEN
            RETURN 'Offer usage rule is outside its valid period';
        END IF;
        IF v_rule.applicable_days IS NOT NULL AND jsonb_typeof(v_rule.applicable_days) = 'array'
           AND jsonb_array_length(v_rule.applicable_days) > 0
           AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(v_rule.applicable_days) d
               WHERE upper(d) IN (upper(trim(to_char(v_now,'DAY'))),upper(trim(to_char(v_now,'DY'))))
           ) THEN RETURN 'Offer is not available today'; END IF;
        IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NOT NULL AND
           ((v_rule.window_start_time <= v_rule.window_end_time AND
             (v_now::time < v_rule.window_start_time OR v_now::time > v_rule.window_end_time)) OR
            (v_rule.window_start_time > v_rule.window_end_time AND
             v_now::time < v_rule.window_start_time AND v_now::time > v_rule.window_end_time)) THEN
            RETURN 'Offer usage rule is outside its valid period';
        END IF;
        IF v_rule.window_start_time IS NOT NULL AND v_rule.window_end_time IS NULL
           AND v_now::time < v_rule.window_start_time THEN
            RETURN 'Offer usage rule is outside its valid period';
        END IF;
        IF v_rule.window_end_time IS NOT NULL AND v_rule.window_start_time IS NULL
           AND v_now::time > v_rule.window_end_time THEN
            RETURN 'Offer usage rule is outside its valid period';
        END IF;
        v_window := CASE upper(v_rule.frequency_type)
            WHEN 'ONE_TIME' THEN v_sub.start_date::timestamp
            WHEN 'DAILY' THEN v_now-make_interval(days=>v_rule.frequency_interval)
            WHEN 'WEEKLY' THEN v_now-make_interval(days=>7*v_rule.frequency_interval)
            WHEN 'MONTHLY' THEN v_now-make_interval(months=>v_rule.frequency_interval)
            WHEN 'YEARLY' THEN v_now-make_interval(years=>v_rule.frequency_interval)
            ELSE NULL END;
        IF v_window IS NULL OR v_rule.frequency_interval < 1 OR v_rule.usage_limit < 1 THEN
            RETURN 'Offer usage rule is invalid';
        END IF;
        SELECT COALESCE(sum(quantity),0)::integer INTO v_count
          FROM offer_redemptions
         WHERE subscription_id=p_subscription_id AND offer_id=p_offer_id AND status='SUCCESS'
           AND ((redeemed_at AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE v_zone) >= v_window;
        IF v_count >= v_rule.usage_limit THEN RETURN 'Offer usage limit has been reached'; END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_redemption_item_status(
    p_organization_id varchar, p_subscription_id varchar, p_user_id varchar
) RETURNS TABLE("itemId" varchar, "itemType" varchar, status varchar, "displayReason" varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_membership_product_id varchar;
    v_snapshot jsonb;
BEGIN
    SELECT sp.membership_product_id INTO v_membership_product_id
      FROM subscriptions s
      JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id AND NOT ou.is_deleted
      JOIN organization_user_types ot ON ot.organization_user_type_id = ou.organization_user_type_id
      JOIN "user" u ON u.user_id = ou.user_id AND NOT u.is_deleted
      JOIN entity_status ues ON ues.entity_status_id = u.user_status_id
      JOIN statuses ust ON ust.status_id = ues.status_id
      JOIN entity_status oes ON oes.entity_status_id = ou.organization_user_status_id
      JOIN statuses ost ON ost.status_id = oes.status_id
      JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
     WHERE s.subscription_id = p_subscription_id AND ou.organization_id = p_organization_id
       AND ou.user_id = p_user_id AND ot.organization_user_type_code = 'CUSTOMER'
       AND ust.status_code = 'ACTIVE' AND ost.status_code = 'ACTIVE' AND NOT s.is_deleted;
    IF v_membership_product_id IS NULL THEN
        RAISE EXCEPTION 'Customer subscription is not available' USING ERRCODE = '42501';
    END IF;
    SELECT r.snapshot_data INTO v_snapshot
      FROM organization o JOIN customer_experience_release r
        ON r.customer_experience_release_id = o.published_customer_experience_release_id
      JOIN entity_status es ON es.entity_status_id = r.release_status_id
      JOIN statuses st ON st.status_id = es.status_id
     WHERE o.organization_id = p_organization_id AND NOT o.is_deleted
       AND NOT r.is_deleted AND st.status_code = 'PUBLISHED';
    IF v_snapshot IS NULL THEN
        RAISE EXCEPTION 'Published Customer Experience is unavailable' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH published_product AS (
        SELECT item AS product
          FROM jsonb_array_elements(COALESCE(v_snapshot->'membershipProducts','[]'::jsonb)) item
         WHERE item->>'id' = v_membership_product_id
    ), candidates AS (
        SELECT b->>'id' AS item_id, 'BENEFIT'::text AS item_type,
               counter_benefit_rejection(p_organization_id,p_subscription_id,b->>'id') AS rejection_reason
          FROM published_product p
          CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(p.product->'benefitIds','[]'::jsonb)) bid
          JOIN LATERAL jsonb_array_elements(COALESCE(v_snapshot->'benefits','[]'::jsonb)) b
            ON b->>'id' = bid
        UNION ALL
        SELECT o->>'id' AS item_id, 'OFFER'::text AS item_type,
               counter_offer_rejection(p_organization_id,p_subscription_id,o->>'id',NULL) AS rejection_reason
          FROM jsonb_array_elements(COALESCE(v_snapshot->'offers','[]'::jsonb)) o
         WHERE NULLIF(o->>'membershipProductId','') IS NULL
            OR o->>'membershipProductId' = v_membership_product_id
    ), classified AS (
        SELECT item_id,item_type,
               CASE WHEN rejection_reason IS NULL THEN 'AVAILABLE'
                    WHEN rejection_reason ILIKE '%usage limit has been reached%' THEN 'LIMIT_REACHED'
                    WHEN rejection_reason ILIKE '%not available today%' THEN 'UNAVAILABLE_TODAY'
                    WHEN rejection_reason ILIKE '%outside its valid period%' THEN 'UNAVAILABLE'
                    WHEN rejection_reason ILIKE '%not active for this membership%' THEN 'NOT_APPLICABLE'
                    ELSE 'INACTIVE' END::varchar AS item_status
          FROM candidates
    )
    SELECT item_id::varchar,item_type::varchar,item_status,
           (CASE item_status WHEN 'LIMIT_REACHED' THEN 'Usage limit reached'
                WHEN 'UNAVAILABLE_TODAY' THEN 'Unavailable today'
                WHEN 'UNAVAILABLE' THEN 'Unavailable right now'
                WHEN 'NOT_APPLICABLE' THEN 'Not available with this membership'
                WHEN 'INACTIVE' THEN 'Unavailable' ELSE NULL END)::varchar
      FROM classified ORDER BY item_type,item_id;
END;
$function$;

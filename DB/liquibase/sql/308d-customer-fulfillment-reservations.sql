-- Phase 308 customer activity and entitlement reservation safety.

CREATE FUNCTION "${schemaName}".customer_fulfillment_orders_projection(
    p_org varchar,p_actor varchar,p_fulfillment varchar,p_subscription varchar,p_limit integer,p_offset integer,p_active_only boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
WITH page AS MATERIALIZED (
    SELECT f.*, s.store_name, st.status_code AS state, w.status_code AS workflow, pt.status_code AS payment_timing,
           t.status_code AS fulfillment_type, rt_kind.status_code AS request_timing,
           c.subscription_id AS commerce_subscription, rt.subscription_id AS redemption_subscription,
           c.status AS commerce_status,c.total_minor,c.currency_code,c.provider_transaction_id,
           rt.status AS redemption_status,r.transaction_receipt_id,
           c.commerce_transaction_id AS owned_commerce_id,rt.redemption_transaction_id AS owned_redemption_id
    FROM fulfillments f
    JOIN stores s ON s.store_id=f.store_id AND s.organization_id=f.organization_id
    JOIN statuses st ON st.status_id=f.fulfillment_status_id
    JOIN statuses w ON w.status_id=f.workflow_mode_status_id
    JOIN statuses pt ON pt.status_id=f.payment_timing_status_id
    JOIN statuses t ON t.status_id=f.fulfillment_type_status_id
    JOIN statuses rt_kind ON rt_kind.status_id=f.request_timing_status_id
    LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id AND c.organization_id=f.organization_id
      AND c.customer_user_id=f.customer_user_id AND c.store_id=f.store_id AND NOT c.is_deleted
    LEFT JOIN redemption_transaction rt ON rt.redemption_transaction_id=f.redemption_transaction_id
      AND rt.organization_id=f.organization_id AND rt.store_id=f.store_id
      AND customer_fulfillment_subscription_owned(f.organization_id,rt.subscription_id,f.customer_user_id)
    LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id=c.commerce_transaction_id
      AND r.organization_id=f.organization_id AND r.customer_user_id=f.customer_user_id
    WHERE f.organization_id=p_org AND f.customer_user_id=p_actor
      AND (p_fulfillment IS NULL OR f.fulfillment_id=p_fulfillment) AND (NOT p_active_only OR st.status_code NOT IN ('FULFILLED','CANCELLED'))
      AND (p_subscription IS NULL OR (p_subscription=coalesce(rt.subscription_id,c.subscription_id)
        AND (f.redemption_transaction_id IS NULL OR rt.redemption_transaction_id IS NOT NULL)
        AND (f.commerce_transaction_id IS NULL OR c.commerce_transaction_id IS NOT NULL)
        AND (rt.subscription_id IS NULL OR c.subscription_id IS NULL OR rt.subscription_id=c.subscription_id)
        AND customer_fulfillment_subscription_owned(p_org,p_subscription,p_actor)))
    ORDER BY f.accepted_at DESC,f.fulfillment_id DESC
    LIMIT CASE WHEN p_active_only THEN NULL ELSE greatest(1,least(coalesce(p_limit,25),51)) END
    OFFSET greatest(coalesce(p_offset,0),0)
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',f.fulfillment_id,'customerLabel',coalesce(f.effective_policy_snapshot->>'customerLabel','Order'),
    'referenceNumber',f.fulfillment_number,'storeName',f.store_name,'status',f.state,
    'workflow',f.workflow,'fulfillmentType',f.fulfillment_type,'requestTiming',f.request_timing,
    'paymentTiming',f.payment_timing,'commerceId',f.owned_commerce_id,
    'redemptionId',f.owned_redemption_id,'redemptionState',f.redemption_status,'receiptId',f.transaction_receipt_id,
    'acceptedAt',f.accepted_at AT TIME ZONE 'UTC','fulfilledAt',f.fulfilled_at AT TIME ZONE 'UTC',
    'expectedCollectionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN f.expected_collection_at AT TIME ZONE 'UTC' END,
    'collectionWindowEndsAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN (f.expected_collection_at + make_interval(mins=>(f.effective_policy_snapshot->>'collectionWindowMinutes')::integer)) AT TIME ZONE 'UTC' END,
    'expectedCompletionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCompletion' IS DISTINCT FROM 'false'
      THEN f.expected_completion_at AT TIME ZONE 'UTC' END,
    'timezone',coalesce(f.effective_policy_snapshot->>'collectionTimeZone',(SELECT timezone FROM stores WHERE store_id=f.store_id)),'currencyCode',f.currency_code,'totalMinor',f.total_minor,
    'verifiedSavingsMinor',verified.net_savings_minor,
    'paymentState',CASE WHEN f.total_minor=0 THEN 'NO_PAYMENT_REQUIRED'
        WHEN f.transaction_receipt_id IS NOT NULL AND f.commerce_status='COMPLETED' THEN 'PAID'
        WHEN EXISTS (
            SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
            WHERE i.commerce_transaction_id=f.owned_commerce_id AND i.organization_id=f.organization_id
              AND i.customer_user_id=f.customer_user_id AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
              AND v.organization_id=i.organization_id AND v.provider_transaction_id=f.provider_transaction_id
              AND v.amount_minor=f.total_minor AND v.currency_code=f.currency_code
        ) THEN 'PAID'
        WHEN f.commerce_status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING') AND EXISTS (
            SELECT 1 FROM commerce_provider_payment_attempts a
            WHERE a.commerce_transaction_id=f.owned_commerce_id AND a.provider_status='SUCCEEDED'
            HAVING count(*)=1 AND count(*) FILTER (WHERE a.amount_minor=f.total_minor AND a.currency_code=f.currency_code
              AND a.provider_transaction_id=f.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),'') IS NOT NULL)=1
        ) THEN 'PAYMENT_RECEIVED'
        WHEN f.commerce_status='PROVIDER_IN_PROGRESS' THEN 'PAYMENT_PENDING'
        WHEN f.commerce_status='PROVIDER_FAILED' THEN 'PAYMENT_FAILED'
        WHEN f.commerce_status='CANCELLED' THEN 'PAYMENT_CANCELLED'
        WHEN f.payment_timing='PAY_AT_COUNTER' AND f.commerce_status='ORDER_CREATED' THEN 'UNPAID'
        ELSE 'PAYMENT_UNCONFIRMED' END,
    'refundStates',coalesce((SELECT jsonb_agg(DISTINCT pr.execution_status) FROM payment_refunds pr
        WHERE pr.organization_id=p_org AND f.commerce_status IS NOT NULL AND (
          pr.commerce_transaction_id=f.owned_commerce_id OR EXISTS (
            SELECT 1 FROM payment_intents i WHERE i.payment_intent_id=pr.payment_intent_id
              AND i.commerce_transaction_id=f.owned_commerce_id AND i.customer_user_id=f.customer_user_id
          )
        )),'[]'),
    'lines',CASE WHEN p_fulfillment IS NOT NULL OR p_active_only THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.commerce_transaction_line_id,'name',l.description,'quantity',l.quantity,
        'fulfilledQuantity',(SELECT sum(res.consumed_quantity)::integer FROM redemption_entitlement_reservations res
          JOIN redemption_transaction_item item USING (redemption_transaction_item_id)
          WHERE res.fulfillment_id=f.fulfillment_id AND item.redemption_transaction_id=f.redemption_transaction_id
            AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id),
        'unitPriceMinor',l.unit_price_minor_authoritative,'discountMinor',coalesce((SELECT sum(a.applied_amount_minor)
            FROM commerce_transaction_adjustments a WHERE a.commerce_transaction_id=l.commerce_transaction_id
              AND a.target_line_id=l.commerce_transaction_line_id AND a.status='APPLIED' AND NOT a.is_deleted),0)
     ) ORDER BY l.created_at,l.commerce_transaction_line_id)
        FROM commerce_transaction_lines l WHERE l.commerce_transaction_id=f.commerce_transaction_id AND NOT l.is_deleted
        AND f.commerce_status IS NOT NULL),'[]') END,
    'timeline',CASE WHEN p_fulfillment IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',a.fulfillment_action_id,'type',action.status_code,'at',a.action_at AT TIME ZONE 'UTC'
    ) ORDER BY a.action_at,a.fulfillment_action_id) FROM fulfillment_actions a JOIN statuses action ON action.status_id=a.action_type_status_id
      WHERE a.fulfillment_id=f.fulfillment_id),'[]') END,
    'version',f.version_no,
    'canRequestCancellation',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerCancellationRequestsEnabled":true}'
        AND (f.expected_collection_at IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')<=f.expected_collection_at
          - make_interval(mins=>coalesce((f.effective_policy_snapshot->>'cancellationCutoffMinutes')::integer,0))),
    'canRequestCollectionChange',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerExtensionRequestsEnabled":true}'
        AND (SELECT ast.status_code FROM fulfillment_actions a JOIN statuses ast ON ast.status_id=a.action_type_status_id
            WHERE a.fulfillment_id=f.fulfillment_id AND ast.status_code IN
              ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED')
            ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1) IS DISTINCT FROM 'COLLECTION_CHANGE_REQUESTED'
) ORDER BY f.accepted_at DESC,f.fulfillment_id DESC),'[]')::text
FROM page f
LEFT JOIN LATERAL get_customer_transaction_actual_savings(p_actor,ARRAY[f.commerce_transaction_id]) verified
    ON p_fulfillment IS NOT NULL AND f.state='FULFILLED' AND verified.verification_state='VERIFIED'
    AND verified.currency_code=f.currency_code;
$body$;

-- Keep the six-argument history and details contract and its existing grants.
REVOKE ALL ON FUNCTION "${schemaName}".customer_fulfillment_orders_projection(
    varchar,varchar,varchar,varchar,integer,integer,boolean
) FROM PUBLIC,"${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_fulfillment_orders(
    p_org varchar,p_actor varchar,p_fulfillment varchar,p_subscription varchar,p_limit integer,p_offset integer
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT customer_fulfillment_orders_projection(p_org,p_actor,p_fulfillment,p_subscription,p_limit,p_offset,false);
$body$;

-- Holds count against the same published windows as recorded usage. An
-- unresolved hold remains linked until its persisted quantity is released.
CREATE FUNCTION "${schemaName}".fulfillment_open_hold_slots(
    p_org varchar,p_sub varchar,p_kind varchar,p_item varchar,p_zone text
) RETURNS TABLE(quantity integer,scheduled_at timestamp)
LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT h.reserved_quantity-h.consumed_quantity-h.released_quantity,
        greatest(coalesce(f.expected_collection_at,h.reserved_at),CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          AT TIME ZONE 'UTC' AT TIME ZONE p_zone
    FROM redemption_entitlement_reservations h
    JOIN statuses hs ON hs.status_id=h.reservation_status_id AND hs.status_code='RESERVED'
    JOIN fulfillments f USING(fulfillment_id)
    JOIN redemption_transaction_item i ON i.redemption_transaction_item_id=h.redemption_transaction_item_id
    JOIN redemption_transaction t ON t.redemption_transaction_id=i.redemption_transaction_id
      AND t.redemption_transaction_id=f.redemption_transaction_id
    WHERE t.organization_id=p_org AND f.organization_id=p_org AND t.subscription_id=p_sub
      AND i.item_type=p_kind AND coalesce(i.benefit_id,i.offer_id)=p_item
      AND h.reserved_quantity>h.consumed_quantity+h.released_quantity;
$body$;

-- A new use affects the window ending at its own time and later windows
-- ending at an outstanding pickup. Count each such window independently.
CREATE FUNCTION "${schemaName}".fulfillment_reservation_blocks_use(
    p_org varchar,p_sub varchar,p_kind varchar,p_item varchar,p_at timestamp,p_start timestamp,
    p_period interval,p_limit integer,p_zone text
) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
WITH holds AS MATERIALIZED (
    SELECT h.* FROM fulfillment_open_hold_slots(p_org,p_sub,p_kind,p_item,p_zone) h
    WHERE h.scheduled_at>=p_start
      AND (p_period IS NULL OR h.scheduled_at<=p_at OR h.scheduled_at-p_period<=p_at)
), windows AS (
    SELECT p_at AS ends,p_start AS starts WHERE EXISTS (SELECT 1 FROM holds)
    UNION
    SELECT h.scheduled_at,coalesce(h.scheduled_at-p_period,p_start)
    FROM holds h WHERE h.scheduled_at>p_at
), usage AS MATERIALIZED (
    SELECT r.quantity,((r.redemption_datetime AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE p_zone) AS used_at
    FROM redemptions r JOIN entity_status es ON es.entity_status_id=r.redemption_status_id
    JOIN statuses st ON st.status_id=es.status_id AND st.status_code='SUCCESS'
    WHERE p_kind='BENEFIT' AND r.subscription_id=p_sub AND r.benefit_id=p_item AND EXISTS (SELECT 1 FROM holds)
    UNION ALL
    SELECT r.quantity,((r.redeemed_at AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE p_zone)
    FROM offer_redemptions r
    WHERE p_kind='OFFER' AND r.organization_id=p_org AND r.subscription_id=p_sub AND r.offer_id=p_item AND r.status='SUCCESS'
      AND EXISTS (SELECT 1 FROM holds)
)
SELECT EXISTS (
    SELECT 1 FROM windows w
    CROSS JOIN LATERAL (
        SELECT sum(h.quantity) AS quantity FROM holds h WHERE h.scheduled_at BETWEEN w.starts AND w.ends
    ) held
    WHERE held.quantity>0 AND held.quantity + coalesce(
        (SELECT sum(u.quantity) FROM usage u WHERE u.used_at BETWEEN w.starts AND w.ends),0
    )>=p_limit
);
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_open_hold_slots(varchar,varchar,varchar,varchar,text),
    "${schemaName}".fulfillment_reservation_blocks_use(varchar,varchar,varchar,varchar,timestamp,timestamp,interval,integer,text)
FROM PUBLIC,"${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_benefit_rejection_at(
    p_organization_id varchar, p_subscription_id varchar, p_benefit_id varchar,p_at timestamptz
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
    v_period interval;
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
    IF v_sub.status_code <> 'ACTIVE' OR p_at::date < v_sub.start_date
       OR p_at::date > v_sub.end_date THEN
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
       AND p_at::date < (v_benefit->>'effectiveDate')::date THEN
        RETURN 'Benefit is not active for this membership';
    END IF;
    IF (v_benefit->>'expiryDate') IS NOT NULL
       AND p_at::date > (v_benefit->>'expiryDate')::date THEN
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
            v_local_now := p_at AT TIME ZONE v_zone;
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
        v_period := CASE upper(v_rule.frequency_type)
            WHEN 'DAILY' THEN make_interval(days=>v_rule.frequency_interval)
            WHEN 'WEEKLY' THEN make_interval(days=>7*v_rule.frequency_interval)
            WHEN 'MONTHLY' THEN make_interval(months=>v_rule.frequency_interval)
            WHEN 'YEARLY' THEN make_interval(years=>v_rule.frequency_interval)
            ELSE NULL END;
        IF fulfillment_reservation_blocks_use(p_organization_id,p_subscription_id,'BENEFIT',p_benefit_id,v_local_now,v_window_start,v_period,v_rule.usage_limit,v_zone) THEN RETURN 'Reserved entitlement usage limit has been reached'; END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".fulfillment_offer_rejection_at(
    p_organization_id varchar, p_subscription_id varchar,
    p_offer_id varchar, p_store_id varchar,p_at timestamptz
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
    v_period interval;
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
    IF v_sub.status_code <> 'ACTIVE' OR p_at::date NOT BETWEEN v_sub.start_date AND v_sub.end_date THEN
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
       OR ((v_offer->>'effectiveDate') IS NOT NULL AND p_at::date < (v_offer->>'effectiveDate')::date)
       OR ((v_offer->>'expiryDate') IS NOT NULL AND p_at::date > (v_offer->>'expiryDate')::date)
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
        BEGIN v_now := p_at AT TIME ZONE v_zone;
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
        v_period := CASE upper(v_rule.frequency_type)
            WHEN 'DAILY' THEN make_interval(days=>v_rule.frequency_interval)
            WHEN 'WEEKLY' THEN make_interval(days=>7*v_rule.frequency_interval)
            WHEN 'MONTHLY' THEN make_interval(months=>v_rule.frequency_interval)
            WHEN 'YEARLY' THEN make_interval(years=>v_rule.frequency_interval)
            ELSE NULL END;
        IF fulfillment_reservation_blocks_use(p_organization_id,p_subscription_id,'OFFER',p_offer_id,v_now,v_window,v_period,v_rule.usage_limit,v_zone) THEN RETURN 'Reserved entitlement usage limit has been reached'; END IF;
    END LOOP;
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_benefit_rejection(
    p_organization_id varchar,p_subscription_id varchar,p_benefit_id varchar
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT fulfillment_benefit_rejection_at(p_organization_id,p_subscription_id,p_benefit_id,CURRENT_TIMESTAMP);
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_offer_rejection(
    p_organization_id varchar,p_subscription_id varchar,p_offer_id varchar,p_store_id varchar DEFAULT NULL
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT fulfillment_offer_rejection_at(p_organization_id,p_subscription_id,p_offer_id,p_store_id,CURRENT_TIMESTAMP);
$body$;

CREATE FUNCTION "${schemaName}".assert_fulfillment_pickup_entitlements(
    p_org varchar,p_sub varchar,p_store varchar,p_benefits varchar[],p_offers varchar[],p_at timestamptz
) RETURNS void LANGUAGE plpgsql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE reason text;
BEGIN
    SELECT r.reason INTO reason FROM (
      SELECT fulfillment_benefit_rejection_at(p_org,p_sub,b,p_at) AS reason FROM unnest(p_benefits) b
      UNION ALL SELECT fulfillment_offer_rejection_at(p_org,p_sub,o,p_store,p_at) FROM unnest(p_offers) o
    ) r WHERE r.reason IS NOT NULL LIMIT 1;
    IF FOUND THEN RAISE EXCEPTION 'Selected entitlement is unavailable at pickup: %',reason USING ERRCODE='23505'; END IF;
END;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_benefit_rejection_at(varchar,varchar,varchar,timestamptz),
    "${schemaName}".fulfillment_offer_rejection_at(varchar,varchar,varchar,varchar,timestamptz),
    "${schemaName}".assert_fulfillment_pickup_entitlements(varchar,varchar,varchar,varchar[],varchar[],timestamptz)
FROM PUBLIC,"${appRole}";

-- An already-issued QR or an unsettled Counter checkout has priority over a
-- new advance hold. Counter preparation and execution reuse shared eligibility.
CREATE FUNCTION "${schemaName}".fulfillment_has_competing_counter_redemption(
    p_org varchar,p_sub varchar,p_benefits varchar[],p_offers varchar[]
) RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT EXISTS (
      SELECT 1 FROM redemption_transaction t JOIN redemption_transaction_item i USING(redemption_transaction_id)
      WHERE t.organization_id=p_org AND t.subscription_id=p_sub AND t.status='PENDING'
        AND (i.benefit_id=ANY(p_benefits) OR i.offer_id=ANY(p_offers))
        AND (t.expires_at IS NULL OR t.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          OR EXISTS (
             SELECT 1 FROM commerce_transaction_redemptions x JOIN commerce_transactions c USING(commerce_transaction_id)
             WHERE x.redemption_transaction_id=t.redemption_transaction_id AND NOT x.is_deleted
               AND c.organization_id=p_org AND NOT c.is_deleted AND c.status NOT IN ('COMPLETED','CANCELLED')
          ))
    );
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".fulfillment_has_competing_counter_redemption(varchar,varchar,varchar[],varchar[])
    FROM PUBLIC,"${appRole}";

CREATE FUNCTION "${schemaName}".get_customer_fulfillment_activity(p_org varchar,p_actor varchar,p_sub varchar)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT jsonb_build_object(
      'orders',customer_fulfillment_orders_projection(p_org,p_actor,NULL,p_sub,51,0,true)::jsonb,
      'reservations',coalesce((
        SELECT jsonb_agg(jsonb_build_object('itemType',i.item_type,'itemId',coalesce(i.benefit_id,i.offer_id),
          'fulfillmentId',f.fulfillment_id,'referenceNumber',f.fulfillment_number,
          'quantity',h.reserved_quantity-h.consumed_quantity-h.released_quantity)
          ORDER BY f.accepted_at DESC,f.fulfillment_id)
        FROM redemption_entitlement_reservations h
        JOIN statuses s ON s.status_id=h.reservation_status_id AND s.status_code='RESERVED'
        JOIN fulfillments f USING(fulfillment_id)
        JOIN redemption_transaction_item i ON i.redemption_transaction_item_id=h.redemption_transaction_item_id
          AND i.redemption_transaction_id=f.redemption_transaction_id
        JOIN redemption_transaction t ON t.redemption_transaction_id=i.redemption_transaction_id
          AND t.organization_id=f.organization_id
        WHERE f.organization_id=p_org AND f.customer_user_id=p_actor AND t.subscription_id=p_sub
          AND h.reserved_quantity>h.consumed_quantity+h.released_quantity
      ),'[]'),
      'itemStatuses',coalesce((
        SELECT jsonb_agg(to_jsonb(item)) FROM get_customer_redemption_item_status(p_org,p_sub,p_actor) item
      ),'[]')
    )::text
    WHERE customer_fulfillment_subscription_owned(p_org,p_sub,p_actor);
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_fulfillment_activity(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_fulfillment_activity(varchar,varchar,varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_redemption_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;

    v_actor varchar(64);
    v_success varchar(64);
    v_id varchar(64);
    v_number varchar(64);
    v_sequence bigint;
    v_eligibility_reason text;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    IF c.status = 'COMPLETED' THEN
        RETURN true;
    END IF;

    IF c.status <> 'PROVIDER_SUCCEEDED' THEN
        RAISE EXCEPTION 'Counter redemption provider payment has not succeeded'
            USING ERRCODE = '23505';
    END IF;

    SELECT rt.*
      INTO t
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     FOR UPDATE OF rt;

    IF NOT FOUND OR t.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Pending redemption transaction is unavailable'
            USING ERRCODE = '23505';
    END IF;

    PERFORM 1 FROM subscriptions WHERE subscription_id=t.subscription_id FOR UPDATE;

    SELECT es.entity_status_id
      INTO v_success
      FROM entity_status es
      JOIN entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'REDEMPTION'
       AND st.status_code = 'SUCCESS'
       AND es.is_active;

    IF v_success IS NULL THEN
        RAISE EXCEPTION 'Successful redemption status is unavailable'
            USING ERRCODE = '23503';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        IF i.status = 'SUCCESS' THEN
            CONTINUE;
        END IF;

        IF i.status <> 'PENDING' THEN
            RAISE EXCEPTION 'Redemption transaction item is not pending'
                USING ERRCODE = '23505';
        END IF;

        -- A prepared QR is not evidence that entitlement capacity still exists.
        -- Existing payment recovery retains any capture when this check fails.
        v_eligibility_reason := CASE WHEN i.item_type='BENEFIT'
            THEN counter_benefit_rejection(c.organization_id,t.subscription_id,i.benefit_id,t.store_id)
            ELSE counter_offer_rejection(c.organization_id,t.subscription_id,i.offer_id,t.store_id) END;
        IF v_eligibility_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_eligibility_reason USING ERRCODE='23505';
        END IF;

        IF i.item_type = 'BENEFIT' THEN
            v_id := generate_runtime_id('RDM');
            v_sequence := next_business_sequence(
                'REDEMPTION',
                t.subscription_id
            );

            SELECT (
                subscription_number
                || '_RDM_'
                || lpad(v_sequence::text, 3, '0')
            )::varchar(64)
              INTO v_number
              FROM subscriptions
             WHERE subscription_id = t.subscription_id;

            INSERT INTO redemptions (
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
                v_id,
                v_number,
                t.subscription_id,
                i.benefit_id,
                c.store_id,
                t.staff_id,
                v_success,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSIF i.item_type = 'OFFER' THEN
            v_id := generate_runtime_id('ORD');

            INSERT INTO offer_redemptions (
                offer_redemption_id,
                redemption_transaction_id,
                redemption_transaction_item_id,
                organization_id,
                subscription_id,
                offer_id,
                store_id,
                staff_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                t.redemption_transaction_id,
                i.redemption_transaction_item_id,
                c.organization_id,
                t.subscription_id,
                i.offer_id,
                c.store_id,
                t.staff_id,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET offer_redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSE
            RAISE EXCEPTION 'Unsupported redemption transaction item type'
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    UPDATE redemption_transaction
       SET status = 'SUCCESS',
           store_id = c.store_id,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_id = t.redemption_transaction_id;

    UPDATE commerce_transactions
       SET status = 'COMPLETED',
           completed_at = CURRENT_TIMESTAMP,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_fulfillment_stores(
    p_org varchar,p_subscription varchar,p_benefits varchar[],p_offers varchar[],p_actor varchar,p_advance boolean,p_test boolean,p_collect boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH items AS MATERIALIZED (
        SELECT 'BENEFIT'::varchar AS kind,id FROM unnest(p_benefits) id
        UNION ALL SELECT 'OFFER'::varchar,id FROM unnest(p_offers) id
    ), candidates AS MATERIALIZED (
        SELECT s.*,source.provider_code,source.integration_id,source.catalog_id,
            (source.provider_code<>'MEMGINE' AND source.integration_id=route.integration_configuration_id
                AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,IMMEDIATE_PAY_AT_COUNTER}'='true') AS immediate,
            (p_advance AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,ADVANCE_PAY_AT_COUNTER}'='true') AS advance,
            CASE WHEN p_advance AND p_collect AND s.policy #> '{journeys,ADVANCE_PAY_NOW}'='true'
                 THEN collect.currency END AS collect_currency
        FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s
        CROSS JOIN LATERAL fulfillment_store_pricing_source(p_org,s.store_id) source
        LEFT JOIN LATERAL fulfillment_counter_quote_route(p_org,s.store_id) route ON true
        LEFT JOIN LATERAL fulfillment_collect_route(p_org,s.store_id) collect ON p_advance AND p_collect
        WHERE s.policy @> '{"enabled":true}'
          AND EXISTS (SELECT 1 FROM items)
          AND NOT EXISTS (
            SELECT 1 FROM items i WHERE (CASE WHEN i.kind='BENEFIT'
              THEN counter_benefit_rejection(p_org,p_subscription,i.id,s.store_id)
              ELSE counter_offer_rejection(p_org,p_subscription,i.id,s.store_id) END) IS NOT NULL
          )
    ), products AS MATERIALIZED (
        SELECT i.kind,i.id,p.product_id,adjustment.currency_code
        FROM items i CROSS JOIN LATERAL fulfillment_redemption_item_products(p_org,i.kind,i.id) p
        CROSS JOIN LATERAL fulfillment_redemption_item_adjustment(p_org,i.kind,i.id) adjustment
    ), available AS (
        SELECT c.store_id,p.kind,p.id,price.product_id,price.product_name,price.product_code,
               price.currency=c.collect_currency AS can_pay_now
        FROM candidates c
        CROSS JOIN LATERAL fulfillment_store_product_prices(p_org,c.store_id,c.provider_code,c.integration_id,c.catalog_id,
            ARRAY(SELECT DISTINCT product_id FROM products)) price
        JOIN products p ON p.product_id=price.product_id
        WHERE (c.immediate OR c.advance OR price.currency=c.collect_currency)
          AND (p.currency_code IS NULL OR p.currency_code=price.currency)
    ), choices AS (
        SELECT a.store_id,a.kind,a.id,jsonb_agg(product ORDER BY a.product_name,a.product_id) AS options,
            jsonb_agg(product ORDER BY a.product_name,a.product_id) FILTER (WHERE a.can_pay_now) AS pay_now_options
        FROM available a CROSS JOIN LATERAL (SELECT jsonb_build_object(
            'productId',a.product_id,'productName',a.product_name,'productCode',a.product_code) AS product) v
        GROUP BY a.store_id,a.kind,a.id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.store_id,'name',c.store_name,'customerLabel',coalesce(c.policy->>'customerLabel','Order'),
        'journeys',(CASE WHEN c.immediate
                        THEN '["IMMEDIATE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN c.advance
                        THEN '["ADVANCE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN p.collect_count=p.count
                        THEN '["ADVANCE_PAY_NOW"]'::jsonb ELSE '[]'::jsonb END),
        'products',p.options,'payNowProducts',p.pay_now_options
    ) ORDER BY c.store_name,c.store_id),'[]')::text
    FROM candidates c CROSS JOIN LATERAL (
        SELECT count(*) AS count,count(ch.pay_now_options) AS collect_count,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.options) AS options,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.pay_now_options) FILTER (WHERE ch.pay_now_options IS NOT NULL) AS pay_now_options
        FROM choices ch WHERE ch.store_id=c.store_id
    ) p WHERE p.count=(SELECT count(*) FROM items) AND (c.immediate OR c.advance OR p.collect_count=p.count);
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".accept_customer_fulfillment(
    p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar,p_key varchar,p_hash varchar,
    p_benefits varchar[],p_offers varchar[],p_products jsonb,p_quote jsonb,
    p_expected_completion timestamptz,p_expected_collection timestamptz,p_intent varchar DEFAULT NULL
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
    replay varchar; organization_user_key varchar; policy jsonb; shop record; created record;
    f_id varchar; commerce_id varchar; line_id varchar; row_data record; money_line jsonb;
    line_evidence jsonb := '[]'; line_workflow varchar; workflow varchar := 'NONE';
    item_count integer := 0; inserted_item_count integer := 0; integration_id varchar; placed varchar; source_type varchar; now_utc timestamp;
    local_pricing boolean; payment_provider varchar; payment_integration varchar;
    payment_timing varchar; pay_now boolean; collect record; payment payment_intents%ROWTYPE;
    quote_total bigint := (p_quote->>'totalMinor')::bigint; quote_currency varchar := p_quote->>'currencyCode';
    checkout jsonb;
BEGIN
    -- Serialize retries by organization and request key, and reservation decisions by subscription.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org||':'||p_key,308));
    replay := get_customer_fulfillment_replay(p_org,p_actor,p_key,p_hash);
    IF replay IS NOT NULL THEN RETURN replay; END IF;
    pay_now := coalesce(p_quote->>'journey'='ADVANCE_PAY_NOW',false);
    payment_timing := CASE WHEN pay_now THEN 'PAY_NOW' ELSE 'PAY_AT_COUNTER' END;
    IF quote_total IS NULL OR quote_total<0 OR quote_currency IS NULL THEN
        RAISE EXCEPTION 'Authoritative quote totals are unavailable' USING ERRCODE='22023';
    END IF;
    SELECT s.organization_user_id INTO organization_user_key
    FROM subscriptions s JOIN organization_user u USING (organization_user_id)
    WHERE s.subscription_id=p_subscription AND u.organization_id=p_org AND u.user_id=p_actor
      AND NOT s.is_deleted AND NOT u.is_deleted FOR UPDATE OF s;
    IF NOT FOUND OR NOT customer_has_active_relationship(p_org,p_actor) THEN
        RAISE EXCEPTION 'Subscription is unavailable' USING ERRCODE='42501';
    END IF;
    IF p_intent IS NULL AND pay_now THEN
        SELECT i.* INTO payment FROM payment_intents i
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND i.idempotency_key=p_key
          AND i.fulfillment_checkout IS NOT NULL;
        IF FOUND THEN
            IF payment.fulfillment_checkout->>'requestHash' IS DISTINCT FROM p_hash THEN
                RAISE EXCEPTION 'This request key has already been used' USING ERRCODE='23505';
            END IF;
            RETURN payment.payment_intent_id;
        END IF;
    END IF;
    IF p_intent IS NULL AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
          AND i.fulfillment_checkout IS NOT NULL AND i.status='PROCESSING' AND i.idempotency_key<>p_key
    ) THEN RAISE EXCEPTION 'An existing checkout requires payment confirmation' USING ERRCODE='23505'; END IF;
    SELECT * INTO shop FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s WHERE s.store_id=p_store;
    policy := shop.policy;
    IF NOT coalesce(policy @> '{"enabled":true}' AND policy->'journeys'->(
        CASE WHEN pay_now THEN 'ADVANCE_PAY_NOW' ELSE 'ADVANCE_PAY_AT_COUNTER' END)='true',false) THEN
        RAISE EXCEPTION 'Advance fulfillment is unavailable at this Store' USING ERRCODE='22023';
    END IF;
    IF policy IS DISTINCT FROM p_quote->'policy' OR shop.timezone IS DISTINCT FROM p_quote->>'timezone' THEN
        RAISE EXCEPTION 'Collection policy changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF pay_now THEN
        IF p_intent IS NULL THEN
            SELECT * INTO collect FROM fulfillment_collect_route(p_org,p_store) r WHERE r.currency=quote_currency;
            IF NOT FOUND THEN RAISE EXCEPTION 'Customer payment is unavailable at this Store' USING ERRCODE='22023'; END IF;
            payment_integration := collect.integration_id;
        ELSE
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            JOIN poynt_collect_verified_captures capture ON capture.payment_intent_id=i.payment_intent_id
              AND capture.organization_id=i.organization_id AND capture.provider_transaction_id=i.provider_reference_id
              AND capture.amount_minor=quote_total AND capture.currency_code=quote_currency
              AND capture.merchant_business_id IS NOT NULL AND capture.merchant_store_id IS NOT NULL
            WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.customer_user_id=p_actor
              AND i.store_id=p_store AND i.status='PROCESSING' AND i.fulfillment_checkout IS NOT NULL
              AND i.amount*100=quote_total AND i.currency_code=quote_currency
              AND i.fulfillment_checkout->'quote'=p_quote
              AND i.fulfillment_checkout->'products'=p_products
              AND i.fulfillment_checkout->'benefits'=to_jsonb(p_benefits)
              AND i.fulfillment_checkout->'offers'=to_jsonb(p_offers)
              AND (i.fulfillment_checkout->>'expectedCompletion')::timestamptz=p_expected_completion
              AND (i.fulfillment_checkout->>'expectedCollection')::timestamptz=p_expected_collection
              AND c.organization_id=p_org AND c.customer_user_id=p_actor AND c.store_id=p_store
              AND c.subscription_id=p_subscription AND c.source_channel='CUSTOMER_FULFILLMENT'
              AND c.status='DRAFT' AND c.idempotency_key=p_key AND NOT c.is_deleted FOR UPDATE OF i;
            IF NOT FOUND THEN RAISE EXCEPTION 'Verified fulfillment capture is unavailable' USING ERRCODE='23505'; END IF;
            IF EXISTS (SELECT 1 FROM payment_refunds r WHERE r.payment_intent_id=p_intent AND r.approval_status<>'REJECTED') THEN
                RAISE EXCEPTION 'Captured fulfillment payment has a refund under review' USING ERRCODE='23505';
            END IF;
            payment_integration := payment.collect_integration_configuration_id;
        END IF;
        payment_provider := 'POYNT_COLLECT';
    ELSE
        SELECT route.provider_code,route.integration_configuration_id INTO payment_provider,payment_integration
        FROM fulfillment_counter_quote_route(p_org,p_store) route;
        IF p_intent IS NOT NULL OR payment_provider IS NULL OR payment_provider IS DISTINCT FROM p_quote->>'counterPaymentProvider' THEN
            RAISE EXCEPTION 'Counter payment route changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
    END IF;
    IF p_expected_completion IS NULL OR p_expected_collection IS NULL OR p_expected_collection<p_expected_completion
       OR p_expected_collection<transaction_timestamp() THEN
        RAISE EXCEPTION 'Collection time is no longer available' USING ERRCODE='22023';
    END IF;

    PERFORM assert_fulfillment_pickup_entitlements(p_org,p_subscription,p_store,p_benefits,p_offers,p_expected_collection);
    IF fulfillment_has_competing_counter_redemption(p_org,p_subscription,p_benefits,p_offers) THEN
        RAISE EXCEPTION 'Finish the existing Counter redemption or wait for the QR to expire' USING ERRCODE='23505';
    END IF;

    now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    SELECT status_id INTO STRICT placed FROM statuses WHERE status_code='PLACED';
    f_id := generate_runtime_id('FUL');
    commerce_id := coalesce(payment.commerce_transaction_id,generate_runtime_id('CTX'));
    local_pricing := p_quote->>'providerCode' = 'MEMGINE';

    FOR row_data IN SELECT * FROM fulfillment_redemption_quote_rows(p_org,p_store,p_subscription,p_benefits,p_offers,p_products) LOOP
        item_count := item_count+1;
        SELECT element INTO STRICT money_line FROM jsonb_array_elements(p_quote->'lines') element
        WHERE element->>'itemType'=row_data."itemType" AND element->>'itemId'=row_data."itemId";
        IF money_line->>'mappingId' IS DISTINCT FROM row_data."commerceProductMappingId"
           OR (money_line->>'mappingVersion')::integer IS DISTINCT FROM row_data."mappingVersionNo"
           OR money_line->>'adjustmentId' IS DISTINCT FROM row_data."commerceAdjustmentId"
           OR (money_line->>'adjustmentVersion')::integer IS DISTINCT FROM row_data."adjustmentVersionNo"
           OR p_quote->>'providerCode' IS DISTINCT FROM row_data."providerCode"
           OR p_quote->>'integrationId' IS DISTINCT FROM row_data."integrationConfigurationId"
           OR (local_pricing AND ((money_line->>'unitPriceMinor')::bigint IS DISTINCT FROM row_data."snapshotUnitPriceMinor"
               OR p_quote->>'currencyCode' IS DISTINCT FROM row_data."snapshotCurrencyCode")) THEN
            RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
        integration_id := row_data."integrationConfigurationId";
        line_workflow := fulfillment_resolve_product_workflow(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId");
        IF line_workflow='DETAILED' OR (line_workflow='SIMPLE' AND workflow='NONE') THEN workflow := line_workflow; END IF;
        line_evidence := line_evidence || jsonb_build_array(money_line || jsonb_build_object(
            'productId',row_data."canonicalProductId",'workflow',line_workflow,
            'externalProductId',row_data."externalProductId",'externalVariantId',row_data."externalVariantId",
            'catalogId',(SELECT m.external_catalog_id FROM commerce_product_mappings m WHERE m.commerce_product_mapping_id=row_data."commerceProductMappingId"),
            'categoryIds',(SELECT coalesce(jsonb_agg(c.target_id ORDER BY c.target_id),'[]') FROM
                fulfillment_store_product_pos_categories(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId") c),
            'canonicalCategoryId',(SELECT p.product_catalog_category_id FROM product p WHERE p.product_id=row_data."canonicalProductId"),
            'adjustmentType',row_data."adjustmentType",'percentage',row_data.percentage,'amountMinor',row_data."amountMinor",
            'snapshotPriceMinor',row_data."snapshotUnitPriceMinor"));
    END LOOP;
    IF item_count=0 OR item_count<>jsonb_array_length(p_quote->'lines') THEN
        RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF p_intent IS NULL THEN
        IF pay_now AND quote_total>0 THEN
            -- The subscription lock serializes checkout initiation across request keys.
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
              AND c.organization_id=p_org AND i.fulfillment_checkout IS NOT NULL
              AND i.status IN ('PENDING','PROCESSING') AND NOT c.is_deleted;
            IF FOUND THEN
                IF payment.fulfillment_checkout->>'requestHash'=p_hash THEN RETURN payment.payment_intent_id; END IF;
                RAISE EXCEPTION 'Resume or cancel the existing checkout before starting a new one' USING ERRCODE='23505';
            END IF;
        END IF;
        INSERT INTO commerce_transactions(
        commerce_transaction_id,organization_id,store_id,customer_user_id,subscription_id,integration_configuration_id,
        source_channel,status,currency_code,subtotal_minor,adjustment_total_minor,tax_total_minor,total_minor,idempotency_key,created_by,updated_by
    ) VALUES (
        commerce_id,p_org,p_store,p_actor,p_subscription,integration_id,'CUSTOMER_FULFILLMENT',
        CASE WHEN pay_now AND quote_total>0 THEN 'DRAFT' ELSE 'ORDER_CREATED' END,
        p_quote->>'currencyCode',(p_quote->>'subtotalMinor')::bigint,(p_quote->>'adjustmentTotalMinor')::bigint,
        (p_quote->>'taxTotalMinor')::bigint,(p_quote->>'totalMinor')::bigint,p_key,organization_user_key,organization_user_key
        );
    ELSE
        UPDATE commerce_transactions SET status='PROVIDER_SUCCEEDED',provider_transaction_id=payment.provider_reference_id,
            updated_at=CURRENT_TIMESTAMP,updated_by=organization_user_key,version_no=version_no+1
        WHERE commerce_transaction_id=commerce_id AND currency_code=quote_currency AND total_minor=quote_total;
        IF NOT FOUND THEN RAISE EXCEPTION 'Commerce totals conflict with captured payment' USING ERRCODE='23505'; END IF;
    END IF;
    IF pay_now AND quote_total>0 AND p_intent IS NULL THEN
        checkout := jsonb_build_object('requestHash',p_hash,'quote',p_quote,
            'benefits',to_jsonb(p_benefits),'offers',to_jsonb(p_offers),'products',p_products,
            'expectedCompletion',p_expected_completion,'expectedCollection',p_expected_collection,
            'paymentBusinessId',(SELECT c.provider_business_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration),
            'paymentStoreId',(SELECT c.provider_store_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration));
        payment.payment_intent_id := generate_runtime_id('PAY');
        INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,authorization_mode,
            customer_user_id,store_id,amount,currency_code,idempotency_key,created_by,updated_by,
            commerce_transaction_id,collect_integration_configuration_id,fulfillment_checkout)
        VALUES (payment.payment_intent_id,p_org,collect.config_id,'CUSTOMER_SESSION',p_actor,p_store,quote_total::numeric/100,
            quote_currency,p_key,p_actor,p_actor,commerce_id,payment_integration,checkout);
        INSERT INTO payment_attempts(payment_attempt_id,payment_intent_id,amount,currency_code,idempotency_key)
        VALUES (generate_runtime_id('PAT'),payment.payment_intent_id,quote_total::numeric/100,quote_currency,p_key);
        RETURN payment.payment_intent_id;
    END IF;
    IF local_pricing THEN
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_actor);
        UPDATE redemption_transaction_item item SET selected_product_id=evidence->>'productId',updated_at=now_utc,updated_by=p_actor
        FROM jsonb_array_elements(line_evidence) evidence
        WHERE item.redemption_transaction_id=created."transactionId" AND item.item_type=evidence->>'itemType'
          AND coalesce(item.benefit_id,item.offer_id)=evidence->>'itemId';
    ELSE
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction_with_products(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_products,p_actor);
    END IF;
    UPDATE redemption_transaction SET status='RESERVED',store_id=p_store,expires_at=NULL,updated_at=now_utc
    WHERE redemption_transaction_id=created."transactionId";
    FOR money_line IN SELECT value FROM jsonb_array_elements(line_evidence) LOOP
        line_id := generate_runtime_id('CTL');
        source_type := money_line->>'itemType';
        INSERT INTO commerce_transaction_lines(
            commerce_transaction_line_id,commerce_transaction_id,line_type,source_entity_type,source_entity_id,
            commerce_product_mapping_id,external_product_id,external_variant_id,description,quantity,
            unit_price_minor_snapshot,unit_price_minor_authoritative,line_subtotal_minor,currency_code,price_source,metadata_json,created_by,updated_by
        ) VALUES (
            line_id,commerce_id,CASE WHEN local_pricing THEN 'CUSTOM_ITEM' ELSE 'EXTERNAL_PRODUCT' END,
            source_type,money_line->>'itemId',money_line->>'mappingId',
            money_line->>'externalProductId',money_line->>'externalVariantId',money_line->>'productName',1,
            (money_line->>'snapshotPriceMinor')::bigint,(money_line->>'unitPriceMinor')::bigint,
            (money_line->>'subtotalMinor')::bigint,p_quote->>'currencyCode',
            CASE WHEN local_pricing THEN 'MEMGINE_PRODUCT' ELSE 'PROVIDER_FINAL' END,
            jsonb_build_object('canonicalProductId',money_line->>'productId'),organization_user_key,organization_user_key
        );
        INSERT INTO commerce_transaction_adjustments(
            commerce_transaction_adjustment_id,commerce_transaction_id,target_line_id,commerce_adjustment_id,
            source_type,source_id,adjustment_type,percentage,requested_amount_minor,applied_amount_minor,currency_code,
            status,created_by,updated_by
        ) VALUES (
            generate_runtime_id('CTA'),commerce_id,line_id,money_line->>'adjustmentId',source_type,money_line->>'itemId',
            money_line->>'adjustmentType',(money_line->>'percentage')::numeric,(money_line->>'amountMinor')::bigint,
            NULL,p_quote->>'currencyCode','REQUESTED',organization_user_key,organization_user_key
        );
    END LOOP;
    INSERT INTO commerce_transaction_redemptions(
        commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,created_by,updated_by
    ) VALUES (generate_runtime_id('CTR'),commerce_id,created."transactionId",organization_user_key,organization_user_key);
    INSERT INTO fulfillments (
        fulfillment_id,organization_id,store_id,customer_user_id,redemption_transaction_id,commerce_transaction_id,fulfillment_number,
        request_channel_status_id,request_timing_status_id,payment_timing_status_id,fulfillment_type_status_id,
        workflow_mode_status_id,fulfillment_status_id,effective_policy_snapshot,
        original_expected_completion_at,expected_completion_at,original_expected_collection_at,expected_collection_at,created_by,updated_by
    )
    SELECT f_id,p_org,p_store,p_actor,created."transactionId",commerce_id,created."transactionNumber",
        (SELECT status_id FROM statuses WHERE status_code='CUSTOMER_APP'),(SELECT status_id FROM statuses WHERE status_code='ADVANCE'),
        (SELECT status_id FROM statuses WHERE status_code=payment_timing),(SELECT status_id FROM statuses WHERE status_code='ORDER'),
        (SELECT status_id FROM statuses WHERE status_code=workflow),placed,
        policy || jsonb_build_object('collectionTimeZone',shop.timezone,'requestHash',p_hash,'lines',line_evidence,
                                    'pricingSource',p_quote->>'providerCode','counterPaymentProvider',payment_provider,
                                    'counterPaymentIntegrationId',payment_integration),
        p_expected_completion AT TIME ZONE 'UTC',p_expected_completion AT TIME ZONE 'UTC',
        p_expected_collection AT TIME ZONE 'UTC',p_expected_collection AT TIME ZONE 'UTC',p_actor,p_actor;
    -- Persist the per-line operational obligations introduced by 307A/307B.
    -- Link exact Commerce and redemption lines; never infer product/category from a name.
    INSERT INTO fulfillment_items(
        fulfillment_item_id,fulfillment_id,line_reference,product_id,product_catalog_category_id,
        redemption_transaction_item_id,product_name_snapshot,quantity,workflow_code_snapshot,
        commerce_product_mapping_id,external_categories_snapshot,policy_snapshot,created_by,updated_by
    )
    SELECT generate_runtime_id('FUI'),f_id,l.commerce_transaction_line_id,p.product_id,p.product_catalog_category_id,
        item.redemption_transaction_item_id,left(l.description,200),l.quantity,
        (evidence.value->>'workflow')::varchar,l.commerce_product_mapping_id,
        CASE WHEN local_pricing THEN NULL ELSE (
            SELECT jsonb_agg(DISTINCT cat.external_category_id ORDER BY cat.external_category_id)
            FROM fulfillment_store_product_pos_categories(
                p_org,p_store,p.product_id,l.commerce_product_mapping_id) cat
        ) END,
        jsonb_build_object('pricingSource',p_quote->>'providerCode',
            'integrationConfigurationId',p_quote->>'integrationId',
            'externalCatalogId',evidence.value->>'catalogId',
            'externalCategoryKeys',evidence.value->'categoryIds',
            'workflow',evidence.value->>'workflow'),
        p_actor,p_actor
    FROM commerce_transaction_lines l
    JOIN redemption_transaction_item item
      ON item.redemption_transaction_id=created."transactionId"
     AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id
    JOIN product p ON p.product_id=(l.metadata_json->>'canonicalProductId')
      AND p.organization_id=p_org AND NOT p.is_deleted
    JOIN LATERAL jsonb_array_elements(line_evidence) evidence(value)
      ON evidence.value->>'itemType'=l.source_entity_type
     AND evidence.value->>'itemId'=l.source_entity_id
     AND evidence.value->>'productId'=p.product_id
    WHERE l.commerce_transaction_id=commerce_id AND NOT l.is_deleted;
    GET DIAGNOSTICS inserted_item_count = ROW_COUNT;
    IF inserted_item_count<>item_count THEN
        RAISE EXCEPTION 'Fulfillment item snapshots are inconsistent' USING ERRCODE='23505';
    END IF;
    INSERT INTO redemption_entitlement_reservations(
        redemption_entitlement_reservation_id,fulfillment_id,redemption_transaction_item_id,reservation_status_id,
        usage_window_key,reserved_quantity,created_by,updated_by
    ) SELECT generate_runtime_id('RES'),f_id,i.redemption_transaction_item_id,s.status_id,
        p_subscription||':'||i.item_type||':'||coalesce(i.benefit_id,i.offer_id),i.quantity,p_actor,p_actor
    FROM redemption_transaction_item i CROSS JOIN statuses s
    WHERE i.redemption_transaction_id=created."transactionId" AND s.status_code='RESERVED';
    INSERT INTO fulfillment_actions (
        fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,new_fulfillment_status_id,created_by
    ) SELECT generate_runtime_id('FAC'),f_id,status_id,p_actor,placed,p_actor FROM statuses WHERE status_code='ACCEPTED';
    IF p_intent IS NOT NULL THEN
        IF NOT payment_record_result(p_intent,NULL,'SUCCEEDED',payment.provider_reference_id,NULL,NULL,p_actor) THEN
            RAISE EXCEPTION 'Could not finalize captured fulfillment payment' USING ERRCODE='23505';
        END IF;
    END IF;
    RETURN f_id;
END;
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".claim_customer_fulfillment_collect(
    p_org varchar,p_intent varchar,p_actor varchar,p_business varchar,p_provider_store varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $fn$
DECLARE i payment_intents%ROWTYPE; sub_id varchar; route record; draft jsonb; quote jsonb; shop record;
        benefits varchar[]; offers varchar[]; price record; line jsonb; line_count integer := 0;
BEGIN
    SELECT c.subscription_id INTO sub_id FROM payment_intents p JOIN commerce_transactions c USING(commerce_transaction_id)
    WHERE p.payment_intent_id=p_intent AND p.organization_id=p_org AND p.fulfillment_checkout IS NOT NULL
      AND c.status='DRAFT' AND payment_actor_is_authorized(p_intent,p_actor);
    IF NOT FOUND THEN RETURN false; END IF;
    PERFORM 1 FROM subscriptions WHERE subscription_id=sub_id FOR UPDATE;
    SELECT * INTO STRICT i FROM payment_intents WHERE payment_intent_id=p_intent FOR UPDATE;
    IF i.status<>'PENDING' OR i.provider_reference_id IS NOT NULL THEN RETURN false; END IF;
    -- A different request may already have claimed payment while this claim waited for the subscription lock.
    IF EXISTS (
        SELECT 1 FROM payment_intents other JOIN commerce_transactions c USING(commerce_transaction_id)
        WHERE other.organization_id=p_org AND other.customer_user_id=i.customer_user_id
          AND c.organization_id=p_org AND c.subscription_id=sub_id
          AND other.fulfillment_checkout IS NOT NULL AND other.status='PROCESSING'
          AND other.payment_intent_id<>i.payment_intent_id
    ) THEN RAISE EXCEPTION 'An existing checkout requires payment confirmation' USING ERRCODE='23505'; END IF;
    draft := i.fulfillment_checkout;
    quote := draft->'quote';
    IF draft->>'paymentBusinessId' IS DISTINCT FROM p_business OR draft->>'paymentStoreId' IS DISTINCT FROM p_provider_store THEN
        RAISE EXCEPTION 'Checkout merchant does not match the payment intent' USING ERRCODE='23505';
    END IF;
    IF i.created_at < CURRENT_TIMESTAMP - interval '10 minutes' OR (draft->>'expectedCollection')::timestamptz<=CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Checkout expired. Cancel it and review a new quote.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO shop FROM customer_fulfillment_store_context(p_org,sub_id,p_actor) s WHERE s.store_id=i.store_id;
    IF NOT FOUND OR shop.policy IS DISTINCT FROM quote->'policy' OR shop.timezone IS DISTINCT FROM quote->>'timezone' THEN
        RAISE EXCEPTION 'Store configuration changed. Review a new quote.' USING ERRCODE='22023';
    END IF;
    SELECT * INTO route FROM fulfillment_collect_route(p_org,i.store_id);
    IF NOT FOUND OR route.integration_id IS DISTINCT FROM i.collect_integration_configuration_id
       OR route.config_id IS DISTINCT FROM i.payment_provider_config_id OR route.currency IS DISTINCT FROM i.currency_code
       OR NOT EXISTS (
          SELECT 1 FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=route.integration_id
            AND c.provider_business_id=draft->>'paymentBusinessId' AND c.provider_store_id=draft->>'paymentStoreId'
       ) THEN RAISE EXCEPTION 'Store payment configuration changed' USING ERRCODE='22023'; END IF;
    benefits := ARRAY(SELECT jsonb_array_elements_text(draft->'benefits')::varchar);
    offers := ARRAY(SELECT jsonb_array_elements_text(draft->'offers')::varchar);
    PERFORM assert_fulfillment_pickup_entitlements(p_org,sub_id,i.store_id,benefits,offers,(draft->>'expectedCollection')::timestamptz);
    IF fulfillment_has_competing_counter_redemption(p_org,sub_id,benefits,offers) THEN
        RAISE EXCEPTION 'Finish the existing Counter redemption or wait for the QR to expire' USING ERRCODE='23505';
    END IF;

    FOR price IN SELECT * FROM fulfillment_redemption_quote_rows(p_org,i.store_id,sub_id,benefits,offers,draft->'products') LOOP
        SELECT entry INTO STRICT line FROM jsonb_array_elements(quote->'lines') entry
          WHERE entry->>'itemType'=price."itemType" AND entry->>'itemId'=price."itemId";
        line_count := line_count+1;
        IF line->>'mappingId' IS DISTINCT FROM price."commerceProductMappingId"
          OR (line->>'mappingVersion')::integer IS DISTINCT FROM price."mappingVersionNo"
          OR line->>'adjustmentId' IS DISTINCT FROM price."commerceAdjustmentId"
          OR (line->>'adjustmentVersion')::integer IS DISTINCT FROM price."adjustmentVersionNo"
          OR quote->>'providerCode' IS DISTINCT FROM price."providerCode"
          OR quote->>'integrationId' IS DISTINCT FROM price."integrationConfigurationId"
          OR (price."providerCode"='MEMGINE' AND ((line->>'unitPriceMinor')::bigint IS DISTINCT FROM price."snapshotUnitPriceMinor"
              OR i.currency_code IS DISTINCT FROM price."snapshotCurrencyCode"))
        THEN RAISE EXCEPTION 'Prices changed. Review a new quote.' USING ERRCODE='23505'; END IF;
    END LOOP;
    IF line_count=0 OR line_count<>jsonb_array_length(quote->'lines') THEN
        RAISE EXCEPTION 'Checkout items changed' USING ERRCODE='23505';
    END IF;
    UPDATE payment_intents SET status='PROCESSING',updated_at=CURRENT_TIMESTAMP,updated_by=p_actor WHERE payment_intent_id=p_intent;
    UPDATE payment_attempts SET status='PROCESSING' WHERE payment_intent_id=p_intent AND status='PENDING';
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment attempt is unavailable' USING ERRCODE='23505'; END IF;
    RETURN true;
END;
$fn$;

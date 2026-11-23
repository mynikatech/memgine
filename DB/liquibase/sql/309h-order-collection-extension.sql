DO $seed$
BEGIN
  IF EXISTS (SELECT 1 FROM "${schemaName}".statuses WHERE status_id=('STATUS_'||md5('STAFF_COLLECTION_EXTENDED')) AND status_code<>'STAFF_COLLECTION_EXTENDED') THEN
    RAISE EXCEPTION 'Staff collection extension status ID is already in use';
  END IF;
  INSERT INTO "${schemaName}".statuses(status_id,status_code,status_name,description,display_order)
  SELECT 'STATUS_'||md5('STAFF_COLLECTION_EXTENDED'),'STAFF_COLLECTION_EXTENDED','Staff Collection Extended','Staff extended collection time',14
  WHERE NOT EXISTS (SELECT 1 FROM "${schemaName}".statuses WHERE status_code='STAFF_COLLECTION_EXTENDED');
  INSERT INTO "${schemaName}".entity_status(entity_status_id,entity_type_id,status_id,display_order,system_managed)
  SELECT 'ENTITY_STATUS_'||md5('FULFILLMENT_ACTION_TYPE:STAFF_COLLECTION_EXTENDED'),e.entity_type_id,s.status_id,14,true
  FROM "${schemaName}".entity_type e CROSS JOIN "${schemaName}".statuses s
  WHERE e.entity_type_code='FULFILLMENT_ACTION_TYPE' AND s.status_code='STAFF_COLLECTION_EXTENDED'
    AND NOT EXISTS (SELECT 1 FROM "${schemaName}".entity_status x WHERE x.entity_type_id=e.entity_type_id AND x.status_id=s.status_id);
  IF NOT FOUND AND NOT EXISTS (SELECT 1 FROM "${schemaName}".entity_type e JOIN "${schemaName}".entity_status x USING(entity_type_id)
    JOIN "${schemaName}".statuses s USING(status_id) WHERE e.entity_type_code='FULFILLMENT_ACTION_TYPE' AND s.status_code='STAFF_COLLECTION_EXTENDED')
    THEN RAISE EXCEPTION 'Fulfillment action status unavailable'; END IF;
END;
$seed$;

-- Staff decisions refer to the original request action. The fulfillment lock
-- serializes customer requests, staff decisions and cancellation.
CREATE FUNCTION "${schemaName}".counter_order_collection_extension(
  p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,
  p_version integer,p_action varchar,p_request varchar,p_local timestamp,p_reason varchar
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; pending fulfillment_actions%ROWTYPE; policy jsonb; zone text;
  proposed timestamp; utc_time timestamp; local_end timestamp; hours jsonb; action_code varchar; now_utc timestamp;
BEGIN
  IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN RETURN 'FORBIDDEN'; END IF;
  SELECT f0.* INTO f FROM fulfillments f0 JOIN statuses t ON t.status_id=f0.request_timing_status_id AND t.status_code='ADVANCE'
    JOIN statuses k ON k.status_id=f0.fulfillment_type_status_id AND k.status_code='ORDER'
    JOIN statuses s ON s.status_id=f0.fulfillment_status_id AND s.status_code IN ('PLACED','PREPARING','READY')
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store FOR UPDATE OF f0;
  IF NOT FOUND THEN RETURN 'ORDER_UNAVAILABLE'; END IF;
  IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN RETURN 'FORBIDDEN'; END IF;
  IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
  IF f.cancelled_at IS NOT NULL OR f.cancellation_requested_at IS NOT NULL OR f.fulfilled_at IS NOT NULL THEN RETURN 'ORDER_UNAVAILABLE'; END IF;
  SELECT a.* INTO pending FROM fulfillment_actions a JOIN statuses s ON s.status_id=a.action_type_status_id
    WHERE a.fulfillment_id=p_order AND s.status_code IN ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED')
    ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1;
  IF pending.fulfillment_action_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM statuses s WHERE s.status_id=pending.action_type_status_id AND s.status_code='COLLECTION_CHANGE_REQUESTED') THEN pending := NULL; END IF;
  IF p_action IN ('APPROVE','REJECT') AND (pending.fulfillment_action_id IS NULL OR pending.fulfillment_action_id IS DISTINCT FROM p_request) THEN RETURN 'REQUEST_CHANGED'; END IF;
  IF p_action='EXTEND' AND pending.fulfillment_action_id IS NOT NULL THEN RETURN 'REQUEST_PENDING'; END IF;
  IF p_action NOT IN ('APPROVE','REJECT','EXTEND') THEN RETURN 'INVALID_ACTION'; END IF;
  IF p_action IN ('REJECT','EXTEND') AND length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RETURN 'INVALID_REASON'; END IF;
  policy := f.effective_policy_snapshot;
  zone := policy->>'collectionTimeZone';
  IF zone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=zone) THEN RETURN 'INVALID_TIMEZONE'; END IF;
  now_utc := clock_timestamp() AT TIME ZONE 'UTC';
  IF p_action<>'REJECT' THEN
    IF p_action='APPROVE' THEN utc_time := pending.proposed_expected_collection_at; proposed := utc_time AT TIME ZONE 'UTC' AT TIME ZONE zone;
    ELSE proposed := p_local; utc_time := proposed AT TIME ZONE zone AT TIME ZONE 'UTC'; END IF;
    IF proposed IS NULL OR utc_time IS NULL OR (utc_time AT TIME ZONE 'UTC' AT TIME ZONE zone) IS DISTINCT FROM proposed
       OR utc_time<=now_utc OR utc_time<=coalesce(f.expected_collection_at,f.accepted_at)
       OR utc_time>now_utc+make_interval(mins=>coalesce((policy->>'maximumHorizonMinutes')::integer,0)) THEN RETURN 'INVALID_TIME'; END IF;
    -- Ambiguous local times are rejected, so the chosen instant is unambiguous.
    IF EXISTS (SELECT 1 FROM generate_series(utc_time-interval '3 hours',utc_time+interval '3 hours',interval '1 minute') candidate
      WHERE candidate<>utc_time AND (candidate AT TIME ZONE 'UTC' AT TIME ZONE zone)=proposed) THEN RETURN 'INVALID_TIME'; END IF;
    hours := policy->'collectionHours';
    IF jsonb_typeof(hours)='object' THEN
      local_end := (utc_time+make_interval(mins=>coalesce((policy->>'collectionWindowMinutes')::integer,0))) AT TIME ZONE 'UTC' AT TIME ZONE zone;
      IF proposed::date<>local_end::date OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(hours->((ARRAY['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'])[extract(isodow FROM proposed)::integer]),'[]'::jsonb)) h
        WHERE proposed::time >= (h->>'start')::time AND proposed::time < (h->>'end')::time AND local_end::time <= (h->>'end')::time)
        THEN RETURN 'INVALID_TIME'; END IF;
    END IF;
  END IF;
  action_code := CASE p_action WHEN 'APPROVE' THEN 'COLLECTION_CHANGE_APPROVED' WHEN 'REJECT' THEN 'COLLECTION_CHANGE_REJECTED' ELSE 'STAFF_COLLECTION_EXTENDED' END;
  UPDATE fulfillments SET expected_collection_at=CASE WHEN p_action='REJECT' THEN expected_collection_at ELSE utc_time END,
    updated_at=now_utc,updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_id=p_order;
  INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,prior_fulfillment_status_id,new_fulfillment_status_id,
    previous_expected_collection_at,proposed_expected_collection_at,reason,action_details,action_at,created_by)
  VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code=action_code),p_actor,
    f.fulfillment_status_id,f.fulfillment_status_id,f.expected_collection_at,CASE WHEN p_action='REJECT' THEN pending.proposed_expected_collection_at ELSE utc_time END,
    nullif(btrim(p_reason),''),jsonb_build_object('requestActionId',p_request,'staffId',p_staff,'storeId',p_store,'direct',p_action='EXTEND'),now_utc,p_actor);
  RETURN 'UPDATED';
END;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".counter_order_collection_extension(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar,timestamp,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_collection_extension(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar,timestamp,varchar) TO "${appRole}";

CREATE FUNCTION "${schemaName}".get_counter_order_collection_extension(p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
  SELECT jsonb_build_object('requestId',CASE WHEN s.status_code='COLLECTION_CHANGE_REQUESTED' THEN a.fulfillment_action_id END,
    'previousAt',a.previous_expected_collection_at AT TIME ZONE 'UTC',
    'proposedAt',a.proposed_expected_collection_at AT TIME ZONE 'UTC','type',s.status_code,'reason',a.reason,
    'at',a.action_at AT TIME ZONE 'UTC','timezone',f.effective_policy_snapshot->>'collectionTimeZone',
    'history',coalesce((SELECT jsonb_agg(jsonb_build_object('id',h.fulfillment_action_id,'type',hs.status_code,
      'previousAt',h.previous_expected_collection_at AT TIME ZONE 'UTC','proposedAt',h.proposed_expected_collection_at AT TIME ZONE 'UTC',
      'reason',h.reason,'at',h.action_at AT TIME ZONE 'UTC') ORDER BY h.action_at,h.fulfillment_action_id)
      FROM fulfillment_actions h JOIN statuses hs ON hs.status_id=h.action_type_status_id
      WHERE h.fulfillment_id=f.fulfillment_id AND hs.status_code IN ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED','STAFF_COLLECTION_EXTENDED')),'[]'::jsonb))::text
  FROM fulfillments f JOIN LATERAL (SELECT a.* FROM fulfillment_actions a JOIN statuses s ON s.status_id=a.action_type_status_id
    WHERE a.fulfillment_id=f.fulfillment_id AND s.status_code IN ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED','STAFF_COLLECTION_EXTENDED')
    ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1) a ON true
  JOIN statuses s ON s.status_id=a.action_type_status_id
  WHERE f.fulfillment_id=p_order AND f.organization_id=p_org AND f.store_id=p_store
    AND counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".get_counter_order_collection_extension(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_order_collection_extension(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".customer_fulfillment_orders_projection(
    p_org varchar,p_actor varchar,p_fulfillment varchar,p_subscription varchar,p_limit integer,p_offset integer,p_active_only boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
WITH page AS MATERIALIZED (
    SELECT f.*, s.store_name, st.status_code AS state, w.status_code AS workflow, pt.status_code AS payment_timing,
           t.status_code AS fulfillment_type, rt_kind.status_code AS request_timing,
           c.subscription_id AS commerce_subscription, rt.subscription_id AS redemption_subscription,
           c.status AS commerce_status,c.subtotal_minor,c.adjustment_total_minor,c.tax_total_minor,c.total_minor,c.currency_code,c.provider_transaction_id,
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
    'subtotalMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.subtotal_minor END,
    'discountMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.adjustment_total_minor END,
    'taxMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.tax_total_minor END,
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
        'unitPriceMinor',l.unit_price_minor_authoritative,'subtotalMinor',l.line_subtotal_minor,
        'discountMinor',coalesce((SELECT sum(a.applied_amount_minor)
            FROM commerce_transaction_adjustments a WHERE a.commerce_transaction_id=l.commerce_transaction_id
              AND a.target_line_id=l.commerce_transaction_line_id AND a.status='APPLIED' AND NOT a.is_deleted),0)
     ) ORDER BY l.created_at,l.commerce_transaction_line_id)
        FROM commerce_transaction_lines l WHERE l.commerce_transaction_id=f.commerce_transaction_id AND NOT l.is_deleted
        AND f.commerce_status IS NOT NULL),'[]') END,
    'timeline',CASE WHEN p_fulfillment IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',a.fulfillment_action_id,'type',action.status_code,'at',a.action_at AT TIME ZONE 'UTC',
        'previousAt',a.previous_expected_collection_at AT TIME ZONE 'UTC',
        'proposedAt',a.proposed_expected_collection_at AT TIME ZONE 'UTC','reason',CASE WHEN action.status_code IN
          ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED','STAFF_COLLECTION_EXTENDED') THEN a.reason END
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

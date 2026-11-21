-- Extend existing references and owner-scoped customer projections.
CREATE OR REPLACE FUNCTION "${schemaName}".create_redemption_transaction_internal(
 p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_subscription_id varchar,p_benefit_ids varchar[],p_offer_ids varchar[],p_redemption_method varchar,p_actor_user_id varchar
) RETURNS TABLE("transactionId" varchar,"transactionNumber" varchar,status varchar,"expiresAt" text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE
 v_id varchar(64); v_number varchar(64); v_item varchar(64); v_benefit varchar; v_offer varchar; v_reason text; v_seq bigint;
 v_now timestamp without time zone := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
 v_expires_at timestamp without time zone;
 v_expiry_minutes integer;
BEGIN
 IF COALESCE(cardinality(p_benefit_ids),0)+COALESCE(cardinality(p_offer_ids),0)=0 THEN RAISE EXCEPTION 'Select one or more benefits or offers' USING ERRCODE='22023'; END IF;
 IF (p_benefit_ids IS NOT NULL AND cardinality(p_benefit_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_benefit_ids)x)) OR (p_offer_ids IS NOT NULL AND cardinality(p_offer_ids)<> (SELECT count(DISTINCT x) FROM unnest(p_offer_ids)x)) THEN RAISE EXCEPTION 'Select distinct redemption items' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM subscriptions s JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id WHERE s.subscription_id=p_subscription_id AND ou.organization_id=p_organization_id AND NOT s.is_deleted AND NOT ou.is_deleted FOR UPDATE OF s; IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found' USING ERRCODE='P0002'; END IF;
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_benefit_rejection(p_organization_id,p_subscription_id,v_benefit,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_reason:=counter_offer_rejection(p_organization_id,p_subscription_id,v_offer,p_store_id); IF v_reason IS NOT NULL THEN RAISE EXCEPTION '%',v_reason USING ERRCODE='23505'; END IF; END LOOP;
 v_id:=generate_runtime_id('RTX'); v_seq:=next_business_sequence('REDEMPTION_TRANSACTION',p_organization_id);
 v_number:=('RTX_'||lpad(v_seq::text,greatest(8,length(v_seq::text)),'0'))::varchar(64);
 v_expiry_minutes := get_organization_redemption_qr_expiry_minutes(p_organization_id);
 v_expires_at := v_now + make_interval(mins => v_expiry_minutes);
 INSERT INTO redemption_transaction(redemption_transaction_id,redemption_transaction_number,organization_id,subscription_id,store_id,staff_id,redemption_method,status,expires_at,created_by,updated_by) VALUES(v_id,v_number,p_organization_id,p_subscription_id,p_store_id,p_staff_id,p_redemption_method,'PENDING',v_expires_at,p_actor_user_id,p_actor_user_id);
 FOREACH v_benefit IN ARRAY COALESCE(p_benefit_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,benefit_id,created_by,updated_by) VALUES(v_item,v_id,'BENEFIT',v_benefit,p_actor_user_id,p_actor_user_id); END LOOP;
 FOREACH v_offer IN ARRAY COALESCE(p_offer_ids,ARRAY[]::varchar[]) LOOP v_item:=generate_runtime_id('RTI'); INSERT INTO redemption_transaction_item(redemption_transaction_item_id,redemption_transaction_id,item_type,offer_id,created_by,updated_by) VALUES(v_item,v_id,'OFFER',v_offer,p_actor_user_id,p_actor_user_id); END LOOP;
 RETURN QUERY SELECT v_id,v_number,'PENDING'::varchar,v_expires_at::text;
END; $function$;

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

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_fulfillment_activity(p_org varchar,p_actor varchar,p_sub varchar)
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
      'counterQrs',coalesce((
        SELECT jsonb_agg(jsonb_build_object('transactionId',t.redemption_transaction_id,
          'transactionNumber',t.redemption_transaction_number,'expiresAt',t.expires_at AT TIME ZONE 'UTC',
          'items',basket.items) ORDER BY t.created_at DESC,t.redemption_transaction_id DESC)
        FROM redemption_transaction t
        CROSS JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('itemType',i.item_type,'itemId',coalesce(i.benefit_id,i.offer_id))) AS items
          FROM redemption_transaction_item i WHERE i.redemption_transaction_id=t.redemption_transaction_id
        ) basket
        WHERE t.organization_id=p_org AND t.subscription_id=p_sub AND t.redemption_method='CUSTOMER_QR'
          AND t.status='PENDING' AND t.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          AND basket.items IS NOT NULL AND customer_has_active_relationship(p_org,p_actor)
      ),'[]'),
      'itemStatuses',coalesce((
        SELECT jsonb_agg(to_jsonb(item)) FROM get_customer_redemption_item_status(p_org,p_sub,p_actor) item
      ),'[]')
    )::text
    WHERE customer_fulfillment_subscription_owned(p_org,p_sub,p_actor);
$body$;

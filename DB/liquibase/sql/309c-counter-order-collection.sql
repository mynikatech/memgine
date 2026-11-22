-- The existing staff/Store policy also binds the staff record to the signed-in actor.
CREATE FUNCTION "${schemaName}".counter_order_operator(p_org varchar,p_store varchar,p_staff varchar,p_actor varchar)
RETURNS varchar LANGUAGE sql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT op.organization_user_id
    FROM staff op JOIN organization o ON o.organization_id=op.organization_id
    JOIN entity_status es ON es.entity_status_id=o.organization_status_id AND es.is_active
    JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE'
    WHERE o.organization_id=p_org AND NOT o.is_deleted AND op.staff_id=p_staff AND p_store IS NOT NULL
      AND get_counter_order_stores(p_org,p_actor,p_staff,p_store)::jsonb <> '[]'::jsonb;
$body$;

CREATE FUNCTION "${schemaName}".counter_order_next(p_state varchar,p_workflow varchar,p_command varchar)
RETURNS varchar LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $body$
    SELECT (CASE
      WHEN p_workflow='DETAILED' AND p_state='PLACED' AND p_command='START_PREPARING' THEN 'PREPARING'
      WHEN p_workflow='DETAILED' AND p_state='PREPARING' AND p_command='MARK_READY' THEN 'READY'
      WHEN p_workflow='DETAILED' AND p_state='READY' AND p_command='COMPLETE_COLLECTION' THEN 'FULFILLED'
      WHEN p_workflow IN ('NONE','SIMPLE') AND p_state='PLACED' AND p_command='COMPLETE_COLLECTION' THEN 'FULFILLED'
    END)::varchar;
$body$;

-- Shared by detail and collection. The write path calls this only after locking
-- the linked payment intents and Commerce row. A receipt alone cannot settle an order.
CREATE FUNCTION "${schemaName}".counter_order_collection_payment(
    p_org varchar,p_store varchar,p_customer varchar,p_commerce varchar,p_timing varchar
) RETURNS varchar LANGUAGE plpgsql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE c commerce_transactions%ROWTYPE; v_capture_count bigint; v_terminal_count bigint;
BEGIN
    SELECT * INTO c FROM commerce_transactions
    WHERE commerce_transaction_id=p_commerce AND organization_id=p_org AND store_id=p_store
      AND customer_user_id=p_customer AND source_channel='CUSTOMER_FULFILLMENT' AND NOT is_deleted;
    IF NOT FOUND OR c.total_minor IS NULL OR c.total_minor<0 OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$' OR c.subtotal_minor IS NULL OR c.adjustment_total_minor IS NULL
       OR c.tax_total_minor IS NULL OR c.adjustment_total_minor NOT BETWEEN 0 AND c.subtotal_minor
       OR c.tax_total_minor<0 OR c.total_minor IS DISTINCT FROM c.subtotal_minor-c.adjustment_total_minor+c.tax_total_minor
       OR p_timing IS NULL OR p_timing NOT IN ('PAY_NOW','PAY_AT_COUNTER') THEN
        RETURN 'PAYMENT_UNRESOLVED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM poynt_collect_financial_exceptions e
      WHERE (e.commerce_transaction_id=p_commerce OR EXISTS (
        SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce
          AND i.payment_intent_id IN (e.payment_intent_id,e.related_payment_intent_id)))
        AND e.case_status NOT IN ('RESOLVED','CLOSED')
    ) OR EXISTS (
      SELECT 1 FROM commerce_counter_timeout_recoveries r
      WHERE r.commerce_transaction_id=p_commerce AND r.late_capture_seen
    ) THEN RETURN 'FINANCIAL_EXCEPTION'; END IF;
    IF EXISTS (
      SELECT 1 FROM payment_refunds r
      WHERE (r.commerce_transaction_id=p_commerce OR r.payment_intent_id IN
        (SELECT i.payment_intent_id FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce))
        AND (r.approval_status IS DISTINCT FROM 'REJECTED' OR r.execution_status = 'SUCCEEDED')
    ) THEN RETURN 'REFUND_CONFLICT'; END IF;
    IF c.status IN ('DRAFT','PROVIDER_IN_PROGRESS','PROVIDER_FAILED','CANCELLED') OR EXISTS (
      SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce AND (
        i.status IN ('PENDING','PROCESSING') OR EXISTS (
          SELECT 1 FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id AND a.status IN ('PENDING','PROCESSING')
        ))
    ) OR EXISTS (
      SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND a.provider_status NOT IN ('SUCCEEDED','FAILED','CANCELLED','CANCELED','DECLINED')
    ) THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
    SELECT count(*) INTO v_capture_count FROM payment_intents i
    LEFT JOIN poynt_collect_verified_captures v USING(payment_intent_id)
    WHERE i.commerce_transaction_id=p_commerce AND (i.status='SUCCEEDED' OR v.payment_intent_id IS NOT NULL);
    SELECT count(*) INTO v_terminal_count FROM commerce_provider_payment_attempts a
    WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED';
    IF c.total_minor=0 THEN
      IF v_capture_count=0 AND v_terminal_count=0 AND c.provider_transaction_id IS NULL
         AND c.status IN ('ORDER_CREATED','COMPLETED') THEN RETURN 'NO_PAYMENT_REQUIRED'; END IF;
    ELSIF p_timing='PAY_NOW' AND v_capture_count=1 AND v_terminal_count=0
      AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED') AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
        WHERE i.commerce_transaction_id=p_commerce AND i.organization_id=p_org AND i.store_id=p_store
          AND i.customer_user_id=p_customer AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
          AND i.currency_code=c.currency_code AND i.amount*100=c.total_minor
          AND v.organization_id=p_org AND v.amount_minor=c.total_minor AND v.currency_code=c.currency_code
          AND v.provider_transaction_id=c.provider_transaction_id AND v.provider_transaction_id=i.provider_reference_id
          AND nullif(btrim(v.provider_transaction_id),'') IS NOT NULL
          AND nullif(btrim(v.merchant_business_id),'')=i.fulfillment_checkout->>'paymentBusinessId'
          AND nullif(btrim(v.merchant_store_id),'')=i.fulfillment_checkout->>'paymentStoreId'
          AND (SELECT count(*) FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id AND a.status='SUCCEEDED')=1
          AND EXISTS (SELECT 1 FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
            AND a.status='SUCCEEDED' AND a.amount*100=c.total_minor AND a.currency_code=c.currency_code
            AND a.provider_reference_id=v.provider_transaction_id)
      ) THEN RETURN 'VERIFIED_ONLINE';
    ELSIF p_timing='PAY_AT_COUNTER' AND v_capture_count=0 THEN
      IF v_terminal_count=0 AND c.status='ORDER_CREATED' AND c.provider_transaction_id IS NULL THEN
        RETURN 'PAYMENT_REQUIRED';
      END IF;
      IF v_terminal_count=1 AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED') AND EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
        WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED'
          AND a.amount_minor=c.total_minor AND a.currency_code=c.currency_code
          AND a.provider_transaction_id=c.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),'') IS NOT NULL
          AND (a.payment_channel='CASH' OR (a.payment_channel='REMOTE_TERMINAL'
            AND nullif(btrim(a.provider_business_id),'') IS NOT NULL AND nullif(btrim(a.provider_device_id),'') IS NOT NULL))
      ) THEN RETURN 'VERIFIED_AT_COUNTER'; END IF;
    END IF;
    RETURN 'PAYMENT_UNRESOLVED';
END;
$body$;

CREATE FUNCTION "${schemaName}".get_counter_order_lifecycle(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH scoped AS MATERIALIZED (
      SELECT f.*,state.status_code AS state,workflow.status_code AS workflow,timing.status_code AS timing
      FROM fulfillments f
      JOIN statuses state ON state.status_id=f.fulfillment_status_id
      JOIN statuses workflow ON workflow.status_id=f.workflow_mode_status_id
      JOIN statuses timing ON timing.status_id=f.payment_timing_status_id
      JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
      JOIN statuses request ON request.status_id=f.request_timing_status_id AND request.status_code='ADVANCE'
      WHERE f.fulfillment_id=p_order AND f.organization_id=p_org AND f.store_id=p_store
        AND counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL
    ), details AS MATERIALIZED (
      SELECT f.*,counter_order_collection_payment(p_org,p_store,f.customer_user_id,f.commerce_transaction_id,f.timing) AS payment,
             f.fulfilled_at IS NULL AND f.cancelled_at IS NULL AND f.cancellation_requested_at IS NULL AS available
      FROM scoped f
    )
    SELECT (original.item || coalesce((SELECT jsonb_build_object('lifecycle',jsonb_build_object(
      'version',f.version_no,'payment',f.payment,'collectedAt',f.actual_collection_at AT TIME ZONE 'UTC',
      'outstandingMinor',CASE WHEN f.payment='PAYMENT_REQUIRED' THEN c.total_minor END,
      'canStartPreparing',f.available AND counter_order_next(f.state,f.workflow,'START_PREPARING') IS NOT NULL,
      'canMarkReady',f.available AND counter_order_next(f.state,f.workflow,'MARK_READY') IS NOT NULL,
      'canCompleteCollection',f.available AND counter_order_next(f.state,f.workflow,'COMPLETE_COLLECTION') IS NOT NULL
        AND coalesce(c.status<>'COMPLETED',false)
        AND f.payment IN ('NO_PAYMENT_REQUIRED','VERIFIED_ONLINE','VERIFIED_AT_COUNTER')
    )) FROM details f LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id
      AND c.organization_id=p_org AND c.store_id=p_store AND c.customer_user_id=f.customer_user_id AND NOT c.is_deleted
    ),'{}'::jsonb))::text
    FROM (SELECT get_counter_fulfillment_orders(p_org,p_store,p_staff,p_actor,p_order,NULL,NULL,NULL,1,0)::jsonb
      ->'orders'->0 AS item) original
    WHERE counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL;
$body$;

CREATE FUNCTION "${schemaName}".update_counter_order_lifecycle(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,
    p_version integer,p_command varchar,p_hash varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; qr fulfillment_credentials%ROWTYPE; c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE; item redemption_transaction_item%ROWTYPE;
    v_operator varchar; v_state varchar; v_workflow varchar; v_timing varchar; v_target varchar; v_target_id varchar;
    v_action varchar; v_payment varchar; v_subscription varchar; v_sub_number varchar; v_success varchar;
    v_ledger_id varchar; v_sequence text; v_now timestamp; v_items integer; v_lines integer;
BEGIN
    v_operator := counter_order_operator(p_org,p_store,p_staff,p_actor);
    IF v_operator IS NULL THEN RETURN 'FORBIDDEN'; END IF;
    -- The issuer and customer cancellation also lock fulfillment first.
    SELECT f0.* INTO f FROM fulfillments f0
      JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id AND kind.status_code='ORDER'
      JOIN statuses timing ON timing.status_id=f0.request_timing_status_id AND timing.status_code='ADVANCE'
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store FOR UPDATE OF f0;
    IF NOT FOUND THEN RETURN 'ORDER_NOT_FOUND'; END IF;
    IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS DISTINCT FROM v_operator THEN RETURN 'FORBIDDEN'; END IF;
    SELECT status_code INTO STRICT v_state FROM statuses WHERE status_id=f.fulfillment_status_id;
    SELECT status_code INTO STRICT v_workflow FROM statuses WHERE status_id=f.workflow_mode_status_id;
    SELECT status_code INTO STRICT v_timing FROM statuses WHERE status_id=f.payment_timing_status_id;
    IF v_state='FULFILLED' OR f.fulfilled_at IS NOT NULL THEN RETURN 'ALREADY_FULFILLED'; END IF;
    IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
    v_target := counter_order_next(v_state,v_workflow,p_command);
    IF v_target IS NULL OR f.cancelled_at IS NOT NULL OR f.cancellation_requested_at IS NOT NULL THEN
      RETURN 'INVALID_TRANSITION';
    END IF;
    SELECT status_id INTO STRICT v_target_id FROM statuses WHERE status_code=v_target;
    v_action := CASE p_command WHEN 'START_PREPARING' THEN 'PREPARATION_STARTED'
                  WHEN 'MARK_READY' THEN 'MARKED_READY' ELSE 'HANDOVER_CONFIRMED' END;

    IF p_command='COMPLETE_COLLECTION' THEN
      IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID_CREDENTIAL'; END IF;
      SELECT q.* INTO qr FROM fulfillment_credentials q
      JOIN statuses kind ON kind.status_id=q.credential_type_status_id AND kind.status_code='PICKUP_QR'
      WHERE q.fulfillment_id=f.fulfillment_id AND q.token_hash=p_hash::char(64) FOR UPDATE OF q;
      IF NOT FOUND THEN
        -- Disclose a Store mismatch only for a valid-shaped hash in the same organization.
        IF EXISTS (SELECT 1 FROM fulfillment_credentials q JOIN fulfillments other USING(fulfillment_id)
          JOIN statuses kind ON kind.status_id=q.credential_type_status_id AND kind.status_code='PICKUP_QR'
          WHERE q.token_hash=p_hash::char(64) AND other.organization_id=p_org AND other.store_id<>p_store) THEN
          RETURN 'WRONG_STORE';
        END IF;
        RETURN 'INVALID_CREDENTIAL';
      END IF;
      IF qr.used_at IS NOT NULL THEN RETURN 'CREDENTIAL_USED'; END IF;
      IF qr.revoked_at IS NOT NULL THEN RETURN 'CREDENTIAL_REVOKED'; END IF;
      IF qr.expires_at IS NULL OR qr.expires_at <= clock_timestamp() AT TIME ZONE 'UTC' THEN RETURN 'CREDENTIAL_EXPIRED'; END IF;

      SELECT subscription_id INTO v_subscription FROM commerce_transactions
      WHERE commerce_transaction_id=f.commerce_transaction_id AND organization_id=p_org AND store_id=p_store
        AND customer_user_id=f.customer_user_id AND source_channel='CUSTOMER_FULFILLMENT' AND NOT is_deleted;
      IF NOT FOUND THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
      -- Match 308's subscription -> Collect intent -> Commerce lock order. Refund
      -- requests serialize on the same intent or Commerce row.
      SELECT subscription_number INTO v_sub_number FROM subscriptions
      WHERE subscription_id=v_subscription AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR NOT customer_fulfillment_subscription_owned(p_org,v_subscription,f.customer_user_id)
        THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;
      PERFORM i.payment_intent_id FROM payment_intents i WHERE i.commerce_transaction_id=f.commerce_transaction_id
        ORDER BY i.payment_intent_id FOR UPDATE;
      SELECT * INTO c FROM commerce_transactions
      WHERE commerce_transaction_id=f.commerce_transaction_id AND organization_id=p_org AND store_id=p_store
        AND customer_user_id=f.customer_user_id AND subscription_id=v_subscription
        AND source_channel='CUSTOMER_FULFILLMENT' AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR c.status='COMPLETED' THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
      v_payment := counter_order_collection_payment(p_org,p_store,f.customer_user_id,c.commerce_transaction_id,v_timing);
      IF v_payment NOT IN ('NO_PAYMENT_REQUIRED','VERIFIED_ONLINE','VERIFIED_AT_COUNTER') THEN RETURN v_payment; END IF;

      SELECT * INTO t FROM redemption_transaction WHERE redemption_transaction_id=f.redemption_transaction_id
        AND organization_id=p_org AND store_id=p_store AND subscription_id=v_subscription
        AND redemption_method='CUSTOMER_FULFILLMENT' AND status='RESERVED' FOR UPDATE;
      IF NOT FOUND OR (SELECT count(*) FROM commerce_transaction_redemptions x
        WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted)<>1
        OR NOT EXISTS (SELECT 1 FROM commerce_transaction_redemptions x WHERE x.commerce_transaction_id=c.commerce_transaction_id
          AND x.redemption_transaction_id=t.redemption_transaction_id AND NOT x.is_deleted)
        THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;
      PERFORM i.redemption_transaction_item_id FROM redemption_transaction_item i
        WHERE i.redemption_transaction_id=t.redemption_transaction_id ORDER BY i.redemption_transaction_item_id FOR UPDATE;
      PERFORM r.redemption_entitlement_reservation_id FROM redemption_entitlement_reservations r
        WHERE r.fulfillment_id=p_order ORDER BY r.redemption_entitlement_reservation_id FOR UPDATE;
      SELECT count(*) INTO v_items FROM redemption_transaction_item WHERE redemption_transaction_id=t.redemption_transaction_id;
      -- The exact intact, accepted reservation is capacity evidence. Rechecking
      -- usage as a fresh redemption would count this order's own hold as a competitor.
      IF v_items=0 OR v_items<>(SELECT count(*) FROM redemption_entitlement_reservations WHERE fulfillment_id=p_order)
        OR EXISTS (
          SELECT 1 FROM redemption_transaction_item i
          LEFT JOIN redemption_entitlement_reservations r ON r.redemption_transaction_item_id=i.redemption_transaction_item_id
          LEFT JOIN statuses s ON s.status_id=r.reservation_status_id
          WHERE i.redemption_transaction_id=t.redemption_transaction_id AND
           (i.status<>'PENDING' OR i.redemption_id IS NOT NULL OR i.offer_redemption_id IS NOT NULL
            OR r.fulfillment_id IS DISTINCT FROM p_order OR s.status_code IS DISTINCT FROM 'RESERVED'
            OR r.reserved_quantity IS DISTINCT FROM i.quantity OR r.consumed_quantity<>0 OR r.released_quantity<>0)
        ) THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;

      -- Finalize only the discount allocations frozen by Phase 308, using the
      -- exact Commerce line + entitlement linkage and matching the settled total.
      IF jsonb_typeof(f.effective_policy_snapshot->'lines') IS DISTINCT FROM 'array' THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
      SELECT count(*) INTO v_lines FROM commerce_transaction_lines l
        WHERE l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted;
      IF v_lines<>v_items OR v_lines<>jsonb_array_length(f.effective_policy_snapshot->'lines')
        OR v_items<>(SELECT count(DISTINCT fi.redemption_transaction_item_id) FROM fulfillment_items fi
          JOIN commerce_transaction_lines l ON l.commerce_transaction_line_id=fi.line_reference
          WHERE fi.fulfillment_id=p_order AND l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted)
        OR v_lines<>(SELECT count(*) FROM commerce_transaction_adjustments a
          WHERE a.commerce_transaction_id=c.commerce_transaction_id AND NOT a.is_deleted)
        OR c.subtotal_minor IS DISTINCT FROM (SELECT sum(l.line_subtotal_minor) FROM commerce_transaction_lines l
          WHERE l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted)
        OR c.adjustment_total_minor IS DISTINCT FROM (SELECT sum(s."discountMinor")
          FROM jsonb_to_recordset(f.effective_policy_snapshot->'lines') s("discountMinor" bigint))
        OR EXISTS (
          SELECT 1 FROM commerce_transaction_lines l
          WHERE l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted
            AND (l.currency_code IS DISTINCT FROM c.currency_code OR l.line_subtotal_minor IS NULL OR 1<>(
              SELECT count(*) FROM fulfillment_items fi
              JOIN redemption_transaction_item i ON i.redemption_transaction_item_id=fi.redemption_transaction_item_id
                AND i.redemption_transaction_id=t.redemption_transaction_id AND fi.quantity=i.quantity
              JOIN commerce_transaction_adjustments a ON a.target_line_id=l.commerce_transaction_line_id
                AND a.commerce_transaction_id=c.commerce_transaction_id AND NOT a.is_deleted
                AND a.status='REQUESTED' AND a.source_type=i.item_type AND a.source_id=coalesce(i.benefit_id,i.offer_id)
              JOIN jsonb_to_recordset(f.effective_policy_snapshot->'lines')
                s("itemType" varchar,"itemId" varchar,"productId" varchar,"discountMinor" bigint)
                ON s."itemType"=a.source_type AND s."itemId"=a.source_id AND s."productId"=fi.product_id
                AND s."discountMinor" BETWEEN 0 AND l.line_subtotal_minor
              WHERE fi.fulfillment_id=p_order AND fi.line_reference=l.commerce_transaction_line_id
                AND fi.quantity=l.quantity AND a.currency_code=c.currency_code
            ))) THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;

      v_now := clock_timestamp() AT TIME ZONE 'UTC';
      IF qr.expires_at<=v_now THEN RETURN 'CREDENTIAL_EXPIRED'; END IF;
      IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS DISTINCT FROM v_operator THEN RETURN 'FORBIDDEN'; END IF;
      BEGIN
        -- Revalidate pickup eligibility without counting the order's own hold.
        -- If the rule rejects the pickup, roll back the provisional consumption.
        UPDATE redemption_entitlement_reservations SET consumed_quantity=reserved_quantity,consumed_at=v_now,
          reservation_status_id=(SELECT status_id FROM statuses WHERE status_code='CONSUMED'),
          updated_at=v_now,updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_id=p_order;
        PERFORM assert_fulfillment_pickup_entitlements(p_org,v_subscription,p_store,
          ARRAY(SELECT benefit_id FROM redemption_transaction_item WHERE redemption_transaction_id=t.redemption_transaction_id AND item_type='BENEFIT'),
          ARRAY(SELECT offer_id FROM redemption_transaction_item WHERE redemption_transaction_id=t.redemption_transaction_id AND item_type='OFFER'),
          v_now AT TIME ZONE 'UTC');
      EXCEPTION WHEN unique_violation THEN
        RETURN 'ENTITLEMENT_CONFLICT';
      END;
      SELECT es.entity_status_id INTO STRICT v_success FROM entity_status es
        JOIN entity_type et ON et.entity_type_id=es.entity_type_id AND et.entity_type_code='REDEMPTION'
        JOIN statuses s ON s.status_id=es.status_id AND s.status_code='SUCCESS' WHERE es.is_active;
      FOR item IN SELECT * FROM redemption_transaction_item
        WHERE redemption_transaction_id=t.redemption_transaction_id ORDER BY redemption_transaction_item_id LOOP
        IF item.item_type='BENEFIT' THEN
          v_ledger_id := generate_runtime_id('RDM');
          v_sequence := next_business_sequence('REDEMPTION',v_subscription)::text;
          INSERT INTO redemptions(redemption_id,redemption_number,subscription_id,benefit_id,store_id,staff_id,
              quantity,redemption_status_id,redemption_datetime,created_at,updated_at,created_by,updated_by)
          VALUES(v_ledger_id,v_sub_number||'_RDM_'||lpad(v_sequence,greatest(3,length(v_sequence)),'0'),
              v_subscription,item.benefit_id,p_store,p_staff,item.quantity,v_success,v_now,v_now,v_now,p_actor,p_actor);
        ELSE
          v_ledger_id := generate_runtime_id('ORD');
          INSERT INTO offer_redemptions(offer_redemption_id,redemption_transaction_id,redemption_transaction_item_id,
              organization_id,subscription_id,offer_id,store_id,staff_id,quantity,redeemed_at,created_at,updated_at,created_by,updated_by)
          VALUES(v_ledger_id,t.redemption_transaction_id,item.redemption_transaction_item_id,p_org,v_subscription,
              item.offer_id,p_store,p_staff,item.quantity,v_now,v_now,v_now,p_actor,p_actor);
        END IF;
        UPDATE redemption_transaction_item SET status='SUCCESS',
          redemption_id=CASE WHEN item.item_type='BENEFIT' THEN v_ledger_id END,
          offer_redemption_id=CASE WHEN item.item_type='OFFER' THEN v_ledger_id END,
          updated_at=v_now,updated_by=p_actor,version_no=version_no+1
        WHERE redemption_transaction_item_id=item.redemption_transaction_item_id;
      END LOOP;
      UPDATE redemption_transaction SET status='SUCCESS',staff_id=p_staff,completed_at=v_now,
        updated_at=v_now,updated_by=p_actor,version_no=version_no+1 WHERE redemption_transaction_id=t.redemption_transaction_id;
      UPDATE commerce_transaction_adjustments a SET status='APPLIED',applied_amount_minor=s."discountMinor",
        updated_at=v_now AT TIME ZONE 'UTC',updated_by=v_operator,version_no=a.version_no+1
      FROM fulfillment_items fi JOIN jsonb_to_recordset(f.effective_policy_snapshot->'lines')
        s("itemType" varchar,"itemId" varchar,"productId" varchar,"discountMinor" bigint) ON fi.product_id=s."productId"
      WHERE a.commerce_transaction_id=c.commerce_transaction_id AND NOT a.is_deleted AND a.status='REQUESTED'
        AND fi.fulfillment_id=p_order AND fi.line_reference=a.target_line_id AND a.source_type=s."itemType" AND a.source_id=s."itemId";
      UPDATE fulfillment_credentials SET used_at=v_now,verified_by=p_actor,updated_at=v_now,
        updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_credential_id=qr.fulfillment_credential_id;
      UPDATE commerce_transactions SET status='COMPLETED',completed_at=v_now AT TIME ZONE 'UTC',
        updated_at=v_now AT TIME ZONE 'UTC',updated_by=v_operator,version_no=version_no+1
        WHERE commerce_transaction_id=c.commerce_transaction_id;
    ELSE
      v_now := clock_timestamp() AT TIME ZONE 'UTC';
    END IF;
    UPDATE fulfillments SET fulfillment_status_id=v_target_id,updated_at=v_now,updated_by=p_actor,version_no=version_no+1,
      fulfilled_at=CASE WHEN v_target='FULFILLED' THEN v_now ELSE fulfilled_at END,
      actual_collection_at=CASE WHEN v_target='FULFILLED' THEN v_now ELSE actual_collection_at END
      WHERE fulfillment_id=p_order;
    INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
      prior_fulfillment_status_id,new_fulfillment_status_id,action_details,action_at,created_at,created_by)
    VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code=v_action),p_actor,
      f.fulfillment_status_id,v_target_id,jsonb_build_object('staffId',p_staff,'storeId',p_store),v_now,v_now,p_actor);
    RETURN CASE WHEN v_target='FULFILLED' THEN 'COLLECTION_COMPLETED' ELSE 'ORDER_UPDATED' END;
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_order_operator(varchar,varchar,varchar,varchar),
    "${schemaName}".counter_order_next(varchar,varchar,varchar),
    "${schemaName}".counter_order_collection_payment(varchar,varchar,varchar,varchar,varchar)
FROM PUBLIC,"${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_counter_order_lifecycle(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".update_counter_order_lifecycle(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_order_lifecycle(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".update_counter_order_lifecycle(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar) TO "${appRole}";

-- Extend the canonical receipt resolver for online fulfillment captures.
-- Existing Commerce and membership receipts retain their established path.
CREATE OR REPLACE FUNCTION "${schemaName}".receipt_successful_payment_facts(
    p_commerce_transaction_id varchar,p_total_minor bigint
) RETURNS TABLE(payment_method varchar,customer_reference varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH existing AS MATERIALIZED (
      SELECT (CASE
        WHEN coalesce(p_total_minor,0)=0 THEN 'NO_PAYMENT'
        WHEN a.payment_channel='CASH' THEN 'CASH'
        WHEN p.checkout_payment_method IS NOT NULL THEN p.checkout_payment_method
        WHEN a.payment_channel='REMOTE_TERMINAL' THEN 'CARD'
        WHEN a.payment_channel='LEGACY_PAYMENT_INTENT' AND pc.provider_code='POYNT_COLLECT' THEN 'CARD'
        WHEN a.payment_channel='LEGACY_PAYMENT_INTENT' THEN coalesce(pc.provider_code,'CARD')
        ELSE coalesce(nullif(btrim(a.payment_channel),''),'CARD')
      END)::varchar AS method,
      nullif(btrim(coalesce(a.provider_transaction_id,a.provider_reference_id)),'')::varchar AS reference
      FROM commerce_provider_payment_attempts a
      JOIN commerce_transactions ct ON ct.commerce_transaction_id=a.commerce_transaction_id
      LEFT JOIN payment_intents p ON p.organization_id=ct.organization_id AND p.status='SUCCEEDED'
        AND p.provider_reference_id=coalesce(a.provider_transaction_id,a.provider_reference_id)
      LEFT JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
      WHERE a.commerce_transaction_id=p_commerce_transaction_id AND a.provider_status='SUCCEEDED'
      ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC LIMIT 1
    )
    SELECT method,reference FROM existing
    UNION ALL
    SELECT coalesce(nullif(btrim(i.checkout_payment_method),''),'POYNT_COLLECT')::varchar,v.provider_transaction_id::varchar
    FROM commerce_transactions c JOIN payment_intents i ON i.commerce_transaction_id=c.commerce_transaction_id
    JOIN poynt_collect_verified_captures v ON v.payment_intent_id=i.payment_intent_id
      AND v.provider_transaction_id=c.provider_transaction_id
    WHERE c.commerce_transaction_id=p_commerce_transaction_id AND c.source_channel='CUSTOMER_FULFILLMENT'
      AND c.total_minor=p_total_minor AND NOT EXISTS (SELECT 1 FROM existing)
      AND counter_order_collection_payment(c.organization_id,c.store_id,c.customer_user_id,c.commerce_transaction_id,'PAY_NOW')='VERIFIED_ONLINE';
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".receipt_successful_payment_facts(varchar,bigint) FROM PUBLIC;

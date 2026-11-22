-- Collection authorization is an order action, independent of the pickup
-- credential used to establish it. The original 309c changeset remains intact.
ALTER TABLE "${schemaName}".redemption_transaction ADD COLUMN counter_verification jsonb;

INSERT INTO "${schemaName}".statuses(status_id,status_code,status_name,description,display_order)
VALUES ('STATUS_'||md5('COLLECTION_AUTHORIZED'),'COLLECTION_AUTHORIZED','Collection Authorized',
        'A Counter operator verified a customer for this order',12)
ON CONFLICT (status_code) DO NOTHING;
INSERT INTO "${schemaName}".entity_status(entity_status_id,entity_type_id,status_id,display_order,system_managed)
SELECT 'ENTITY_STATUS_'||md5('FULFILLMENT_ACTION_TYPE:COLLECTION_AUTHORIZED'),et.entity_type_id,s.status_id,12,
    true
FROM "${schemaName}".entity_type et CROSS JOIN "${schemaName}".statuses s
WHERE et.entity_type_code='FULFILLMENT_ACTION_TYPE' AND s.status_code='COLLECTION_AUTHORIZED'
ON CONFLICT (entity_status_id) DO NOTHING;

-- OTP evidence becomes durable only when the existing verified business
-- binding is consumed for this exact redemption.

-- ==========================================================================
-- IMMEDIATE COUNTER — Verified customer authorization
-- Canonical PostgreSQL function: bind_counter_redemption_otp
-- ==========================================================================

CREATE FUNCTION "${schemaName}".bind_counter_redemption_otp(
    p_org varchar,p_redemption varchar,p_challenge varchar,p_actor varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE r redemption_transaction%ROWTYPE; b record;
BEGIN
    SELECT * INTO r FROM redemption_transaction WHERE redemption_transaction_id=p_redemption
      AND organization_id=p_org AND redemption_method='OTP' AND status='PENDING'
          AND created_by=p_actor FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF r.counter_verification->>'sourceId'=p_challenge THEN RETURN true; END IF;
    SELECT * INTO b FROM business_otp_resolve_context(p_challenge,'COUNTER_REDEMPTION_VERIFY') b
      WHERE b.organization_id=p_org AND b.store_id=r.store_id AND b.staff_id=r.staff_id
        AND b.subscription_id=r.subscription_id AND NOT (b.payload ? 'collectionOrderId')
        AND customer_fulfillment_subscription_owned(p_org,r.subscription_id,b.user_id)
        AND (SELECT coalesce(array_agg(i.benefit_id ORDER BY i.benefit_id),ARRAY[]::varchar[])
          FROM redemption_transaction_item i WHERE i.redemption_transaction_id=p_redemption
              AND i.item_type='BENEFIT')
          = ARRAY(SELECT x::varchar FROM jsonb_array_elements_text(coalesce(b.payload->'benefitIds',
              '[]'::jsonb)) x ORDER BY x)
        AND (SELECT coalesce(array_agg(i.offer_id ORDER BY i.offer_id),ARRAY[]::varchar[])
          FROM redemption_transaction_item i WHERE i.redemption_transaction_id=p_redemption
              AND i.item_type='OFFER')
          = ARRAY(SELECT x::varchar FROM jsonb_array_elements_text(coalesce(b.payload->'offerIds',
              '[]'::jsonb)) x ORDER BY x);
    IF NOT FOUND OR counter_order_operator(p_org,r.store_id,r.staff_id,p_actor) IS NULL
       OR NOT business_otp_consume_context(p_challenge,'COUNTER_REDEMPTION_VERIFY') THEN RETURN false; END IF;
    UPDATE redemption_transaction SET counter_verification=jsonb_build_object(
      'method','PHONE_OTP','sourceId',p_challenge,'actorId',p_actor,'staffId',r.staff_id,'storeId',r.store_id,
      'verifiedAt',clock_timestamp() AT TIME ZONE 'UTC')
      WHERE redemption_transaction_id=p_redemption;
    RETURN true;
END;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".bind_counter_redemption_otp(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".bind_counter_redemption_otp(varchar,varchar,varchar,
    varchar) TO "${appRole}";

-- Place the order in the same transaction that persists the priced provider
-- order, before the Commerce transaction becomes available to payment.

-- ==========================================================================
-- IMMEDIATE COUNTER — Durable order and entitlement holds
-- Canonical PostgreSQL function: place_immediate_counter_order
-- ==========================================================================

CREATE FUNCTION "${schemaName}".place_immediate_counter_order(p_commerce varchar,p_actor varchar)
RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE c commerce_transactions%ROWTYPE; r redemption_transaction%ROWTYPE; v_id varchar; v_placed varchar;
    v_policy jsonb; v_workflow varchar; v_zone varchar; v_lines jsonb; v_evidence jsonb; v_now timestamp;
    v_count integer; v_inserted integer;
BEGIN
    SELECT * INTO STRICT c FROM commerce_transactions WHERE commerce_transaction_id=p_commerce
        AND source_channel='COUNTER_REDEMPTION';
    IF EXISTS (SELECT 1 FROM fulfillments WHERE commerce_transaction_id=p_commerce) THEN RETURN; END IF;
    SELECT t.* INTO STRICT r FROM commerce_transaction_redemptions x JOIN redemption_transaction t USING(redemption_transaction_id)
      WHERE x.commerce_transaction_id=p_commerce AND NOT x.is_deleted AND t.organization_id=c.organization_id
        AND t.store_id=c.store_id AND t.subscription_id=c.subscription_id AND t.status='PENDING' FOR UPDATE OF t;
    v_evidence := r.counter_verification;
    IF v_evidence IS NULL OR v_evidence->>'storeId' IS DISTINCT FROM c.store_id
      OR coalesce(v_evidence->>'method','') NOT IN ('QR','PHONE_OTP','STAFF_ASSISTED')
      OR (v_evidence->>'verifiedAt')::timestamp+interval '15 minutes'<=clock_timestamp() AT TIME ZONE 'UTC'
      OR counter_order_operator(c.organization_id,c.store_id,(v_evidence->>'staffId')::varchar,
          (v_evidence->>'actorId')::varchar) IS NULL
      THEN RAISE EXCEPTION 'Verify the customer before starting Counter checkout' USING ERRCODE='23505'; END IF;
    PERFORM 1 FROM subscriptions WHERE subscription_id=r.subscription_id AND NOT is_deleted FOR UPDATE;
    SELECT s.policy,s.timezone INTO v_policy,v_zone FROM customer_fulfillment_store_context(c.organization_id,
        r.subscription_id,c.customer_user_id) s
      WHERE s.store_id=c.store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Counter order ownership is unavailable' USING ERRCODE='23505'; END IF;
    PERFORM assert_fulfillment_pickup_entitlements(c.organization_id,r.subscription_id,c.store_id,
      ARRAY(SELECT benefit_id FROM redemption_transaction_item WHERE redemption_transaction_id=r.redemption_transaction_id
          AND item_type='BENEFIT'),
      ARRAY(SELECT offer_id FROM redemption_transaction_item WHERE redemption_transaction_id=r.redemption_transaction_id
          AND item_type='OFFER'),
      clock_timestamp());
    SELECT count(*) INTO v_count FROM redemption_transaction_item WHERE redemption_transaction_id=r.redemption_transaction_id
        AND status='PENDING';
    SELECT jsonb_agg(jsonb_build_object('itemType',l.source_entity_type,'itemId',l.source_entity_id,'productId',
        m.product_id,
      'discountMinor',a.applied_amount_minor,'workflow',fulfillment_resolve_product_workflow(c.organization_id,
          c.store_id,m.product_id,m.commerce_product_mapping_id)))
    INTO v_lines FROM commerce_transaction_lines l JOIN commerce_product_mappings m USING(commerce_product_mapping_id)
      JOIN commerce_transaction_adjustments a ON a.target_line_id=l.commerce_transaction_line_id
        AND a.commerce_transaction_id=p_commerce AND a.status='APPLIED' AND NOT a.is_deleted
      WHERE l.commerce_transaction_id=p_commerce AND NOT l.is_deleted;
    IF v_count=0 OR jsonb_array_length(coalesce(v_lines,'[]'::jsonb))<>v_count
      THEN RAISE EXCEPTION 'Counter order lines do not match the verified basket' USING ERRCODE='23505'; END IF;
    v_workflow := CASE WHEN v_lines @> '[{"workflow":"DETAILED"}]' THEN 'DETAILED'
      WHEN v_lines @> '[{"workflow":"SIMPLE"}]' THEN 'SIMPLE' ELSE 'NONE' END;
    v_now := clock_timestamp() AT TIME ZONE 'UTC';
    v_id := generate_runtime_id('FUL');
    SELECT status_id INTO STRICT v_placed FROM statuses WHERE status_code='PLACED';
    INSERT INTO fulfillments(fulfillment_id,organization_id,store_id,customer_user_id,redemption_transaction_id,
        commerce_transaction_id,
      fulfillment_number,request_channel_status_id,request_timing_status_id,payment_timing_status_id,
          fulfillment_type_status_id,
      workflow_mode_status_id,fulfillment_status_id,effective_policy_snapshot,expected_collection_at,created_by,
          updated_by)
    VALUES(v_id,c.organization_id,c.store_id,c.customer_user_id,r.redemption_transaction_id,p_commerce,
        r.redemption_transaction_number,
      (SELECT status_id FROM statuses WHERE status_code='COUNTER_STAFF'),
          (SELECT status_id FROM statuses WHERE status_code='IMMEDIATE'),
      (SELECT status_id FROM statuses WHERE status_code='PAY_AT_COUNTER'),
          (SELECT status_id FROM statuses WHERE status_code='ORDER'),
      (SELECT status_id FROM statuses WHERE status_code=v_workflow),v_placed,
      v_policy||jsonb_build_object('collectionTimeZone',v_zone,'lines',v_lines),v_now,p_actor,p_actor);
    INSERT INTO fulfillment_items(fulfillment_item_id,fulfillment_id,line_reference,product_id,
        product_catalog_category_id,
      redemption_transaction_item_id,product_name_snapshot,quantity,workflow_code_snapshot,
          commerce_product_mapping_id,
      policy_snapshot,created_by,updated_by)
    SELECT generate_runtime_id('FUI'),v_id,l.commerce_transaction_line_id,p.product_id,
        p.product_catalog_category_id,
      i.redemption_transaction_item_id,left(l.description,200),l.quantity,s->>'workflow',
          l.commerce_product_mapping_id,s,p_actor,p_actor
    FROM commerce_transaction_lines l JOIN commerce_product_mappings m USING(commerce_product_mapping_id)
    JOIN product p ON p.product_id=m.product_id AND p.organization_id=c.organization_id AND NOT p.is_deleted
    JOIN redemption_transaction_item i ON i.redemption_transaction_id=r.redemption_transaction_id
      AND i.item_type=l.source_entity_type AND coalesce(i.benefit_id,i.offer_id)=l.source_entity_id
          AND i.quantity=l.quantity
    JOIN LATERAL jsonb_array_elements(v_lines) s ON s->>'itemType'=l.source_entity_type
        AND s->>'itemId'=l.source_entity_id
      AND s->>'productId'=p.product_id
    WHERE l.commerce_transaction_id=p_commerce AND NOT l.is_deleted;
    GET DIAGNOSTICS v_inserted=ROW_COUNT;
    IF v_inserted<>v_count THEN RAISE EXCEPTION 'Counter reservation lines are incomplete' USING ERRCODE='23505';
        END IF;
    INSERT INTO redemption_entitlement_reservations(redemption_entitlement_reservation_id,fulfillment_id,
        redemption_transaction_item_id,
      reservation_status_id,usage_window_key,reserved_quantity,created_by,updated_by)
    SELECT generate_runtime_id('RES'),v_id,i.redemption_transaction_item_id,s.status_id,
      r.subscription_id||':'||i.item_type||':'||coalesce(i.benefit_id,i.offer_id),i.quantity,p_actor,p_actor
    FROM redemption_transaction_item i CROSS JOIN statuses s
    WHERE i.redemption_transaction_id=r.redemption_transaction_id AND i.status='PENDING'
        AND s.status_code='RESERVED';
    -- Keep the checkout's existing PENDING contract for terminal recovery.
    -- These durable holds are the authoritative pending entitlement state.
    UPDATE redemption_transaction SET expires_at=NULL WHERE redemption_transaction_id=r.redemption_transaction_id;
    INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
      new_fulfillment_status_id,action_details,action_at,created_by)
    SELECT generate_runtime_id('FAC'),v_id,s.status_id,
      CASE WHEN s.status_code='ACCEPTED' THEN p_actor ELSE v_evidence->>'actorId' END,v_placed,
      CASE WHEN s.status_code='ACCEPTED' THEN '{}'::jsonb ELSE v_evidence||jsonb_build_object('customerId',
          c.customer_user_id,'origin','IMMEDIATE') END,
      v_now,p_actor FROM statuses s WHERE s.status_code IN ('ACCEPTED','COLLECTION_AUTHORIZED');
END;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".place_immediate_counter_order(varchar,varchar) FROM PUBLIC,"${appRole}";


-- ==========================================================================
-- IMMEDIATE COUNTER — Existing redemption order lookup
-- Canonical PostgreSQL function: counter_order_for_redemption
-- ==========================================================================

CREATE FUNCTION "${schemaName}".counter_order_for_redemption(p_commerce varchar,p_actor varchar)
RETURNS varchar LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",
    pg_temp AS $body$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(p_commerce,p_actor);
    RETURN (SELECT fulfillment_id FROM fulfillments WHERE commerce_transaction_id=p_commerce);
END;
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".counter_order_for_redemption(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_for_redemption(varchar,varchar) TO "${appRole}";


-- ==========================================================================
-- UNIFIED ORDER — Allowed preparation and handover transitions
-- Canonical PostgreSQL function: counter_order_next
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_next(p_state varchar,p_workflow varchar,
    p_command varchar)
RETURNS varchar LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $body$
    SELECT (CASE
      WHEN p_workflow='DETAILED' AND p_state='PLACED' AND p_command='START_PREPARING' THEN 'PREPARING'
      WHEN p_workflow='DETAILED' AND p_state='PREPARING' AND p_command='MARK_READY' THEN 'READY'
      WHEN p_workflow='SIMPLE' AND p_state='PLACED' AND p_command='MARK_READY' THEN 'READY'
      WHEN p_workflow IN ('SIMPLE','DETAILED') AND p_state='READY'
          AND p_command='COMPLETE_COLLECTION' THEN 'FULFILLED'
      WHEN p_workflow='NONE' AND p_state='PLACED' AND p_command='COMPLETE_COLLECTION' THEN 'FULFILLED'
    END)::varchar;
$body$;

INSERT INTO "${schemaName}".statuses(status_id,status_code,status_name,description,display_order)
VALUES ('STATUS_'||md5('SUPPORT_CASE_LINKED'),'SUPPORT_CASE_LINKED','Support Case Linked',
        'An existing Support case was linked to a fulfillment',13)
ON CONFLICT (status_code) DO NOTHING;
INSERT INTO "${schemaName}".entity_status(entity_status_id,entity_type_id,status_id,display_order,system_managed)
SELECT 'ENTITY_STATUS_'||md5('FULFILLMENT_ACTION_TYPE:SUPPORT_CASE_LINKED'),et.entity_type_id,s.status_id,13,true
FROM "${schemaName}".entity_type et CROSS JOIN "${schemaName}".statuses s
WHERE et.entity_type_code='FULFILLMENT_ACTION_TYPE' AND s.status_code='SUPPORT_CASE_LINKED'
ON CONFLICT (entity_status_id) DO NOTHING;


-- ==========================================================================
-- UNIFIED ORDER — Authoritative payment evidence
-- Canonical PostgreSQL function: counter_order_collection_payment
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_collection_payment(
    p_org varchar,p_store varchar,p_customer varchar,p_commerce varchar,p_timing varchar
) RETURNS varchar LANGUAGE plpgsql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE c commerce_transactions%ROWTYPE; v_capture_count bigint; v_terminal_count bigint; v_cash_override varchar;
BEGIN
    SELECT * INTO c FROM commerce_transactions
    WHERE commerce_transaction_id=p_commerce AND organization_id=p_org AND store_id=p_store
      AND customer_user_id=p_customer AND source_channel IN ('CUSTOMER_FULFILLMENT','COUNTER_REDEMPTION')
          AND NOT is_deleted;
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
    SELECT r.terminal_payment_attempt_id INTO v_cash_override FROM commerce_counter_timeout_recoveries r
      WHERE r.commerce_transaction_id=p_commerce AND r.action='CASH' AND r.confirmed_no_success
          AND NOT r.late_capture_seen;
    IF p_timing='PAY_AT_COUNTER' AND c.currency_code='CAD' AND c.status='ORDER_CREATED' AND c.total_minor>0
      AND c.provider_transaction_id IS NULL AND v_cash_override IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce)
      AND NOT EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND (a.provider_status='SUCCEEDED' OR a.payment_channel='CASH'
          OR (a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED','DECLINED')
            AND a.commerce_provider_payment_attempt_id<>v_cash_override)))
      THEN RETURN 'CASH_RECOVERY_READY'; END IF;
    IF p_timing='PAY_AT_COUNTER' AND c.currency_code='CAD' AND c.total_minor>0 AND c.status='PROVIDER_IN_PROGRESS'
      AND c.provider_transaction_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce)
      AND (SELECT count(*) FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED','DECLINED')
        AND (a.commerce_provider_payment_attempt_id IS DISTINCT FROM v_cash_override
            OR a.provider_status='SUCCEEDED'))=1
      AND EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND a.payment_channel='CASH' AND a.provider_status='PENDING' AND a.amount_minor=c.total_minor
        AND a.currency_code=c.currency_code AND a.provider_reference_id='cash:'||p_commerce)
      THEN RETURN 'CASH_CONFIRMATION_REQUIRED'; END IF;
    IF c.status IN ('DRAFT','PROVIDER_IN_PROGRESS','PROVIDER_FAILED','CANCELLED') OR EXISTS (
      SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce AND (
        i.status IN ('PENDING','PROCESSING') OR EXISTS (
          SELECT 1 FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
              AND a.status IN ('PENDING','PROCESSING')
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
         AND (c.status IN ('ORDER_CREATED','COMPLETED') OR
           (c.source_channel='COUNTER_REDEMPTION'
               AND c.status='PROVIDER_SUCCEEDED')) THEN RETURN 'NO_PAYMENT_REQUIRED'; END IF;
    ELSIF p_timing='PAY_NOW' AND v_capture_count=1
      AND (v_terminal_count=0 OR (v_terminal_count=1 AND EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
        WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED'
          AND a.payment_channel='LEGACY_PAYMENT_INTENT' AND a.amount_minor=c.total_minor
              AND a.currency_code=c.currency_code
          AND coalesce(a.provider_transaction_id,a.provider_reference_id)=c.provider_transaction_id
      )))
      AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED') AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
        WHERE i.commerce_transaction_id=p_commerce AND i.organization_id=p_org AND i.store_id=p_store
          AND i.customer_user_id=p_customer AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
          AND i.currency_code=c.currency_code AND i.amount*100=c.total_minor
          AND v.organization_id=p_org AND v.amount_minor=c.total_minor AND v.currency_code=c.currency_code
          AND v.provider_transaction_id=c.provider_transaction_id
              AND v.provider_transaction_id=i.provider_reference_id
          AND nullif(btrim(v.provider_transaction_id),'') IS NOT NULL
          AND nullif(btrim(v.merchant_business_id),'')=i.fulfillment_checkout->>'paymentBusinessId'
          AND nullif(btrim(v.merchant_store_id),'')=i.fulfillment_checkout->>'paymentStoreId'
          AND (SELECT count(*) FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
              AND a.status='SUCCEEDED')=1
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
          AND a.provider_transaction_id=c.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),
              '') IS NOT NULL
          AND (a.payment_channel='CASH' OR (a.payment_channel='REMOTE_TERMINAL'
            AND nullif(btrim(a.provider_business_id),'') IS NOT NULL AND nullif(btrim(a.provider_device_id),
                '') IS NOT NULL))
      ) THEN RETURN 'VERIFIED_AT_COUNTER'; END IF;
    END IF;
    RETURN 'PAYMENT_UNRESOLVED';
END;
$body$;


-- ==========================================================================
-- UNIFIED ORDER — Staff dashboard lifecycle projection
-- Canonical PostgreSQL function: get_counter_order_lifecycle
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_order_lifecycle(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH scoped AS MATERIALIZED (
      SELECT f.*,state.status_code AS state,workflow.status_code AS workflow,timing.status_code AS timing,
        request.status_code AS request_timing
      FROM fulfillments f
      JOIN statuses state ON state.status_id=f.fulfillment_status_id
      JOIN statuses workflow ON workflow.status_id=f.workflow_mode_status_id
      JOIN statuses timing ON timing.status_id=f.payment_timing_status_id
      JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
      JOIN statuses request ON request.status_id=f.request_timing_status_id AND request.status_code IN ('ADVANCE',
          'IMMEDIATE')
      WHERE f.fulfillment_id=p_order AND f.organization_id=p_org AND f.store_id=p_store
        AND counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL
    ), details AS MATERIALIZED (
      SELECT f.*,counter_order_collection_payment(p_org,p_store,f.customer_user_id,f.commerce_transaction_id,
          f.timing) AS payment,
             f.fulfilled_at IS NULL AND f.cancelled_at IS NULL
                 AND f.cancellation_requested_at IS NULL AS available
      FROM scoped f
    )
    SELECT (original.item || coalesce((SELECT jsonb_build_object('lifecycle',jsonb_build_object(
      'version',f.version_no,'payment',f.payment,'collectedAt',f.actual_collection_at AT TIME ZONE 'UTC',
      'journey',CASE WHEN f.request_timing='IMMEDIATE' THEN 'IMMEDIATE_PAY_AT_COUNTER'
        WHEN f.timing='PAY_NOW' THEN 'ADVANCE_PAY_NOW' ELSE 'ADVANCE_PAY_AT_COUNTER' END,
      'redemptionId',f.redemption_transaction_id,
      'canStartTerminal',f.available AND f.state IN ('PLACED','PREPARING','READY') AND verified.method IS NOT NULL
        AND f.request_timing='ADVANCE' AND f.timing='PAY_AT_COUNTER' AND f.payment='PAYMENT_REQUIRED'
            AND c.currency_code='CAD'
        AND f.effective_policy_snapshot->>'counterPaymentProvider'='POYNT'
        AND c.integration_configuration_id=f.effective_policy_snapshot->>'counterPaymentIntegrationId'
        AND NOT coalesce(support.unresolved,false),
      'terminalRecoveryAttemptId',CASE WHEN f.available AND f.timing='PAY_AT_COUNTER'
        AND f.request_timing='ADVANCE' AND f.payment='PAYMENT_UNRESOLVED' AND terminal.recoverable
        THEN terminal.attempt_id END,
      'verificationMethod',verified.method,
      'supportCaseNumber',support.ticket_number,
      'collectionBlocker',CASE WHEN f.state='CANCEL_REQUESTED' THEN 'CANCELLATION_REQUESTED'
        WHEN support.unresolved THEN 'SUPPORT_UNRESOLVED' END,
      'canLinkSupport',f.state IN ('PLACED','PREPARING','READY','CANCEL_REQUESTED') AND f.fulfilled_at IS NULL
          AND f.cancelled_at IS NULL,
      'canRequestCancellation',f.available AND f.state IN ('PLACED','PREPARING','READY'),
      'canReportNoShow',f.available AND f.state IN ('PLACED','PREPARING','READY')
          AND f.no_show_recorded_at IS NULL
        AND f.effective_policy_snapshot @> '{"staffNoShowRecordingEnabled":true}'
        AND coalesce(f.expected_collection_at + make_interval(mins=>coalesce((f.effective_policy_snapshot->>'noShowGraceMinutes')::integer,
            0))
          <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC',false),
      'canAuthorizeCollection',f.available AND f.state IN ('PLACED','PREPARING','READY'),
      'outstandingMinor',CASE WHEN f.payment IN ('PAYMENT_REQUIRED','CASH_CONFIRMATION_REQUIRED',
          'CASH_RECOVERY_READY')
        THEN c.total_minor END,
      'canStartCash',f.available AND f.state IN ('PLACED','PREPARING','READY') AND c.currency_code='CAD'
        AND verified.method IS NOT NULL AND f.payment IN ('PAYMENT_REQUIRED','CASH_RECOVERY_READY')
            AND NOT coalesce(support.unresolved,false),
      'canConfirmCash',f.available AND f.state IN ('PLACED','PREPARING','READY')
        AND verified.method IS NOT NULL AND f.payment='CASH_CONFIRMATION_REQUIRED'
            AND NOT coalesce(support.unresolved,false),
      'canStartPreparing',f.available AND counter_order_next(f.state,f.workflow,'START_PREPARING') IS NOT NULL,
      'canMarkReady',f.available AND counter_order_next(f.state,f.workflow,'MARK_READY') IS NOT NULL,
      'canCompleteCollection',f.available AND counter_order_next(f.state,f.workflow,
          'COMPLETE_COLLECTION') IS NOT NULL
        AND coalesce(c.status<>'COMPLETED',false) AND verified.method IS NOT NULL
            AND NOT coalesce(support.unresolved,false)
        AND f.payment IN ('NO_PAYMENT_REQUIRED','VERIFIED_ONLINE','VERIFIED_AT_COUNTER')
    )) FROM details f LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id
      AND c.organization_id=p_org AND c.store_id=p_store AND c.customer_user_id=f.customer_user_id
          AND NOT c.is_deleted
    LEFT JOIN LATERAL (
      SELECT CASE WHEN f.state='FULFILLED'
          OR ((a.action_at+interval '15 minutes'>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        OR a.action_details @> '{"origin":"IMMEDIATE"}')
        AND counter_order_operator(p_org,p_store,(a.action_details->>'staffId')::varchar,
            a.actor_user_id) IS NOT NULL)
        THEN a.action_details->>'method' END AS method FROM fulfillment_actions a
      JOIN statuses s ON s.status_id=a.action_type_status_id AND s.status_code='COLLECTION_AUTHORIZED'
      WHERE a.fulfillment_id=f.fulfillment_id AND a.action_details->>'storeId'=f.store_id
        AND a.action_details->>'customerId'=f.customer_user_id
      ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1
    ) verified ON true
    LEFT JOIN LATERAL (
      SELECT max(r.ticket_number) AS ticket_number,bool_or(r.status NOT IN ('RESOLVED','CLOSED')) AS unresolved
      FROM fulfillment_actions a JOIN customer_support_requests r ON r.support_request_id=a.support_reference_id
        AND r.organization_id=f.organization_id AND r.customer_user_id=f.customer_user_id
      WHERE a.fulfillment_id=f.fulfillment_id
    ) support ON true
    LEFT JOIN LATERAL (
      SELECT a.commerce_provider_payment_attempt_id AS attempt_id,
        a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED')
        AND a.created_at+interval '120 seconds'<=CURRENT_TIMESTAMP AS recoverable
      FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=c.commerce_transaction_id
        AND a.payment_channel='REMOTE_TERMINAL' ORDER BY a.created_at DESC,
            a.commerce_provider_payment_attempt_id DESC LIMIT 1
    ) terminal ON true
    ),'{}'::jsonb))::text
    FROM (SELECT get_counter_fulfillment_orders(p_org,p_store,p_staff,p_actor,p_order,NULL,NULL,NULL,1,0)::jsonb
      ->'orders'->0 AS item) original
    WHERE counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL;
$body$;


-- ==========================================================================
-- UNIFIED ORDER — Payment, preparation and atomic collection
-- Canonical PostgreSQL function: update_counter_order_lifecycle
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".update_counter_order_lifecycle(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,
    p_version integer,p_command varchar,p_hash varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; qr fulfillment_credentials%ROWTYPE; c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE; item redemption_transaction_item%ROWTYPE;
    v_operator varchar; v_state varchar; v_workflow varchar; v_timing varchar; v_target varchar;
        v_target_id varchar;
    v_action varchar; v_payment varchar; v_subscription varchar; v_sub_number varchar; v_success varchar;
    v_ledger_id varchar; v_sequence text; v_now timestamp; v_items integer; v_lines integer;
    v_authorization fulfillment_actions%ROWTYPE; v_method varchar; v_source varchar; v_support_id varchar;
        v_immediate boolean;
BEGIN
    v_operator := counter_order_operator(p_org,p_store,p_staff,p_actor);
    IF v_operator IS NULL THEN RETURN 'FORBIDDEN'; END IF;
    -- The issuer and customer cancellation also lock fulfillment first.
    SELECT f0.* INTO f FROM fulfillments f0
      JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id AND kind.status_code='ORDER'
      JOIN statuses timing ON timing.status_id=f0.request_timing_status_id AND timing.status_code IN ('IMMEDIATE',
          'ADVANCE')
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store FOR UPDATE OF f0;
    IF NOT FOUND THEN RETURN 'ORDER_NOT_FOUND'; END IF;
    IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS DISTINCT FROM v_operator THEN RETURN 'FORBIDDEN';
        END IF;
    SELECT status_code INTO STRICT v_state FROM statuses WHERE status_id=f.fulfillment_status_id;
    SELECT status_code INTO STRICT v_workflow FROM statuses WHERE status_id=f.workflow_mode_status_id;
    SELECT status_code INTO STRICT v_timing FROM statuses WHERE status_id=f.payment_timing_status_id;
    SELECT status_code='IMMEDIATE' INTO STRICT v_immediate FROM statuses WHERE status_id=f.request_timing_status_id;
    IF v_state='FULFILLED' OR f.fulfilled_at IS NOT NULL THEN RETURN 'ALREADY_FULFILLED'; END IF;
    IF p_command IN ('LINK_SUPPORT','REQUEST_CANCELLATION','REPORT_NO_SHOW') THEN
      IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
      IF f.cancelled_at IS NOT NULL OR v_state NOT IN ('PLACED','PREPARING','READY','CANCEL_REQUESTED')
        OR (v_state='CANCEL_REQUESTED' AND p_command<>'LINK_SUPPORT') THEN RETURN 'INVALID_TRANSITION'; END IF;
      SELECT r.support_request_id INTO v_support_id FROM customer_support_requests r
      WHERE r.ticket_number=p_hash AND r.organization_id=p_org AND r.customer_user_id=f.customer_user_id
        AND r.status NOT IN ('RESOLVED','CLOSED')
        AND counter_support_request_visible(r.support_request_id,p_org,p_store,p_staff,p_actor) FOR SHARE OF r;
      IF NOT FOUND THEN RETURN 'SUPPORT_CASE_UNAVAILABLE'; END IF;
      v_now := clock_timestamp() AT TIME ZONE 'UTC';
      v_target_id := f.fulfillment_status_id;
      IF p_command='LINK_SUPPORT' THEN
        IF EXISTS (SELECT 1 FROM fulfillment_actions a WHERE a.fulfillment_id=p_order
            AND a.support_reference_id=v_support_id)
          THEN RETURN 'ORDER_UPDATED'; END IF;
        v_action := 'SUPPORT_CASE_LINKED';
      ELSIF p_command='REQUEST_CANCELLATION' THEN
        IF f.cancellation_requested_at IS NOT NULL THEN RETURN 'INVALID_TRANSITION'; END IF;
        v_action := 'CANCELLATION_REQUESTED';
        SELECT status_id INTO STRICT v_target_id FROM statuses WHERE status_code='CANCEL_REQUESTED';
      ELSE
        IF f.no_show_recorded_at IS NOT NULL
            OR NOT (f.effective_policy_snapshot @> '{"staffNoShowRecordingEnabled":true}')
          OR f.expected_collection_at IS NULL OR v_now < f.expected_collection_at
            + make_interval(mins=>coalesce((f.effective_policy_snapshot->>'noShowGraceMinutes')::integer,0))
          THEN RETURN 'INVALID_TRANSITION'; END IF;
        v_action := 'NO_SHOW_RECORDED';
      END IF;
      UPDATE fulfillments SET fulfillment_status_id=v_target_id,version_no=version_no+1,updated_at=v_now,
          updated_by=p_actor,
        cancellation_requested_at=CASE WHEN v_action='CANCELLATION_REQUESTED' THEN v_now ELSE cancellation_requested_at END,
        no_show_recorded_at=CASE WHEN v_action='NO_SHOW_RECORDED' THEN v_now ELSE no_show_recorded_at END
        WHERE fulfillment_id=p_order;
      INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
        prior_fulfillment_status_id,new_fulfillment_status_id,support_reference_id,action_details,action_at,
            created_by)
      VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code=v_action),
          p_actor,
        f.fulfillment_status_id,v_target_id,v_support_id,jsonb_build_object('staffId',p_staff,'storeId',p_store),
            v_now,p_actor);
      RETURN 'ORDER_UPDATED';
    END IF;
    IF f.cancelled_at IS NOT NULL OR f.cancellation_requested_at IS NOT NULL THEN RETURN 'INVALID_TRANSITION';
        END IF;
    IF p_command IN ('AUTHORIZE_PICKUP_QR','AUTHORIZE_PICKUP_OTP','AUTHORIZE_PICKUP_ASSISTED') THEN
      IF v_state NOT IN ('PLACED','PREPARING','READY') OR p_hash IS NULL THEN RETURN 'INVALID_CREDENTIAL'; END IF;
      IF p_command='AUTHORIZE_PICKUP_QR' THEN
        IF p_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID_CREDENTIAL'; END IF;
        SELECT q.* INTO qr FROM fulfillment_credentials q
        JOIN statuses s ON s.status_id=q.credential_type_status_id AND s.status_code='PICKUP_QR'
        WHERE q.fulfillment_id=p_order AND q.token_hash=p_hash::char(64) FOR UPDATE OF q;
        IF NOT FOUND THEN
          IF EXISTS (SELECT 1 FROM fulfillment_credentials q JOIN fulfillments other USING(fulfillment_id)
            JOIN statuses kind ON kind.status_id=q.credential_type_status_id AND kind.status_code='PICKUP_QR'
            WHERE q.token_hash=p_hash::char(64) AND other.organization_id=p_org AND other.store_id<>p_store) THEN
            RETURN 'WRONG_STORE';
          END IF;
          RETURN 'INVALID_CREDENTIAL';
        END IF;
        IF qr.used_at IS NOT NULL THEN RETURN 'CREDENTIAL_USED'; END IF;
        IF qr.revoked_at IS NOT NULL THEN RETURN 'CREDENTIAL_REVOKED'; END IF;
        IF qr.expires_at IS NULL OR qr.expires_at<=clock_timestamp() AT TIME ZONE 'UTC' THEN RETURN 'CREDENTIAL_EXPIRED';
            END IF;
        v_method := 'QR';
        v_source := qr.fulfillment_credential_id;
      ELSIF p_command='AUTHORIZE_PICKUP_OTP' THEN
        v_method := 'PHONE_OTP';
        v_source := p_hash;
      ELSE
        SELECT s.organization_user_id INTO v_source FROM redemption_transaction rt
          JOIN subscriptions s ON s.subscription_id=rt.subscription_id AND NOT s.is_deleted
          JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
            AND ou.organization_id=p_org AND ou.user_id=f.customer_user_id AND NOT ou.is_deleted
        WHERE rt.redemption_transaction_id=f.redemption_transaction_id AND rt.organization_id=p_org
            AND rt.store_id=p_store
          AND upper(s.subscription_number)=upper(p_hash) AND customer_has_active_relationship(p_org,
              f.customer_user_id);
        IF v_source IS NULL THEN RETURN 'INVALID_CREDENTIAL'; END IF;
        v_method := 'STAFF_ASSISTED';
      END IF;
      IF EXISTS (SELECT 1 FROM fulfillment_actions a
        JOIN statuses s ON s.status_id=a.action_type_status_id AND s.status_code='COLLECTION_AUTHORIZED'
        WHERE a.fulfillment_id=p_order AND a.actor_user_id=p_actor AND a.action_details->>'staffId'=p_staff
          AND a.action_details->>'method'=v_method AND a.action_details->>'sourceId'=v_source
          AND a.action_at+interval '15 minutes'>clock_timestamp() AT TIME ZONE 'UTC') THEN
        RETURN 'COLLECTION_AUTHORIZED';
      END IF;
      IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
      IF v_method='PHONE_OTP' THEN
        IF NOT EXISTS (
          SELECT 1 FROM business_otp_resolve_context(v_source,'COUNTER_REDEMPTION_VERIFY') b
          JOIN otp_challenges o ON o.otp_challenge_id=v_source
              AND o.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
          JOIN redemption_transaction r ON r.redemption_transaction_id=f.redemption_transaction_id
              AND r.subscription_id=b.subscription_id
          WHERE b.organization_id=p_org AND b.store_id=p_store AND b.staff_id=p_staff
              AND b.user_id=f.customer_user_id
            AND b.payload->>'collectionOrderId'=p_order AND b.payload->>'counterActorId'=p_actor
        ) OR NOT business_otp_consume_context(v_source,
            'COUNTER_REDEMPTION_VERIFY') THEN RETURN 'INVALID_CREDENTIAL'; END IF;
      END IF;
      v_now := clock_timestamp() AT TIME ZONE 'UTC';
      INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
        prior_fulfillment_status_id,new_fulfillment_status_id,action_details,action_at,created_by)
      VALUES(generate_runtime_id('FAC'),p_order,
          (SELECT status_id FROM statuses WHERE status_code='COLLECTION_AUTHORIZED'),
        p_actor,f.fulfillment_status_id,f.fulfillment_status_id,
        jsonb_build_object('method',v_method,'sourceId',v_source,'staffId',p_staff,'storeId',p_store,'customerId',
            f.customer_user_id),
        v_now,p_actor);
      UPDATE fulfillments SET version_no=version_no+1,updated_at=v_now,
          updated_by=p_actor WHERE fulfillment_id=p_order;
      RETURN 'COLLECTION_AUTHORIZED';
    END IF;
    IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
    IF p_command IN ('START_CASH','CONFIRM_CASH','COMPLETE_COLLECTION') THEN
      PERFORM r.support_request_id FROM customer_support_requests r
        WHERE r.organization_id=p_org AND r.customer_user_id=f.customer_user_id AND EXISTS (
          SELECT 1 FROM fulfillment_actions a WHERE a.fulfillment_id=p_order
              AND a.support_reference_id=r.support_request_id
        ) ORDER BY r.support_request_id FOR SHARE;
      IF EXISTS (SELECT 1 FROM fulfillment_actions a JOIN customer_support_requests r
        ON r.support_request_id=a.support_reference_id AND r.organization_id=p_org
            AND r.customer_user_id=f.customer_user_id
        WHERE a.fulfillment_id=p_order AND r.status NOT IN ('RESOLVED','CLOSED'))
        THEN RETURN 'SUPPORT_UNRESOLVED'; END IF;
    END IF;
    IF p_command IN ('START_CASH','CONFIRM_CASH') THEN
      IF v_timing<>'PAY_AT_COUNTER' OR v_state NOT IN ('PLACED','PREPARING',
          'READY') THEN RETURN 'INVALID_TRANSITION'; END IF;
      SELECT a.* INTO v_authorization FROM fulfillment_actions a
        JOIN statuses s ON s.status_id=a.action_type_status_id AND s.status_code='COLLECTION_AUTHORIZED'
        WHERE a.fulfillment_id=p_order AND a.action_details->>'storeId'=p_store
            AND a.action_details->>'customerId'=f.customer_user_id
        ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1;
      IF NOT FOUND THEN RETURN 'AUTHORIZATION_REQUIRED'; END IF;
      IF NOT (v_authorization.action_details @> '{"origin":"IMMEDIATE"}')
        AND v_authorization.action_at+interval '15 minutes'<=clock_timestamp() AT TIME ZONE 'UTC'
        THEN RETURN 'AUTHORIZATION_EXPIRED'; END IF;
      IF counter_order_operator(p_org,p_store,(v_authorization.action_details->>'staffId')::varchar,
          v_authorization.actor_user_id) IS NULL
        THEN RETURN 'AUTHORIZATION_REVOKED'; END IF;
      PERFORM i.payment_intent_id FROM payment_intents i WHERE i.commerce_transaction_id=f.commerce_transaction_id
        ORDER BY i.payment_intent_id FOR UPDATE;
      SELECT * INTO c FROM commerce_transactions WHERE commerce_transaction_id=f.commerce_transaction_id
        AND organization_id=p_org AND store_id=p_store AND customer_user_id=f.customer_user_id
        AND source_channel=CASE WHEN v_immediate THEN 'COUNTER_REDEMPTION' ELSE 'CUSTOMER_FULFILLMENT' END
        AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR c.currency_code IS DISTINCT FROM 'CAD' THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
      IF NOT EXISTS (
        SELECT 1 FROM redemption_transaction r
        JOIN commerce_transaction_redemptions x ON x.redemption_transaction_id=r.redemption_transaction_id
          AND x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
        WHERE r.redemption_transaction_id=f.redemption_transaction_id AND r.organization_id=p_org
            AND r.store_id=p_store
          AND r.subscription_id=c.subscription_id
              AND r.status=CASE WHEN v_immediate THEN 'PENDING' ELSE 'RESERVED' END
      ) OR NOT EXISTS (
        SELECT 1 FROM redemption_entitlement_reservations h JOIN statuses s
          ON s.status_id=h.reservation_status_id AND s.status_code='RESERVED'
        WHERE h.fulfillment_id=p_order AND h.reserved_quantity>h.consumed_quantity+h.released_quantity
      ) THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;
      v_payment := counter_order_collection_payment(p_org,p_store,f.customer_user_id,c.commerce_transaction_id,
          v_timing);
      IF p_command='START_CASH' AND v_payment='CASH_CONFIRMATION_REQUIRED' THEN RETURN 'CASH_STARTED'; END IF;
      IF p_command='CONFIRM_CASH' AND v_payment='VERIFIED_AT_COUNTER' THEN RETURN 'PAYMENT_RECORDED'; END IF;
      IF p_command='START_CASH' AND v_payment IN ('PAYMENT_REQUIRED','CASH_RECOVERY_READY') THEN
        PERFORM commerce_begin_counter_redemption_cash_payment(p_org,c.commerce_transaction_id,p_actor);
      ELSIF p_command='CONFIRM_CASH' AND v_payment='CASH_CONFIRMATION_REQUIRED' THEN
        PERFORM commerce_confirm_counter_redemption_cash_payment(p_org,c.commerce_transaction_id,p_actor);
      ELSE
        RETURN 'PAYMENT_UNRESOLVED';
      END IF;
      UPDATE fulfillments SET version_no=version_no+1,updated_at=clock_timestamp() AT TIME ZONE 'UTC',
          updated_by=p_actor
        WHERE fulfillment_id=p_order;
      RETURN CASE WHEN p_command='START_CASH' THEN 'CASH_STARTED' ELSE 'PAYMENT_RECORDED' END;
    END IF;
    v_target := counter_order_next(v_state,v_workflow,p_command);
    IF v_target IS NULL OR f.cancelled_at IS NOT NULL OR f.cancellation_requested_at IS NOT NULL THEN
      RETURN 'INVALID_TRANSITION';
    END IF;
    SELECT status_id INTO STRICT v_target_id FROM statuses WHERE status_code=v_target;
    v_action := CASE p_command WHEN 'START_PREPARING' THEN 'PREPARATION_STARTED'
                  WHEN 'MARK_READY' THEN 'MARKED_READY' ELSE 'HANDOVER_CONFIRMED' END;

    IF p_command='COMPLETE_COLLECTION' THEN
      SELECT a.* INTO v_authorization FROM fulfillment_actions a
      JOIN statuses s ON s.status_id=a.action_type_status_id AND s.status_code='COLLECTION_AUTHORIZED'
      WHERE a.fulfillment_id=p_order AND a.action_details->>'storeId'=p_store
        AND a.action_details->>'customerId'=f.customer_user_id
      ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1;
      IF NOT FOUND THEN RETURN 'AUTHORIZATION_REQUIRED'; END IF;
      IF NOT (v_authorization.action_details @> '{"origin":"IMMEDIATE"}')
        AND v_authorization.action_at+interval '15 minutes'<=clock_timestamp() AT TIME ZONE 'UTC'
        THEN RETURN 'AUTHORIZATION_EXPIRED'; END IF;
      IF counter_order_operator(p_org,p_store,(v_authorization.action_details->>'staffId')::varchar,
         v_authorization.actor_user_id) IS NULL THEN RETURN 'AUTHORIZATION_REVOKED'; END IF;
      IF v_authorization.action_details @> '{"origin":"IMMEDIATE","method":"QR"}' THEN
        PERFORM 1 FROM redemption_transaction_qr q WHERE q.redemption_transaction_id=f.redemption_transaction_id
          AND q.organization_id=p_org AND q.redemption_transaction_qr_id=v_authorization.action_details->>'sourceId';
        IF NOT FOUND THEN RETURN 'AUTHORIZATION_REVOKED'; END IF;
      ELSIF v_authorization.action_details->>'method'='QR' THEN
        -- The issuer may rotate a presented QR. The accepted authorization
        -- has its own expiry and revocation checks after presentation.
        SELECT q.* INTO qr FROM fulfillment_credentials q JOIN statuses s
          ON s.status_id=q.credential_type_status_id AND s.status_code='PICKUP_QR'
        WHERE q.fulfillment_id=p_order
            AND q.fulfillment_credential_id=v_authorization.action_details->>'sourceId' FOR UPDATE OF q;
        IF NOT FOUND THEN RETURN 'AUTHORIZATION_REVOKED'; END IF;
        IF qr.used_at IS NOT NULL THEN RETURN 'CREDENTIAL_USED'; END IF;
      ELSIF v_authorization.action_details->>'method'='STAFF_ASSISTED'
        AND NOT customer_has_active_relationship(p_org,f.customer_user_id) THEN
        RETURN 'AUTHORIZATION_REVOKED';
      END IF;

      SELECT subscription_id INTO v_subscription FROM commerce_transactions
      WHERE commerce_transaction_id=f.commerce_transaction_id AND organization_id=p_org AND store_id=p_store
        AND customer_user_id=f.customer_user_id
        AND source_channel=CASE WHEN v_immediate THEN 'COUNTER_REDEMPTION' ELSE 'CUSTOMER_FULFILLMENT' END
            AND NOT is_deleted;
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
        AND source_channel=CASE WHEN v_immediate THEN 'COUNTER_REDEMPTION' ELSE 'CUSTOMER_FULFILLMENT' END
        AND NOT is_deleted FOR UPDATE;
      IF NOT FOUND OR c.status='COMPLETED' THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
      v_payment := counter_order_collection_payment(p_org,p_store,f.customer_user_id,c.commerce_transaction_id,
          v_timing);
      IF v_payment NOT IN ('NO_PAYMENT_REQUIRED','VERIFIED_ONLINE','VERIFIED_AT_COUNTER') THEN RETURN v_payment;
          END IF;

      SELECT * INTO t FROM redemption_transaction WHERE redemption_transaction_id=f.redemption_transaction_id
        AND organization_id=p_org AND store_id=p_store AND subscription_id=v_subscription
        AND ((v_immediate AND status='PENDING' AND redemption_method IN ('CUSTOMER_QR','OTP','STAFF_ASSISTED'))
          OR (NOT v_immediate AND status='RESERVED' AND redemption_method='CUSTOMER_FULFILLMENT')) FOR UPDATE;
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
            OR r.reserved_quantity IS DISTINCT FROM i.quantity OR r.consumed_quantity<>0
                OR r.released_quantity<>0)
        ) THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;

      -- Finalize only the discount allocations frozen by Phase 308, using the
      -- exact Commerce line + entitlement linkage and matching the settled total.
      IF jsonb_typeof(f.effective_policy_snapshot->'lines') IS DISTINCT FROM 'array' THEN RETURN 'PAYMENT_UNRESOLVED';
          END IF;
      SELECT count(*) INTO v_lines FROM commerce_transaction_lines l
        WHERE l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted;
      IF v_lines<>v_items OR v_lines<>jsonb_array_length(f.effective_policy_snapshot->'lines')
        OR v_items<>(SELECT count(DISTINCT fi.redemption_transaction_item_id) FROM fulfillment_items fi
          JOIN commerce_transaction_lines l ON l.commerce_transaction_line_id=fi.line_reference
          WHERE fi.fulfillment_id=p_order AND l.commerce_transaction_id=c.commerce_transaction_id
              AND NOT l.is_deleted)
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
                AND a.status=CASE WHEN v_immediate THEN 'APPLIED' ELSE 'REQUESTED' END
                AND a.source_type=i.item_type AND a.source_id=coalesce(i.benefit_id,i.offer_id)
              JOIN jsonb_to_recordset(f.effective_policy_snapshot->'lines')
                s("itemType" varchar,"itemId" varchar,"productId" varchar,"discountMinor" bigint)
                ON s."itemType"=a.source_type AND s."itemId"=a.source_id AND s."productId"=fi.product_id
                AND s."discountMinor" BETWEEN 0 AND l.line_subtotal_minor
                AND (NOT v_immediate OR a.applied_amount_minor=s."discountMinor")
              WHERE fi.fulfillment_id=p_order AND fi.line_reference=l.commerce_transaction_line_id
                AND fi.quantity=l.quantity AND a.currency_code=c.currency_code
            ))) THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;

      v_now := clock_timestamp() AT TIME ZONE 'UTC';
      IF NOT (v_authorization.action_details @> '{"origin":"IMMEDIATE"}')
        AND v_authorization.action_at+interval '15 minutes'<=v_now THEN RETURN 'AUTHORIZATION_EXPIRED'; END IF;
      IF counter_order_operator(p_org,p_store,p_staff,
          p_actor) IS DISTINCT FROM v_operator THEN RETURN 'FORBIDDEN'; END IF;
      BEGIN
        -- Revalidate pickup eligibility without counting the order's own hold.
        -- If the rule rejects the pickup, roll back the provisional consumption.
        UPDATE redemption_entitlement_reservations SET consumed_quantity=reserved_quantity,consumed_at=v_now,
          reservation_status_id=(SELECT status_id FROM statuses WHERE status_code='CONSUMED'),
          updated_at=v_now,updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_id=p_order;
        PERFORM assert_fulfillment_pickup_entitlements(p_org,v_subscription,p_store,
          ARRAY(SELECT benefit_id FROM redemption_transaction_item WHERE redemption_transaction_id=t.redemption_transaction_id
              AND item_type='BENEFIT'),
          ARRAY(SELECT offer_id FROM redemption_transaction_item WHERE redemption_transaction_id=t.redemption_transaction_id
              AND item_type='OFFER'),
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
              v_subscription,item.benefit_id,p_store,p_staff,item.quantity,v_success,v_now,v_now,v_now,p_actor,
                  p_actor);
        ELSE
          v_ledger_id := generate_runtime_id('ORD');
          INSERT INTO offer_redemptions(offer_redemption_id,redemption_transaction_id,
              redemption_transaction_item_id,
              organization_id,subscription_id,offer_id,store_id,staff_id,quantity,redeemed_at,created_at,
                  updated_at,created_by,updated_by)
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
        updated_at=v_now,updated_by=p_actor,
            version_no=version_no+1 WHERE redemption_transaction_id=t.redemption_transaction_id;
      UPDATE commerce_transaction_adjustments a SET status='APPLIED',applied_amount_minor=s."discountMinor",
        updated_at=v_now AT TIME ZONE 'UTC',updated_by=v_operator,version_no=a.version_no+1
      FROM fulfillment_items fi JOIN jsonb_to_recordset(f.effective_policy_snapshot->'lines')
        s("itemType" varchar,"itemId" varchar,"productId" varchar,
            "discountMinor" bigint) ON fi.product_id=s."productId"
      WHERE a.commerce_transaction_id=c.commerce_transaction_id AND NOT a.is_deleted AND a.status='REQUESTED'
        AND fi.fulfillment_id=p_order AND fi.line_reference=a.target_line_id AND a.source_type=s."itemType"
            AND a.source_id=s."itemId";
      UPDATE fulfillment_credentials SET used_at=v_now,verified_by=p_actor,updated_at=v_now,
        updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_credential_id=qr.fulfillment_credential_id;
      UPDATE commerce_transactions SET status='COMPLETED',completed_at=v_now AT TIME ZONE 'UTC',
        updated_at=v_now AT TIME ZONE 'UTC',updated_by=v_operator,version_no=version_no+1
        WHERE commerce_transaction_id=c.commerce_transaction_id;
    ELSE
      v_now := clock_timestamp() AT TIME ZONE 'UTC';
    END IF;
    UPDATE fulfillments SET fulfillment_status_id=v_target_id,updated_at=v_now,updated_by=p_actor,
        version_no=version_no+1,
      fulfilled_at=CASE WHEN v_target='FULFILLED' THEN v_now ELSE fulfilled_at END,
      actual_collection_at=CASE WHEN v_target='FULFILLED' THEN v_now ELSE actual_collection_at END
      WHERE fulfillment_id=p_order;
    INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
      prior_fulfillment_status_id,new_fulfillment_status_id,action_details,action_at,created_at,created_by)
    VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code=v_action),p_actor,
      f.fulfillment_status_id,v_target_id,jsonb_strip_nulls(jsonb_build_object('staffId',p_staff,'storeId',
          p_store,
        'collectionAuthorizationId',v_authorization.fulfillment_action_id)),v_now,v_now,p_actor);
    RETURN CASE WHEN v_target='FULFILLED' THEN 'COLLECTION_COMPLETED' ELSE 'ORDER_UPDATED' END;
END;
$body$;

-- Private delivery target for the service that issues the existing Counter OTP.

-- ==========================================================================
-- PICKUP AUTHORIZATION — OTP recipient binding
-- Canonical PostgreSQL function: counter_order_pickup_otp_target
-- ==========================================================================

CREATE FUNCTION "${schemaName}".counter_order_pickup_otp_target(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,p_challenge varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT jsonb_build_object('customerId',f.customer_user_id,'subscriptionId',r.subscription_id)::text
    FROM fulfillments f
    JOIN redemption_transaction r ON r.redemption_transaction_id=f.redemption_transaction_id
      AND r.organization_id=f.organization_id AND r.store_id=f.store_id AND r.status IN ('RESERVED','PENDING')
    JOIN statuses s ON s.status_id=f.fulfillment_status_id AND s.status_code IN ('PLACED','PREPARING','READY')
    JOIN statuses k ON k.status_id=f.fulfillment_type_status_id AND k.status_code='ORDER'
    JOIN statuses t ON t.status_id=f.request_timing_status_id AND t.status_code IN ('ADVANCE','IMMEDIATE')
    WHERE f.fulfillment_id=p_order AND f.organization_id=p_org AND f.store_id=p_store
      AND f.cancellation_requested_at IS NULL AND f.cancelled_at IS NULL AND f.fulfilled_at IS NULL
      AND counter_order_operator(p_org,p_store,p_staff,p_actor) IS NOT NULL
      AND customer_fulfillment_subscription_owned(p_org,r.subscription_id,f.customer_user_id)
      AND (p_challenge IS NULL OR EXISTS (
        SELECT 1 FROM business_otp_context b
        WHERE b.otp_challenge_id=p_challenge AND b.purpose='COUNTER_REDEMPTION_VERIFY'
          AND b.organization_id=p_org AND b.store_id=p_store AND b.staff_id=p_staff
          AND b.user_id=f.customer_user_id AND b.subscription_id=r.subscription_id
          AND b.payload->>'collectionOrderId'=p_order AND b.payload->>'counterActorId'=p_actor
      ));
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".counter_order_pickup_otp_target(varchar,varchar,varchar,varchar,varchar,
    varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_pickup_otp_target(varchar,varchar,varchar,varchar,varchar,
    varchar) TO "${appRole}";


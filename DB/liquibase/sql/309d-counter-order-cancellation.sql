-- 309D: Counter Orders cancellation decisions. Never edit executed 309C migrations.
-- Atomic entitlement release + linked support refund case. Provider refund is NOT automatically executed.

INSERT INTO "${schemaName}".statuses(status_id,status_code,status_name,description,display_order)
VALUES
 ('STATUS_' || md5('CANCELLATION_APPROVED'),'CANCELLATION_APPROVED','Cancellation Approved','Staff approved order cancellation',15),
 ('STATUS_' || md5('CANCELLATION_REJECTED'),'CANCELLATION_REJECTED','Cancellation Rejected','Staff rejected order cancellation',16),
 ('STATUS_' || md5('STAFF_ORDER_CANCELLED'),'STAFF_ORDER_CANCELLED','Staff Cancelled Order','Staff directly cancelled an eligible order',17)
ON CONFLICT (status_code) DO NOTHING;

INSERT INTO "${schemaName}".entity_status(entity_status_id,entity_type_id,status_id,display_order,system_managed)
SELECT 'ENTITY_STATUS_' || md5('FULFILLMENT_ACTION_TYPE:' || s.status_code),et.entity_type_id,s.status_id,
       CASE s.status_code WHEN 'CANCELLATION_APPROVED' THEN 15 WHEN 'CANCELLATION_REJECTED' THEN 16 ELSE 17 END,true
FROM "${schemaName}".entity_type et JOIN "${schemaName}".statuses s
  ON s.status_code IN ('CANCELLATION_APPROVED','CANCELLATION_REJECTED','STAFF_ORDER_CANCELLED')
WHERE et.entity_type_code='FULFILLMENT_ACTION_TYPE'
ON CONFLICT (entity_status_id) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_decide_cancellation(
    p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,
    p_version integer,p_decision varchar,p_reason varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
 f fulfillments%ROWTYPE;
 c commerce_transactions%ROWTYPE;
 t redemption_transaction%ROWTYPE;
 v_state varchar;
 v_prior_status varchar;
 v_payment varchar;
 v_now timestamp;
 v_target_id varchar;
 v_action_status varchar;
 v_support_id varchar;
 v_ticket varchar;
 v_category varchar;
 v_issue varchar;
 v_refund_needed boolean;
 v_decision varchar := upper(btrim(coalesce(p_decision,'')));
 v_reason varchar := btrim(coalesce(p_reason,''));
 v_total bigint;
 v_currency varchar;
 v_org_actor varchar(64);
 v_item_actor varchar(64);
 v_redemption_actor varchar(64);
BEGIN
 IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN RETURN 'FORBIDDEN'; END IF;
 IF v_decision NOT IN ('APPROVE','REJECT','CANCEL') OR length(v_reason) NOT BETWEEN 5 AND 500
    THEN RETURN 'INVALID_REASON'; END IF;
 -- Both collection and customer requests lock fulfillment first.
 SELECT f0.* INTO f FROM fulfillments f0
 JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id AND kind.status_code='ORDER'
 WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store
 FOR UPDATE OF f0;
 IF NOT FOUND THEN RETURN 'ORDER_NOT_FOUND'; END IF;
 SELECT s.status_code INTO STRICT v_state FROM statuses s WHERE s.status_id=f.fulfillment_status_id;
 IF f.cancelled_at IS NOT NULL OR v_state='CANCELLED' THEN RETURN 'ALREADY_CANCELLED'; END IF;
 IF f.fulfilled_at IS NOT NULL OR v_state='FULFILLED' THEN RETURN 'ALREADY_FULFILLED'; END IF;
 IF f.version_no IS DISTINCT FROM p_version THEN RETURN 'STALE_ORDER'; END IF;
 IF (v_decision IN ('APPROVE','REJECT') AND (v_state<>'CANCEL_REQUESTED' OR f.cancellation_requested_at IS NULL))
    OR (v_decision='CANCEL' AND (v_state NOT IN ('PLACED','PREPARING','READY') OR f.cancellation_requested_at IS NOT NULL))
    THEN RETURN 'INVALID_TRANSITION'; END IF;
 v_now := clock_timestamp() AT TIME ZONE 'UTC';
 IF v_decision='REJECT' THEN
   SELECT a.prior_fulfillment_status_id INTO v_prior_status
   FROM fulfillment_actions a JOIN statuses s ON s.status_id=a.action_type_status_id
   WHERE a.fulfillment_id=p_order AND s.status_code='CANCELLATION_REQUESTED'
   ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1;
   IF v_prior_status IS NULL OR NOT EXISTS (
        SELECT 1 FROM statuses s WHERE s.status_id=v_prior_status AND s.status_code IN ('PLACED','PREPARING','READY'))
     THEN RETURN 'INVALID_TRANSITION'; END IF;
   v_target_id := v_prior_status;
   v_action_status := 'CANCELLATION_REJECTED';
   UPDATE fulfillments SET fulfillment_status_id=v_target_id,cancellation_requested_at=NULL,
       updated_at=v_now,updated_by=p_actor,version_no=version_no+1 WHERE fulfillment_id=p_order;
 ELSE
   -- A concurrent payment or late capture cannot be treated as an unpaid cancellation.
   -- Lock subscription before payment intent/Commerce, matching collection's lock ordering.
   PERFORM 1 FROM subscriptions s WHERE s.subscription_id=(
       SELECT subscription_id FROM commerce_transactions WHERE commerce_transaction_id=f.commerce_transaction_id)
       AND NOT s.is_deleted FOR UPDATE;
   PERFORM i.payment_intent_id FROM payment_intents i
     WHERE i.commerce_transaction_id=f.commerce_transaction_id ORDER BY i.payment_intent_id FOR UPDATE;
   SELECT * INTO c FROM commerce_transactions
     WHERE commerce_transaction_id=f.commerce_transaction_id AND organization_id=p_org
       AND store_id=p_store AND customer_user_id=f.customer_user_id AND NOT is_deleted FOR UPDATE;
   IF NOT FOUND THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
   v_payment := counter_order_collection_payment(p_org,p_store,f.customer_user_id,
       c.commerce_transaction_id,(SELECT status_code FROM statuses WHERE status_id=f.payment_timing_status_id));
   IF v_payment NOT IN ('NO_PAYMENT_REQUIRED','PAYMENT_REQUIRED','VERIFIED_ONLINE','VERIFIED_AT_COUNTER')
      THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
   IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
       WHERE a.commerce_transaction_id=c.commerce_transaction_id
         AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED'))
      OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e
       WHERE e.commerce_transaction_id=c.commerce_transaction_id
         AND e.provider_outcome='CAPTURED')
      OR EXISTS (SELECT 1 FROM payment_refunds pr
       WHERE pr.commerce_transaction_id=c.commerce_transaction_id
         AND pr.approval_status<>'REJECTED')
      OR EXISTS (SELECT 1 FROM payment_refunds pr
       WHERE pr.payment_intent_id IN (SELECT payment_intent_id FROM payment_intents
             WHERE commerce_transaction_id=c.commerce_transaction_id)
         AND pr.approval_status<>'REJECTED')
     THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
   IF EXISTS (SELECT 1 FROM redemption_entitlement_reservations h
       WHERE h.fulfillment_id=p_order AND h.consumed_quantity>0)
     THEN RETURN 'ALREADY_FULFILLED'; END IF;
   PERFORM h.redemption_entitlement_reservation_id
       FROM redemption_entitlement_reservations h WHERE h.fulfillment_id=p_order
       ORDER BY h.redemption_entitlement_reservation_id FOR UPDATE;
   IF NOT EXISTS(SELECT 1 FROM redemption_entitlement_reservations h
       WHERE h.fulfillment_id=p_order) THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;
   SELECT * INTO t FROM redemption_transaction
       WHERE redemption_transaction_id=f.redemption_transaction_id AND organization_id=p_org
       AND store_id=p_store FOR UPDATE;
   IF NOT FOUND OR t.status NOT IN ('RESERVED','PENDING') THEN RETURN 'ENTITLEMENT_CONFLICT'; END IF;
   SELECT organization_user_id INTO v_org_actor FROM organization_user
      WHERE organization_id=p_org AND user_id=p_actor AND NOT is_deleted
      ORDER BY organization_user_id LIMIT 1;
   IF v_org_actor IS NULL THEN RETURN 'FORBIDDEN'; END IF;
   v_item_actor := commerce_counter_recovery_fk_actor('redemption_transaction_item'::regclass,
       p_actor,v_org_actor);
   v_redemption_actor := commerce_counter_recovery_fk_actor('redemption_transaction'::regclass,
       p_actor,v_org_actor);
   v_refund_needed := v_payment IN ('VERIFIED_ONLINE','VERIFIED_AT_COUNTER') AND c.total_minor>0;
   -- The Support case is created in the SAME transaction, so cancellation cannot be
   -- committed without its financial follow-up obligation.
   IF v_refund_needed THEN
     SELECT cat.support_category_id,it.support_issue_type_id INTO v_category,v_issue
       FROM support_categories cat JOIN support_issue_types it ON it.support_category_id=cat.support_category_id
       WHERE cat.support_category_code='PAYMENT' AND it.support_issue_type_code='REFUND_REQUEST';
     IF v_category IS NULL THEN RAISE EXCEPTION 'Refund Support issue type is missing' USING ERRCODE='23505'; END IF;
     v_support_id := generate_runtime_id('SUP');
     v_ticket := 'SUP-' || lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
     INSERT INTO customer_support_requests(support_request_id,organization_id,customer_user_id,ticket_number,
       category,issue_type,support_category_id,support_issue_type_id,subject,description,source,status,
       priority,created_by,updated_by)
     VALUES(v_support_id,p_org,f.customer_user_id,v_ticket,'PAYMENT','REFUND_REQUEST',v_category,v_issue,
       left('Order cancellation refund review: ' || f.fulfillment_number,200),
       left('Order ' || f.fulfillment_number || ' cancelled by authorized staff. Review verified paid amount '
            || (c.total_minor::text) || ' minor units ' || c.currency_code || '. Reason: ' || v_reason
            || '. Commerce transaction: ' || c.commerce_transaction_id || '. Provider refund NOT executed.',8000),
       'SYSTEM','OPEN','HIGH',p_actor,p_actor);
     INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,new_status,
       actor_user_id,actor_role,description)
     VALUES('EVT-SUP-'||md5(v_support_id||':OPENED'),v_support_id,p_org,'CREATED','OPEN',p_actor,
       'SYSTEM','Order cancellation refund review created automatically.');
   END IF;
   UPDATE redemption_entitlement_reservations SET released_quantity=reserved_quantity,
     reservation_status_id=(SELECT status_id FROM statuses WHERE status_code='RELEASED'),
     released_at=v_now,updated_at=v_now,updated_by=p_actor,version_no=version_no+1
    WHERE fulfillment_id=p_order AND consumed_quantity=0 AND released_quantity<>reserved_quantity;
   UPDATE redemption_transaction_item SET status='FAILED',failure_reason='Order cancelled before collection',
        updated_at=v_now,updated_by=v_item_actor,version_no=version_no+1
      WHERE redemption_transaction_id=t.redemption_transaction_id AND status IN ('PENDING','RESERVED');
   UPDATE redemption_transaction SET status='CANCELLED',updated_at=v_now,
       updated_by=v_redemption_actor,version_no=version_no+1
     WHERE redemption_transaction_id=t.redemption_transaction_id;
   -- Preserve successfully captured financial history. Only unpaid Commerce may become cancelled.
   IF NOT v_refund_needed THEN
      UPDATE commerce_transactions SET status='CANCELLED',updated_at=v_now,
          updated_by=v_org_actor,version_no=version_no+1
        WHERE commerce_transaction_id=c.commerce_transaction_id AND status<>'COMPLETED';
   END IF;
   SELECT status_id INTO STRICT v_target_id FROM statuses WHERE status_code='CANCELLED';
   v_action_status := CASE WHEN v_decision='APPROVE' THEN 'CANCELLATION_APPROVED'
       ELSE 'STAFF_ORDER_CANCELLED' END;
   UPDATE fulfillments SET fulfillment_status_id=v_target_id,cancelled_at=v_now,
       cancellation_requested_at=NULL,updated_at=v_now,updated_by=p_actor,version_no=version_no+1
     WHERE fulfillment_id=p_order;
 END IF;
 INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,
    actor_user_id,prior_fulfillment_status_id,new_fulfillment_status_id,support_reference_id,
    reason,action_details,action_at,created_by)
 VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code=v_action_status),
    p_actor,f.fulfillment_status_id,v_target_id,v_support_id,v_reason,
    jsonb_build_object('staffId',p_staff,'storeId',p_store,'decision',v_decision,
       'refundSupportTicket',v_ticket),v_now,p_actor);
 IF v_refund_needed THEN
     PERFORM support_notify_org_admins(p_org,'SUPPORT_REQUEST_CREATED','Refund review required',
         'Order cancellation created a refund review in Support.',v_support_id);
 END IF;
 RETURN CASE WHEN v_decision='REJECT' THEN 'CANCELLATION_REJECTED'
       WHEN v_refund_needed THEN 'ORDER_CANCELLED_REFUND_REVIEW'
       ELSE 'ORDER_CANCELLED' END;
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_order_decide_cancellation(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_decide_cancellation(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar) TO "${appRole}";

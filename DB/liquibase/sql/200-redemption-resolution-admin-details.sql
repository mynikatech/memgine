-- R5: richer unified redemption read model and support-customer enforcement.
-- The existing read function changes its return shape; drop before recreating.
DROP FUNCTION "${schemaName}".redemption_resolution_candidates(varchar,varchar);
CREATE FUNCTION "${schemaName}".redemption_resolution_candidates(
 p_org_id varchar,p_actor varchar
) RETURNS TABLE("itemId" varchar,"transactionId" varchar,"itemType" varchar,
 "itemName" varchar,"subscriptionId" varchar,"redemptionNumber" varchar,
 "itemStatus" varchar,"resolutionId" varchar,"actionStatus" varchar,
 "commerceTransactionId" varchar,"paymentAmountMinor" bigint,"currencyCode" varchar,
 "customerUserId" varchar,"customerName" varchar,"customerEmail" varchar,
 "customerPhone" varchar,"subscriptionNumber" varchar,"redeemedAt" text,
 "storeName" varchar,"staffName" varchar,"paymentStatus" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $fn$
 SELECT i.redemption_transaction_item_id, t.redemption_transaction_id, i.item_type,
  CASE WHEN i.item_type='BENEFIT' THEN coalesce(nullif(b.display_name,''),b.benefit_name)
       ELSE o.offer_name END::varchar,
  t.subscription_id,t.redemption_transaction_number,
  CASE WHEN i.item_type='BENEFIT' THEN coalesce(st.status_code,i.status)
       WHEN i.item_type='OFFER' THEN coalesce(ored.status,i.status)
       ELSE i.status END::varchar,
  rr.redemption_resolution_id,rr.action_status,
  c.commerce_transaction_id,c.total_minor,c.currency_code,
  u.user_id,
  coalesce(nullif(trim(u.display_name),''),nullif(trim(concat_ws(' ',u.first_name,u.middle_name,u.last_name)),''),u.user_code)::varchar,
  u.primary_email,u.primary_phone,s.subscription_number,
  coalesce(t.completed_at,t.created_at)::text,store.store_name::varchar,
  coalesce(nullif(trim(su.display_name),''),nullif(trim(concat_ws(' ',su.first_name,su.middle_name,su.last_name)),''),su.user_code)::varchar,
  CASE WHEN c.commerce_transaction_id IS NULL THEN 'NO_LINKED_PAYMENT'
       WHEN c.total_minor <= 0 THEN 'NO_CHARGE'
       ELSE c.status END::varchar
 FROM redemption_transaction_item i
 JOIN redemption_transaction t ON t.redemption_transaction_id=i.redemption_transaction_id
 JOIN subscriptions s ON s.subscription_id=t.subscription_id
 JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
 JOIN "user" u ON u.user_id=ou.user_id
 LEFT JOIN stores store ON store.store_id=t.store_id
 LEFT JOIN staff sf ON sf.staff_id=t.staff_id
 LEFT JOIN organization_user sou ON sou.organization_user_id=sf.organization_user_id
 LEFT JOIN "user" su ON su.user_id=sou.user_id
 LEFT JOIN benefits b ON b.benefit_id=i.benefit_id
 LEFT JOIN offer o ON o.offer_id=i.offer_id
 LEFT JOIN redemptions r ON r.redemption_id=i.redemption_id
 LEFT JOIN entity_status es ON es.entity_status_id=r.redemption_status_id
 LEFT JOIN statuses st ON st.status_id=es.status_id
 LEFT JOIN offer_redemptions ored ON ored.offer_redemption_id=i.offer_redemption_id
 LEFT JOIN redemption_resolutions rr ON rr.redemption_transaction_item_id=i.redemption_transaction_item_id
 LEFT JOIN commerce_transaction_redemptions cr ON cr.redemption_transaction_id=t.redemption_transaction_id AND NOT cr.is_deleted
 LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=cr.commerce_transaction_id
 WHERE t.organization_id=p_org_id AND t.status='SUCCESS'
 AND (rbac_has_capability(p_actor,p_org_id,'ORG_ADMIN_ACCESS') OR rbac_has_capability(p_actor,p_org_id,'BUSINESS_OWNER_ACCESS'))
 ORDER BY t.completed_at DESC,i.redemption_transaction_item_id DESC LIMIT 500;
$fn$;
REVOKE ALL ON FUNCTION "${schemaName}".redemption_resolution_candidates(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".redemption_resolution_candidates(varchar,varchar) TO "${appRole}";

-- Retain the support linkage for both paid and unpaid corrections.
ALTER TABLE "${schemaName}".redemption_resolutions
  ADD COLUMN support_request_id varchar(64)
  REFERENCES "${schemaName}".customer_support_requests(support_request_id);
CREATE INDEX ix_redemption_resolution_support
  ON "${schemaName}".redemption_resolutions(support_request_id)
  WHERE support_request_id IS NOT NULL;

-- Tighten support linkage for new requests, preserving the current refund code path.
CREATE OR REPLACE FUNCTION "${schemaName}".redemption_resolution_request(
  p_resolution_id varchar, p_org_id varchar, p_item_id varchar,
  p_action varchar, p_reason varchar, p_explanation varchar,
  p_idempotency varchar, p_actor varchar,
  p_refund_id varchar DEFAULT NULL, p_support_request_id varchar DEFAULT NULL
) RETURNS TABLE("resolutionId" varchar,"actionStatus" varchar,"paymentRefundId" varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $fn$
DECLARE v_item redemption_transaction_item%ROWTYPE;
  v_transaction redemption_transaction%ROWTYPE;
  v_commerce commerce_transactions%ROWTYPE;
  v_link record; v_existing redemption_resolutions%ROWTYPE;
  v_payment record; v_refund record; v_status varchar; v_res_status varchar;
BEGIN
  IF NOT (rbac_has_capability(p_actor,p_org_id,'ORG_ADMIN_ACCESS') OR rbac_has_capability(p_actor,p_org_id,'BUSINESS_OWNER_ACCESS')) THEN
    RAISE EXCEPTION 'Redemption correction not permitted' USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN ('RESTORE_ONLY','REFUND_ONLY','REFUND_AND_RESTORE') OR
     nullif(btrim(p_idempotency),'') IS NULL OR length(p_idempotency)>160 OR
     nullif(btrim(p_reason),'') IS NULL OR length(btrim(p_explanation))<10 THEN
    RAISE EXCEPTION 'Invalid resolution action, idempotency key or reason' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_existing FROM redemption_resolutions
    WHERE organization_id=p_org_id AND idempotency_key=p_idempotency FOR UPDATE;
  IF FOUND THEN
    IF v_existing.redemption_transaction_item_id<>p_item_id OR v_existing.action_code<>p_action OR
      v_existing.reason_code<>p_reason OR v_existing.explanation<>p_explanation OR
      v_existing.support_request_id IS DISTINCT FROM p_support_request_id THEN
       RAISE EXCEPTION 'Idempotency key conflicts with existing resolution' USING ERRCODE='23505';
    END IF;
    RETURN QUERY SELECT v_existing.redemption_resolution_id,v_existing.action_status,v_existing.payment_refund_id; RETURN;
  END IF;
  -- Lock parent before item, matching the normal redemption-finalization order.
  SELECT * INTO v_item FROM redemption_transaction_item WHERE redemption_transaction_item_id=p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Successful redemption item unavailable' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_transaction FROM redemption_transaction
    WHERE redemption_transaction_id=v_item.redemption_transaction_id AND organization_id=p_org_id AND status='SUCCESS' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Redemption organization or state mismatch' USING ERRCODE='22023'; END IF;
  -- A support-linked resolution must belong to the customer who raised that case.
  IF p_support_request_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM customer_support_requests csr
    JOIN subscriptions s ON s.subscription_id=v_transaction.subscription_id
    JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id
    WHERE csr.support_request_id=p_support_request_id
      AND csr.organization_id=p_org_id AND csr.customer_user_id=ou.user_id
  ) THEN
    RAISE EXCEPTION 'Support request customer does not own redemption' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_item FROM redemption_transaction_item WHERE redemption_transaction_item_id=p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.status<>'SUCCESS' OR v_item.redemption_transaction_id<>v_transaction.redemption_transaction_id THEN
    RAISE EXCEPTION 'Successful redemption item unavailable' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM redemption_resolutions r WHERE r.redemption_transaction_item_id=p_item_id) THEN
    RAISE EXCEPTION 'Redemption item already has a resolution' USING ERRCODE='23505';
  END IF;
  IF v_item.item_type='BENEFIT' THEN
    SELECT st.status_code INTO v_status FROM redemptions r JOIN entity_status es ON es.entity_status_id=r.redemption_status_id
      JOIN statuses st ON st.status_id=es.status_id WHERE r.redemption_id=v_item.redemption_id AND r.subscription_id=v_transaction.subscription_id FOR UPDATE OF r;
    IF v_status IS DISTINCT FROM 'SUCCESS' THEN RAISE EXCEPTION 'Benefit is not successfully consumed' USING ERRCODE='22023'; END IF;
  ELSIF v_item.item_type='OFFER' THEN
    IF NOT EXISTS(SELECT 1 FROM offer_redemptions o WHERE o.offer_redemption_id=v_item.offer_redemption_id
        AND o.redemption_transaction_item_id=p_item_id AND o.subscription_id=v_transaction.subscription_id AND o.status='SUCCESS' FOR UPDATE) THEN
      RAISE EXCEPTION 'Offer is not successfully consumed' USING ERRCODE='22023';
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported redemption item type' USING ERRCODE='22023'; END IF;
  -- Fail before taking money-related action if restoration cannot be represented
  -- with the canonical REDEMPTION reference-data status.
  IF p_action <> 'REFUND_ONLY' AND v_item.item_type='BENEFIT' AND NOT EXISTS (
    SELECT 1 FROM entity_status es JOIN entity_type et ON et.entity_type_id=es.entity_type_id
      JOIN statuses st ON st.status_id=es.status_id
    WHERE et.entity_type_code='REDEMPTION' AND st.status_code='REVERSED'
      AND es.is_active AND st.is_active
  ) THEN
    RAISE EXCEPTION 'REDEMPTION REVERSED reference status must be configured' USING ERRCODE='22023';
  END IF;
  IF p_action <> 'RESTORE_ONLY' THEN
    IF p_refund_id IS NULL THEN RAISE EXCEPTION 'Refund identifier is required' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_commerce FROM commerce_transaction_redemptions l
      JOIN commerce_transactions c ON c.commerce_transaction_id=l.commerce_transaction_id
      WHERE l.redemption_transaction_id=v_transaction.redemption_transaction_id
        AND NOT l.is_deleted AND c.organization_id=p_org_id FOR UPDATE OF c;
    IF NOT FOUND OR v_commerce.source_channel<>'COUNTER_REDEMPTION' THEN
      RAISE EXCEPTION 'This redemption has no counter commerce payment' USING ERRCODE='22023';
    END IF;
    IF v_commerce.total_minor<=0 THEN RAISE EXCEPTION 'No refundable payment is available' USING ERRCODE='22023'; END IF;
    -- Fail closed for multi-item payments: item-level financial attribution is not established.
    IF (SELECT count(*) FROM redemption_transaction_item WHERE redemption_transaction_id=v_transaction.redemption_transaction_id AND status='SUCCESS')<>1 THEN
      RAISE EXCEPTION 'Multi-item payment requires financial allocation review' USING ERRCODE='22023';
    END IF;
    -- Keep existing refund ledger validation/provider evidence and refund balance checks.
    SELECT * INTO v_refund FROM payment_refund_request_commerce(
      p_refund_id,p_org_id,v_commerce.commerce_transaction_id,v_commerce.total_minor,
      p_reason,p_explanation,p_support_request_id,p_idempotency,p_actor);
    IF v_refund."paymentRefundId" IS DISTINCT FROM p_refund_id THEN
      RAISE EXCEPTION 'Refund idempotency already belongs to another request' USING ERRCODE='23505';
    END IF;
  END IF;
  v_res_status:=CASE WHEN p_action='RESTORE_ONLY' THEN 'READY_TO_RESTORE' ELSE 'WAITING_FOR_REFUND' END;
  INSERT INTO redemption_resolutions(redemption_resolution_id,organization_id,redemption_transaction_item_id,
    redemption_transaction_id,subscription_id,action_code,action_status,payment_refund_id,commerce_transaction_id,
    reason_code,explanation,idempotency_key,requested_by,support_request_id)
  VALUES(p_resolution_id,p_org_id,p_item_id,v_transaction.redemption_transaction_id,v_transaction.subscription_id,
    p_action,v_res_status,CASE WHEN p_action='RESTORE_ONLY' THEN NULL ELSE p_refund_id END,
    CASE WHEN p_action='RESTORE_ONLY' THEN NULL ELSE v_commerce.commerce_transaction_id END,
    p_reason,p_explanation,p_idempotency,p_actor,p_support_request_id);
  RETURN QUERY SELECT p_resolution_id,v_res_status,CASE WHEN p_action='RESTORE_ONLY' THEN NULL::varchar ELSE p_refund_id END;
END $fn$;


-- Extend existing Poynt Payment Bridge refund preflight to correctly handle
-- completed counter redemption checkout, without weakening provider evidence.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_request_commerce(
 p_refund_id varchar,p_organization_id varchar,p_commerce_transaction_id varchar,
 p_amount_minor bigint,p_reason_code varchar,p_explanation varchar,
 p_support_request_id varchar,p_idempotency_key varchar,p_actor_user_id varchar
) RETURNS TABLE("paymentRefundId" varchar,"approvalStatus" varchar,"executionStatus" varchar,
 "refundAmountMinor" bigint,"currencyCode" varchar,"versionNo" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $fn$
DECLARE v_transaction commerce_transactions%ROWTYPE;
 v_payment commerce_provider_payment_attempts%ROWTYPE;
 v_existing payment_refunds%ROWTYPE;
 v_reserved bigint;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
    rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
   RAISE EXCEPTION 'Commerce refund request is not permitted' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>160 OR
    p_amount_minor IS NULL OR p_amount_minor<=0 THEN
   RAISE EXCEPTION 'Refund idempotency key and amount are required' USING ERRCODE='22023'; END IF;
 IF p_reason_code NOT IN ('DUPLICATE_PAYMENT','CAPTURED_NOT_FULFILLED','GOODWILL','INCORRECT_AMOUNT','MEMBERSHIP_CANCELLATION','OTHER_APPROVED') OR
   (p_reason_code IN ('GOODWILL','OTHER_APPROVED') AND length(btrim(coalesce(p_explanation,'')))<10) THEN
    RAISE EXCEPTION 'Refund reason or explanation is invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_existing FROM payment_refunds
   WHERE organization_id=p_organization_id AND idempotency_key=p_idempotency_key FOR UPDATE;
 IF FOUND THEN
   IF v_existing.commerce_transaction_id IS DISTINCT FROM p_commerce_transaction_id OR
      v_existing.refund_amount_minor IS DISTINCT FROM p_amount_minor OR
      v_existing.reason_code IS DISTINCT FROM p_reason_code OR
      coalesce(v_existing.explanation,'') IS DISTINCT FROM coalesce(nullif(btrim(p_explanation),''),'') OR
      v_existing.support_request_id IS DISTINCT FROM p_support_request_id THEN
     RAISE EXCEPTION 'Refund idempotency key conflicts with existing request' USING ERRCODE='23505'; END IF;
   RETURN QUERY SELECT v_existing.payment_refund_id,v_existing.approval_status,v_existing.execution_status,
     v_existing.refund_amount_minor,v_existing.currency_code,v_existing.version_no; RETURN;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('commerce-refund:'||p_commerce_transaction_id,0));
 SELECT * INTO v_transaction FROM commerce_transactions WHERE commerce_transaction_id=p_commerce_transaction_id
   AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND OR v_transaction.status NOT IN ('PROVIDER_SUCCEEDED','COMPLETED') OR
    v_transaction.total_minor<=0 OR nullif(btrim(v_transaction.currency_code),'') IS NULL OR
    v_transaction.integration_configuration_id IS NULL THEN
   RAISE EXCEPTION 'Original successful commerce payment is unavailable' USING ERRCODE='22023'; END IF;
 -- A completed non-counter Commerce transaction remains covered by existing policy.
 -- The provider verification below still must match a successful REMOTE_TERMINAL attempt.
 IF NOT EXISTS(SELECT 1 FROM integration_configurations i WHERE
    i.integration_configuration_id=v_transaction.integration_configuration_id AND
    i.organization_id=p_organization_id AND upper(i.provider)='POYNT' AND NOT i.is_deleted) THEN
   RAISE EXCEPTION 'Original Poynt integration is unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_payment FROM commerce_provider_payment_attempts WHERE
    commerce_transaction_id=p_commerce_transaction_id AND payment_channel='REMOTE_TERMINAL' AND
    provider_status='SUCCEEDED' AND provider_transaction_id=v_transaction.provider_transaction_id AND
    amount_minor=v_transaction.total_minor AND upper(currency_code)=upper(v_transaction.currency_code) AND
    nullif(btrim(provider_transaction_id),'') IS NOT NULL AND
    nullif(btrim(provider_business_id),'') IS NOT NULL AND
    nullif(btrim(provider_device_id),'') IS NOT NULL
    ORDER BY created_at DESC,commerce_provider_payment_attempt_id DESC LIMIT 1;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM commerce_provider_payment_attempts a WHERE
    a.commerce_transaction_id=p_commerce_transaction_id AND a.payment_channel='REMOTE_TERMINAL' AND
    a.provider_status='SUCCEEDED' AND a.provider_transaction_id=v_transaction.provider_transaction_id AND
    a.amount_minor=v_transaction.total_minor AND upper(a.currency_code)=upper(v_transaction.currency_code) AND
    a.commerce_provider_payment_attempt_id<>v_payment.commerce_provider_payment_attempt_id) THEN
   RAISE EXCEPTION 'Original Poynt terminal payment evidence is missing or ambiguous' USING ERRCODE='22023'; END IF;
 IF p_support_request_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_support_requests s WHERE
    s.support_request_id=p_support_request_id AND s.organization_id=p_organization_id AND
    s.customer_user_id IS NOT DISTINCT FROM v_transaction.customer_user_id) THEN
   RAISE EXCEPTION 'Support request is unavailable for this commerce payment' USING ERRCODE='22023'; END IF;
 SELECT coalesce(sum(refund_amount_minor),0) INTO v_reserved FROM payment_refunds WHERE
    commerce_transaction_id=p_commerce_transaction_id AND NOT(execution_status='FAILED' OR approval_status='REJECTED');
 IF v_reserved+p_amount_minor>v_transaction.total_minor THEN
   RAISE EXCEPTION 'Refund amount exceeds remaining refundable amount' USING ERRCODE='22023'; END IF;
 INSERT INTO payment_refunds(payment_refund_id,organization_id,commerce_transaction_id,original_provider_code,
   original_provider_transaction_reference,original_integration_configuration_id,original_store_id,original_channel,
   captured_amount_minor,currency_code,refund_amount_minor,reason_code,explanation,support_request_id,idempotency_key,
   requested_by,approval_status,execution_status,approved_at)
 VALUES(p_refund_id,p_organization_id,p_commerce_transaction_id,'POYNT_PAYMENT_BRIDGE',v_payment.provider_transaction_id,
   v_transaction.integration_configuration_id,v_transaction.store_id,'COUNTER',v_transaction.total_minor,v_transaction.currency_code,
   p_amount_minor,p_reason_code,nullif(btrim(p_explanation),''),p_support_request_id,p_idempotency_key,p_actor_user_id,
   'APPROVED','READY',current_timestamp);
 INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,
   previous_approval_status,new_approval_status,previous_execution_status,new_execution_status,
   actor_origin,description,event_identity)
 VALUES('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'AUTO_APPROVED',NULL,'APPROVED',NULL,'READY',
   'SYSTEM_POLICY','MVP refund policy automatically approved the eligible commerce refund request.',
   'AUTO_APPROVED:'||p_refund_id);
 RETURN QUERY SELECT p_refund_id,'APPROVED'::varchar,'READY'::varchar,p_amount_minor,v_transaction.currency_code,1;
END $fn$;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_request_commerce(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_request_commerce(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

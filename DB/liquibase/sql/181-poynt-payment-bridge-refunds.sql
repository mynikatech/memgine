-- Centralized ledger request path for successful Poynt Payment Bridge commerce payments.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_request_commerce(
    p_refund_id varchar, p_organization_id varchar, p_commerce_transaction_id varchar,
    p_amount_minor bigint, p_reason_code varchar, p_explanation varchar,
    p_support_request_id varchar, p_idempotency_key varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar, "approvalStatus" varchar, "executionStatus" varchar,
    "refundAmountMinor" bigint, "currencyCode" varchar, "versionNo" integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
    v_payment commerce_provider_payment_attempts%ROWTYPE;
    v_existing payment_refunds%ROWTYPE;
    v_reserved bigint;
BEGIN
    IF NOT (rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
            OR rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS')) THEN
        RAISE EXCEPTION 'Commerce refund request is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_idempotency_key), '') IS NULL OR length(p_idempotency_key) > 160
       OR p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RAISE EXCEPTION 'Refund idempotency key and amount are required' USING ERRCODE = '22023';
    END IF;
    IF p_reason_code NOT IN ('DUPLICATE_PAYMENT','CAPTURED_NOT_FULFILLED','GOODWILL','INCORRECT_AMOUNT','MEMBERSHIP_CANCELLATION','OTHER_APPROVED')
       OR (p_reason_code IN ('GOODWILL','OTHER_APPROVED') AND length(btrim(COALESCE(p_explanation,''))) < 10) THEN
        RAISE EXCEPTION 'Refund reason or explanation is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_existing FROM payment_refunds
     WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
        IF v_existing.commerce_transaction_id IS DISTINCT FROM p_commerce_transaction_id
           OR v_existing.refund_amount_minor IS DISTINCT FROM p_amount_minor
           OR v_existing.reason_code IS DISTINCT FROM p_reason_code
           OR COALESCE(v_existing.explanation,'') IS DISTINCT FROM COALESCE(NULLIF(btrim(p_explanation),''),'')
           OR v_existing.support_request_id IS DISTINCT FROM p_support_request_id THEN
            RAISE EXCEPTION 'Refund idempotency key conflicts with existing request' USING ERRCODE = '23505';
        END IF;
        RETURN QUERY SELECT v_existing.payment_refund_id, v_existing.approval_status, v_existing.execution_status,
                            v_existing.refund_amount_minor, v_existing.currency_code, v_existing.version_no;
        RETURN;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('commerce-refund:' || p_commerce_transaction_id, 0));
    SELECT * INTO v_transaction FROM commerce_transactions
     WHERE commerce_transaction_id = p_commerce_transaction_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND OR v_transaction.status <> 'PROVIDER_SUCCEEDED' OR v_transaction.total_minor <= 0
       OR NULLIF(btrim(v_transaction.currency_code),'') IS NULL OR v_transaction.integration_configuration_id IS NULL THEN
        RAISE EXCEPTION 'Original successful commerce payment is unavailable' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM integration_configurations i
         WHERE i.integration_configuration_id = v_transaction.integration_configuration_id
           AND i.organization_id = p_organization_id AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted
    ) THEN RAISE EXCEPTION 'Original Poynt integration is unavailable' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_payment FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = p_commerce_transaction_id AND payment_channel = 'REMOTE_TERMINAL'
       AND provider_status = 'SUCCEEDED'
       AND provider_transaction_id = v_transaction.provider_transaction_id
       AND amount_minor = v_transaction.total_minor
       AND upper(currency_code) = upper(v_transaction.currency_code)
       AND NULLIF(btrim(provider_transaction_id),'') IS NOT NULL
       AND NULLIF(btrim(provider_business_id),'') IS NOT NULL
       AND NULLIF(btrim(provider_device_id),'') IS NOT NULL
     ORDER BY created_at DESC, commerce_provider_payment_attempt_id DESC LIMIT 1;
    IF NOT FOUND OR EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id = p_commerce_transaction_id AND a.payment_channel = 'REMOTE_TERMINAL'
           AND a.provider_status = 'SUCCEEDED' AND a.provider_transaction_id = v_transaction.provider_transaction_id
           AND a.amount_minor = v_transaction.total_minor AND upper(a.currency_code) = upper(v_transaction.currency_code)
           AND a.commerce_provider_payment_attempt_id <> v_payment.commerce_provider_payment_attempt_id
    ) THEN RAISE EXCEPTION 'Original Poynt terminal payment evidence is missing or ambiguous' USING ERRCODE = '22023'; END IF;
    IF p_support_request_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM customer_support_requests s WHERE s.support_request_id = p_support_request_id
          AND s.organization_id = p_organization_id AND s.customer_user_id IS NOT DISTINCT FROM v_transaction.customer_user_id
    ) THEN RAISE EXCEPTION 'Support request is unavailable for this commerce payment' USING ERRCODE = '22023'; END IF;
    SELECT COALESCE(sum(refund_amount_minor),0) INTO v_reserved FROM payment_refunds
     WHERE commerce_transaction_id = p_commerce_transaction_id
       AND NOT (execution_status = 'FAILED' OR approval_status = 'REJECTED');
    IF v_reserved + p_amount_minor > v_transaction.total_minor THEN
        RAISE EXCEPTION 'Refund amount exceeds remaining refundable amount' USING ERRCODE = '22023';
    END IF;
    INSERT INTO payment_refunds(payment_refund_id,organization_id,commerce_transaction_id,original_provider_code,
      original_provider_transaction_reference,original_integration_configuration_id,original_store_id,original_channel,
      captured_amount_minor,currency_code,refund_amount_minor,reason_code,explanation,support_request_id,idempotency_key,
      requested_by,approval_status,execution_status,approved_at)
    VALUES(p_refund_id,p_organization_id,p_commerce_transaction_id,'POYNT_PAYMENT_BRIDGE',v_payment.provider_transaction_id,
      v_transaction.integration_configuration_id,v_transaction.store_id,'COUNTER',v_transaction.total_minor,v_transaction.currency_code,
      p_amount_minor,p_reason_code,NULLIF(btrim(p_explanation),''),p_support_request_id,p_idempotency_key,p_actor_user_id,
      'APPROVED','READY',CURRENT_TIMESTAMP);
    INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,previous_approval_status,new_approval_status,previous_execution_status,new_execution_status,actor_origin,description,event_identity)
    VALUES('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'AUTO_APPROVED',NULL,'APPROVED',NULL,'READY','SYSTEM_POLICY','MVP refund policy automatically approved the eligible commerce refund request.','AUTO_APPROVED:'||p_refund_id);
    RETURN QUERY SELECT p_refund_id,'APPROVED'::varchar,'READY'::varchar,p_amount_minor,v_transaction.currency_code,1;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_request_commerce(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_request_commerce(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_claim_poynt_bridge_execution(p_organization_id varchar,p_refund_id varchar,p_attempt_id varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"paymentRefundAttemptId" varchar,"dispatchRequired" boolean,"attemptStatus" varchar,"providerReference" varchar,"originalCaptureId" varchar,"refundAmountMinor" bigint,"currencyCode" varchar,"integrationConfigurationId" varchar,"businessId" varchar,"providerStoreId" varchar,"providerDeviceId" varchar,"targetPosDeviceId" varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE; p commerce_provider_payment_attempts%ROWTYPE;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN RAISE EXCEPTION 'Bridge refund execution is not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=p_refund_id AND organization_id=p_organization_id FOR UPDATE;
 IF NOT FOUND OR r.commerce_transaction_id IS NULL OR r.original_provider_code<>'POYNT_PAYMENT_BRIDGE' THEN RAISE EXCEPTION 'Bridge refund was not found' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_id=p_refund_id ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF FOUND THEN RETURN QUERY SELECT r.payment_refund_id,a.payment_refund_attempt_id,false,a.status,a.provider_reference,r.original_provider_transaction_reference,r.refund_amount_minor,r.currency_code,r.original_integration_configuration_id,NULL::varchar,NULL::varchar,NULL::varchar,NULL::varchar; RETURN; END IF;
 IF r.approval_status<>'APPROVED' OR r.execution_status<>'READY' THEN RAISE EXCEPTION 'Bridge refund is not ready' USING ERRCODE='23514'; END IF;
 SELECT * INTO p FROM commerce_provider_payment_attempts WHERE commerce_transaction_id=r.commerce_transaction_id AND payment_channel='REMOTE_TERMINAL' AND provider_status='SUCCEEDED' AND provider_transaction_id=r.original_provider_transaction_reference AND amount_minor=r.captured_amount_minor AND upper(currency_code)=upper(r.currency_code) FOR UPDATE;
 IF NOT FOUND OR NULLIF(btrim(p.provider_business_id),'') IS NULL OR NULLIF(btrim(p.provider_store_id),'') IS NULL OR NULLIF(btrim(p.provider_device_id),'') IS NULL OR NULLIF(btrim(p.target_pos_device_id),'') IS NULL THEN RAISE EXCEPTION 'Historical Bridge terminal evidence is unavailable' USING ERRCODE='22023'; END IF;
 IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts other WHERE other.commerce_transaction_id=r.commerce_transaction_id AND other.payment_channel='REMOTE_TERMINAL' AND other.provider_status='SUCCEEDED' AND other.provider_transaction_id=r.original_provider_transaction_reference AND other.commerce_provider_payment_attempt_id<>p.commerce_provider_payment_attempt_id) THEN RAISE EXCEPTION 'Ambiguous historical Bridge terminal evidence' USING ERRCODE='23514'; END IF;
 INSERT INTO payment_refund_attempts(payment_refund_attempt_id,payment_refund_id,provider_code,idempotency_reference,status) VALUES(p_attempt_id,p_refund_id,'POYNT_PAYMENT_BRIDGE',p_attempt_id,'PENDING');
 UPDATE payment_refunds SET execution_status='PENDING',updated_at=CURRENT_TIMESTAMP,version_no=version_no+1 WHERE payment_refund_id=p_refund_id;
 INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,previous_execution_status,new_execution_status,actor_user_id,actor_origin,description,event_identity)
 VALUES('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'BRIDGE_REFUND_CLAIMED','READY','PENDING',p_actor_user_id,'ORG_ADMIN','Poynt Bridge refund attempt claimed.','BRIDGE_CLAIM:'||p_attempt_id) ON CONFLICT(event_identity) DO NOTHING;
 RETURN QUERY SELECT r.payment_refund_id,p_attempt_id,true,'PENDING'::varchar,NULL::varchar,r.original_provider_transaction_reference,r.refund_amount_minor,r.currency_code,r.original_integration_configuration_id,p.provider_business_id,p.provider_store_id,p.provider_device_id,p.target_pos_device_id;
END;$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_record_poynt_bridge_outcome(p_organization_id varchar,p_refund_id varchar,p_attempt_id varchar,p_outcome varchar,p_provider_reference varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"executionStatus" varchar,"providerRefundReference" varchar,"versionNo" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE; v varchar;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN RAISE EXCEPTION 'Bridge refund outcome is not permitted' USING ERRCODE='42501'; END IF;
 v:=upper(btrim(p_outcome)); IF v NOT IN ('SUCCEEDED','FAILED','PENDING','UNKNOWN_REQUIRES_RECONCILIATION') THEN RAISE EXCEPTION 'Invalid Bridge refund outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=p_refund_id AND organization_id=p_organization_id AND original_provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund not found for organization' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_attempt_id=p_attempt_id AND payment_refund_id=p_refund_id AND provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund attempt was not found' USING ERRCODE='22023'; END IF;
 IF r.execution_status IN ('SUCCEEDED','FAILED') THEN IF r.execution_status=v AND r.provider_refund_reference IS NOT DISTINCT FROM NULLIF(btrim(p_provider_reference),'') THEN RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no; RETURN; END IF; RAISE EXCEPTION 'Bridge refund has a terminal outcome' USING ERRCODE='23514'; END IF;
 IF v NOT IN ('PENDING','UNKNOWN_REQUIRES_RECONCILIATION') THEN RAISE EXCEPTION 'Bridge refund financial outcomes require authenticated callback or verified recovery' USING ERRCODE='42501'; END IF;
 IF NULLIF(btrim(coalesce(p_provider_reference,'')),'') IS NOT NULL THEN RAISE EXCEPTION 'Unverified Bridge provider reference is not permitted' USING ERRCODE='42501'; END IF;
 IF r.execution_status NOT IN ('PENDING','UNKNOWN_REQUIRES_RECONCILIATION') THEN RAISE EXCEPTION 'Bridge refund is not claimed' USING ERRCODE='23514'; END IF;
 IF r.execution_status=v AND a.status=v THEN RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no; RETURN; END IF;
 IF v='PENDING' AND r.execution_status='UNKNOWN_REQUIRES_RECONCILIATION' THEN RAISE EXCEPTION 'Cannot regress UNKNOWN refund to pending' USING ERRCODE='23514'; END IF;
 UPDATE payment_refund_attempts SET status=v,provider_reference=COALESCE(NULLIF(btrim(p_provider_reference),''),provider_reference),updated_at=CURRENT_TIMESTAMP WHERE payment_refund_attempt_id=p_attempt_id;
 UPDATE payment_refunds SET execution_status=v,provider_refund_reference=COALESCE(NULLIF(btrim(p_provider_reference),''),provider_refund_reference),updated_at=CURRENT_TIMESTAMP,version_no=version_no+1 WHERE payment_refund_id=p_refund_id AND organization_id=p_organization_id RETURNING * INTO r;
 INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,previous_execution_status,new_execution_status,actor_user_id,actor_origin,description,event_identity) VALUES('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'POYNT_BRIDGE_REFUND_OUTCOME',a.status,v,p_actor_user_id,'ORG_ADMIN','Poynt Payment Bridge refund outcome recorded.','POYNT_BRIDGE_REFUND_OUTCOME:'||p_attempt_id||':'||v) ON CONFLICT(event_identity) DO NOTHING;
 RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no;
END;$f$;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_claim_poynt_bridge_execution(varchar,varchar,varchar,varchar),"${schemaName}".payment_refund_record_poynt_bridge_outcome(varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_claim_poynt_bridge_execution(varchar,varchar,varchar,varchar),"${schemaName}".payment_refund_record_poynt_bridge_outcome(varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";


-- Read-only status for both org-scoped refund status routes and callback investigation.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_poynt_bridge_execution_status(
 p_organization_id varchar,p_refund_id varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"executionStatus" varchar,"providerRefundReference" varchar,"versionNo" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
         rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
  RAISE EXCEPTION 'Bridge refund status is not permitted' USING ERRCODE='42501';
 END IF;
 RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no
 FROM payment_refunds r WHERE r.organization_id=p_organization_id AND r.payment_refund_id=p_refund_id
 AND r.original_provider_code='POYNT_PAYMENT_BRIDGE' AND r.commerce_transaction_id IS NOT NULL;
END;$f$;

-- Read-only original context for a previously claimed attempt. No dispatch or status mutation.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_poynt_bridge_context(
 p_organization_id varchar,p_refund_id varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"paymentRefundAttemptId" varchar,"dispatchRequired" boolean,
 "attemptStatus" varchar,"providerReference" varchar,"originalCaptureId" varchar,
 "refundAmountMinor" bigint,"currencyCode" varchar,"integrationConfigurationId" varchar,
 "businessId" varchar,"providerStoreId" varchar,"providerDeviceId" varchar,"targetPosDeviceId" varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE;
        p commerce_provider_payment_attempts%ROWTYPE;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
         rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
  RAISE EXCEPTION 'Bridge refund context is not permitted' USING ERRCODE='42501';
 END IF;
 SELECT * INTO r FROM payment_refunds WHERE organization_id=p_organization_id
 AND payment_refund_id=p_refund_id AND original_provider_code='POYNT_PAYMENT_BRIDGE';
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_id=p_refund_id
 AND provider_code='POYNT_PAYMENT_BRIDGE' ORDER BY created_at DESC,payment_refund_attempt_id DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund attempt unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO p FROM commerce_provider_payment_attempts WHERE commerce_transaction_id=r.commerce_transaction_id
 AND provider_status='SUCCEEDED' AND payment_channel='REMOTE_TERMINAL'
 AND provider_transaction_id=r.original_provider_transaction_reference
 AND amount_minor=r.captured_amount_minor AND upper(currency_code)=upper(r.currency_code);
 IF NOT FOUND THEN RAISE EXCEPTION 'Original terminal evidence unavailable' USING ERRCODE='22023'; END IF;
 RETURN QUERY SELECT r.payment_refund_id,a.payment_refund_attempt_id,false,r.execution_status,
 a.provider_reference,r.original_provider_transaction_reference,r.refund_amount_minor,r.currency_code,
 r.original_integration_configuration_id,p.provider_business_id,p.provider_store_id,p.provider_device_id,p.target_pos_device_id;
END;$f$;

-- Provider-callback-only accounting entry. Invoked exclusively by authenticated
-- callback route after strict DTO parsing. Refund attempt ID is the callback correlation.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_record_poynt_bridge_callback(
 p_attempt_id varchar,p_outcome varchar,p_provider_refund_id varchar,p_original_transaction_id varchar,
 p_amount_minor bigint,p_currency_code varchar,p_business_id varchar,p_store_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"executionStatus" varchar,"providerRefundReference" varchar,"versionNo" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE;
        p commerce_provider_payment_attempts%ROWTYPE; v_outcome varchar;
        v_previous varchar;
BEGIN
 v_outcome:=upper(btrim(coalesce(p_outcome,'')));
 IF v_outcome NOT IN ('SUCCEEDED','UNKNOWN_REQUIRES_RECONCILIATION') THEN
   RAISE EXCEPTION 'Unverified Bridge callback outcome' USING ERRCODE='22023';
 END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_attempt_id=p_attempt_id
  AND provider_code='POYNT_PAYMENT_BRIDGE';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Bridge refund callback reference' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=a.payment_refund_id
 AND original_provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown Bridge refund callback' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_attempt_id=p_attempt_id
 AND payment_refund_id=r.payment_refund_id FOR UPDATE;
 IF r.execution_status='SUCCEEDED' THEN
  IF v_outcome='SUCCEEDED' AND r.provider_refund_reference=p_provider_refund_id AND p_original_transaction_id IS NOT DISTINCT FROM r.original_provider_transaction_reference AND p_amount_minor IS NOT DISTINCT FROM r.refund_amount_minor AND upper(coalesce(p_currency_code,''))=upper(r.currency_code) THEN
   RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no; RETURN;
  END IF;
  RAISE EXCEPTION 'Conflicting terminal refund callback' USING ERRCODE='23514';
 END IF;
 IF r.execution_status='FAILED' THEN RAISE EXCEPTION 'Terminal refund cannot be overwritten' USING ERRCODE='23514'; END IF;
 IF r.execution_status NOT IN ('PENDING','UNKNOWN_REQUIRES_RECONCILIATION') THEN
   RAISE EXCEPTION 'Refund has not been dispatched' USING ERRCODE='23514'; END IF;
 IF v_outcome='UNKNOWN_REQUIRES_RECONCILIATION' AND r.execution_status='UNKNOWN_REQUIRES_RECONCILIATION' THEN
  RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no; RETURN;
 END IF;
 IF v_outcome='SUCCEEDED' THEN
  SELECT * INTO p FROM commerce_provider_payment_attempts
   WHERE commerce_transaction_id=r.commerce_transaction_id AND payment_channel='REMOTE_TERMINAL'
    AND provider_status='SUCCEEDED' AND provider_transaction_id=r.original_provider_transaction_reference
    AND amount_minor=r.captured_amount_minor AND upper(currency_code)=upper(r.currency_code);
  IF NOT FOUND OR NULLIF(btrim(p_provider_refund_id),'') IS NULL
   OR length(p_provider_refund_id)>160 OR p_provider_refund_id=r.original_provider_transaction_reference
   OR p_original_transaction_id IS DISTINCT FROM r.original_provider_transaction_reference
   OR p_amount_minor IS DISTINCT FROM r.refund_amount_minor
   OR upper(coalesce(p_currency_code,''))<>upper(r.currency_code)
   OR p_business_id IS DISTINCT FROM p.provider_business_id
   OR p_store_id IS DISTINCT FROM p.provider_store_id THEN
    RAISE EXCEPTION 'Refund callback financial evidence mismatches original' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM payment_refunds x WHERE x.payment_refund_id<>r.payment_refund_id
     AND x.provider_refund_reference=p_provider_refund_id AND x.original_provider_code='POYNT_PAYMENT_BRIDGE') THEN
    RAISE EXCEPTION 'Refund provider reference already recorded' USING ERRCODE='23505'; END IF;
 END IF;
 v_previous:=r.execution_status;
 UPDATE payment_refund_attempts SET status=v_outcome,
  provider_reference=CASE WHEN v_outcome='SUCCEEDED' THEN p_provider_refund_id ELSE provider_reference END,
  updated_at=CURRENT_TIMESTAMP WHERE payment_refund_attempt_id=p_attempt_id;
 UPDATE payment_refunds SET execution_status=v_outcome,
  provider_refund_reference=CASE WHEN v_outcome='SUCCEEDED' THEN p_provider_refund_id ELSE provider_refund_reference END,
  executed_at=CASE WHEN v_outcome='SUCCEEDED' THEN CURRENT_TIMESTAMP ELSE executed_at END,
  updated_at=CURRENT_TIMESTAMP,version_no=version_no+1 WHERE payment_refund_id=r.payment_refund_id RETURNING * INTO r;
 INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,
   event_type,previous_execution_status,new_execution_status,actor_origin,description,event_identity)
 VALUES('PRE_'||gen_random_uuid()::text,r.payment_refund_id,r.organization_id,'POYNT_BRIDGE_REFUND_CALLBACK',
  v_previous,v_outcome,'PROVIDER_CALLBACK','Authenticated Poynt Payment Bridge refund callback recorded.',
  'BRIDGE_CALLBACK:'||p_attempt_id||':'||v_outcome) ON CONFLICT(event_identity) DO NOTHING;
 RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no;
END;$f$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_poynt_bridge_execution_status(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_poynt_bridge_context(varchar,varchar,varchar) FROM PUBLIC;
-- Correct callback signature: attempt, outcome, reference, amount, currency, business, store.
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_record_poynt_bridge_callback(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_poynt_bridge_execution_status(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_poynt_bridge_context(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_record_poynt_bridge_callback(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar) TO "${appRole}";


-- Verified independent provider GET evidence; never a substitute for proof.
CREATE TABLE "${schemaName}".payment_refund_bridge_verifications (
 verification_id varchar(64) PRIMARY KEY,
 payment_refund_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_refunds(payment_refund_id),
 payment_refund_attempt_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_refund_attempts(payment_refund_attempt_id),
 organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
 provider_refund_reference varchar(160) NOT NULL,
 attestation varchar(1000) NOT NULL,
 verified_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
 verified_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(payment_refund_id,payment_refund_attempt_id,provider_refund_reference),
 UNIQUE(provider_refund_reference)
);
CREATE UNIQUE INDEX ux_poynt_bridge_refund_provider_reference
 ON "${schemaName}".payment_refunds(provider_refund_reference)
 WHERE original_provider_code='POYNT_PAYMENT_BRIDGE' AND provider_refund_reference IS NOT NULL;
REVOKE ALL ON TABLE "${schemaName}".payment_refund_bridge_verifications FROM PUBLIC;
REVOKE ALL ON TABLE "${schemaName}".payment_refund_bridge_verifications FROM "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_bridge_record_verification(
 p_verification_id varchar,p_organization_id varchar,p_refund_id varchar,p_attempt_id varchar,
 p_provider_reference varchar,p_attestation varchar,p_actor_user_id varchar)
RETURNS TABLE("verificationId" varchar,"paymentRefundId" varchar,"paymentRefundAttemptId" varchar,
 "providerRefundReference" varchar,"verificationOutcome" varchar,"verifiedAt" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE;
        v payment_refund_bridge_verifications%ROWTYPE;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
     rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
  RAISE EXCEPTION 'Bridge reference verification is not permitted' USING ERRCODE='42501'; END IF;
 IF NULLIF(btrim(p_provider_reference),'') IS NULL OR length(p_provider_reference)>160
    OR length(btrim(coalesce(p_attestation,''))) NOT BETWEEN 10 AND 1000 THEN
  RAISE EXCEPTION 'Bridge reference evidence is invalid' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=p_refund_id
  AND organization_id=p_organization_id AND original_provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND OR r.execution_status<>'UNKNOWN_REQUIRES_RECONCILIATION' THEN
  RAISE EXCEPTION 'Bridge refund is not awaiting recovery' USING ERRCODE='23514'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_attempt_id=p_attempt_id
  AND payment_refund_id=p_refund_id AND provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND OR a.status<>'UNKNOWN_REQUIRES_RECONCILIATION' THEN
  RAISE EXCEPTION 'Bridge attempt is not awaiting recovery' USING ERRCODE='23514'; END IF;
 SELECT * INTO v FROM payment_refund_bridge_verifications WHERE payment_refund_id=p_refund_id
   AND payment_refund_attempt_id=p_attempt_id AND provider_refund_reference=p_provider_reference;
 IF NOT FOUND THEN
  INSERT INTO payment_refund_bridge_verifications(verification_id,payment_refund_id,payment_refund_attempt_id,
   organization_id,provider_refund_reference,attestation,verified_by)
  VALUES(p_verification_id,p_refund_id,p_attempt_id,p_organization_id,p_provider_reference,p_attestation,p_actor_user_id)
  RETURNING * INTO v;
 END IF;
 RETURN QUERY SELECT v.verification_id,v.payment_refund_id,v.payment_refund_attempt_id,
  v.provider_refund_reference,'VERIFIED'::varchar,v.verified_at::text;
END;$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_bridge_confirm_verified(
 p_organization_id varchar,p_refund_id varchar,p_attempt_id varchar,
 p_verification_id varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"executionStatus" varchar,"providerRefundReference" varchar,"versionNo" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r payment_refunds%ROWTYPE; a payment_refund_attempts%ROWTYPE;
        v payment_refund_bridge_verifications%ROWTYPE;
BEGIN
 IF NOT (rbac_has_capability(p_actor_user_id,p_organization_id,'ORG_ADMIN_ACCESS') OR
     rbac_has_capability(p_actor_user_id,p_organization_id,'BUSINESS_OWNER_ACCESS')) THEN
  RAISE EXCEPTION 'Bridge reference confirmation is not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=p_refund_id
  AND organization_id=p_organization_id AND original_provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM payment_refund_attempts WHERE payment_refund_attempt_id=p_attempt_id
  AND payment_refund_id=p_refund_id AND provider_code='POYNT_PAYMENT_BRIDGE' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge refund attempt unavailable' USING ERRCODE='22023'; END IF;
 SELECT * INTO v FROM payment_refund_bridge_verifications WHERE verification_id=p_verification_id
  AND payment_refund_id=p_refund_id AND payment_refund_attempt_id=p_attempt_id
  AND organization_id=p_organization_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified provider evidence is unavailable' USING ERRCODE='23514'; END IF;
 IF r.execution_status='SUCCEEDED' AND r.provider_refund_reference=v.provider_refund_reference THEN
  RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no; RETURN;
 END IF;
 IF r.execution_status<>'UNKNOWN_REQUIRES_RECONCILIATION'
    OR a.status<>'UNKNOWN_REQUIRES_RECONCILIATION' THEN
  RAISE EXCEPTION 'Bridge recovery state changed' USING ERRCODE='23514'; END IF;
 IF EXISTS (SELECT 1 FROM payment_refunds x WHERE x.payment_refund_id<>r.payment_refund_id
   AND x.original_provider_code='POYNT_PAYMENT_BRIDGE' AND x.provider_refund_reference=v.provider_refund_reference) THEN
   RAISE EXCEPTION 'Verified provider refund reference already used' USING ERRCODE='23505'; END IF;
 UPDATE payment_refund_attempts SET status='SUCCEEDED',provider_reference=v.provider_refund_reference,
   updated_at=CURRENT_TIMESTAMP WHERE payment_refund_attempt_id=p_attempt_id;
 UPDATE payment_refunds SET execution_status='SUCCEEDED',provider_refund_reference=v.provider_refund_reference,
   executed_by=p_actor_user_id,executed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP,version_no=version_no+1
 WHERE payment_refund_id=p_refund_id AND organization_id=p_organization_id RETURNING * INTO r;
 INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,
   previous_execution_status,new_execution_status,actor_user_id,actor_origin,description,event_identity)
 VALUES('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'BRIDGE_REFERENCE_RECOVERY',
  'UNKNOWN_REQUIRES_RECONCILIATION','SUCCEEDED',p_actor_user_id,'ORG_ADMIN',
  'Verified Poynt Bridge provider refund reference confirmed.','BRIDGE_REFERENCE_RECOVERY:'||p_verification_id)
 ON CONFLICT(event_identity) DO NOTHING;
 RETURN QUERY SELECT r.payment_refund_id,r.execution_status,r.provider_refund_reference,r.version_no;
END;$f$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_bridge_record_verification(varchar,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_bridge_confirm_verified(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_bridge_record_verification(varchar,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_bridge_confirm_verified(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

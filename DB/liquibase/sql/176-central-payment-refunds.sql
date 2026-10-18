-- Phase R1: provider-independent refund ledger. Provider adapters are intentionally
-- non-executing in this phase; no provider credentials or card data are stored here.

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_refunds (
    payment_refund_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    payment_intent_id varchar(64) REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    commerce_transaction_id varchar(64) REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    support_request_id varchar(64) REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    financial_exception_id varchar(64) REFERENCES "${schemaName}".poynt_collect_financial_exceptions(financial_exception_id),
    original_provider_code varchar(64) NOT NULL,
    original_provider_transaction_reference varchar(160),
    original_provider_config_id varchar(64) REFERENCES "${schemaName}".payment_provider_configs(payment_provider_config_id),
    original_integration_configuration_id varchar(64) REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    original_store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    original_channel varchar(32) NOT NULL,
    captured_amount_minor bigint NOT NULL CHECK (captured_amount_minor >= 0),
    currency_code varchar(10) NOT NULL,
    refund_amount_minor bigint NOT NULL CHECK (refund_amount_minor > 0),
    reason_code varchar(48) NOT NULL,
    explanation varchar(500),
    approval_status varchar(32) NOT NULL DEFAULT 'APPROVED',
    execution_status varchar(48) NOT NULL DEFAULT 'READY',
    idempotency_key varchar(160) NOT NULL,
    requested_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    approved_by varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    rejected_by varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    executed_by varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    provider_refund_reference varchar(160),
    failure_code varchar(80),
    failure_description varchar(500),
    requested_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    executed_at timestamp with time zone,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_payment_refunds_source CHECK ((payment_intent_id IS NOT NULL)::integer + (commerce_transaction_id IS NOT NULL)::integer = 1),
    CONSTRAINT ck_payment_refunds_reason CHECK (reason_code IN ('DUPLICATE_PAYMENT','CAPTURED_NOT_FULFILLED','GOODWILL','INCORRECT_AMOUNT','MEMBERSHIP_CANCELLATION','OTHER_APPROVED')),
    CONSTRAINT ck_payment_refunds_explanation CHECK (reason_code NOT IN ('GOODWILL','OTHER_APPROVED') OR length(btrim(COALESCE(explanation, ''))) >= 10),
    CONSTRAINT ck_payment_refunds_approval CHECK (approval_status IN ('REQUESTED','APPROVED','REJECTED')),
    CONSTRAINT ck_payment_refunds_execution CHECK (execution_status IN ('NOT_EXECUTED','READY','PENDING','SUCCEEDED','FAILED','UNKNOWN_REQUIRES_RECONCILIATION','UNSUPPORTED_REQUIRES_MANUAL')),
    CONSTRAINT ux_payment_refunds_org_idempotency UNIQUE (organization_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_refund_events (
    payment_refund_event_id varchar(64) PRIMARY KEY,
    payment_refund_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_refunds(payment_refund_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    event_type varchar(48) NOT NULL,
    previous_approval_status varchar(32), new_approval_status varchar(32),
    previous_execution_status varchar(48), new_execution_status varchar(48),
    actor_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    actor_origin varchar(32) NOT NULL,
    description varchar(500) NOT NULL,
    event_identity varchar(200) NOT NULL UNIQUE,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "${schemaName}".payment_refund_attempts (
    payment_refund_attempt_id varchar(64) PRIMARY KEY,
    payment_refund_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_refunds(payment_refund_id),
    provider_code varchar(64) NOT NULL,
    idempotency_reference varchar(160) NOT NULL,
    status varchar(48) NOT NULL,
    provider_reference varchar(160),
    failure_code varchar(80),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ux_payment_refund_attempt_idempotency UNIQUE (payment_refund_id, idempotency_reference)
);

CREATE INDEX IF NOT EXISTS ix_payment_refunds_original_intent ON "${schemaName}".payment_refunds(payment_intent_id) WHERE payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_payment_refunds_org_requested ON "${schemaName}".payment_refunds(organization_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS ix_payment_refund_events_refund ON "${schemaName}".payment_refund_events(payment_refund_id, created_at);

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_request(
    p_refund_id varchar, p_organization_id varchar, p_payment_intent_id varchar,
    p_amount_minor bigint, p_reason_code varchar, p_explanation varchar,
    p_support_request_id varchar, p_financial_exception_id varchar,
    p_idempotency_key varchar, p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar, "approvalStatus" varchar, "executionStatus" varchar,
    "refundAmountMinor" bigint, "currencyCode" varchar, "versionNo" integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_intent payment_intents%ROWTYPE; v_provider_code varchar; v_existing payment_refunds%ROWTYPE;
        v_reserved bigint; v_reference varchar; v_channel varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN RAISE EXCEPTION 'Refund request is not permitted' USING ERRCODE='42501'; END IF;
    IF NULLIF(btrim(p_idempotency_key),'') IS NULL OR length(p_idempotency_key)>160 THEN RAISE EXCEPTION 'Refund idempotency key is required' USING ERRCODE='22023'; END IF;
    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'Refund amount is required' USING ERRCODE='22023'; END IF;
    IF p_reason_code NOT IN ('DUPLICATE_PAYMENT','CAPTURED_NOT_FULFILLED','GOODWILL','INCORRECT_AMOUNT','MEMBERSHIP_CANCELLATION','OTHER_APPROVED') THEN RAISE EXCEPTION 'Refund reason is invalid' USING ERRCODE='22023'; END IF;
    IF p_reason_code IN ('GOODWILL','OTHER_APPROVED') AND length(btrim(COALESCE(p_explanation,''))) < 10 THEN RAISE EXCEPTION 'A meaningful refund explanation is required' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_existing FROM payment_refunds WHERE organization_id=p_organization_id AND idempotency_key=p_idempotency_key FOR UPDATE;
    IF FOUND THEN
      IF v_existing.payment_intent_id IS DISTINCT FROM p_payment_intent_id
         OR v_existing.refund_amount_minor IS DISTINCT FROM p_amount_minor
         OR v_existing.reason_code IS DISTINCT FROM p_reason_code
         OR COALESCE(v_existing.explanation,'') IS DISTINCT FROM COALESCE(NULLIF(btrim(p_explanation),''),'')
         OR v_existing.support_request_id IS DISTINCT FROM p_support_request_id
         OR v_existing.financial_exception_id IS DISTINCT FROM p_financial_exception_id
      THEN RAISE EXCEPTION 'Refund idempotency key conflicts with existing request' USING ERRCODE='23505'; END IF;
      RETURN QUERY SELECT v_existing.payment_refund_id,v_existing.approval_status,v_existing.execution_status,v_existing.refund_amount_minor,v_existing.currency_code,v_existing.version_no; RETURN;
    END IF;
    -- serializes reservations for this original payment without holding locks across provider work.
    PERFORM pg_advisory_xact_lock(hashtextextended('payment-refund:' || p_payment_intent_id, 0));
    SELECT * INTO v_intent FROM payment_intents WHERE payment_intent_id=p_payment_intent_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND OR v_intent.status <> 'SUCCEEDED' THEN RAISE EXCEPTION 'Original captured payment is unavailable' USING ERRCODE='22023'; END IF;
    -- Historical identity is immutable payment evidence; a later provider disable
    -- must not make a captured payment unidentifiable or silently select a new route.
    SELECT provider_code INTO v_provider_code FROM payment_provider_configs WHERE payment_provider_config_id=v_intent.payment_provider_config_id AND (organization_id=p_organization_id OR organization_id IS NULL);
    v_reference := NULLIF(btrim(v_intent.provider_reference_id),'');
    IF v_provider_code IS NULL OR v_reference IS NULL THEN RAISE EXCEPTION 'Original provider transaction requires manual investigation' USING ERRCODE='22023'; END IF;
    -- A Collect refund must have the same durable verified capture evidence that protected the original fulfilment path.
    IF v_provider_code='POYNT_COLLECT' AND NOT EXISTS (SELECT 1 FROM poynt_collect_verified_captures c WHERE c.payment_intent_id=v_intent.payment_intent_id AND c.organization_id=p_organization_id AND c.provider_transaction_id=v_reference AND c.amount_minor=round(v_intent.amount*100)::bigint AND upper(c.currency_code)=upper(v_intent.currency_code)) THEN RAISE EXCEPTION 'Verified provider capture is unavailable' USING ERRCODE='22023'; END IF;
    -- Reservations stay held through PENDING, UNKNOWN and UNSUPPORTED until a
    -- later controlled reconciliation/cancellation transition resolves them.
    SELECT COALESCE(sum(refund_amount_minor),0) INTO v_reserved FROM payment_refunds WHERE payment_intent_id=p_payment_intent_id AND NOT (execution_status='FAILED' OR approval_status='REJECTED');
    IF v_reserved + p_amount_minor > round(v_intent.amount*100)::bigint THEN RAISE EXCEPTION 'Refund amount exceeds remaining refundable amount' USING ERRCODE='22023'; END IF;
    IF p_financial_exception_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions f WHERE f.financial_exception_id=p_financial_exception_id AND f.organization_id=p_organization_id AND f.payment_intent_id=p_payment_intent_id) THEN RAISE EXCEPTION 'Financial exception is unavailable for this payment' USING ERRCODE='22023'; END IF;
    IF p_support_request_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM customer_support_requests s WHERE s.support_request_id=p_support_request_id AND s.organization_id=p_organization_id AND s.customer_user_id=v_intent.customer_user_id) THEN RAISE EXCEPTION 'Support request is unavailable for this payment customer' USING ERRCODE='22023'; END IF;
    v_channel := CASE WHEN v_intent.authorization_mode='CUSTOMER_SESSION' THEN 'CUSTOMER_MEMBERSHIP' ELSE 'COUNTER' END;
    INSERT INTO payment_refunds(payment_refund_id,organization_id,payment_intent_id,original_provider_code,original_provider_transaction_reference,original_provider_config_id,original_integration_configuration_id,original_store_id,original_channel,captured_amount_minor,currency_code,refund_amount_minor,reason_code,explanation,support_request_id,financial_exception_id,idempotency_key,requested_by,approval_status,execution_status,approved_at)
    VALUES(p_refund_id,p_organization_id,p_payment_intent_id,v_provider_code,v_reference,v_intent.payment_provider_config_id,v_intent.collect_integration_configuration_id,v_intent.store_id,v_channel,round(v_intent.amount*100)::bigint,upper(v_intent.currency_code),p_amount_minor,p_reason_code,NULLIF(btrim(p_explanation),''),p_support_request_id,p_financial_exception_id,p_idempotency_key,p_actor_user_id,'APPROVED','READY',CURRENT_TIMESTAMP);
    INSERT INTO payment_refund_events(payment_refund_event_id,payment_refund_id,organization_id,event_type,previous_approval_status,new_approval_status,previous_execution_status,new_execution_status,actor_user_id,actor_origin,description,event_identity)
    VALUES ('PRE_'||gen_random_uuid()::text,p_refund_id,p_organization_id,'AUTO_APPROVED',NULL,'APPROVED',NULL,'READY',NULL,'SYSTEM_POLICY','MVP refund policy automatically approved the eligible refund request.','AUTO_APPROVED:'||p_refund_id);
    RETURN QUERY SELECT p_refund_id,'APPROVED'::varchar,'READY'::varchar,p_amount_minor,upper(v_intent.currency_code),1;
END;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_list(p_organization_id varchar,p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"paymentIntentId" varchar,"supportRequestId" varchar,"financialExceptionId" varchar,"originalProviderCode" varchar,"refundAmountMinor" bigint,"currencyCode" varchar,"reasonCode" varchar,"approvalStatus" varchar,"executionStatus" varchar,"requestedAt" text,"versionNo" integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT r.payment_refund_id,r.payment_intent_id,r.support_request_id,r.financial_exception_id,r.original_provider_code,r.refund_amount_minor,r.currency_code,r.reason_code,r.approval_status,r.execution_status,r.requested_at::text,r.version_no FROM payment_refunds r WHERE r.organization_id=p_organization_id AND can_administer_organization(p_organization_id,p_actor_user_id) ORDER BY r.requested_at DESC;
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_detail(p_organization_id varchar,p_refund_id varchar,p_actor_user_id varchar)
RETURNS SETOF payment_refunds LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT r.* FROM payment_refunds r WHERE r.organization_id=p_organization_id AND r.payment_refund_id=p_refund_id AND can_administer_organization(p_organization_id,p_actor_user_id);
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_platform_list(p_actor_user_id varchar)
RETURNS TABLE("paymentRefundId" varchar,"organizationId" varchar,"paymentIntentId" varchar,"originalProviderCode" varchar,"refundAmountMinor" bigint,"currencyCode" varchar,"reasonCode" varchar,"approvalStatus" varchar,"executionStatus" varchar,"requestedAt" text,"versionNo" integer)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT r.payment_refund_id,r.organization_id,r.payment_intent_id,r.original_provider_code,r.refund_amount_minor,r.currency_code,r.reason_code,r.approval_status,r.execution_status,r.requested_at::text,r.version_no
 FROM payment_refunds r WHERE rbac_has_capability(p_actor_user_id,NULL,'PLATFORM_ADMIN_ACCESS') ORDER BY r.requested_at DESC;
$function$;

REVOKE ALL ON TABLE "${schemaName}".payment_refunds,"${schemaName}".payment_refund_events,"${schemaName}".payment_refund_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_request(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_list(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_detail(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_platform_list(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_request(varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_list(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_detail(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_platform_list(varchar) TO "${appRole}";

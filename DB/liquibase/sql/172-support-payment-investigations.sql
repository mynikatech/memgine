-- Customer-reported payment concerns are investigation intake, not financial evidence.
CREATE TABLE "${schemaName}".support_payment_investigations (
    support_payment_investigation_id varchar(64) PRIMARY KEY,
    support_request_id varchar(64) NOT NULL UNIQUE REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    organization_id varchar(64) NOT NULL,
    financial_exception_id varchar(64) UNIQUE REFERENCES "${schemaName}".poynt_collect_financial_exceptions(financial_exception_id),
    source varchar(32) NOT NULL,
    state varchar(48) NOT NULL DEFAULT 'PENDING_INVESTIGATION',
    escalation_reason varchar(500) NOT NULL,
    payment_reference varchar(128),
    investigation_description varchar(2000),
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    created_by varchar(64),
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_by varchar(64),
    CONSTRAINT ck_support_payment_investigation_source CHECK (source IN ('CUSTOMER_ESCALATION','ADMIN_EXCEPTION_LINK','SYSTEM_DETECTION')),
    CONSTRAINT ck_support_payment_investigation_state CHECK (state IN ('PENDING_INVESTIGATION','ADDITIONAL_INFORMATION_REQUIRED','EXISTING_EXCEPTION_LINKED','NEW_EXCEPTION_VERIFIED','NO_EXCEPTION_FOUND'))
);
CREATE INDEX ix_support_payment_investigation_org_state ON "${schemaName}".support_payment_investigations(organization_id, state, updated_at DESC);

INSERT INTO "${schemaName}".support_issue_types(support_issue_type_id,support_category_id,support_issue_type_code,support_issue_type_name,description,display_order,platform_reply_allowed,is_active)
SELECT 'support-issue-payment-review',c.support_category_id,'PAYMENT_REVIEW_REQUIRED','Payment review required','Memgine identified a payment issue that requires review.',30,false,true
FROM "${schemaName}".support_categories c WHERE c.support_category_code='PAYMENT'
ON CONFLICT(support_category_id,support_issue_type_code) DO UPDATE SET support_issue_type_name=EXCLUDED.support_issue_type_name,description=EXCLUDED.description,is_active=true,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

CREATE TABLE "${schemaName}".support_payment_investigation_events (
    support_payment_investigation_event_id varchar(96) PRIMARY KEY,
    support_payment_investigation_id varchar(64) NOT NULL REFERENCES "${schemaName}".support_payment_investigations(support_payment_investigation_id),
    organization_id varchar(64) NOT NULL,
    event_type varchar(48) NOT NULL,
    actor_user_id varchar(64),
    description varchar(500) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE OR REPLACE FUNCTION "${schemaName}".support_payment_investigation_detail(p_request_id varchar, p_organization_id varchar, p_actor_user_id varchar)
RETURNS TABLE("investigationId" varchar, "supportRequestId" varchar, "financialExceptionId" varchar, source varchar, state varchar, "escalationReason" varchar, "paymentReference" varchar, "investigationDescription" varchar, "createdAt" text, "updatedAt" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
        RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT i.support_payment_investigation_id,i.support_request_id,i.financial_exception_id,i.source,i.state,i.escalation_reason,i.payment_reference,i.investigation_description,i.created_at::text,i.updated_at::text FROM support_payment_investigations i JOIN customer_support_requests r ON r.support_request_id=i.support_request_id WHERE i.support_request_id=p_request_id AND i.organization_id=p_organization_id AND r.organization_id=p_organization_id;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_payment_exception_candidates(p_request_id varchar,p_organization_id varchar,p_actor_user_id varchar)
RETURNS TABLE("financialExceptionId" varchar,"paymentIntentId" varchar,"commerceTransactionId" varchar,"providerReferenceId" varchar,"amountMinor" bigint,"currencyCode" varchar,"caseStatus" varchar,"fulfillmentOutcome" varchar,"openedAt" text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
        RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501';
    END IF;
    RETURN QUERY SELECT e.financial_exception_id,e.payment_intent_id,e.commerce_transaction_id,e.provider_reference_id,e.amount_minor,e.currency_code,e.case_status,e.fulfillment_outcome,e.opened_at::text FROM customer_support_requests r JOIN poynt_collect_financial_exceptions e ON e.organization_id=r.organization_id AND e.customer_user_id=r.customer_user_id WHERE r.support_request_id=p_request_id AND r.organization_id=p_organization_id AND e.provider_outcome='CAPTURED' AND e.fulfillment_outcome<>'FULFILLED' AND e.case_status<>'CLOSED' ORDER BY e.opened_at DESC;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_escalate_payment_investigation(p_request_id varchar,p_organization_id varchar,p_actor_user_id varchar,p_reason varchar,p_payment_reference varchar,p_description varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_id varchar; v_category varchar; BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501'; END IF;
    SELECT c.support_category_code INTO v_category FROM customer_support_requests r JOIN support_categories c ON c.support_category_id=r.support_category_id WHERE r.support_request_id=p_request_id AND r.organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
    IF v_category <> 'PAYMENT' THEN RAISE EXCEPTION 'Payment investigation is unavailable for this support request' USING ERRCODE='22023'; END IF;
    IF NULLIF(btrim(p_reason),'') IS NULL OR length(p_reason)>500 OR (p_description IS NOT NULL AND length(p_description)>2000) OR (p_payment_reference IS NOT NULL AND length(p_payment_reference)>128) THEN RAISE EXCEPTION 'Invalid payment investigation details' USING ERRCODE='22023'; END IF;
    INSERT INTO support_payment_investigations(support_payment_investigation_id,support_request_id,organization_id,source,state,escalation_reason,payment_reference,investigation_description,created_by,updated_by) VALUES ('SPI-'||md5(p_request_id||':CUSTOMER_ESCALATION'),p_request_id,p_organization_id,'CUSTOMER_ESCALATION','PENDING_INVESTIGATION',btrim(p_reason),nullif(btrim(p_payment_reference),''),nullif(btrim(p_description),''),p_actor_user_id,p_actor_user_id) ON CONFLICT(support_request_id) DO NOTHING RETURNING support_payment_investigation_id INTO v_id;
    SELECT coalesce(v_id,support_payment_investigation_id) INTO v_id FROM support_payment_investigations WHERE support_request_id=p_request_id;
    INSERT INTO support_payment_investigation_events(support_payment_investigation_event_id,support_payment_investigation_id,organization_id,event_type,actor_user_id,description) VALUES ('SPIEV-'||md5(v_id||':REQUESTED'),v_id,p_organization_id,'INVESTIGATION_REQUESTED',p_actor_user_id,'Payment investigation requested.') ON CONFLICT DO NOTHING;
    RETURN v_id;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_link_payment_exception(p_request_id varchar,p_organization_id varchar,p_actor_user_id varchar,p_exception_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE
    v_id varchar;
    v_category varchar;
    v_existing_exception varchar;
    v_existing_state varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
        RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501';
    END IF;
    SELECT c.support_category_code INTO v_category FROM customer_support_requests r JOIN support_categories c ON c.support_category_id=r.support_category_id WHERE r.support_request_id=p_request_id AND r.organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002';
    END IF;
    IF v_category <> 'PAYMENT' THEN
        RAISE EXCEPTION 'Payment investigation is unavailable for this support request' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM customer_support_requests r JOIN poynt_collect_financial_exceptions e ON e.organization_id=r.organization_id AND e.customer_user_id=r.customer_user_id WHERE r.support_request_id=p_request_id AND r.organization_id=p_organization_id AND e.financial_exception_id=p_exception_id AND e.provider_outcome='CAPTURED' AND e.fulfillment_outcome<>'FULFILLED' AND e.case_status<>'CLOSED') THEN
        RAISE EXCEPTION 'Financial exception is not eligible for this support request' USING ERRCODE='42501';
    END IF;
    SELECT support_payment_investigation_id,financial_exception_id,state INTO v_id,v_existing_exception,v_existing_state FROM support_payment_investigations WHERE support_request_id=p_request_id FOR UPDATE;
    IF v_id IS NOT NULL AND v_existing_state='NO_EXCEPTION_FOUND' THEN
        RAISE EXCEPTION 'A closed payment investigation cannot be linked to a financial exception' USING ERRCODE='22023';
    END IF;
    IF v_id IS NOT NULL AND v_existing_exception IS NOT NULL AND v_existing_exception IS DISTINCT FROM p_exception_id THEN
        RAISE EXCEPTION 'A different financial exception is already linked to this support request' USING ERRCODE='22023';
    END IF;
    IF v_id IS NULL THEN INSERT INTO support_payment_investigations(support_payment_investigation_id,support_request_id,organization_id,financial_exception_id,source,state,escalation_reason,created_by,updated_by) VALUES ('SPI-'||md5(p_request_id||':LINK:'||p_exception_id),p_request_id,p_organization_id,p_exception_id,'ADMIN_EXCEPTION_LINK','EXISTING_EXCEPTION_LINKED','Existing verified financial exception linked.',p_actor_user_id,p_actor_user_id) RETURNING support_payment_investigation_id INTO v_id;
    ELSIF v_existing_exception IS NULL THEN
        UPDATE support_payment_investigations SET financial_exception_id=p_exception_id,state='EXISTING_EXCEPTION_LINKED',updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id WHERE support_payment_investigation_id=v_id;
    END IF;
    INSERT INTO support_payment_investigation_events(support_payment_investigation_event_id,support_payment_investigation_id,organization_id,event_type,actor_user_id,description) VALUES ('SPIEV-'||md5(v_id||':LINK:'||p_exception_id),v_id,p_organization_id,'EXCEPTION_LINKED',p_actor_user_id,'Verified financial exception linked.') ON CONFLICT DO NOTHING;
    RETURN v_id;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_payment_investigation_transition(p_investigation_id varchar,p_organization_id varchar,p_actor_user_id varchar,p_state varchar,p_reason varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_current varchar; BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501'; END IF;
    IF NULLIF(btrim(p_reason),'') IS NULL OR length(p_reason)>500 OR p_state NOT IN ('PENDING_INVESTIGATION','ADDITIONAL_INFORMATION_REQUIRED','NO_EXCEPTION_FOUND') THEN RAISE EXCEPTION 'Invalid investigation disposition' USING ERRCODE='22023'; END IF;
    SELECT state INTO v_current FROM support_payment_investigations WHERE support_payment_investigation_id=p_investigation_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment investigation was not found' USING ERRCODE='P0002'; END IF;
    IF v_current=p_state THEN RETURN true; END IF;
    IF (v_current='PENDING_INVESTIGATION' AND p_state NOT IN ('ADDITIONAL_INFORMATION_REQUIRED','NO_EXCEPTION_FOUND')) OR (v_current='ADDITIONAL_INFORMATION_REQUIRED' AND p_state NOT IN ('PENDING_INVESTIGATION','NO_EXCEPTION_FOUND')) OR v_current IN ('NO_EXCEPTION_FOUND','EXISTING_EXCEPTION_LINKED','NEW_EXCEPTION_VERIFIED') THEN RAISE EXCEPTION 'Invalid investigation state transition' USING ERRCODE='22023'; END IF;
    UPDATE support_payment_investigations SET state=p_state,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id WHERE support_payment_investigation_id=p_investigation_id;
    INSERT INTO support_payment_investigation_events(support_payment_investigation_event_id,support_payment_investigation_id,organization_id,event_type,actor_user_id,description) VALUES ('SPIEV-'||md5(p_investigation_id||':STATE:'||p_state||':'||clock_timestamp()::text),p_investigation_id,p_organization_id,'INVESTIGATION_DISPOSITION',p_actor_user_id,btrim(p_reason));
    RETURN true;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_create_case_for_verified_exception(p_exception_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE e poynt_collect_financial_exceptions%ROWTYPE; v_request varchar; v_ticket varchar; v_category_id varchar; v_issue_type_id varchar; BEGIN
    IF NOT pg_try_advisory_xact_lock(hashtext(p_exception_id)) THEN RETURN '__MEMGINE_SUPPORT_LINK_BUSY__'; END IF;
    SELECT * INTO e FROM poynt_collect_financial_exceptions WHERE financial_exception_id=p_exception_id FOR UPDATE;
    IF NOT FOUND OR e.customer_user_id IS NULL OR e.provider_outcome <> 'CAPTURED' OR e.fulfillment_outcome='FULFILLED' OR e.case_status='CLOSED' THEN RETURN NULL; END IF;
    SELECT support_request_id INTO v_request FROM support_payment_investigations WHERE financial_exception_id=p_exception_id;
    IF v_request IS NOT NULL THEN RETURN v_request; END IF;
    SELECT c.support_category_id,i.support_issue_type_id INTO v_category_id,v_issue_type_id FROM support_categories c JOIN support_issue_types i ON i.support_category_id=c.support_category_id WHERE c.support_category_code='PAYMENT' AND c.is_active AND i.support_issue_type_code='PAYMENT_REVIEW_REQUIRED' AND i.is_active;
    IF v_category_id IS NULL THEN RAISE EXCEPTION 'Payment-review support reference data is unavailable' USING ERRCODE='23514'; END IF;
    v_request := 'SUP-'||md5(p_exception_id||':SYSTEM_SUPPORT');
    v_ticket := 'SUP-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
    INSERT INTO customer_support_requests(support_request_id,organization_id,customer_user_id,ticket_number,category,issue_type,support_category_id,support_issue_type_id,subject,description,source,status,priority,created_by,updated_by) SELECT v_request,e.organization_id,e.customer_user_id,v_ticket,c.support_category_code,i.support_issue_type_code,v_category_id,v_issue_type_id,'Payment review in progress','Memgine identified a payment issue that requires review. Our support team will provide updates here.','SYSTEM','OPEN','NORMAL',NULL,NULL FROM support_categories c JOIN support_issue_types i ON i.support_issue_type_id=v_issue_type_id WHERE c.support_category_id=v_category_id;
    INSERT INTO support_payment_investigations(support_payment_investigation_id,support_request_id,organization_id,financial_exception_id,source,state,escalation_reason) VALUES ('SPI-'||md5(p_exception_id||':SYSTEM'),v_request,e.organization_id,p_exception_id,'SYSTEM_DETECTION','NEW_EXCEPTION_VERIFIED','Verified payment exception requires customer support follow-up.');
    INSERT INTO support_payment_investigation_events(support_payment_investigation_event_id,support_payment_investigation_id,organization_id,event_type,description) VALUES ('SPIEV-'||md5(p_exception_id||':SYSTEM_CREATED'),'SPI-'||md5(p_exception_id||':SYSTEM'),e.organization_id,'SYSTEM_CASE_CREATED','Customer-visible support request created from verified payment evidence.');
    PERFORM support_emit_notification(e.organization_id,e.customer_user_id,'PAYMENT_SUPPORT_CREATED','Payment review in progress','Memgine identified a payment issue and opened a support request.',v_request);
    PERFORM support_notify_org_admins(e.organization_id,'PAYMENT_SUPPORT_CREATED','Payment investigation opened','A verified payment exception requires customer support follow-up.',v_request);
    RETURN v_request;
END;
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_verified_exception_support_link_candidates(p_limit integer)
RETURNS TABLE("financialExceptionId" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
    SELECT e.financial_exception_id FROM poynt_collect_financial_exceptions e
    LEFT JOIN support_payment_investigations i ON i.financial_exception_id=e.financial_exception_id
    WHERE e.provider_outcome='CAPTURED' AND e.customer_user_id IS NOT NULL AND e.fulfillment_outcome<>'FULFILLED' AND e.case_status<>'CLOSED' AND i.financial_exception_id IS NULL
    ORDER BY e.opened_at ASC LIMIT least(greatest(coalesce(p_limit,50),1),200);
$f$;

REVOKE ALL ON TABLE "${schemaName}".support_payment_investigations,"${schemaName}".support_payment_investigation_events FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".support_payment_investigation_detail(varchar,varchar,varchar),"${schemaName}".support_payment_exception_candidates(varchar,varchar,varchar),"${schemaName}".support_escalate_payment_investigation(varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".support_link_payment_exception(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".support_payment_investigation_transition(varchar,varchar,varchar,varchar,varchar),"${schemaName}".support_create_case_for_verified_exception(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".support_verified_exception_support_link_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_payment_investigation_detail(varchar,varchar,varchar),"${schemaName}".support_payment_exception_candidates(varchar,varchar,varchar),"${schemaName}".support_escalate_payment_investigation(varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".support_link_payment_exception(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".support_payment_investigation_transition(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".support_verified_exception_support_link_candidates(integer) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".support_create_case_for_verified_exception(varchar) TO "${appRole}";

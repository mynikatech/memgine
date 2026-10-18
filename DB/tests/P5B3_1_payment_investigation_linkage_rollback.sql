-- P5-B3.1 linkage regression. Run only after Migration 172 is applied, against a
-- non-production database. All synthetic changes roll back.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $test$
DECLARE
  v_exception poynt_collect_financial_exceptions%ROWTYPE;
  v_admin varchar;
  v_request varchar := 'SUP-P5B31-LINK-TEST';
  v_transition_request varchar := 'SUP-P5B31-TRANSITION-TEST';
  v_investigation varchar := 'SPI-P5B31-LINK-TEST';
  v_transition_investigation varchar := 'SPI-P5B31-TRANSITION-TEST';
  v_ticket varchar;
  v_linked varchar;
  v_link_event_count integer;
  v_rejected boolean := false;
BEGIN
  SELECT e.* INTO v_exception
  FROM poynt_collect_financial_exceptions e
  LEFT JOIN support_payment_investigations i ON i.financial_exception_id=e.financial_exception_id
  WHERE e.provider_outcome='CAPTURED'
    AND e.customer_user_id IS NOT NULL
    AND e.fulfillment_outcome<>'FULFILLED'
    AND e.case_status<>'CLOSED'
    AND i.financial_exception_id IS NULL
  ORDER BY e.opened_at
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'P5-B3.1 STOP: no eligible unlinked verified exception'; END IF;

  SELECT ou.user_id INTO v_admin
  FROM organization_user ou
  WHERE ou.organization_id=v_exception.organization_id
    AND ou.is_deleted=false
    AND can_administer_organization(ou.organization_id,ou.user_id)
  ORDER BY ou.user_id
  LIMIT 1;
  IF v_admin IS NULL THEN RAISE EXCEPTION 'P5-B3.1 STOP: no authorized organization administrator'; END IF;

  v_ticket := 'P5B31-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
  INSERT INTO customer_support_requests(
    support_request_id,organization_id,customer_user_id,ticket_number,category,issue_type,
    support_category_id,support_issue_type_id,subject,description,source,status,priority,created_by,updated_by
  )
  SELECT v_request,v_exception.organization_id,v_exception.customer_user_id,v_ticket,
    c.support_category_code,t.support_issue_type_code,c.support_category_id,t.support_issue_type_id,
    'Synthetic linkage regression','Rollback-only linkage regression.','BUSINESS_ADMIN','OPEN','NORMAL',v_admin,v_admin
  FROM support_categories c
  JOIN support_issue_types t ON t.support_category_id=c.support_category_id
  WHERE c.support_category_code='PAYMENT' AND t.support_issue_type_code='PAYMENT_REVIEW_REQUIRED';

  INSERT INTO support_payment_investigations(
    support_payment_investigation_id,support_request_id,organization_id,source,state,
    escalation_reason,payment_reference,investigation_description,created_by,updated_by
  ) VALUES (
    v_investigation,v_request,v_exception.organization_id,'CUSTOMER_ESCALATION','ADDITIONAL_INFORMATION_REQUIRED',
    'Original escalation reason','ORIGINAL-REFERENCE','Original investigation description',v_admin,v_admin
  );

  v_linked := support_link_payment_exception(v_request,v_exception.organization_id,v_admin,v_exception.financial_exception_id);
  IF v_linked<>v_investigation THEN RAISE EXCEPTION 'P5-B3.1 FAIL: linked wrong investigation'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM support_payment_investigations
    WHERE support_payment_investigation_id=v_investigation
      AND financial_exception_id=v_exception.financial_exception_id
      AND state='EXISTING_EXCEPTION_LINKED'
      AND source='CUSTOMER_ESCALATION'
      AND escalation_reason='Original escalation reason'
      AND payment_reference='ORIGINAL-REFERENCE'
      AND investigation_description='Original investigation description'
      AND created_by=v_admin
  ) THEN RAISE EXCEPTION 'P5-B3.1 FAIL: linking changed investigation provenance'; END IF;

  PERFORM support_link_payment_exception(v_request,v_exception.organization_id,v_admin,v_exception.financial_exception_id);
  SELECT count(*) INTO v_link_event_count
  FROM support_payment_investigation_events
  WHERE support_payment_investigation_id=v_investigation AND event_type='EXCEPTION_LINKED';
  IF v_link_event_count<>1 THEN RAISE EXCEPTION 'P5-B3.1 FAIL: repeated link was not idempotent'; END IF;

  UPDATE support_payment_investigations SET state='NO_EXCEPTION_FOUND' WHERE support_payment_investigation_id=v_investigation;
  BEGIN
    PERFORM support_link_payment_exception(v_request,v_exception.organization_id,v_admin,v_exception.financial_exception_id);
  EXCEPTION WHEN SQLSTATE '22023' THEN v_rejected := true;
  END;
  IF NOT v_rejected THEN RAISE EXCEPTION 'P5-B3.1 FAIL: terminal NO_EXCEPTION_FOUND investigation accepted a link'; END IF;

  v_ticket := 'P5B31-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
  INSERT INTO customer_support_requests(
    support_request_id,organization_id,customer_user_id,ticket_number,category,issue_type,
    support_category_id,support_issue_type_id,subject,description,source,status,priority,created_by,updated_by
  )
  SELECT v_transition_request,v_exception.organization_id,v_exception.customer_user_id,v_ticket,
    c.support_category_code,t.support_issue_type_code,c.support_category_id,t.support_issue_type_id,
    'Synthetic transition regression','Rollback-only transition regression.','BUSINESS_ADMIN','OPEN','NORMAL',v_admin,v_admin
  FROM support_categories c
  JOIN support_issue_types t ON t.support_category_id=c.support_category_id
  WHERE c.support_category_code='PAYMENT' AND t.support_issue_type_code='PAYMENT_REVIEW_REQUIRED';
  INSERT INTO support_payment_investigations(
    support_payment_investigation_id,support_request_id,organization_id,source,state,escalation_reason,created_by,updated_by
  ) VALUES (
    v_transition_investigation,v_transition_request,v_exception.organization_id,
    'CUSTOMER_ESCALATION','ADDITIONAL_INFORMATION_REQUIRED','Transition regression',v_admin,v_admin
  );
  PERFORM support_payment_investigation_transition(v_transition_investigation,v_exception.organization_id,v_admin,'PENDING_INVESTIGATION','Customer supplied requested information.');
  IF (SELECT state FROM support_payment_investigations WHERE support_payment_investigation_id=v_transition_investigation)<>'PENDING_INVESTIGATION' THEN
    RAISE EXCEPTION 'P5-B3.1 FAIL: ADDITIONAL_INFORMATION_REQUIRED -> PENDING_INVESTIGATION was rejected';
  END IF;
END $test$;
ROLLBACK;

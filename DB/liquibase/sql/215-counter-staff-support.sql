-- R2-4B: Counter staff support access is narrower than organization support.
-- Visibility requires both the active Counter context and a persisted customer
-- Commerce transaction at that same store.  Platform-only requests are absent.

ALTER TABLE "${schemaName}".support_issue_types
    ADD COLUMN IF NOT EXISTS counter_staff_closeable boolean NOT NULL DEFAULT false;

ALTER TABLE "${schemaName}".customer_support_messages
    DROP CONSTRAINT IF EXISTS customer_support_messages_author_role_check,
    ADD CONSTRAINT ck_customer_support_messages_author_role
        CHECK (author_role IN ('CUSTOMER', 'ORG_ADMIN', 'PLATFORM_ADMIN', 'COUNTER'));

UPDATE "${schemaName}".support_issue_types
   SET counter_staff_closeable = true
 WHERE support_issue_type_code IN ('LOGIN_ISSUE', 'ACCESS_ISSUE', 'GENERAL_ENQUIRY');

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_request_visible(
    p_request_id varchar, p_organization_id varchar, p_store_id varchar,
    p_staff_id varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id)
    AND EXISTS (
        SELECT 1
        FROM customer_support_requests r
        WHERE r.support_request_id = p_request_id
          AND r.organization_id = p_organization_id
          AND r.support_destination = 'BUSINESS'
          AND EXISTS (
              SELECT 1 FROM commerce_transactions c
              WHERE c.organization_id = r.organization_id
                AND c.store_id = p_store_id
                AND c.customer_user_id = r.customer_user_id
                AND NOT c.is_deleted
          )
    )
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_list(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar,
    p_actor_user_id varchar, p_limit integer, p_offset integer
) RETURNS SETOF customer_support_requests
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
 IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE='42501';
 END IF;
 IF coalesce(p_limit,0) NOT BETWEEN 1 AND 100 OR coalesce(p_offset,-1)<0 THEN
   RAISE EXCEPTION 'Invalid support pagination' USING ERRCODE='22023';
 END IF;
 RETURN QUERY
 SELECT r.* FROM customer_support_requests r
 WHERE r.organization_id=p_organization_id AND r.support_destination='BUSINESS'
   AND EXISTS (SELECT 1 FROM commerce_transactions c WHERE c.organization_id=r.organization_id AND c.store_id=p_store_id AND c.customer_user_id=r.customer_user_id AND NOT c.is_deleted)
 ORDER BY r.updated_at DESC,r.support_request_id LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_detail(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar
) RETURNS customer_support_requests
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT r.* FROM customer_support_requests r
 WHERE r.support_request_id=p_request_id
   AND counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id)
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_messages(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar
) RETURNS SETOF customer_support_messages
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT m.* FROM customer_support_messages m
 WHERE m.support_request_id=p_request_id
   AND counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id)
 ORDER BY m.created_at,m.support_message_id
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_events(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar
) RETURNS SETOF customer_support_events
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT e.* FROM customer_support_events e
 WHERE e.support_request_id=p_request_id
   AND counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id)
 ORDER BY e.created_at,e.event_id
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_payment_investigation(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar
) RETURNS TABLE("investigationId" varchar,"supportRequestId" varchar,"financialExceptionId" varchar,"source" varchar,"state" varchar,"escalationReason" varchar,"paymentReference" varchar,"investigationDescription" varchar,"createdAt" text,"updatedAt" text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT i.support_payment_investigation_id,i.support_request_id,i.financial_exception_id,i.source,i.state,i.escalation_reason,i.payment_reference,i.investigation_description,i.created_at::text,i.updated_at::text FROM support_payment_investigations i
 WHERE i.support_request_id=p_request_id
   AND counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id)
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_payment_exception_summary(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar
) RETURNS TABLE("financialExceptionId" varchar,"commerceTransactionId" varchar,"amountMinor" bigint,"currencyCode" varchar,"caseStatus" varchar,"fulfillmentOutcome" varchar,"openedAt" text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT e.financial_exception_id,e.commerce_transaction_id,e.amount_minor,e.currency_code,e.case_status,e.fulfillment_outcome,e.opened_at::text
 FROM customer_support_requests r
 JOIN poynt_collect_financial_exceptions e
   ON e.organization_id=r.organization_id
  AND EXISTS (
       SELECT 1 FROM commerce_transactions c
       WHERE c.commerce_transaction_id=e.commerce_transaction_id
         AND c.organization_id=r.organization_id
         AND c.customer_user_id=r.customer_user_id
         AND c.store_id=p_store_id
         AND NOT c.is_deleted
  )
 WHERE r.support_request_id=p_request_id
   AND counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id)
 ORDER BY e.opened_at DESC
$function$;

-- Counter staff use only the existing customer-visible Business reply or an
-- internal note.  The role is retained for audit and is not inferred later.
CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_add_message(
    p_message_id varchar,p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,
    p_actor_user_id varchar,p_body varchar,p_internal boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_request customer_support_requests%ROWTYPE;
BEGIN
 IF NOT counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Counter support request is not permitted' USING ERRCODE='42501';
 END IF;
 IF nullif(btrim(p_body),'') IS NULL OR length(p_body)>8000 THEN RAISE EXCEPTION 'Invalid support message' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_request FROM customer_support_requests WHERE support_request_id=p_request_id FOR UPDATE;
 IF v_request.status='CLOSED' THEN RAISE EXCEPTION 'A closed support request cannot receive messages' USING ERRCODE='22023'; END IF;
 INSERT INTO customer_support_messages(support_message_id,support_request_id,organization_id,author_user_id,author_role,message_type,message_body,is_internal)
 VALUES(p_message_id,p_request_id,p_organization_id,p_actor_user_id,'COUNTER',CASE WHEN p_internal THEN 'INTERNAL_NOTE' ELSE 'BUSINESS_REPLY' END,btrim(p_body),p_internal);
 IF NOT p_internal THEN
  INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description)
  VALUES('EVT-SUP-'||md5(p_message_id||':MESSAGE'),p_request_id,p_organization_id,'MESSAGE_ADDED',p_actor_user_id,'COUNTER','Counter support message added.');
  PERFORM support_emit_notification(p_organization_id,v_request.customer_user_id,'SUPPORT_REPLY','Support request updated','There is a new reply on your support request.',p_request_id);
 END IF;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_support_transition(
    p_request_id varchar,p_organization_id varchar,p_store_id varchar,p_staff_id varchar,p_actor_user_id varchar,
    p_status varchar,p_resolution varchar,p_version integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_request customer_support_requests%ROWTYPE; v_closeable boolean;
BEGIN
 IF NOT counter_support_request_visible(p_request_id,p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN RAISE EXCEPTION 'Counter support request is not permitted' USING ERRCODE='42501'; END IF;
 SELECT r INTO v_request FROM customer_support_requests r WHERE r.support_request_id=p_request_id FOR UPDATE;
 SELECT i.counter_staff_closeable INTO v_closeable FROM support_issue_types i WHERE i.support_issue_type_id=v_request.support_issue_type_id;
 IF v_request.version_no<>p_version THEN RAISE EXCEPTION 'Support request was updated by another user' USING ERRCODE='40001'; END IF;
 IF NOT coalesce(v_closeable,false)
    OR EXISTS(SELECT 1 FROM support_payment_investigations pi WHERE pi.support_request_id=p_request_id AND pi.state NOT IN ('RESOLVED','NO_EXCEPTION_FOUND'))
    OR EXISTS(
        SELECT 1
        FROM poynt_collect_financial_exceptions e
        WHERE e.organization_id=v_request.organization_id
          AND e.case_status<>'CLOSED'
          AND e.fulfillment_outcome<>'FULFILLED'
          AND EXISTS (
              SELECT 1 FROM commerce_transactions c
              WHERE c.commerce_transaction_id=e.commerce_transaction_id
                AND c.organization_id=v_request.organization_id
                AND c.customer_user_id=v_request.customer_user_id
                AND c.store_id=p_store_id
                AND NOT c.is_deleted
          )
    )
    OR EXISTS(
        SELECT 1
        FROM commerce_transactions c
        WHERE c.organization_id=v_request.organization_id
          AND c.store_id=p_store_id
          AND c.customer_user_id=v_request.customer_user_id
          AND c.status='PROVIDER_IN_PROGRESS'
          AND NOT c.is_deleted
          AND EXISTS(
              SELECT 1 FROM commerce_provider_payment_attempts a
              WHERE a.commerce_transaction_id=c.commerce_transaction_id
                AND a.payment_channel='REMOTE_TERMINAL'
                AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
          )
    )
 THEN RAISE EXCEPTION 'This request requires administrative review' USING ERRCODE='42501'; END IF;
 IF p_status='RESOLVED' AND v_request.status IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_BUSINESS') AND nullif(btrim(p_resolution),'') IS NOT NULL THEN
   UPDATE customer_support_requests SET status='RESOLVED',resolution_summary=btrim(p_resolution),resolved_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id,version_no=version_no+1 WHERE support_request_id=p_request_id;
 ELSIF p_status='CLOSED' AND v_request.status='RESOLVED' THEN
   UPDATE customer_support_requests SET status='CLOSED',closed_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id,version_no=version_no+1 WHERE support_request_id=p_request_id;
 ELSE RAISE EXCEPTION 'Invalid Counter support status transition' USING ERRCODE='22023'; END IF;
 INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,previous_status,new_status,actor_user_id,actor_role,description)
 VALUES('EVT-SUP-'||md5(p_request_id||':COUNTER:'||clock_timestamp()::text),p_request_id,p_organization_id,'STATUS_CHANGED',v_request.status,p_status,p_actor_user_id,'COUNTER','Counter support status updated.');
 RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_support_request_visible(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_list(varchar,varchar,varchar,varchar,integer,integer),
 "${schemaName}".counter_support_detail(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_messages(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_events(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_payment_investigation(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_payment_exception_summary(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_add_message(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean),
 "${schemaName}".counter_support_transition(varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_support_request_visible(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_list(varchar,varchar,varchar,varchar,integer,integer),
 "${schemaName}".counter_support_detail(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_messages(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_events(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_payment_investigation(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_payment_exception_summary(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".counter_support_add_message(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean),
 "${schemaName}".counter_support_transition(varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer) TO "${appRole}";

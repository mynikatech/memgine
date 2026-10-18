-- Customer closure and one immutable feedback submission. This migration does not alter payment evidence.
CREATE TABLE "${schemaName}".support_request_feedback (
    support_request_feedback_id varchar(64) PRIMARY KEY,
    support_request_id varchar(64) NOT NULL UNIQUE REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    customer_user_id varchar(64) NOT NULL,
    rating varchar(16),
    feedback_comment varchar(1000),
    submitted_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT ck_support_request_feedback_rating CHECK (rating IS NULL OR rating IN ('VERY_BAD','BAD','OKAY','GOOD','VERY_GOOD')),
    CONSTRAINT ck_support_request_feedback_content CHECK (rating IS NOT NULL OR nullif(btrim(feedback_comment),'') IS NOT NULL)
);

CREATE INDEX ix_support_request_feedback_customer ON "${schemaName}".support_request_feedback(customer_user_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".support_closure_blocked_by_payment_investigation(p_request_id varchar)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM support_payment_investigations i
          LEFT JOIN poynt_collect_financial_exceptions e
            ON e.financial_exception_id=i.financial_exception_id
         WHERE i.support_request_id=p_request_id
           AND (
                i.state IN ('PENDING_INVESTIGATION','ADDITIONAL_INFORMATION_REQUIRED','NEW_EXCEPTION_VERIFIED')
                OR (i.financial_exception_id IS NOT NULL AND (e.financial_exception_id IS NULL OR e.fulfillment_outcome <> 'FULFILLED'))
           )
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_close(p_request_id varchar,p_customer_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE r customer_support_requests%ROWTYPE;
BEGIN
    SELECT * INTO r FROM customer_support_requests
     WHERE support_request_id=p_request_id AND customer_user_id=p_customer_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002';
    END IF;
    IF r.status='CLOSED' THEN
        RETURN true;
    END IF;
    IF r.status <> 'RESOLVED' THEN
        RAISE EXCEPTION 'Only a resolved support request can be closed' USING ERRCODE='22023';
    END IF;
    IF support_closure_blocked_by_payment_investigation(p_request_id) THEN
        RAISE EXCEPTION 'Payment investigation must be completed before closing this support request' USING ERRCODE='22023';
    END IF;
    UPDATE customer_support_requests
       SET status='CLOSED', closed_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
           updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), updated_by=p_customer_user_id,
           version_no=version_no+1
     WHERE support_request_id=p_request_id;
    INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,previous_status,new_status,actor_user_id,actor_role,description)
    VALUES ('EVT-SUP-'||md5(p_request_id||':CLOSED'),p_request_id,r.organization_id,'CLOSED','RESOLVED','CLOSED',p_customer_user_id,'CUSTOMER','Customer accepted the resolution and closed this request.')
    ON CONFLICT (event_id) DO NOTHING;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_submit_feedback(p_request_id varchar,p_customer_user_id varchar,p_rating varchar,p_comment varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE r customer_support_requests%ROWTYPE; v_rating varchar; v_comment varchar;
BEGIN
    SELECT * INTO r FROM customer_support_requests
     WHERE support_request_id=p_request_id AND customer_user_id=p_customer_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
    IF r.status <> 'CLOSED' THEN RAISE EXCEPTION 'Feedback can be submitted only after a support request is closed' USING ERRCODE='22023'; END IF;
    v_rating:=nullif(btrim(p_rating),'');
    v_comment:=nullif(btrim(p_comment),'');
    IF v_rating IS NOT NULL AND v_rating NOT IN ('VERY_BAD','BAD','OKAY','GOOD','VERY_GOOD') THEN RAISE EXCEPTION 'Invalid support feedback rating' USING ERRCODE='22023'; END IF;
    IF v_comment IS NOT NULL AND length(v_comment)>1000 THEN RAISE EXCEPTION 'Support feedback is too long' USING ERRCODE='22023'; END IF;
    IF v_rating IS NULL AND v_comment IS NULL THEN RAISE EXCEPTION 'Provide a rating or feedback comment' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM support_request_feedback WHERE support_request_id=p_request_id) THEN RAISE EXCEPTION 'Support feedback has already been submitted' USING ERRCODE='23505'; END IF;
    INSERT INTO support_request_feedback(support_request_feedback_id,support_request_id,customer_user_id,rating,feedback_comment)
    VALUES ('SFB-'||md5(p_request_id),p_request_id,p_customer_user_id,v_rating,v_comment);
    INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description)
    VALUES ('EVT-SUP-'||md5(p_request_id||':FEEDBACK'),p_request_id,r.organization_id,'FEEDBACK_SUBMITTED',p_customer_user_id,'CUSTOMER','Customer feedback submitted.');
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_feedback(p_request_id varchar,p_actor_user_id varchar,p_viewer varchar)
RETURNS TABLE("feedbackId" varchar,"supportRequestId" varchar,"customerUserId" varchar,rating varchar,"feedbackComment" varchar,"submittedAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
    SELECT f.support_request_feedback_id,f.support_request_id,
           CASE WHEN p_viewer='CUSTOMER' THEN NULL ELSE f.customer_user_id END,
           f.rating,f.feedback_comment,f.submitted_at::text
      FROM support_request_feedback f
      JOIN customer_support_requests r ON r.support_request_id=f.support_request_id
     WHERE f.support_request_id=p_request_id
       AND ((p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id)
         OR (p_viewer='ORG_ADMIN' AND can_administer_organization(r.organization_id,p_actor_user_id))
         OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id)));
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_add_message(p_message_id varchar,p_request_id varchar,p_actor_user_id varchar,p_actor_role varchar,p_message_type varchar,p_body varchar,p_internal boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE r customer_support_requests%ROWTYPE;
BEGIN
    SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
    IF p_actor_role='CUSTOMER' AND r.status='CLOSED' THEN RAISE EXCEPTION 'A closed support request cannot receive customer replies' USING ERRCODE='22023'; END IF;
    IF nullif(btrim(p_body),'') IS NULL OR length(p_body)>8000 THEN RAISE EXCEPTION 'Invalid support message' USING ERRCODE='22023'; END IF;
    IF p_actor_role='CUSTOMER' THEN
        IF r.customer_user_id<>p_actor_user_id OR p_internal OR p_message_type<>'CUSTOMER_REPLY' THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
    ELSIF p_actor_role='ORG_ADMIN' THEN
        IF NOT can_administer_organization(r.organization_id,p_actor_user_id) OR p_message_type NOT IN ('BUSINESS_REPLY','INTERNAL_NOTE') OR (p_internal <> (p_message_type='INTERNAL_NOTE')) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
    ELSIF p_actor_role='PLATFORM_ADMIN' THEN
        IF NOT support_is_platform_admin(p_actor_user_id) OR p_message_type NOT IN ('PLATFORM_REPLY','INTERNAL_NOTE','PLATFORM_RECOMMENDATION') OR (p_internal <> (p_message_type IN ('INTERNAL_NOTE','PLATFORM_RECOMMENDATION'))) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
        IF p_message_type='PLATFORM_REPLY' AND NOT EXISTS (SELECT 1 FROM support_issue_types i WHERE i.support_issue_type_id=r.support_issue_type_id AND i.platform_reply_allowed) THEN RAISE EXCEPTION 'Customer-visible platform reply is not permitted for this request' USING ERRCODE='42501'; END IF;
    ELSE RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
    INSERT INTO customer_support_messages VALUES(p_message_id,p_request_id,r.organization_id,p_actor_user_id,p_actor_role,p_message_type,btrim(p_body),p_internal,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'));
    IF NOT p_internal THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description) VALUES ('EVT-SUP-'||md5(p_message_id||':MESSAGE'),p_request_id,r.organization_id,'MESSAGE_ADDED',p_actor_user_id,p_actor_role,'Support message added.'); END IF;
    IF p_actor_role='CUSTOMER' THEN PERFORM support_notify_org_admins(r.organization_id,'SUPPORT_CUSTOMER_REPLY','Customer replied','A customer replied to a support request.',p_request_id);
    ELSIF (p_actor_role='ORG_ADMIN' OR p_actor_role='PLATFORM_ADMIN') AND NOT p_internal THEN PERFORM support_emit_notification(r.organization_id,r.customer_user_id,'SUPPORT_REPLY','Support request updated','There is a new reply on your support request.',p_request_id); END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_admin_update(p_request_id varchar,p_organization_id varchar,p_actor_user_id varchar,p_status varchar,p_priority varchar,p_assigned_to varchar,p_resolution varchar,p_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE r customer_support_requests%ROWTYPE; v_new varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id AND organization_id=p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
    IF r.version_no<>p_version THEN RAISE EXCEPTION 'Support request was updated by another user' USING ERRCODE='40001'; END IF;
    IF r.status='CLOSED' THEN RAISE EXCEPTION 'A closed support request cannot be updated' USING ERRCODE='22023'; END IF;
    v_new:=coalesce(p_status,r.status);
    IF v_new NOT IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_BUSINESS','RESOLVED','CLOSED') OR (r.status='RESOLVED' AND v_new NOT IN ('RESOLVED','CLOSED')) OR (v_new='CLOSED' AND r.status<>'RESOLVED') THEN RAISE EXCEPTION 'Invalid support status transition' USING ERRCODE='22023'; END IF;
    IF r.status='RESOLVED' THEN
        IF (p_priority IS NOT NULL AND p_priority IS DISTINCT FROM r.priority) OR (p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM r.assigned_to_user_id) OR (p_resolution IS NOT NULL AND p_resolution IS DISTINCT FROM r.resolution_summary) THEN RAISE EXCEPTION 'Resolved support request operational fields are locked' USING ERRCODE='22023'; END IF;
        IF v_new='RESOLVED' THEN RAISE EXCEPTION 'Resolved support request has no operational updates' USING ERRCODE='22023'; END IF;
    END IF;
    IF v_new='CLOSED' AND support_closure_blocked_by_payment_investigation(p_request_id) THEN RAISE EXCEPTION 'Payment investigation must be completed before closing this support request' USING ERRCODE='22023'; END IF;
    IF p_priority IS NOT NULL AND p_priority NOT IN ('LOW','NORMAL','HIGH','URGENT') THEN RAISE EXCEPTION 'Invalid support priority' USING ERRCODE='22023'; END IF;
    IF p_assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_user ou WHERE ou.organization_id=p_organization_id AND ou.user_id=p_assigned_to AND NOT ou.is_deleted AND ou.organization_user_status_id='entity-status-org-user-active' AND rbac_has_capability(p_assigned_to,p_organization_id,'ORG_ADMIN_ACCESS')) THEN RAISE EXCEPTION 'Assignee must be an organization administrator' USING ERRCODE='22023'; END IF;
    IF v_new='RESOLVED' AND nullif(btrim(coalesce(p_resolution,r.resolution_summary)),'') IS NULL THEN RAISE EXCEPTION 'Resolution summary is required' USING ERRCODE='22023'; END IF;
    UPDATE customer_support_requests SET status=v_new,priority=coalesce(p_priority,priority),assigned_to_user_id=CASE WHEN p_assigned_to IS NULL THEN assigned_to_user_id ELSE p_assigned_to END,resolution_summary=coalesce(p_resolution,resolution_summary),resolved_at=CASE WHEN v_new='RESOLVED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE resolved_at END,closed_at=CASE WHEN v_new='CLOSED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE closed_at END,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id,version_no=version_no+1 WHERE support_request_id=p_request_id;
    IF p_priority IS NOT NULL AND p_priority<>r.priority THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description) VALUES ('EVT-SUP-'||md5(p_request_id||':PRIORITY:'||clock_timestamp()::text),p_request_id,p_organization_id,'PRIORITY_CHANGED',p_actor_user_id,'ORG_ADMIN','Support priority updated.'); END IF;
    IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM r.assigned_to_user_id THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description) VALUES ('EVT-SUP-'||md5(p_request_id||':ASSIGNMENT:'||clock_timestamp()::text),p_request_id,p_organization_id,'ASSIGNED',p_actor_user_id,'ORG_ADMIN','Support request assigned.'); PERFORM support_emit_notification(p_organization_id,p_assigned_to,'SUPPORT_ASSIGNED','Support request assigned','A support request was assigned to you.',p_request_id); END IF;
    IF v_new<>r.status THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,previous_status,new_status,actor_user_id,actor_role,description) VALUES ('EVT-SUP-'||md5(p_request_id||':STATUS:'||clock_timestamp()::text),p_request_id,p_organization_id,'STATUS_CHANGED',r.status,v_new,p_actor_user_id,'ORG_ADMIN','Support status updated.'); IF v_new='RESOLVED' THEN PERFORM support_emit_notification(p_organization_id,r.customer_user_id,'SUPPORT_RESOLVED','Support request resolved','Your support request has been resolved.',p_request_id); END IF; END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_events(p_request_id varchar,p_actor_user_id varchar,p_viewer varchar)
RETURNS SETOF customer_support_events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT e.event_id,e.support_request_id,e.organization_id,e.event_type,e.previous_status,e.new_status,
        CASE WHEN p_viewer='CUSTOMER' THEN NULL ELSE e.actor_user_id END,
        CASE WHEN p_viewer='CUSTOMER' THEN 'SYSTEM' ELSE e.actor_role END,
        CASE WHEN p_viewer='CUSTOMER' THEN CASE e.event_type WHEN 'CREATED' THEN 'Request submitted.' WHEN 'REOPENED' THEN 'Request reopened.' WHEN 'CLOSED' THEN 'Request closed.' WHEN 'FEEDBACK_SUBMITTED' THEN 'Feedback submitted.' WHEN 'STATUS_CHANGED' THEN 'Request status updated.' WHEN 'MESSAGE_ADDED' THEN 'Support request updated.' ELSE 'Support request updated.' END ELSE e.description END,
        e.created_at
   FROM customer_support_events e JOIN customer_support_requests r ON r.support_request_id=e.support_request_id
  WHERE e.support_request_id=p_request_id AND ((p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id AND e.event_type IN ('CREATED','REOPENED','CLOSED','FEEDBACK_SUBMITTED','STATUS_CHANGED','MESSAGE_ADDED')) OR (p_viewer='ORG_ADMIN' AND can_administer_organization(r.organization_id,p_actor_user_id)) OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id))) ORDER BY e.created_at,e.event_id;
$function$;

REVOKE ALL ON TABLE "${schemaName}".support_request_feedback FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".support_closure_blocked_by_payment_investigation(varchar),"${schemaName}".support_customer_close(varchar,varchar),"${schemaName}".support_customer_submit_feedback(varchar,varchar,varchar,varchar),"${schemaName}".support_feedback(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_customer_close(varchar,varchar),"${schemaName}".support_customer_submit_feedback(varchar,varchar,varchar,varchar),"${schemaName}".support_feedback(varchar,varchar,varchar) TO "${appRole}";

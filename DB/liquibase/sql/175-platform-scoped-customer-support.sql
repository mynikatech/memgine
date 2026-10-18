ALTER TABLE "${schemaName}".customer_support_requests ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE "${schemaName}".customer_support_messages ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE "${schemaName}".customer_support_events ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE "${schemaName}".customer_support_requests ADD COLUMN support_destination varchar(16) NOT NULL DEFAULT 'BUSINESS';
UPDATE "${schemaName}".customer_support_requests SET support_destination='BUSINESS' WHERE support_destination IS NULL;
ALTER TABLE "${schemaName}".customer_support_requests ADD CONSTRAINT ck_customer_support_request_destination CHECK ((support_destination='BUSINESS' AND organization_id IS NOT NULL) OR (support_destination='PLATFORM' AND organization_id IS NULL));
CREATE INDEX ix_customer_support_requests_destination ON "${schemaName}".customer_support_requests(support_destination,updated_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".support_notify_platform_admins(p_type varchar,p_title varchar,p_message varchar,p_request_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_user_id varchar;
BEGIN
 FOR v_user_id IN SELECT DISTINCT pur.user_id FROM platform_user_role pur JOIN "user" u ON u.user_id=pur.user_id JOIN role r ON r.role_id=pur.role_id JOIN role_privileges rp ON rp.role_id=r.role_id JOIN privileges p ON p.privilege_id=rp.privilege_id WHERE NOT pur.is_deleted AND pur.status_id='entity-status-platfrm-user-role-active' AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active' AND pur.effective_from<=CURRENT_TIMESTAMP AND (pur.effective_to IS NULL OR pur.effective_to>CURRENT_TIMESTAMP) AND r.role_status_id='entity-status-role-active' AND p.privilege_code='PLATFORM_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
 LOOP PERFORM support_emit_notification(NULL,v_user_id,p_type,p_title,p_message,p_request_id); END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_create(p_request_id varchar,p_organization_id varchar,p_customer_user_id varchar,p_category varchar,p_issue_type varchar,p_subject varchar,p_description varchar,p_destination varchar)
RETURNS TABLE("supportRequestId" varchar,"ticketNumber" varchar) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_ticket varchar(32); v_category_id varchar(64); v_issue_id varchar(64); v_destination varchar;
BEGIN
 v_destination:=upper(coalesce(nullif(btrim(p_destination),''),'BUSINESS'));
 IF v_destination NOT IN ('BUSINESS','PLATFORM') THEN RAISE EXCEPTION 'Invalid support destination' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(p_subject),'') IS NULL OR length(p_subject)>200 OR nullif(btrim(p_description),'') IS NULL OR length(p_description)>8000 THEN RAISE EXCEPTION 'Invalid support request' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.user_id=p_customer_user_id AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active') THEN RAISE EXCEPTION 'Customer identity is not active' USING ERRCODE='42501'; END IF;
 SELECT c.support_category_id,i.support_issue_type_id INTO v_category_id,v_issue_id FROM support_categories c JOIN support_issue_types i ON i.support_category_id=c.support_category_id WHERE c.support_category_code=p_category AND i.support_issue_type_code=p_issue_type AND c.is_active AND i.is_active;
 IF v_category_id IS NULL THEN RAISE EXCEPTION 'Invalid support category or issue type' USING ERRCODE='22023'; END IF;
 IF v_destination='BUSINESS' THEN
   IF p_organization_id IS NULL OR NOT EXISTS (SELECT 1 FROM discoverable_organizations(p_customer_user_id) d WHERE d.organization_id=p_organization_id) THEN RAISE EXCEPTION 'Organization is not available for customer support' USING ERRCODE='42501'; END IF;
 ELSE
   IF p_organization_id IS NOT NULL OR p_category NOT IN ('ACCOUNT','GENERAL') THEN RAISE EXCEPTION 'Platform support accepts only Account or General requests' USING ERRCODE='22023'; END IF;
 END IF;
 v_ticket:='SUP-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
 INSERT INTO customer_support_requests(support_request_id,organization_id,customer_user_id,ticket_number,category,issue_type,support_category_id,support_issue_type_id,subject,description,source,status,priority,support_destination,created_by,updated_by) VALUES(p_request_id,p_organization_id,p_customer_user_id,v_ticket,p_category,p_issue_type,v_category_id,v_issue_id,btrim(p_subject),btrim(p_description),'CUSTOMER','OPEN','NORMAL',v_destination,p_customer_user_id,p_customer_user_id);
 INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,new_status,actor_user_id,actor_role,description) VALUES('EVT-SUP-'||md5(p_request_id||':OPENED'),p_request_id,p_organization_id,'CREATED','OPEN',p_customer_user_id,'CUSTOMER','Customer support request created.');
 IF v_destination='BUSINESS' THEN PERFORM support_notify_org_admins(p_organization_id,'SUPPORT_REQUEST_CREATED','New support request','A new support request requires review.',p_request_id); ELSE PERFORM support_notify_platform_admins('SUPPORT_PLATFORM_REQUEST_CREATED','New Memgine support request','A customer requested Memgine support.',p_request_id); END IF;
 RETURN QUERY SELECT p_request_id,v_ticket;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_org_list(p_organization_id varchar,p_actor_user_id varchar,p_category varchar,p_status varchar,p_priority varchar,p_limit integer,p_offset integer)
RETURNS SETOF customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE organization_id=p_organization_id AND support_destination='BUSINESS' AND can_administer_organization(p_organization_id,p_actor_user_id) AND (p_category IS NULL OR category=p_category) AND (p_status IS NULL OR status=p_status) AND (p_priority IS NULL OR priority=p_priority) ORDER BY updated_at DESC,support_request_id DESC LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
$f$;
CREATE OR REPLACE FUNCTION "${schemaName}".support_org_detail(p_request_id varchar,p_organization_id varchar,p_actor_user_id varchar)
RETURNS customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_request_id=p_request_id AND organization_id=p_organization_id AND support_destination='BUSINESS' AND can_administer_organization(p_organization_id,p_actor_user_id)
$f$;
CREATE OR REPLACE FUNCTION "${schemaName}".support_platform_list(p_actor_user_id varchar,p_organization_id varchar,p_category varchar,p_status varchar,p_priority varchar,p_destination varchar,p_limit integer,p_offset integer)
RETURNS SETOF customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_is_platform_admin(p_actor_user_id) AND (p_destination IS NULL OR support_destination=p_destination) AND (p_organization_id IS NULL OR organization_id=p_organization_id) AND (p_category IS NULL OR category=p_category) AND (p_status IS NULL OR status=p_status) AND (p_priority IS NULL OR priority=p_priority) ORDER BY updated_at DESC,support_request_id DESC LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_messages(p_request_id varchar,p_actor_user_id varchar,p_viewer varchar)
RETURNS TABLE("supportMessageId" varchar,"supportRequestId" varchar,"organizationId" varchar,"authorUserId" varchar,"authorRole" varchar,"messageType" varchar,"messageBody" text,"isInternal" boolean,"createdAt" timestamp without time zone,"authorName" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT m.support_message_id,m.support_request_id,m.organization_id,m.author_user_id,m.author_role,m.message_type,m.message_body,m.is_internal,m.created_at,CASE WHEN m.is_internal AND p_viewer IN ('ORG_ADMIN','PLATFORM_ADMIN') THEN NULLIF(btrim(concat_ws(' ',u.first_name,u.last_name)),'') ELSE NULL END FROM customer_support_messages m JOIN customer_support_requests r ON r.support_request_id=m.support_request_id LEFT JOIN "user" u ON u.user_id=m.author_user_id WHERE m.support_request_id=p_request_id AND ((p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id AND NOT m.is_internal) OR (p_viewer='ORG_ADMIN' AND r.support_destination='BUSINESS' AND can_administer_organization(r.organization_id,p_actor_user_id)) OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id))) ORDER BY m.created_at,m.support_message_id
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_add_message(p_message_id varchar,p_request_id varchar,p_actor_user_id varchar,p_actor_role varchar,p_message_type varchar,p_body varchar,p_internal boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE;
BEGIN
 SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
 IF p_actor_role='CUSTOMER' AND r.status='CLOSED' THEN RAISE EXCEPTION 'A closed support request cannot receive customer replies' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(p_body),'') IS NULL OR length(p_body)>8000 THEN RAISE EXCEPTION 'Invalid support message' USING ERRCODE='22023'; END IF;
 IF p_actor_role='CUSTOMER' THEN IF r.customer_user_id<>p_actor_user_id OR p_internal OR p_message_type<>'CUSTOMER_REPLY' THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 ELSIF p_actor_role='ORG_ADMIN' THEN IF r.support_destination<>'BUSINESS' OR NOT can_administer_organization(r.organization_id,p_actor_user_id) OR p_message_type NOT IN ('BUSINESS_REPLY','INTERNAL_NOTE') OR (p_internal <> (p_message_type='INTERNAL_NOTE')) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 ELSIF p_actor_role='PLATFORM_ADMIN' THEN IF NOT support_is_platform_admin(p_actor_user_id) OR p_message_type NOT IN ('PLATFORM_REPLY','INTERNAL_NOTE','PLATFORM_RECOMMENDATION') OR (p_internal <> (p_message_type IN ('INTERNAL_NOTE','PLATFORM_RECOMMENDATION'))) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF; IF p_message_type='PLATFORM_REPLY' AND r.support_destination='BUSINESS' AND NOT EXISTS (SELECT 1 FROM support_issue_types i WHERE i.support_issue_type_id=r.support_issue_type_id AND i.platform_reply_allowed) THEN RAISE EXCEPTION 'Customer-visible platform reply is not permitted for this request' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 INSERT INTO customer_support_messages VALUES(p_message_id,p_request_id,r.organization_id,p_actor_user_id,p_actor_role,p_message_type,btrim(p_body),p_internal,(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'));
 IF NOT p_internal THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,actor_user_id,actor_role,description) VALUES('EVT-SUP-'||md5(p_message_id||':MESSAGE'),p_request_id,r.organization_id,'MESSAGE_ADDED',p_actor_user_id,p_actor_role,'Support message added.'); END IF;
 IF p_actor_role='CUSTOMER' THEN IF r.support_destination='BUSINESS' THEN PERFORM support_notify_org_admins(r.organization_id,'SUPPORT_CUSTOMER_REPLY','Customer replied','A customer replied to a support request.',p_request_id); ELSE PERFORM support_notify_platform_admins('SUPPORT_PLATFORM_CUSTOMER_REPLY','Customer replied','A customer replied to a Memgine support request.',p_request_id); END IF;
 ELSIF NOT p_internal THEN PERFORM support_emit_notification(r.organization_id,r.customer_user_id,'SUPPORT_REPLY','Support request updated','There is a new reply on your support request.',p_request_id); END IF;
 RETURN true;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_platform_update(p_request_id varchar,p_actor_user_id varchar,p_status varchar,p_priority varchar,p_resolution varchar,p_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE; v_new varchar;
BEGIN
 IF NOT support_is_platform_admin(p_actor_user_id) THEN RAISE EXCEPTION 'Platform support administration is not permitted' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id AND support_destination='PLATFORM' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Platform support request was not found' USING ERRCODE='P0002'; END IF;
 IF r.version_no<>p_version THEN RAISE EXCEPTION 'Support request was updated by another user' USING ERRCODE='40001'; END IF;
 IF r.status='CLOSED' THEN RAISE EXCEPTION 'A closed support request cannot be updated' USING ERRCODE='22023'; END IF;
 v_new:=coalesce(p_status,r.status); IF v_new NOT IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_BUSINESS','RESOLVED','CLOSED') OR (r.status='RESOLVED' AND v_new NOT IN ('RESOLVED','CLOSED')) OR (v_new='CLOSED' AND r.status<>'RESOLVED') THEN RAISE EXCEPTION 'Invalid support status transition' USING ERRCODE='22023'; END IF;
 IF r.status='RESOLVED' AND ((p_priority IS NOT NULL AND p_priority IS DISTINCT FROM r.priority) OR (p_resolution IS NOT NULL AND p_resolution IS DISTINCT FROM r.resolution_summary) OR v_new='RESOLVED') THEN RAISE EXCEPTION 'Resolved support request operational fields are locked' USING ERRCODE='22023'; END IF;
 IF p_priority IS NOT NULL AND p_priority NOT IN ('LOW','NORMAL','HIGH','URGENT') THEN RAISE EXCEPTION 'Invalid support priority' USING ERRCODE='22023'; END IF;
 IF v_new='RESOLVED' AND nullif(btrim(coalesce(p_resolution,r.resolution_summary)),'') IS NULL THEN RAISE EXCEPTION 'Resolution summary is required' USING ERRCODE='22023'; END IF;
 UPDATE customer_support_requests SET status=v_new,priority=coalesce(p_priority,priority),resolution_summary=coalesce(p_resolution,resolution_summary),resolved_at=CASE WHEN v_new='RESOLVED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE resolved_at END,closed_at=CASE WHEN v_new='CLOSED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE closed_at END,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_actor_user_id,version_no=version_no+1 WHERE support_request_id=p_request_id;
 IF v_new<>r.status THEN INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,previous_status,new_status,actor_user_id,actor_role,description) VALUES('EVT-SUP-'||md5(p_request_id||':PLATFORM_STATUS:'||clock_timestamp()::text),p_request_id,NULL,'STATUS_CHANGED',r.status,v_new,p_actor_user_id,'PLATFORM_ADMIN','Platform support request updated.'); IF v_new='RESOLVED' THEN PERFORM support_emit_notification(NULL,r.customer_user_id,'SUPPORT_RESOLVED','Support request resolved','Your Memgine support request has been resolved.',p_request_id); END IF; END IF;
 RETURN true;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_reopen(p_request_id varchar,p_customer_user_id varchar,p_reason varchar) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE; BEGIN SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id AND customer_user_id=p_customer_user_id FOR UPDATE; IF NOT FOUND OR r.status<>'RESOLVED' THEN RAISE EXCEPTION 'Support request cannot be reopened' USING ERRCODE='22023'; END IF; IF nullif(btrim(p_reason),'') IS NULL OR length(p_reason)>1000 THEN RAISE EXCEPTION 'A reopen reason is required' USING ERRCODE='22023'; END IF; UPDATE customer_support_requests SET status='OPEN',resolution_summary=NULL,resolved_at=NULL,updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),updated_by=p_customer_user_id,version_no=version_no+1 WHERE support_request_id=p_request_id; INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,previous_status,new_status,actor_user_id,actor_role,description) VALUES('EVT-SUP-'||md5(p_request_id||':REOPEN:'||clock_timestamp()::text),p_request_id,r.organization_id,'REOPENED','RESOLVED','OPEN',p_customer_user_id,'CUSTOMER',btrim(p_reason)); IF r.support_destination='BUSINESS' THEN PERFORM support_notify_org_admins(r.organization_id,'SUPPORT_REOPENED','Support request reopened','A customer reopened a support request.',p_request_id); ELSE PERFORM support_notify_platform_admins('SUPPORT_PLATFORM_REOPENED','Memgine support request reopened','A customer reopened a Memgine support request.',p_request_id); END IF; RETURN true; END $f$;

REVOKE ALL ON FUNCTION "${schemaName}".support_notify_platform_admins(varchar,varchar,varchar,varchar),"${schemaName}".support_customer_create(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".support_platform_list(varchar,varchar,varchar,varchar,varchar,varchar,integer,integer),"${schemaName}".support_platform_update(varchar,varchar,varchar,varchar,varchar,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_customer_create(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar),"${schemaName}".support_platform_list(varchar,varchar,varchar,varchar,varchar,varchar,integer,integer),"${schemaName}".support_platform_update(varchar,varchar,varchar,varchar,varchar,integer) TO "${appRole}";

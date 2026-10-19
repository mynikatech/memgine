-- Migration 186: restore published-business eligibility for customer support.
-- No existing membership or organization-customer relationship is required.
-- Corrects the undefined discoverable_organizations(varchar) call introduced in 175.
-- Preserve all other behavior of the eight-argument function (including platform routing).

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
   IF p_organization_id IS NULL OR NOT EXISTS (SELECT 1 FROM get_customer_discoverable_organization(p_organization_id)) THEN RAISE EXCEPTION 'Organization is not available for customer support' USING ERRCODE='42501'; END IF;
 ELSE
   IF p_organization_id IS NOT NULL OR p_category NOT IN ('ACCOUNT','GENERAL') THEN RAISE EXCEPTION 'Platform support accepts only Account or General requests' USING ERRCODE='22023'; END IF;
 END IF;
 v_ticket:='SUP-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
 INSERT INTO customer_support_requests(support_request_id,organization_id,customer_user_id,ticket_number,category,issue_type,support_category_id,support_issue_type_id,subject,description,source,status,priority,support_destination,created_by,updated_by) VALUES(p_request_id,p_organization_id,p_customer_user_id,v_ticket,p_category,p_issue_type,v_category_id,v_issue_id,btrim(p_subject),btrim(p_description),'CUSTOMER','OPEN','NORMAL',v_destination,p_customer_user_id,p_customer_user_id);
 INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,new_status,actor_user_id,actor_role,description) VALUES('EVT-SUP-'||md5(p_request_id||':OPENED'),p_request_id,p_organization_id,'CREATED','OPEN',p_customer_user_id,'CUSTOMER','Customer support request created.');
 IF v_destination='BUSINESS' THEN PERFORM support_notify_org_admins(p_organization_id,'SUPPORT_REQUEST_CREATED','New support request','A new support request requires review.',p_request_id); ELSE PERFORM support_notify_platform_admins('SUPPORT_PLATFORM_REQUEST_CREATED','New Memgine support request','A customer requested Memgine support.',p_request_id); END IF;
 RETURN QUERY SELECT p_request_id,v_ticket;
END $f$;

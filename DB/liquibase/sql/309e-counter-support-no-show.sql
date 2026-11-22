-- 309E: Search order-customer support requests and create no-show Support tickets.
-- Existing 309C/309D migrations remain immutable.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_support_candidates(
  p_org varchar, p_store varchar, p_staff varchar, p_actor varchar, p_order varchar,
  p_search varchar, p_limit integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE v_customer varchar(64); v_query varchar := left(btrim(coalesce(p_search,'')),80);
BEGIN
  IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN
    RAISE EXCEPTION 'Counter access is not permitted' USING ERRCODE='42501';
  END IF;
  SELECT f.customer_user_id INTO v_customer FROM fulfillments f
  JOIN statuses ft ON ft.status_id=f.fulfillment_type_status_id AND ft.status_code='ORDER'
  WHERE f.fulfillment_id=p_order AND f.organization_id=p_org AND f.store_id=p_store;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',x.support_request_id,'ticketNumber',x.ticket_number,'subject',x.subject,
      'category',x.category,'status',x.status,'createdAt',x.created_at) ORDER BY x.updated_at DESC,x.support_request_id DESC),'[]'::jsonb)
    FROM (SELECT r.support_request_id,r.ticket_number,r.subject,r.category,r.status,r.created_at,r.updated_at
          FROM customer_support_requests r
          WHERE r.organization_id=p_org AND r.customer_user_id=v_customer
            AND r.status NOT IN ('RESOLVED','CLOSED')
            AND counter_support_request_visible(r.support_request_id,p_org,p_store,p_staff,p_actor)
            AND (v_query='' OR r.ticket_number ILIKE '%'||v_query||'%' OR r.subject ILIKE '%'||v_query||'%')
          ORDER BY r.updated_at DESC,r.support_request_id DESC
          LIMIT least(greatest(coalesce(p_limit,15),1),30)) x);
END;
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_report_no_show(
  p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,
  p_version integer,p_reason varchar
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
 f fulfillments%ROWTYPE; v_state varchar; v_now timestamp;
 v_category varchar; v_issue varchar; v_support varchar; v_ticket varchar;
 v_reason varchar := btrim(coalesce(p_reason,''));
BEGIN
 IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN
   RAISE EXCEPTION 'Counter access is not permitted' USING ERRCODE='42501';
 END IF;
 IF length(v_reason) NOT BETWEEN 5 AND 500 THEN
   RAISE EXCEPTION 'Enter a reason of 5 to 500 characters' USING ERRCODE='22023';
 END IF;
 SELECT f0.* INTO f FROM fulfillments f0
 JOIN statuses ft ON ft.status_id=f0.fulfillment_type_status_id AND ft.status_code='ORDER'
 WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store
 FOR UPDATE OF f0;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF f.no_show_recorded_at IS NOT NULL THEN
   SELECT a.support_reference_id INTO v_support FROM fulfillment_actions a
   JOIN statuses s ON s.status_id=a.action_type_status_id AND s.status_code='NO_SHOW_RECORDED'
   WHERE a.fulfillment_id=p_order ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1;
   SELECT ticket_number INTO v_ticket FROM customer_support_requests WHERE support_request_id=v_support;
   RETURN jsonb_build_object('code','ALREADY_RECORDED','supportRequestId',v_support,'ticketNumber',v_ticket);
 END IF;
 IF f.version_no IS DISTINCT FROM p_version THEN
   RETURN jsonb_build_object('code','STALE_ORDER');
 END IF;
 SELECT status_code INTO STRICT v_state FROM statuses WHERE status_id=f.fulfillment_status_id;
 v_now := clock_timestamp() AT TIME ZONE 'UTC';
 IF v_state NOT IN ('PLACED','PREPARING','READY') OR f.fulfilled_at IS NOT NULL OR f.cancelled_at IS NOT NULL
   OR f.cancellation_requested_at IS NOT NULL
   OR NOT (f.effective_policy_snapshot @> '{"staffNoShowRecordingEnabled":true}'::jsonb)
   OR f.expected_collection_at IS NULL
   OR v_now < f.expected_collection_at + make_interval(mins=>coalesce((f.effective_policy_snapshot->>'noShowGraceMinutes')::integer,0))
 THEN RETURN jsonb_build_object('code','INVALID_TRANSITION'); END IF;
 SELECT cat.support_category_id,it.support_issue_type_id INTO v_category,v_issue
 FROM support_categories cat JOIN support_issue_types it ON it.support_category_id=cat.support_category_id
 WHERE cat.support_category_code='SERVICE' AND it.support_issue_type_code='OTHER_SERVICE'
   AND cat.is_active AND it.is_active;
 IF v_issue IS NULL THEN RAISE EXCEPTION 'Support issue type is missing' USING ERRCODE='23505'; END IF;
 v_support := generate_runtime_id('SUP');
 v_ticket := 'SUP-'||lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
 INSERT INTO customer_support_requests(support_request_id,organization_id,customer_user_id,ticket_number,
  category,issue_type,support_category_id,support_issue_type_id,subject,description,source,status,
  priority,created_by,updated_by)
 VALUES(v_support,p_org,f.customer_user_id,v_ticket,'SERVICE','OTHER_SERVICE',v_category,v_issue,
  left('No-show reported: '||f.fulfillment_number,200),
  left('Customer did not collect order '||f.fulfillment_number||'. Staff reason: '||v_reason,8000),
  'SYSTEM','OPEN','NORMAL',p_actor,p_actor);
 INSERT INTO customer_support_events(event_id,support_request_id,organization_id,event_type,new_status,
   actor_user_id,actor_role,description)
 VALUES('EVT-SUP-'||md5(v_support||':OPENED'),v_support,p_org,'CREATED','OPEN',p_actor,'SYSTEM',
   'No-show case created from Orders dashboard.');
 UPDATE fulfillments SET no_show_recorded_at=v_now,updated_at=v_now,updated_by=p_actor,
  version_no=version_no+1 WHERE fulfillment_id=p_order;
 INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,
  actor_user_id,prior_fulfillment_status_id,new_fulfillment_status_id,support_reference_id,
  reason,action_details,action_at,created_by)
 VALUES(generate_runtime_id('FAC'),p_order,(SELECT status_id FROM statuses WHERE status_code='NO_SHOW_RECORDED'),
  p_actor,f.fulfillment_status_id,f.fulfillment_status_id,v_support,v_reason,
  jsonb_build_object('staffId',p_staff,'storeId',p_store,'ticketNumber',v_ticket),v_now,p_actor);
 PERFORM support_notify_org_admins(p_org,'SUPPORT_REQUEST_CREATED','Order no-show reported',
  'A new order no-show Support case requires review.',v_support);
 RETURN jsonb_build_object('code','NO_SHOW_RECORDED','supportRequestId',v_support,'ticketNumber',v_ticket);
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_order_support_candidates(varchar,varchar,varchar,varchar,varchar,varchar,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".counter_order_report_no_show(varchar,varchar,varchar,varchar,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_support_candidates(varchar,varchar,varchar,varchar,varchar,varchar,integer) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_order_report_no_show(varchar,varchar,varchar,varchar,varchar,integer,varchar) TO "${appRole}";

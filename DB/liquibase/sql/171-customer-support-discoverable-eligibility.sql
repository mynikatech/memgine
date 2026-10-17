-- A customer may need support before a successful purchase creates an
-- organization_customer relationship. The organization must still be visible
-- through the same published discovery projection used by customer journeys.
CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_create(
    p_request_id varchar, p_organization_id varchar, p_customer_user_id varchar,
    p_category varchar, p_issue_type varchar, p_subject varchar, p_description varchar)
RETURNS TABLE("supportRequestId" varchar, "ticketNumber" varchar)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $f$
DECLARE
    v_ticket varchar(32);
    v_category_id varchar(64);
    v_issue_id varchar(64);
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM "user" u
          JOIN entity_status ues ON ues.entity_status_id = u.user_status_id
          JOIN statuses us ON us.status_id = ues.status_id
         WHERE u.user_id = p_customer_user_id
           AND u.is_deleted = false
           AND us.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Active customer identity is required' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM get_customer_discoverable_organization(p_organization_id)
    ) THEN
        RAISE EXCEPTION 'Organization is not available for customer support' USING ERRCODE = '42501';
    END IF;

    SELECT c.support_category_id, i.support_issue_type_id
      INTO v_category_id, v_issue_id
      FROM support_categories c
      JOIN support_issue_types i ON i.support_category_id = c.support_category_id
     WHERE c.support_category_code = upper(p_category)
       AND c.is_active
       AND i.support_issue_type_code = upper(p_issue_type)
       AND i.is_active;
    IF v_category_id IS NULL THEN
        RAISE EXCEPTION 'Issue type is invalid for category' USING ERRCODE = '22023';
    END IF;
    IF nullif(btrim(p_subject), '') IS NULL OR length(p_subject) > 200
       OR nullif(btrim(p_description), '') IS NULL OR length(p_description) > 8000 THEN
        RAISE EXCEPTION 'Invalid support request text' USING ERRCODE = '22023';
    END IF;

    v_ticket := 'SUP-' || lpad(nextval('customer_support_ticket_number_seq')::text, 6, '0');
    INSERT INTO customer_support_requests(
        support_request_id, organization_id, customer_user_id, ticket_number,
        category, issue_type, support_category_id, support_issue_type_id,
        subject, description, source, status, priority, created_by, updated_by)
    VALUES (
        p_request_id, p_organization_id, p_customer_user_id, v_ticket,
        upper(p_category), upper(p_issue_type), v_category_id, v_issue_id,
        btrim(p_subject), btrim(p_description), 'CUSTOMER', 'OPEN', 'NORMAL',
        p_customer_user_id, p_customer_user_id);
    INSERT INTO customer_support_events(
        event_id, support_request_id, organization_id, event_type, new_status,
        actor_user_id, actor_role, description)
    VALUES (
        'EVT-SUP-' || md5(p_request_id || ':OPENED'), p_request_id,
        p_organization_id, 'CREATED', 'OPEN', p_customer_user_id, 'CUSTOMER',
        'Customer support request created.');
    PERFORM support_notify_org_admins(
        p_organization_id, 'SUPPORT_REQUEST_CREATED', 'New support request',
        'A new support request requires review.', p_request_id);
    RETURN QUERY SELECT p_request_id, v_ticket;
END
$f$;

REVOKE ALL ON FUNCTION "${schemaName}".support_customer_create(varchar, varchar, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_customer_create(varchar, varchar, varchar, varchar, varchar, varchar, varchar) TO "${appRole}";

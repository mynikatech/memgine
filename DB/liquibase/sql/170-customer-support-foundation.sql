-- P5-B1 customer support foundation.  All request, event, and recipient rows are
-- created inside the same database operation; no provider or financial action is implied.

CREATE SEQUENCE IF NOT EXISTS "${schemaName}".customer_support_ticket_number_seq;

CREATE TABLE IF NOT EXISTS "${schemaName}".support_categories (
    support_category_id varchar(64) PRIMARY KEY, support_category_code varchar(32) NOT NULL UNIQUE,
    support_category_name varchar(100) NOT NULL, description varchar(500), display_order integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
        created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        created_by varchar(64), updated_by varchar(64)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".support_issue_types (
    support_issue_type_id varchar(64) PRIMARY KEY,
        support_category_id varchar(64) NOT NULL REFERENCES "${schemaName}".support_categories(support_category_id),
    support_issue_type_code varchar(64) NOT NULL, support_issue_type_name varchar(150) NOT NULL,
        description varchar(500), display_order integer NOT NULL,
    platform_reply_allowed boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
        created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        created_by varchar(64), updated_by varchar(64),
    UNIQUE(support_category_id,support_issue_type_code), UNIQUE(support_category_id,support_issue_type_id)
);

CREATE INDEX IF NOT EXISTS ix_support_issue_types_active ON "${schemaName}".support_issue_types(support_category_id,
    display_order) WHERE is_active;
-- Extend the established singleton reference-data payload; the client cache keeps its existing lifecycle.

CREATE OR REPLACE FUNCTION "${schemaName}".get_reference_data() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = "${schemaName}",
    pg_temp AS $function$
 SELECT jsonb_build_object(
 'languages', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', language_id, 'code', language_code, 'name',
     language_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     language_name) FROM languages WHERE is_active), '[]'::jsonb),
 'organizationTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', organization_type_id, 'code',
     organization_type_code, 'name', organization_type_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, organization_type_name) FROM organization_types WHERE is_active), '[]'::jsonb),
 'organizationUserTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', organization_user_type_id, 'code',
     organization_user_type_code, 'name', organization_user_type_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, organization_user_type_name) FROM organization_user_types WHERE is_active),
     '[]'::jsonb),
 'storeTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', store_type_id, 'code', store_type_code, 'name',
     store_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     store_type_name) FROM store_types WHERE is_active), '[]'::jsonb),
 'productCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', product_category_id, 'code',
     product_category_code, 'name', product_category_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, product_category_name) FROM product_categories WHERE is_active), '[]'::jsonb),
 'productTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', product_type_id, 'code', product_type_code, 'name',
     product_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     product_type_name) FROM product_types WHERE is_active), '[]'::jsonb),
 'benefitCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', benefit_category_id, 'code',
     benefit_category_code, 'name', benefit_category_name, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order, benefit_category_name) FROM benefit_categories WHERE is_active), '[]'::jsonb),
 'benefitTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', benefit_type_id, 'code', benefit_type_code, 'name',
     benefit_type_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     benefit_type_name) FROM benefit_types WHERE is_active), '[]'::jsonb),
 'currencies', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', currency_id, 'code', currency_code, 'name',
     currency_name, 'displayOrder', display_order, 'active', is_active) ORDER BY display_order,
     currency_name) FROM currencies WHERE is_active), '[]'::jsonb),
 'integrationTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', integration_type_id, 'code',
     integration_type_code, 'name', integration_type_name, 'displayOrder', display_sequence, 'active',
     NOT is_deleted) ORDER BY display_sequence, integration_type_name) FROM integration_types WHERE NOT is_deleted),
     '[]'::jsonb),
 'supportCategories', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', support_category_id, 'code',
     support_category_code, 'name', support_category_name, 'description', description, 'displayOrder', display_order,
     'active', is_active) ORDER BY display_order, support_category_name) FROM support_categories WHERE is_active),
     '[]'::jsonb),
 'supportIssueTypes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', i.support_issue_type_id, 'categoryId',
     c.support_category_id, 'categoryCode', c.support_category_code, 'code', i.support_issue_type_code, 'name',
     i.support_issue_type_name, 'description', i.description, 'displayOrder', i.display_order, 'active',
     i.is_active) ORDER BY c.display_order, i.display_order,
     i.support_issue_type_name) FROM support_issue_types i JOIN support_categories c ON c.support_category_id=i.support_category_id WHERE i.is_active AND c.is_active),
     '[]'::jsonb),
 'countries', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', country_id, 'code', country_code, 'name',
     country_name, 'countryCode', country_code, 'callingCode', calling_code, 'displayOrder', display_order, 'active',
     is_active) ORDER BY display_order) FROM countries WHERE is_active AND NOT is_deleted), '[]'::jsonb),
 'regions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.region_id, 'countryCode', c.country_code, 'code',
     r.region_code, 'name', r.region_name) ORDER BY r.display_order,
     r.region_name) FROM regions r JOIN countries c ON c.country_id=r.country_id WHERE r.is_active AND NOT r.is_deleted AND c.is_active AND NOT c.is_deleted),
     '[]'::jsonb),
 'cities', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', ci.city_id, 'countryCode', c.country_code, 'regionCode',
     r.region_code, 'name', ci.city_name) ORDER BY ci.display_order,
     ci.city_name) FROM cities ci JOIN regions r ON r.region_id=ci.region_id JOIN countries c ON c.country_id=r.country_id WHERE ci.is_active AND NOT ci.is_deleted AND r.is_active AND NOT r.is_deleted AND c.is_active AND NOT c.is_deleted),
     '[]'::jsonb)
 );
$function$;

INSERT INTO "${schemaName}".support_categories(support_category_id, support_category_code, support_category_name,
    description, display_order, is_active)
VALUES ('support-category-payment','PAYMENT','Payment','Questions about charges and payments.',10,true),
    ('support-category-membership','MEMBERSHIP','Membership','Questions about memberships and plans.',20,true),
    ('support-category-redemption','REDEMPTION','Redemption','Questions about benefit redemption.',30,true),
    ('support-category-service','SERVICE','Service','Feedback about service or products.',40,true),
    ('support-category-account','ACCOUNT','Account','Help with account access and profile.',50,true),
    ('support-category-general','GENERAL','General','General enquiries and feedback.',60,true)
ON CONFLICT (support_category_id) DO UPDATE SET support_category_name=EXCLUDED.support_category_name,
    description=EXCLUDED.description, display_order=EXCLUDED.display_order, is_active=EXCLUDED.is_active,
    updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

INSERT INTO "${schemaName}".support_issue_types(support_issue_type_id, support_category_id, support_issue_type_code,
    support_issue_type_name, description, display_order, is_active)
VALUES
('support-issue-duplicate-charge', 'support-category-payment', 'DUPLICATE_CHARGE', 'Charged more than once',
    'A payment may have been taken more than once.', 10, true),
    ('support-issue-payment-failed', 'support-category-payment', 'PAYMENT_FAILED', 'Payment failed',
        'A payment could not be completed.', 20, true),
    ('support-issue-payment-not-reflected', 'support-category-payment', 'PAYMENT_NOT_REFLECTED',
        'Payment not reflected', 'A completed payment is not visible.', 30, true),
    ('support-issue-refund-request', 'support-category-payment', 'REFUND_REQUEST', 'Refund request',
        'Request a payment review.', 40, true),
    ('support-issue-other-payment', 'support-category-payment', 'OTHER_PAYMENT', 'Other payment issue',
        'Another payment question.', 50, true),
('support-issue-not-activated', 'support-category-membership', 'NOT_ACTIVATED', 'Membership not activated',
    'A membership is not active.', 10, true),
    ('support-issue-renewal', 'support-category-membership', 'RENEWAL_ISSUE', 'Renewal issue',
        'A membership renewal question.', 20, true),
    ('support-issue-cancellation', 'support-category-membership', 'CANCELLATION', 'Cancellation',
        'A membership cancellation question.', 30, true),
    ('support-issue-plan-query', 'support-category-membership', 'PLAN_QUERY', 'Plan query',
        'A question about a membership plan.', 40, true),
    ('support-issue-other-membership', 'support-category-membership', 'OTHER_MEMBERSHIP', 'Other membership issue',
        'Another membership question.', 50, true),
('support-issue-benefit-not-applied', 'support-category-redemption', 'BENEFIT_NOT_APPLIED', 'Benefit not applied',
    'A benefit did not apply.', 10, true),
    ('support-issue-incorrect-redemption', 'support-category-redemption', 'INCORRECT_REDEMPTION',
        'Benefit deducted incorrectly', 'A benefit was deducted incorrectly.', 20, true),
    ('support-issue-balance', 'support-category-redemption', 'BENEFIT_BALANCE_ISSUE', 'Benefit balance issue',
        'A benefit balance question.', 30, true),
    ('support-issue-other-redemption', 'support-category-redemption', 'OTHER_REDEMPTION', 'Other redemption issue',
        'Another redemption question.', 40, true),
('support-issue-service-complaint', 'support-category-service', 'SERVICE_COMPLAINT', 'Service complaint',
    'A complaint about service.', 10, true),
    ('support-issue-product-quality', 'support-category-service', 'PRODUCT_QUALITY', 'Product quality',
        'Feedback about product quality.', 20, true),
    ('support-issue-staff-experience', 'support-category-service', 'STAFF_EXPERIENCE', 'Staff experience',
        'Feedback about a staff interaction.', 30, true),
    ('support-issue-other-service', 'support-category-service', 'OTHER_SERVICE', 'Other service issue',
        'Another service question.', 40, true),
('support-issue-login','support-category-account','LOGIN_ISSUE','Login issue','Help signing in.',10,true),
    ('support-issue-profile', 'support-category-account', 'PROFILE_UPDATE', 'Profile update',
        'Help updating a profile.', 20, true),
    ('support-issue-access', 'support-category-account', 'ACCESS_ISSUE', 'Access issue', 'Help accessing Memgine.', 30,
        true),
    ('support-issue-other-account', 'support-category-account', 'OTHER_ACCOUNT', 'Other account issue',
        'Another account question.', 40, true),
('support-issue-enquiry', 'support-category-general', 'GENERAL_ENQUIRY', 'General enquiry', 'A general question.', 10,
    true),
    ('support-issue-feedback', 'support-category-general', 'FEEDBACK', 'General feedback',
        'General feedback about Memgine.', 20, true),
    ('support-issue-other','support-category-general','OTHER','Other','Another enquiry.',30,true)
ON CONFLICT (support_category_id,
    support_issue_type_code) DO UPDATE SET support_issue_type_name=EXCLUDED.support_issue_type_name,
    description=EXCLUDED.description, display_order=EXCLUDED.display_order, is_active=EXCLUDED.is_active,
    updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

UPDATE "${schemaName}".support_issue_types SET platform_reply_allowed=(support_issue_type_code IN ('LOGIN_ISSUE',
    'ACCESS_ISSUE', 'GENERAL_ENQUIRY'));

CREATE TABLE IF NOT EXISTS "${schemaName}".customer_support_requests (
    support_request_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    customer_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    ticket_number varchar(32) NOT NULL UNIQUE,
    category varchar(32) NOT NULL,
    issue_type varchar(64) NOT NULL,
    support_category_id varchar(64) NOT NULL REFERENCES "${schemaName}".support_categories(support_category_id),
    support_issue_type_id varchar(64) NOT NULL REFERENCES "${schemaName}".support_issue_types(support_issue_type_id),
    subject varchar(200) NOT NULL,
    description text NOT NULL,
    source varchar(32) NOT NULL DEFAULT 'CUSTOMER' CHECK (source IN ('CUSTOMER','BUSINESS_ADMIN','SYSTEM')),
    status varchar(32) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER',
        'WAITING_FOR_BUSINESS', 'RESOLVED', 'CLOSED')),
    priority varchar(16) NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
    assigned_to_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    resolution_summary varchar(1000),
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    resolved_at timestamp without time zone,
    closed_at timestamp without time zone,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    CHECK (length(btrim(subject)) BETWEEN 1 AND 200),
    CHECK (length(btrim(description)) BETWEEN 1 AND 8000)
);

ALTER TABLE "${schemaName}".customer_support_requests ADD CONSTRAINT fk_customer_support_request_issue_category FOREIGN KEY (support_category_id,
    support_issue_type_id) REFERENCES "${schemaName}".support_issue_types(support_category_id, support_issue_type_id);

CREATE INDEX IF NOT EXISTS ix_customer_support_requests_customer ON "${schemaName}".customer_support_requests(customer_user_id,
    created_at DESC);

CREATE INDEX IF NOT EXISTS ix_customer_support_requests_org ON "${schemaName}".customer_support_requests(organization_id,
    status, updated_at DESC);

CREATE TABLE IF NOT EXISTS "${schemaName}".customer_support_messages (
    support_message_id varchar(64) PRIMARY KEY,
    support_request_id varchar(64) NOT NULL REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    author_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    author_role varchar(32) NOT NULL CHECK (author_role IN ('CUSTOMER','ORG_ADMIN','PLATFORM_ADMIN')),
    message_type varchar(32) NOT NULL CHECK (message_type IN ('CUSTOMER_REPLY', 'BUSINESS_REPLY', 'PLATFORM_REPLY',
        'INTERNAL_NOTE', 'PLATFORM_RECOMMENDATION')),
    message_body text NOT NULL,
    is_internal boolean NOT NULL DEFAULT false,
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CHECK (length(btrim(message_body)) BETWEEN 1 AND 8000),
    CHECK ((is_internal AND message_type IN ('INTERNAL_NOTE',
        'PLATFORM_RECOMMENDATION')) OR (NOT is_internal AND message_type IN ('CUSTOMER_REPLY', 'BUSINESS_REPLY',
        'PLATFORM_REPLY')))
);

CREATE INDEX IF NOT EXISTS ix_customer_support_messages_request ON "${schemaName}".customer_support_messages(support_request_id,
    created_at);

CREATE TABLE IF NOT EXISTS "${schemaName}".customer_support_events (
    event_id varchar(64) PRIMARY KEY,
    support_request_id varchar(64) NOT NULL REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    event_type varchar(64) NOT NULL,
    previous_status varchar(32), new_status varchar(32),
    actor_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    actor_role varchar(32) NOT NULL,
    description varchar(1000) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);

CREATE INDEX IF NOT EXISTS ix_customer_support_events_request ON "${schemaName}".customer_support_events(support_request_id,
    created_at);
-- Keep the established reusable notification table and add portable entity identity.

ALTER TABLE "${schemaName}".notifications ADD COLUMN IF NOT EXISTS related_entity_type varchar(64);

ALTER TABLE "${schemaName}".notifications ADD COLUMN IF NOT EXISTS related_entity_id varchar(64);

CREATE INDEX IF NOT EXISTS ix_notifications_related_entity ON "${schemaName}".notifications(related_entity_type,
    related_entity_id);

CREATE OR REPLACE FUNCTION "${schemaName}".support_valid_issue_type(p_category varchar, p_issue_type varchar)
RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT EXISTS(SELECT 1 FROM support_categories c JOIN support_issue_types i ON i.support_category_id=c.support_category_id
 WHERE c.support_category_code=upper(p_category) AND c.is_active AND i.support_issue_type_code=upper(p_issue_type) AND i.is_active)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_derive_reference_codes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 SELECT c.support_category_code, i.support_issue_type_code INTO NEW.category,
     NEW.issue_type FROM support_categories c JOIN support_issue_types i ON i.support_category_id=c.support_category_id WHERE c.support_category_id=NEW.support_category_id AND i.support_issue_type_id=NEW.support_issue_type_id;
 IF NEW.category IS NULL THEN RAISE EXCEPTION 'Support category and issue type do not match' USING ERRCODE='23503'; END IF;
 RETURN NEW;
END $f$;

CREATE TRIGGER trg_customer_support_request_reference_codes BEFORE INSERT OR UPDATE OF support_category_id,
    support_issue_type_id ON "${schemaName}".customer_support_requests FOR EACH ROW EXECUTE FUNCTION "${schemaName}".support_derive_reference_codes();

CREATE OR REPLACE FUNCTION "${schemaName}".support_is_platform_admin(p_user_id varchar)
RETURNS boolean LANGUAGE sql STABLE AS $f$
 SELECT rbac_has_capability(p_user_id, NULL, 'PLATFORM_ADMIN_ACCESS')
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_emit_notification(p_organization_id varchar,
    p_recipient_user_id varchar, p_type varchar, p_title varchar, p_message varchar, p_request_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $f$
BEGIN
 INSERT INTO notifications(notification_id, organization_id, recipient_user_id, event_type, title, message,
     context_json, related_entity_type, related_entity_id)
 VALUES ('NTF-SUP-' || md5(random()::text || clock_timestamp()::text), p_organization_id, p_recipient_user_id, p_type,
     p_title, p_message,
         jsonb_build_object('supportRequestId', p_request_id), 'CUSTOMER_SUPPORT_REQUEST', p_request_id);
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notify_org_admins(p_organization_id varchar, p_type varchar,
    p_title varchar, p_message varchar, p_request_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $f$
DECLARE v_user_id varchar;
BEGIN
 FOR v_user_id IN SELECT DISTINCT ou.user_id FROM organization_user ou JOIN "user" u ON u.user_id=ou.user_id JOIN organization_user_roles our ON our.organization_user_id=ou.organization_user_id
 JOIN role r ON r.role_id=our.role_id JOIN role_privileges rp ON rp.role_id=our.role_id JOIN privileges p ON p.privilege_id=rp.privilege_id
 WHERE ou.organization_id=p_organization_id AND NOT ou.is_deleted AND ou.organization_user_status_id='entity-status-org-user-active' AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
   AND NOT our.is_deleted AND our.assignment_status_id='entity-status-org-user-role-active' AND our.effective_from<=CURRENT_TIMESTAMP AND (our.effective_to IS NULL OR our.effective_to>CURRENT_TIMESTAMP)
   AND r.role_status_id='entity-status-role-active' AND p.privilege_code='ORG_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
 LOOP PERFORM support_emit_notification(p_organization_id, v_user_id, p_type, p_title, p_message,
     p_request_id); END LOOP;
 FOR v_user_id IN SELECT DISTINCT pur.user_id FROM platform_user_role pur JOIN "user" u ON u.user_id=pur.user_id JOIN role r ON r.role_id=pur.role_id JOIN role_privileges rp ON rp.role_id=pur.role_id JOIN privileges p ON p.privilege_id=rp.privilege_id
 WHERE NOT pur.is_deleted AND pur.status_id='entity-status-platfrm-user-role-active' AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active' AND pur.effective_from<=CURRENT_TIMESTAMP AND (pur.effective_to IS NULL OR pur.effective_to>CURRENT_TIMESTAMP)
   AND r.role_status_id='entity-status-role-active' AND p.privilege_code='PLATFORM_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
 LOOP PERFORM support_emit_notification(p_organization_id, v_user_id, p_type, p_title, p_message,
     p_request_id); END LOOP;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_create(p_request_id varchar, p_organization_id varchar,
    p_customer_user_id varchar, p_category varchar, p_issue_type varchar, p_subject varchar, p_description varchar)
RETURNS TABLE("supportRequestId" varchar,
    "ticketNumber" varchar) LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $f$
DECLARE v_ticket varchar(32); v_category_id varchar(64); v_issue_id varchar(64); BEGIN
 IF NOT customer_has_active_relationship(p_organization_id,
     p_customer_user_id) THEN RAISE EXCEPTION 'Customer relationship is required' USING ERRCODE='42501'; END IF;
 SELECT c.support_category_id, i.support_issue_type_id INTO v_category_id,
     v_issue_id FROM support_categories c JOIN support_issue_types i ON i.support_category_id=c.support_category_id WHERE c.support_category_code=upper(p_category) AND c.is_active AND i.support_issue_type_code=upper(p_issue_type) AND i.is_active;
 IF v_category_id IS NULL THEN RAISE EXCEPTION 'Issue type is invalid for category' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(p_subject), '') IS NULL OR length(p_subject)>200 OR nullif(btrim(p_description),
     '') IS NULL OR length(p_description)>8000 THEN RAISE EXCEPTION 'Invalid support request text' USING ERRCODE='22023'; END IF;
 v_ticket := 'SUP-' || lpad(nextval('customer_support_ticket_number_seq')::text,6,'0');
 INSERT INTO customer_support_requests(support_request_id, organization_id, customer_user_id, ticket_number, category,
     issue_type, support_category_id, support_issue_type_id, subject, description, source, status, priority, created_by,
     updated_by)
 VALUES(p_request_id, p_organization_id, p_customer_user_id, v_ticket, upper(p_category), upper(p_issue_type),
     v_category_id, v_issue_id, btrim(p_subject), btrim(p_description), 'CUSTOMER', 'OPEN', 'NORMAL',
     p_customer_user_id, p_customer_user_id);
 INSERT INTO customer_support_events(event_id, support_request_id, organization_id, event_type, new_status,
     actor_user_id, actor_role, description)
 VALUES('EVT-SUP-'||md5(p_request_id||':OPENED'), p_request_id, p_organization_id, 'CREATED', 'OPEN',
     p_customer_user_id, 'CUSTOMER', 'Customer support request created.');
 PERFORM support_notify_org_admins(p_organization_id, 'SUPPORT_REQUEST_CREATED', 'New support request',
     'A new support request requires review.', p_request_id);
 RETURN QUERY SELECT p_request_id,v_ticket; END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_list(p_customer_user_id varchar, p_limit integer,
    p_offset integer)
RETURNS SETOF customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE customer_user_id=p_customer_user_id ORDER BY updated_at DESC,
     support_request_id DESC LIMIT least(greatest(coalesce(p_limit, 50), 1), 100) OFFSET greatest(coalesce(p_offset, 0),
     0)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_org_list(p_organization_id varchar, p_actor_user_id varchar,
    p_category varchar, p_status varchar, p_priority varchar, p_limit integer, p_offset integer)
RETURNS SETOF customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE organization_id=p_organization_id AND can_administer_organization(p_organization_id,
     p_actor_user_id)
 AND (p_category IS NULL OR category=p_category) AND (p_status IS NULL OR status=p_status) AND (p_priority IS NULL OR priority=p_priority)
 ORDER BY created_at DESC, support_request_id DESC LIMIT least(greatest(coalesce(p_limit, 50), 1),
     100) OFFSET greatest(coalesce(p_offset, 0), 0)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_platform_list(p_actor_user_id varchar, p_organization_id varchar,
    p_category varchar, p_status varchar, p_priority varchar, p_limit integer, p_offset integer)
RETURNS SETOF customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_is_platform_admin(p_actor_user_id) AND (p_organization_id IS NULL OR organization_id=p_organization_id)
 AND (p_category IS NULL OR category=p_category) AND (p_status IS NULL OR status=p_status) AND (p_priority IS NULL OR priority=p_priority)
 ORDER BY created_at DESC LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_detail(p_request_id varchar,p_customer_user_id varchar)
RETURNS customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_request_id=p_request_id AND customer_user_id=p_customer_user_id
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_org_detail(p_request_id varchar, p_organization_id varchar,
    p_actor_user_id varchar)
RETURNS customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_request_id=p_request_id AND organization_id=p_organization_id AND can_administer_organization(p_organization_id,
     p_actor_user_id)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_platform_detail(p_request_id varchar,p_actor_user_id varchar)
RETURNS customer_support_requests LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT * FROM customer_support_requests WHERE support_request_id=p_request_id AND support_is_platform_admin(p_actor_user_id)
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_messages(p_request_id varchar, p_actor_user_id varchar,
    p_viewer varchar)
RETURNS SETOF customer_support_messages LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT m.* FROM customer_support_messages m JOIN customer_support_requests r ON r.support_request_id=m.support_request_id
 WHERE m.support_request_id=p_request_id AND ((p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id AND NOT m.is_internal) OR (p_viewer='ORG_ADMIN' AND can_administer_organization(r.organization_id,
     p_actor_user_id)) OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id))) ORDER BY m.created_at,
     m.support_message_id
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_events(p_request_id varchar, p_actor_user_id varchar,
    p_viewer varchar)
RETURNS SETOF customer_support_events LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,
    "${schemaName}" AS $f$
 SELECT e.event_id,e.support_request_id,e.organization_id,e.event_type,e.previous_status,e.new_status,
        CASE WHEN p_viewer='CUSTOMER' THEN NULL ELSE e.actor_user_id END,
        CASE WHEN p_viewer='CUSTOMER' THEN 'SYSTEM' ELSE e.actor_role END,
        CASE WHEN p_viewer='CUSTOMER' THEN CASE e.event_type WHEN 'CREATED' THEN 'Request submitted.' WHEN 'REOPENED' THEN 'Request reopened.' WHEN 'STATUS_CHANGED' THEN 'Request status updated.' WHEN 'MESSAGE_ADDED' THEN 'Support request updated.' ELSE 'Support request updated.' END ELSE e.description END,

        e.created_at
 FROM customer_support_events e JOIN customer_support_requests r ON r.support_request_id=e.support_request_id
 WHERE e.support_request_id=p_request_id AND ((p_viewer='CUSTOMER' AND r.customer_user_id=p_actor_user_id AND e.event_type IN ('CREATED',
     'REOPENED', 'STATUS_CHANGED',
     'MESSAGE_ADDED')) OR (p_viewer='ORG_ADMIN' AND can_administer_organization(r.organization_id,
     p_actor_user_id)) OR (p_viewer='PLATFORM_ADMIN' AND support_is_platform_admin(p_actor_user_id))) ORDER BY e.created_at,
     e.event_id
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_add_message(p_message_id varchar, p_request_id varchar,
    p_actor_user_id varchar, p_actor_role varchar, p_message_type varchar, p_body varchar, p_internal boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE; BEGIN SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF;
 IF nullif(btrim(p_body),
     '') IS NULL OR length(p_body)>8000 THEN RAISE EXCEPTION 'Invalid support message' USING ERRCODE='22023'; END IF;
 IF p_actor_role='CUSTOMER' THEN IF r.customer_user_id<>p_actor_user_id OR p_internal OR p_message_type<>'CUSTOMER_REPLY' THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 ELSIF p_actor_role='ORG_ADMIN' THEN IF NOT can_administer_organization(r.organization_id,
     p_actor_user_id) OR p_message_type NOT IN ('BUSINESS_REPLY',
     'INTERNAL_NOTE') OR (p_internal <> (p_message_type='INTERNAL_NOTE')) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 ELSIF p_actor_role='PLATFORM_ADMIN' THEN
   IF NOT support_is_platform_admin(p_actor_user_id) OR p_message_type NOT IN ('PLATFORM_REPLY', 'INTERNAL_NOTE',
       'PLATFORM_RECOMMENDATION') OR (p_internal <> (p_message_type IN ('INTERNAL_NOTE',
       'PLATFORM_RECOMMENDATION'))) THEN RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
   IF p_message_type='PLATFORM_REPLY' AND NOT EXISTS (SELECT 1 FROM support_issue_types i WHERE i.support_issue_type_id=r.support_issue_type_id AND i.platform_reply_allowed) THEN RAISE EXCEPTION 'Customer-visible platform reply is not permitted for this request' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'Support message is not permitted' USING ERRCODE='42501'; END IF;
 INSERT INTO customer_support_messages VALUES(p_message_id, p_request_id, r.organization_id, p_actor_user_id,
     p_actor_role, p_message_type, btrim(p_body), p_internal, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'));
 IF NOT p_internal THEN INSERT INTO customer_support_events(event_id, support_request_id, organization_id, event_type,
     actor_user_id, actor_role, description) VALUES('EVT-SUP-'||md5(p_message_id||':MESSAGE'), p_request_id,
     r.organization_id, 'MESSAGE_ADDED', p_actor_user_id, p_actor_role, 'Support message added.'); END IF;
 IF p_actor_role='CUSTOMER' THEN
   PERFORM support_notify_org_admins(r.organization_id, 'SUPPORT_CUSTOMER_REPLY', 'Customer replied',
       'A customer replied to a support request.', p_request_id);
 ELSIF (p_actor_role='ORG_ADMIN' OR p_actor_role='PLATFORM_ADMIN') AND NOT p_internal THEN
   PERFORM support_emit_notification(r.organization_id, r.customer_user_id, 'SUPPORT_REPLY', 'Support request updated',
       'There is a new reply on your support request.', p_request_id);
 END IF;
 RETURN true; END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_customer_reopen(p_request_id varchar, p_customer_user_id varchar,
    p_reason varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE; BEGIN SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id AND customer_user_id=p_customer_user_id FOR UPDATE; IF NOT FOUND OR r.status<>'RESOLVED' THEN RAISE EXCEPTION 'Support request cannot be reopened' USING ERRCODE='22023'; END IF;
 IF nullif(btrim(p_reason),
     '') IS NULL OR length(p_reason)>1000 THEN RAISE EXCEPTION 'A reopen reason is required' USING ERRCODE='22023'; END IF;
 UPDATE customer_support_requests SET status='OPEN', resolution_summary=NULL, resolved_at=NULL,
     updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), updated_by=p_customer_user_id,
     version_no=version_no+1 WHERE support_request_id=p_request_id;
 INSERT INTO customer_support_events(event_id, support_request_id, organization_id, event_type, previous_status,
     new_status, actor_user_id, actor_role,
     description) VALUES('EVT-SUP-'||md5(p_request_id||':REOPEN:'||clock_timestamp()::text), p_request_id,
     r.organization_id, 'REOPENED', 'RESOLVED', 'OPEN', p_customer_user_id, 'CUSTOMER', btrim(p_reason));
 PERFORM support_notify_org_admins(r.organization_id, 'SUPPORT_REOPENED', 'Support request reopened',
     'A customer reopened a support request.', p_request_id); RETURN true; END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_admin_update(p_request_id varchar, p_organization_id varchar,
    p_actor_user_id varchar, p_status varchar, p_priority varchar, p_assigned_to varchar, p_resolution varchar,
    p_version integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE r customer_support_requests%ROWTYPE; v_new varchar; BEGIN IF NOT can_administer_organization(p_organization_id,
    p_actor_user_id) THEN RAISE EXCEPTION 'Support administration is not permitted' USING ERRCODE='42501'; END IF; SELECT * INTO r FROM customer_support_requests WHERE support_request_id=p_request_id AND organization_id=p_organization_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Support request was not found' USING ERRCODE='P0002'; END IF; IF r.version_no<>p_version THEN RAISE EXCEPTION 'Support request was updated by another user' USING ERRCODE='40001'; END IF;
 v_new:=coalesce(p_status,r.status);
 IF v_new NOT IN ('OPEN','IN_PROGRESS','WAITING_FOR_CUSTOMER','WAITING_FOR_BUSINESS','RESOLVED','CLOSED')
    OR (r.status='CLOSED')
    OR (r.status='RESOLVED' AND v_new NOT IN ('RESOLVED','CLOSED'))
    OR (v_new='CLOSED' AND r.status<>'RESOLVED') THEN
   RAISE EXCEPTION 'Invalid support status transition' USING ERRCODE='22023';
 END IF;
 IF p_priority IS NOT NULL AND p_priority NOT IN ('LOW', 'NORMAL', 'HIGH',
     'URGENT') THEN RAISE EXCEPTION 'Invalid support priority' USING ERRCODE='22023'; END IF;
 IF p_assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organization_user ou WHERE ou.organization_id=p_organization_id AND ou.user_id=p_assigned_to AND NOT ou.is_deleted AND ou.organization_user_status_id='entity-status-org-user-active' AND rbac_has_capability(p_assigned_to,
     p_organization_id,
     'ORG_ADMIN_ACCESS')) THEN RAISE EXCEPTION 'Assignee must be an organization administrator' USING ERRCODE='22023'; END IF;
 IF v_new='RESOLVED' AND nullif(btrim(coalesce(p_resolution, r.resolution_summary)),
     '') IS NULL THEN RAISE EXCEPTION 'Resolution summary is required' USING ERRCODE='22023'; END IF;
 UPDATE customer_support_requests SET status=v_new, priority=coalesce(p_priority, priority),
     assigned_to_user_id=CASE WHEN p_assigned_to IS NULL THEN assigned_to_user_id ELSE p_assigned_to END,
     resolution_summary=coalesce(p_resolution, resolution_summary),
     resolved_at=CASE WHEN v_new='RESOLVED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE resolved_at END,
     closed_at=CASE WHEN v_new='CLOSED' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ELSE closed_at END,
     updated_at=(CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), updated_by=p_actor_user_id,
     version_no=version_no+1 WHERE support_request_id=p_request_id;
 IF p_priority IS NOT NULL AND p_priority<>r.priority THEN INSERT INTO customer_support_events(event_id,
     support_request_id, organization_id, event_type, actor_user_id, actor_role,
     description) VALUES('EVT-SUP-'||md5(p_request_id||':PRIORITY:'||clock_timestamp()::text), p_request_id,
     p_organization_id, 'PRIORITY_CHANGED', p_actor_user_id, 'ORG_ADMIN', 'Support priority updated.'); END IF;
 IF p_assigned_to IS NOT NULL AND p_assigned_to IS DISTINCT FROM r.assigned_to_user_id THEN
   INSERT INTO customer_support_events(event_id, support_request_id, organization_id, event_type, actor_user_id,
       actor_role, description) VALUES('EVT-SUP-'||md5(p_request_id||':ASSIGNMENT:'||clock_timestamp()::text),
       p_request_id, p_organization_id, 'ASSIGNED', p_actor_user_id, 'ORG_ADMIN', 'Support request assigned.');
   PERFORM support_emit_notification(p_organization_id, p_assigned_to, 'SUPPORT_ASSIGNED', 'Support request assigned',
       'A support request was assigned to you.', p_request_id);
 END IF;
 IF v_new<>r.status THEN INSERT INTO customer_support_events(event_id, support_request_id, organization_id, event_type,
     previous_status, new_status, actor_user_id, actor_role,
     description) VALUES('EVT-SUP-'||md5(p_request_id||':STATUS:'||clock_timestamp()::text), p_request_id,
     p_organization_id, 'STATUS_CHANGED', r.status, v_new, p_actor_user_id, 'ORG_ADMIN',
     'Support status updated.'); IF v_new='RESOLVED' THEN PERFORM support_emit_notification(p_organization_id,
     r.customer_user_id, 'SUPPORT_RESOLVED', 'Support request resolved', 'Your support request has been resolved.',
     p_request_id); END IF; END IF; RETURN true; END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_my_notifications(p_recipient_user_id varchar, p_limit integer,
    p_offset integer)
RETURNS TABLE(id varchar, "organizationId" varchar, "eventType" varchar, title varchar, message text, context jsonb,
    "createdAt" text, "readAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT notification_id, organization_id, event_type, title, message, context_json, created_at::text,
     read_at::text FROM notifications
 WHERE recipient_user_id=p_recipient_user_id ORDER BY created_at DESC,notification_id DESC
 LIMIT least(greatest(coalesce(p_limit,50),1),100) OFFSET greatest(coalesce(p_offset,0),0)
$f$;

REVOKE ALL ON TABLE "${schemaName}".customer_support_requests, "${schemaName}".customer_support_messages,
    "${schemaName}".customer_support_events FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".support_valid_issue_type(varchar, varchar),
    "${schemaName}".support_is_platform_admin(varchar), "${schemaName}".support_emit_notification(varchar, varchar,
    varchar, varchar, varchar, varchar), "${schemaName}".support_notify_org_admins(varchar, varchar, varchar, varchar,
    varchar), "${schemaName}".support_derive_reference_codes() FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".support_customer_create(varchar, varchar, varchar, varchar, varchar, varchar,
    varchar), "${schemaName}".support_customer_list(varchar, integer, integer),
    "${schemaName}".support_org_list(varchar, varchar, varchar, varchar, varchar, integer, integer),
    "${schemaName}".support_platform_list(varchar, varchar, varchar, varchar, varchar, integer, integer),
    "${schemaName}".support_customer_detail(varchar, varchar), "${schemaName}".support_org_detail(varchar, varchar,
    varchar), "${schemaName}".support_platform_detail(varchar, varchar), "${schemaName}".support_messages(varchar,
    varchar, varchar), "${schemaName}".support_events(varchar, varchar, varchar),
    "${schemaName}".support_add_message(varchar, varchar, varchar, varchar, varchar, varchar, boolean),
    "${schemaName}".support_customer_reopen(varchar, varchar, varchar), "${schemaName}".support_admin_update(varchar,
    varchar, varchar, varchar, varchar, varchar, varchar, integer), "${schemaName}".get_my_notifications(varchar,
    integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".support_customer_create(varchar, varchar, varchar, varchar, varchar, varchar,
    varchar), "${schemaName}".support_customer_list(varchar, integer, integer),
    "${schemaName}".support_org_list(varchar, varchar, varchar, varchar, varchar, integer, integer),
    "${schemaName}".support_platform_list(varchar, varchar, varchar, varchar, varchar, integer, integer),
    "${schemaName}".support_customer_detail(varchar, varchar), "${schemaName}".support_org_detail(varchar, varchar,
    varchar), "${schemaName}".support_platform_detail(varchar, varchar), "${schemaName}".support_messages(varchar,
    varchar, varchar), "${schemaName}".support_events(varchar, varchar, varchar),
    "${schemaName}".support_add_message(varchar, varchar, varchar, varchar, varchar, varchar, boolean),
    "${schemaName}".support_customer_reopen(varchar, varchar, varchar), "${schemaName}".support_admin_update(varchar,
    varchar, varchar, varchar, varchar, varchar, varchar, integer), "${schemaName}".get_my_notifications(varchar,
    integer, integer) TO "${appRole}";

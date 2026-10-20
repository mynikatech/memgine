CREATE TABLE IF NOT EXISTS "${schemaName}".support_notification_outbox (
    outbox_event_id varchar(64) PRIMARY KEY,
    source_event_id varchar(64) NOT NULL UNIQUE REFERENCES "${schemaName}".customer_support_events(event_id),
    support_request_id varchar(64) NOT NULL REFERENCES "${schemaName}".customer_support_requests(support_request_id),
    organization_id varchar(64) REFERENCES "${schemaName}".organization(organization_id),
    event_type varchar(64) NOT NULL,
    actor_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    payload jsonb NOT NULL,
    processing_state varchar(32) NOT NULL DEFAULT 'CREATED' CHECK (processing_state IN ('CREATED','LEASED','PROCESSED','FAILED')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_expires_at timestamptz,
    lease_token varchar(64),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_support_notification_outbox_claim ON "${schemaName}".support_notification_outbox(processing_state,next_attempt_at);
CREATE INDEX IF NOT EXISTS ix_support_notification_outbox_lease ON "${schemaName}".support_notification_outbox(lease_expires_at) WHERE processing_state='LEASED';

CREATE TABLE IF NOT EXISTS "${schemaName}".support_notification_deliveries (
    delivery_id varchar(64) PRIMARY KEY,
    outbox_event_id varchar(64) NOT NULL REFERENCES "${schemaName}".support_notification_outbox(outbox_event_id),
    recipient_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    channel varchar(16) NOT NULL CHECK (channel IN ('IN_APP','WHATSAPP','EMAIL')),
    delivery_mode varchar(16) NOT NULL CHECK (delivery_mode IN ('MOCK','LIVE')),
    template_name varchar(128), destination_reference varchar(256), status varchar(32) NOT NULL DEFAULT 'CREATED',
    publish_state varchar(32) NOT NULL DEFAULT 'PENDING' CHECK (publish_state IN ('PENDING','PUBLISHING','PUBLISHED','PUBLISH_UNKNOWN','MOCKED','FAILED')),
    publish_lease_token varchar(64), publish_lease_expires_at timestamptz, publish_attempt_count integer NOT NULL DEFAULT 0,
    template_parameters jsonb, sns_message_id varchar(160), published_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0, provider_message_id varchar(160), provider_correlation_id varchar(160),
    last_error_classification varchar(80), created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
    UNIQUE(outbox_event_id,recipient_user_id,channel)
);
CREATE INDEX IF NOT EXISTS ix_support_delivery_publish ON "${schemaName}".support_notification_deliveries(publish_state, publish_lease_expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_support_delivery_provider_message ON "${schemaName}".support_notification_deliveries(provider_message_id) WHERE provider_message_id IS NOT NULL;

-- Per-user support delivery policy. DEFAULT inherits the environment default;
-- explicit LIVE is permitted in DEV only by the independent server-side gate.
-- Consent is deliberately distinct from the transport test override.
CREATE TABLE IF NOT EXISTS "${schemaName}".support_notification_user_settings (
    user_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}"."user"(user_id),
    delivery_mode varchar(16) NOT NULL DEFAULT 'DEFAULT' CHECK (delivery_mode IN ('DEFAULT','MOCK','LIVE')),
    whatsapp_opted_in boolean NOT NULL DEFAULT false,
    email_opted_in boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "${schemaName}".whatsapp_message_status_events (
    status_event_id varchar(64) PRIMARY KEY, delivery_id varchar(64) REFERENCES "${schemaName}".support_notification_deliveries(delivery_id),
    meta_message_id varchar(160) NOT NULL, meta_status varchar(32) NOT NULL, provider_timestamp timestamptz,
    error_classification varchar(80), received_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP, fingerprint varchar(128) NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_whatsapp_status_events_message ON "${schemaName}".whatsapp_message_status_events(meta_message_id);

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_enqueue_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_type varchar(64);
BEGIN
 v_type := CASE
   WHEN NEW.event_type='CREATED' THEN 'SUPPORT_REQUEST_CREATED'
   WHEN NEW.event_type='MESSAGE_ADDED' AND NEW.actor_role='CUSTOMER' THEN 'SUPPORT_CUSTOMER_REPLY'
   WHEN NEW.event_type='MESSAGE_ADDED' AND NEW.actor_role='ORG_ADMIN' THEN 'SUPPORT_BUSINESS_REPLY'
   WHEN NEW.event_type='MESSAGE_ADDED' AND NEW.actor_role='PLATFORM_ADMIN' THEN 'SUPPORT_PLATFORM_REPLY'
   WHEN NEW.event_type='REOPENED' THEN 'SUPPORT_REQUEST_REOPENED'
   WHEN NEW.event_type='STATUS_CHANGED' AND NEW.new_status='RESOLVED' THEN 'SUPPORT_REQUEST_RESOLVED'
   WHEN NEW.event_type='STATUS_CHANGED' AND NEW.new_status='CLOSED' THEN 'SUPPORT_REQUEST_CLOSED'
 END;
 IF v_type IS NOT NULL THEN
   INSERT INTO support_notification_outbox(outbox_event_id,source_event_id,support_request_id,organization_id,event_type,actor_user_id,payload)
   VALUES('SNO-'||md5(NEW.event_id),NEW.event_id,NEW.support_request_id,NEW.organization_id,v_type,NEW.actor_user_id,jsonb_build_object('ticketEventId',NEW.event_id)) ON CONFLICT(source_event_id) DO NOTHING;
 END IF;
 RETURN NEW;
END;$f$;
CREATE TRIGGER tr_support_notification_enqueue AFTER INSERT ON "${schemaName}".customer_support_events FOR EACH ROW EXECUTE FUNCTION "${schemaName}".support_notification_enqueue_event();

-- The application worker receives a lease rather than a permanently claimed row.  A
-- process crash therefore makes the row available again after the bounded lease.
CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_claim_outbox(
    p_worker_id varchar,
    p_limit integer
)
RETURNS TABLE(
    "outboxEventId" varchar,
    "supportRequestId" varchar,
    "organizationId" varchar,
    "eventType" varchar,
    "payload" jsonb,
    "attemptCount" integer,
    "leaseToken" varchar
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
    IF nullif(btrim(p_worker_id),'') IS NULL THEN
        RAISE EXCEPTION 'Worker identity is required' USING ERRCODE='22023';
    END IF;
    RETURN QUERY
    WITH candidates AS (
        SELECT o.outbox_event_id
        FROM support_notification_outbox o
        WHERE (o.processing_state IN ('CREATED','FAILED') AND o.next_attempt_at <= CURRENT_TIMESTAMP)
           OR (o.processing_state='LEASED' AND o.lease_expires_at <= CURRENT_TIMESTAMP)
        ORDER BY o.created_at, o.outbox_event_id
        FOR UPDATE SKIP LOCKED
        LIMIT least(greatest(coalesce(p_limit, 10),1),100)
    ), claimed AS (
        UPDATE support_notification_outbox o
        SET processing_state='LEASED', attempt_count=o.attempt_count+1,
            lease_expires_at=CURRENT_TIMESTAMP + interval '5 minutes',
            lease_token='SNL-'||md5(random()::text||clock_timestamp()::text||o.outbox_event_id)
        FROM candidates c
        WHERE o.outbox_event_id=c.outbox_event_id
        RETURNING o.*
    )
    SELECT c.outbox_event_id,c.support_request_id,c.organization_id,c.event_type,c.payload,c.attempt_count,c.lease_token
    FROM claimed c;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_complete_outbox(
    p_outbox_event_id varchar,
    p_success boolean,
    p_retry_at timestamptz,
    p_lease_token varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
    UPDATE support_notification_outbox
    SET processing_state=CASE WHEN p_success THEN 'PROCESSED' ELSE 'FAILED' END,
        processed_at=CASE WHEN p_success THEN CURRENT_TIMESTAMP ELSE NULL END,
        lease_expires_at=NULL, lease_token=NULL,
        next_attempt_at=CASE WHEN p_success THEN next_attempt_at ELSE coalesce(p_retry_at, CURRENT_TIMESTAMP + interval '5 minutes') END
    WHERE outbox_event_id=p_outbox_event_id AND processing_state='LEASED'
      AND lease_token=p_lease_token AND lease_expires_at>CURRENT_TIMESTAMP
      AND (NOT p_success OR NOT EXISTS (
          SELECT 1 FROM support_notification_deliveries d
          WHERE d.outbox_event_id=p_outbox_event_id AND d.publish_state IN ('PENDING','PUBLISHING')
      ));
    RETURN FOUND;
END $f$;

-- This resolver deliberately mirrors the final support destination rules.  It is
-- used only for external delivery; in-app notifications remain owned by the
-- existing support SQL and are never re-emitted by the worker.
CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_recipients(p_outbox_event_id varchar)
RETURNS TABLE(
    "recipientUserId" varchar,
    "email" varchar,
    "phone" varchar,
    "isCustomer" boolean,
    "recipientName" varchar,
    "recipientKind" varchar,
    "ticketNumber" varchar,
    "organizationName" varchar,
    "recipientDeliveryMode" varchar,
    "whatsappOptedIn" boolean,
    "emailOptedIn" boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
WITH item AS (
    SELECT o.event_type,r.support_destination,r.organization_id,r.customer_user_id,o.actor_user_id,r.ticket_number
    FROM support_notification_outbox o
    JOIN customer_support_requests r ON r.support_request_id=o.support_request_id
    WHERE o.outbox_event_id=p_outbox_event_id
), recipients AS (
    SELECT i.customer_user_id AS user_id, true AS is_customer
    FROM item i
    WHERE i.event_type IN ('SUPPORT_BUSINESS_REPLY','SUPPORT_PLATFORM_REPLY','SUPPORT_REQUEST_RESOLVED','SUPPORT_REQUEST_CLOSED')
    UNION
    SELECT DISTINCT ou.user_id, false
    FROM item i
    JOIN organization_user ou ON ou.organization_id=i.organization_id
    JOIN organization_user_roles our ON our.organization_user_id=ou.organization_user_id
    JOIN role r ON r.role_id=our.role_id
    JOIN role_privileges rp ON rp.role_id=r.role_id
    JOIN privileges p ON p.privilege_id=rp.privilege_id
    WHERE i.support_destination='BUSINESS'
      AND i.event_type IN ('SUPPORT_REQUEST_CREATED','SUPPORT_CUSTOMER_REPLY','SUPPORT_REQUEST_REOPENED')
      AND NOT ou.is_deleted AND ou.organization_user_status_id='entity-status-org-user-active'
      AND NOT our.is_deleted AND our.assignment_status_id='entity-status-org-user-role-active'
      AND our.effective_from<=CURRENT_TIMESTAMP AND (our.effective_to IS NULL OR our.effective_to>CURRENT_TIMESTAMP)
      AND r.role_status_id='entity-status-role-active'
      AND p.privilege_code='ORG_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
    UNION
    SELECT DISTINCT pur.user_id, false
    FROM item i
    JOIN platform_user_role pur ON true
    JOIN role r ON r.role_id=pur.role_id
    JOIN role_privileges rp ON rp.role_id=r.role_id
    JOIN privileges p ON p.privilege_id=rp.privilege_id
    WHERE i.support_destination='PLATFORM'
      AND i.event_type IN ('SUPPORT_REQUEST_CREATED','SUPPORT_CUSTOMER_REPLY','SUPPORT_REQUEST_REOPENED')
      AND NOT pur.is_deleted AND r.role_status_id='entity-status-role-active' AND pur.status_id='entity-status-platfrm-user-role-active'
      AND pur.effective_from<=CURRENT_TIMESTAMP AND (pur.effective_to IS NULL OR pur.effective_to>CURRENT_TIMESTAMP)
      AND r.role_status_id='entity-status-role-active'
      AND p.privilege_code='PLATFORM_ADMIN_ACCESS' AND p.privilege_status_id='entity-status-privilege-active'
)
SELECT DISTINCT r.user_id,u.primary_email,u.primary_phone,r.is_customer,
  coalesce(nullif(btrim(u.display_name),''),nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Memgine user')::varchar,
  CASE WHEN r.is_customer THEN 'CUSTOMER' WHEN i.support_destination='PLATFORM' THEN 'PLATFORM_ADMIN' ELSE 'BUSINESS_ADMIN' END::varchar,
  i.ticket_number,
  coalesce(nullif(btrim(org.organization_name),''),'Memgine Support')::varchar,
  coalesce(pref.delivery_mode,'DEFAULT')::varchar,
  coalesce(pref.whatsapp_opted_in,false),coalesce(pref.email_opted_in,false)
FROM recipients r JOIN "user" u ON u.user_id=r.user_id CROSS JOIN item i
LEFT JOIN organization org ON org.organization_id=i.organization_id
LEFT JOIN support_notification_user_settings pref ON pref.user_id=r.user_id
WHERE NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
 AND r.user_id IS DISTINCT FROM i.actor_user_id
$f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_create_delivery(
    p_delivery_id varchar,
    p_outbox_event_id varchar,
    p_recipient_user_id varchar,
    p_channel varchar,
    p_delivery_mode varchar,
    p_destination_reference varchar,
    p_template_name varchar,
    p_template_parameters jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
    IF p_channel NOT IN ('WHATSAPP','EMAIL') OR p_delivery_mode NOT IN ('MOCK','LIVE')
       OR (p_channel='WHATSAPP' AND (p_template_name IS NULL OR coalesce(jsonb_typeof(p_template_parameters),'')<>'array')) THEN
        RAISE EXCEPTION 'Invalid support notification delivery' USING ERRCODE='22023';
    END IF;
    INSERT INTO support_notification_deliveries(delivery_id,outbox_event_id,recipient_user_id,channel,delivery_mode,destination_reference,template_name,template_parameters)
    VALUES(p_delivery_id,p_outbox_event_id,p_recipient_user_id,p_channel,p_delivery_mode,p_destination_reference,p_template_name,p_template_parameters)
    ON CONFLICT(outbox_event_id,recipient_user_id,channel) DO NOTHING;
    IF p_delivery_mode='MOCK' THEN
      UPDATE support_notification_deliveries SET publish_state='MOCKED',status='MOCKED'
      WHERE outbox_event_id=p_outbox_event_id AND recipient_user_id=p_recipient_user_id
        AND channel=p_channel AND delivery_mode='MOCK' AND publish_state='PENDING';
    END IF;
    RETURN true;
END $f$;


CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_delivery_snapshot(p_delivery_id varchar)
RETURNS TABLE("deliveryId" varchar,"destination" varchar,"templateName" varchar,"templateParametersJson" text,"channel" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT d.delivery_id,d.destination_reference,d.template_name,d.template_parameters::text,d.channel
 FROM support_notification_deliveries d WHERE d.delivery_id=p_delivery_id
$f$;

-- N3-D: publishing is separate from provider status. A stale PUBLISHING lease
-- cannot be safely replayed because SNS may have accepted the publish.
CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_claim_delivery_publish(
 p_outbox_event_id varchar,p_recipient_user_id varchar,p_channel varchar,p_lease_token varchar,p_outbox_lease_token varchar)
RETURNS TABLE("deliveryId" varchar,"publishState" varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 IF nullif(btrim(p_lease_token),'') IS NULL THEN RAISE EXCEPTION 'Missing publish lease token' USING ERRCODE='22023'; END IF;
 UPDATE support_notification_deliveries d
 SET publish_state='PUBLISH_UNKNOWN',publish_lease_token=NULL,publish_lease_expires_at=NULL,updated_at=CURRENT_TIMESTAMP
 WHERE d.outbox_event_id=p_outbox_event_id AND d.recipient_user_id=p_recipient_user_id AND d.channel=p_channel
   AND d.publish_state='PUBLISHING' AND d.publish_lease_expires_at<=CURRENT_TIMESTAMP;
 RETURN QUERY
 UPDATE support_notification_deliveries d
 SET publish_state='PUBLISHING',publish_lease_token=p_lease_token,
     publish_lease_expires_at=CURRENT_TIMESTAMP + interval '5 minutes',
     publish_attempt_count=publish_attempt_count+1,updated_at=CURRENT_TIMESTAMP
 WHERE d.outbox_event_id=p_outbox_event_id AND d.recipient_user_id=p_recipient_user_id AND d.channel=p_channel
   AND d.delivery_mode='LIVE' AND d.publish_state='PENDING'
   AND EXISTS (SELECT 1 FROM support_notification_outbox o WHERE o.outbox_event_id=d.outbox_event_id
         AND o.processing_state='LEASED' AND o.lease_token=p_outbox_lease_token AND o.lease_expires_at>CURRENT_TIMESTAMP)
 RETURNING d.delivery_id,d.publish_state;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_finish_delivery_publish(
 p_delivery_id varchar,p_lease_token varchar,p_confirmed boolean,p_sns_message_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
 UPDATE support_notification_deliveries SET
 publish_state=CASE WHEN p_confirmed THEN 'PUBLISHED' ELSE 'PUBLISH_UNKNOWN' END,
 sns_message_id=CASE WHEN p_confirmed THEN p_sns_message_id ELSE sns_message_id END,
 publish_lease_token=NULL,publish_lease_expires_at=NULL,
 published_at=CASE WHEN p_confirmed THEN CURRENT_TIMESTAMP ELSE published_at END,
 updated_at=CURRENT_TIMESTAMP
 WHERE delivery_id=p_delivery_id AND publish_state='PUBLISHING'
  AND publish_lease_token=p_lease_token AND publish_lease_expires_at>CURRENT_TIMESTAMP;
 RETURN FOUND;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_ack_delivery(
    p_delivery_id varchar,
    p_provider_message_id varchar,
    p_provider_correlation_id varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_existing varchar;
BEGIN
    SELECT provider_message_id INTO v_existing FROM support_notification_deliveries
    WHERE delivery_id=p_delivery_id AND channel='WHATSAPP' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Support delivery was not found' USING ERRCODE='P0002'; END IF;
    IF v_existing IS NOT NULL AND v_existing<>p_provider_message_id THEN
        RAISE EXCEPTION 'Support delivery provider reference conflicts' USING ERRCODE='22023';
    END IF;
    UPDATE support_notification_deliveries
    SET provider_message_id=coalesce(provider_message_id,p_provider_message_id),
        provider_correlation_id=coalesce(provider_correlation_id,p_provider_correlation_id),
        status=CASE WHEN status IN ('CREATED','SUBMITTED') THEN 'SENT' ELSE status END,
        sent_at=coalesce(sent_at,CURRENT_TIMESTAMP), updated_at=CURRENT_TIMESTAMP
    WHERE delivery_id=p_delivery_id;
    UPDATE whatsapp_message_status_events
    SET delivery_id=p_delivery_id
    WHERE delivery_id IS NULL AND meta_message_id=p_provider_message_id;
    UPDATE support_notification_deliveries d
    SET status=CASE
      WHEN EXISTS(SELECT 1 FROM whatsapp_message_status_events e WHERE e.delivery_id=p_delivery_id AND e.meta_status='read') THEN 'READ'
      WHEN EXISTS(SELECT 1 FROM whatsapp_message_status_events e WHERE e.delivery_id=p_delivery_id AND e.meta_status='delivered') THEN CASE WHEN d.status='READ' THEN d.status ELSE 'DELIVERED' END
      WHEN EXISTS(SELECT 1 FROM whatsapp_message_status_events e WHERE e.delivery_id=p_delivery_id AND e.meta_status='failed') THEN CASE WHEN d.status IN ('READ','DELIVERED') THEN d.status ELSE 'FAILED' END
      ELSE d.status END,
      read_at=CASE WHEN EXISTS(SELECT 1 FROM whatsapp_message_status_events e WHERE e.delivery_id=p_delivery_id AND e.meta_status='read') THEN coalesce(d.read_at,CURRENT_TIMESTAMP) ELSE d.read_at END,
      delivered_at=CASE WHEN EXISTS(SELECT 1 FROM whatsapp_message_status_events e WHERE e.delivery_id=p_delivery_id AND e.meta_status='delivered') THEN coalesce(d.delivered_at,CURRENT_TIMESTAMP) ELSE d.delivered_at END,
      updated_at=CURRENT_TIMESTAMP
    WHERE d.delivery_id=p_delivery_id;
    RETURN true;
END $f$;

CREATE OR REPLACE FUNCTION "${schemaName}".support_notification_record_whatsapp_status(
    p_status_event_id varchar,
    p_meta_message_id varchar,
    p_meta_status varchar,
    p_provider_timestamp timestamptz,
    p_error_classification varchar,
    p_fingerprint varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE v_delivery_id varchar; v_current varchar;
BEGIN
    IF p_meta_status NOT IN ('sent','delivered','read','failed') OR nullif(btrim(p_meta_message_id),'') IS NULL THEN
        RAISE EXCEPTION 'Invalid WhatsApp status event' USING ERRCODE='22023';
    END IF;
    SELECT delivery_id,status INTO v_delivery_id,v_current
    FROM support_notification_deliveries
    WHERE channel='WHATSAPP' AND provider_message_id=p_meta_message_id FOR UPDATE;
    INSERT INTO whatsapp_message_status_events(status_event_id,delivery_id,meta_message_id,meta_status,provider_timestamp,error_classification,fingerprint)
    VALUES(p_status_event_id,v_delivery_id,p_meta_message_id,p_meta_status,p_provider_timestamp,p_error_classification,p_fingerprint)
    ON CONFLICT(fingerprint) DO NOTHING;
    IF NOT FOUND THEN RETURN false; END IF;
    IF v_delivery_id IS NOT NULL THEN
        UPDATE support_notification_deliveries
        SET status=CASE
            WHEN status='READ' THEN status
            WHEN p_meta_status='read' THEN 'READ'
            WHEN p_meta_status='delivered' AND status IN ('CREATED','SENT','SUBMITTED') THEN 'DELIVERED'
            WHEN p_meta_status='sent' AND status='CREATED' THEN 'SENT'
            WHEN p_meta_status='failed' AND status IN ('CREATED','SENT','SUBMITTED') THEN 'FAILED'
            ELSE status END,
            delivered_at=CASE WHEN p_meta_status='delivered' THEN coalesce(delivered_at,CURRENT_TIMESTAMP) ELSE delivered_at END,
            read_at=CASE WHEN p_meta_status='read' THEN coalesce(read_at,CURRENT_TIMESTAMP) ELSE read_at END,
            failed_at=CASE WHEN p_meta_status='failed' AND status IN ('CREATED','SENT','SUBMITTED') THEN coalesce(failed_at,CURRENT_TIMESTAMP) ELSE failed_at END,
            last_error_classification=CASE WHEN p_meta_status='failed' THEN coalesce(p_error_classification,last_error_classification) ELSE last_error_classification END,
            updated_at=CURRENT_TIMESTAMP
        WHERE delivery_id=v_delivery_id;
    END IF;
    RETURN true;
END $f$;

REVOKE ALL ON FUNCTION "${schemaName}".support_notification_enqueue_event(),
    "${schemaName}".support_notification_claim_outbox(varchar,integer),
    "${schemaName}".support_notification_complete_outbox(varchar,boolean,timestamptz,varchar),
    "${schemaName}".support_notification_recipients(varchar),
    "${schemaName}".support_notification_create_delivery(varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb),
    "${schemaName}".support_notification_delivery_snapshot(varchar),
    "${schemaName}".support_notification_claim_delivery_publish(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".support_notification_finish_delivery_publish(varchar,varchar,boolean,varchar),
    "${schemaName}".support_notification_ack_delivery(varchar,varchar,varchar),
    "${schemaName}".support_notification_record_whatsapp_status(varchar,varchar,varchar,timestamptz,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".support_notification_claim_outbox(varchar,integer),
    "${schemaName}".support_notification_complete_outbox(varchar,boolean,timestamptz,varchar),
    "${schemaName}".support_notification_recipients(varchar),
    "${schemaName}".support_notification_create_delivery(varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb),
    "${schemaName}".support_notification_delivery_snapshot(varchar),
    "${schemaName}".support_notification_claim_delivery_publish(varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".support_notification_finish_delivery_publish(varchar,varchar,boolean,varchar),
    "${schemaName}".support_notification_ack_delivery(varchar,varchar,varchar),
    "${schemaName}".support_notification_record_whatsapp_status(varchar,varchar,varchar,timestamptz,varchar,varchar) TO "${appRole}";
REVOKE ALL ON TABLE "${schemaName}".support_notification_outbox,"${schemaName}".support_notification_deliveries,"${schemaName}".whatsapp_message_status_events FROM PUBLIC,"${appRole}";

-- Phase 330 is an unapplied draft. Reuse shared reference status codes and
-- associate them with generic notification categories. No test data is seeded.
DO $notification_reference_seed$
DECLARE row_data record; type_id varchar; status_key varchar;
BEGIN
 FOR row_data IN SELECT * FROM (VALUES
   ('NOTIFICATION_COMPONENT','FULFILLMENT','Fulfillment'),
   ('NOTIFICATION_CATEGORY','TRANSACTIONAL','Transactional'),
   ('NOTIFICATION_CATEGORY','AUTHENTICATION','Authentication'),
   ('NOTIFICATION_CATEGORY','MARKETING','Marketing'),
   ('NOTIFICATION_SOURCE_TYPE','FULFILLMENT_ACTION','Fulfillment action'),
   ('NOTIFICATION_RECIPIENT_POLICY','CUSTOMER','Customer'),
   ('NOTIFICATION_CONSENT_SCOPE','ORDER_UPDATES','Order updates'),
   ('NOTIFICATION_CHANNEL','IN_APP','In-app'),
   ('NOTIFICATION_CHANNEL','WHATSAPP','WhatsApp'),
   ('NOTIFICATION_DELIVERY_STATE','PREPARED','Prepared'),
   ('NOTIFICATION_DELIVERY_STATE','CLAIMED','Claimed'),
   ('NOTIFICATION_DELIVERY_STATE','PUBLISHED','Published'),
   ('NOTIFICATION_DELIVERY_STATE','AMBIGUOUS','Ambiguous'),
   ('NOTIFICATION_DELIVERY_STATE','ACCEPTED','Accepted'),
   ('NOTIFICATION_DELIVERY_STATE','DELIVERED','Delivered'),
   ('NOTIFICATION_DELIVERY_STATE','READ','Read'),
   ('NOTIFICATION_DELIVERY_STATE','FAILED','Failed'),
   ('NOTIFICATION_DELIVERY_STATE','SUPPRESSED','Suppressed'),
   ('NOTIFICATION_DELIVERY_STATE','MOCKED','Mocked')
 ) AS v(category,code,label)
 LOOP
   INSERT INTO "${schemaName}".entity_type(entity_type_id,entity_type_code,entity_type_name,display_order)
   SELECT 'ENTITY_TYPE_'||md5(row_data.category),row_data.category,replace(initcap(lower(row_data.category)),'_',' '),330
   WHERE NOT EXISTS(SELECT 1 FROM "${schemaName}".entity_type WHERE entity_type_code=row_data.category);
   SELECT entity_type_id INTO STRICT type_id FROM "${schemaName}".entity_type WHERE entity_type_code=row_data.category;
   INSERT INTO "${schemaName}".statuses(status_id,status_code,status_name,description,display_order)
   SELECT 'STATUS_'||md5(row_data.code),row_data.code,row_data.label,row_data.label,330
   WHERE NOT EXISTS(SELECT 1 FROM "${schemaName}".statuses WHERE status_code=row_data.code);
   SELECT status_id INTO STRICT status_key FROM "${schemaName}".statuses WHERE status_code=row_data.code;
   INSERT INTO "${schemaName}".entity_status(entity_status_id,entity_type_id,status_id,display_order,system_managed)
   SELECT 'ENTITY_STATUS_'||md5(row_data.category||':'||row_data.code),type_id,status_key,330,true
   WHERE NOT EXISTS(SELECT 1 FROM "${schemaName}".entity_status WHERE entity_type_id=type_id AND status_id=status_key);
 END LOOP;
END $notification_reference_seed$;

-- Generic definitions are separate from organization channel settings and
-- the existing Support-scoped consent. All new delivery is disabled by default.
CREATE TABLE IF NOT EXISTS "${schemaName}".notification_event_definitions (
    component_code varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    event_code varchar(100) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    source_type varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    category varchar(32) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    recipient_policy varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    consent_scope varchar(64) REFERENCES "${schemaName}".statuses(status_code),
    source_action_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
    source_target_status_code varchar(64),
    allowed_parameters text[] NOT NULL DEFAULT ARRAY[]::text[],
    supported boolean NOT NULL DEFAULT false, enabled boolean NOT NULL DEFAULT false,
    PRIMARY KEY (component_code,event_code)
);
CREATE TABLE IF NOT EXISTS "${schemaName}".notification_channel_templates (
    component_code varchar(64) NOT NULL, event_code varchar(100) NOT NULL,
    channel varchar(16) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    language_code varchar(16) NOT NULL, title text NOT NULL, message text NOT NULL,
    provider_template varchar(128), parameter_names text[] NOT NULL DEFAULT '{}',
    enabled boolean NOT NULL DEFAULT false, provider_approved boolean NOT NULL DEFAULT false,
    PRIMARY KEY (component_code,event_code,channel,language_code),
    FOREIGN KEY (component_code,event_code) REFERENCES "${schemaName}".notification_event_definitions(component_code,event_code)
);
CREATE TABLE IF NOT EXISTS "${schemaName}".notification_scoped_preferences (
    user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    scope_code varchar(64) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    channel varchar(16) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    enabled boolean NOT NULL DEFAULT false, consent_granted_at timestamptz,
    consent_account_version integer,
    consent_withdrawn_at timestamptz, updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id,scope_code,channel)
);
CREATE TABLE IF NOT EXISTS "${schemaName}".notification_events (
    event_id varchar(64) PRIMARY KEY, component_code varchar(64) NOT NULL, event_code varchar(100) NOT NULL,
    source_type varchar(64) NOT NULL, source_id varchar(64) NOT NULL, source_action_id varchar(64) NOT NULL,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    recipient_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    event_parameters jsonb NOT NULL DEFAULT '{}'::jsonb, navigation_context jsonb,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (component_code,event_code) REFERENCES "${schemaName}".notification_event_definitions(component_code,event_code),
    UNIQUE(component_code,event_code,source_type,source_id,source_action_id,recipient_user_id)
);
CREATE TABLE IF NOT EXISTS "${schemaName}".notification_channel_deliveries (
    delivery_id varchar(64) PRIMARY KEY, event_id varchar(64) NOT NULL REFERENCES "${schemaName}".notification_events(event_id),
    channel varchar(16) NOT NULL REFERENCES "${schemaName}".statuses(status_code),
    status varchar(32) NOT NULL DEFAULT 'PREPARED' REFERENCES "${schemaName}".statuses(status_code),
    language_code varchar(16) NOT NULL, recipient_account_version integer,
    claim_token uuid, submission_id varchar(160), provider_message_id varchar(160), provider_correlation_id varchar(160),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id,channel), UNIQUE(provider_message_id)
);
REVOKE ALL ON TABLE "${schemaName}".notification_event_definitions,
    "${schemaName}".notification_channel_templates,"${schemaName}".notification_scoped_preferences,
    "${schemaName}".notification_events,"${schemaName}".notification_channel_deliveries
FROM PUBLIC, "${appRole}";

-- Seed only existing fulfillment reference values; support is not asserted
-- until the corresponding lifecycle producer is implemented and reviewed.
INSERT INTO "${schemaName}".notification_event_definitions(component_code,event_code,source_type,category,recipient_policy,consent_scope)
SELECT 'FULFILLMENT', statuses.status_code, 'FULFILLMENT_ACTION', 'TRANSACTIONAL', 'CUSTOMER', 'ORDER_UPDATES'
FROM "${schemaName}".entity_type entity_type
JOIN "${schemaName}".entity_status entity_status ON entity_status.entity_type_id=entity_type.entity_type_id
JOIN "${schemaName}".statuses statuses ON statuses.status_id=entity_status.status_id
WHERE entity_type.entity_type_code='FULFILLMENT_NOTIFICATION_EVENT'
ON CONFLICT (component_code,event_code) DO NOTHING;

INSERT INTO "${schemaName}".notification_channel_templates(
    component_code,event_code,channel,language_code,title,message,provider_template,parameter_names)
SELECT definition.component_code,definition.event_code,channels.code,'en',content.title,content.message,
    CASE WHEN channels.code='WHATSAPP' THEN content.provider_template END,
    CASE WHEN channels.code='WHATSAPP' THEN ARRAY['customerName','organizationName','referenceNumber','storeName'] || content.extra_parameters
         ELSE ARRAY[]::text[] END
FROM "${schemaName}".notification_event_definitions definition
JOIN (VALUES
    ('FULFILLMENT_PLACED','Order placed','Your order {referenceNumber} from {organizationName} was placed at {storeName}.','memgine_order_placed',ARRAY[]::text[]),
    ('FULFILLMENT_PREPARING','We are preparing your order','Your order {referenceNumber} from {organizationName} is being prepared at {storeName}.','memgine_order_preparing',ARRAY[]::text[]),
    ('FULFILLMENT_READY','Your order is ready','Your order {referenceNumber} from {organizationName} is ready for collection at {storeName}.','memgine_order_ready',ARRAY[]::text[]),
    ('FULFILLMENT_COLLECTION_REVISED','Collection time updated','Collect order {referenceNumber} from {organizationName} at {storeName} on {revisedCollectionTime}.','memgine_order_collection_revised',ARRAY['revisedCollectionTime']),
    ('FULFILLMENT_COMPLETED','Order collected','Your order {referenceNumber} from {organizationName} was collected at {storeName}.','memgine_order_completed',ARRAY[]::text[]),
    ('FULFILLMENT_CANCELLED','Order cancelled','Your order {referenceNumber} from {organizationName} at {storeName} was cancelled.','memgine_order_cancelled',ARRAY[]::text[])
) content(event_code,title,message,provider_template,extra_parameters) ON content.event_code=definition.event_code
CROSS JOIN (VALUES ('IN_APP'),('WHATSAPP')) channels(code)
WHERE definition.component_code='FULFILLMENT'
ON CONFLICT (component_code,event_code,channel,language_code) DO NOTHING;

-- Enable in-app templates for implemented fulfillment events.
-- Actual delivery is controlled by Organization and Store policies.
UPDATE "${schemaName}".notification_channel_templates
SET enabled=true
WHERE component_code='FULFILLMENT'
  AND channel='IN_APP'
  AND event_code IN (
      'FULFILLMENT_PLACED',
      'FULFILLMENT_PREPARING',
      'FULFILLMENT_READY',
      'FULFILLMENT_COLLECTION_REVISED',
      'FULFILLMENT_COMPLETED',
      'FULFILLMENT_CANCELLED'
  );


CREATE OR REPLACE FUNCTION "${schemaName}".resolve_notification_configuration(p_component varchar,p_event varchar,p_channel varchar,p_language varchar)
RETURNS TABLE(title text,message text,provider_template varchar,parameter_names text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
 SELECT template.title,template.message,template.provider_template,template.parameter_names
 FROM notification_event_definitions definition JOIN notification_channel_templates template
   ON template.component_code=definition.component_code AND template.event_code=definition.event_code
 WHERE definition.component_code=p_component AND definition.event_code=p_event AND definition.supported AND definition.enabled
   AND template.channel=p_channel AND template.language_code=p_language AND template.enabled
   AND (p_channel<>'WHATSAPP' OR (template.provider_approved AND nullif(btrim(template.provider_template),'') IS NOT NULL))
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".resolve_notification_configuration(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".resolve_notification_configuration(varchar,varchar,varchar,varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".set_notification_scoped_preference(
    p_user varchar,p_scope varchar,p_channel varchar,p_enabled boolean,p_consent boolean,p_expected_account_version integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE account_version integer;
BEGIN
    IF p_enabled IS NULL OR p_consent IS NULL OR p_channel IS NULL OR p_channel NOT IN ('IN_APP','WHATSAPP')
       OR NOT EXISTS (SELECT 1 FROM notification_event_definitions definition WHERE definition.consent_scope=p_scope
           AND (NOT p_consent OR definition.supported)) THEN
        RETURN false;
    END IF;
    SELECT account.version_no INTO account_version FROM "user" account
    WHERE account.user_id=p_user AND NOT account.is_deleted
      AND account.user_status_id='entity-status-user-active'
      AND (NOT p_consent OR p_channel<>'WHATSAPP' OR (account.version_no=p_expected_account_version
           AND account.primary_phone ~ '^[+][1-9][0-9]{7,14}$'))
    FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
    INSERT INTO notification_scoped_preferences(user_id,scope_code,channel,enabled,consent_account_version,
        consent_granted_at,consent_withdrawn_at)
    VALUES(p_user,p_scope,p_channel,p_enabled,CASE WHEN p_consent THEN account_version END,
        CASE WHEN p_consent THEN CURRENT_TIMESTAMP END,CASE WHEN NOT p_consent THEN CURRENT_TIMESTAMP END)
    ON CONFLICT (user_id,scope_code,channel) DO UPDATE
       SET enabled=EXCLUDED.enabled, consent_account_version=EXCLUDED.consent_account_version,
           consent_granted_at=coalesce(EXCLUDED.consent_granted_at,notification_scoped_preferences.consent_granted_at),
           consent_withdrawn_at=EXCLUDED.consent_withdrawn_at,updated_at=CURRENT_TIMESTAMP;
    RETURN true;
END $body$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_notification_scoped_preference(
    p_user varchar,p_scope varchar,p_channel varchar
) RETURNS TABLE(enabled boolean,consent_granted boolean,consent_granted_at timestamptz,consent_withdrawn_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT coalesce(preference.enabled,p_channel='IN_APP'),
           coalesce(preference.consent_granted_at IS NOT NULL AND preference.consent_withdrawn_at IS NULL
             AND (p_channel<>'WHATSAPP' OR (preference.consent_account_version=account.version_no
               AND account.primary_phone ~ '^[+][1-9][0-9]{7,14}$')),false),
           preference.consent_granted_at,preference.consent_withdrawn_at
    FROM "user" account
    LEFT JOIN notification_scoped_preferences preference
      ON preference.user_id=account.user_id AND preference.scope_code=p_scope AND preference.channel=p_channel
    WHERE account.user_id=p_user AND NOT account.is_deleted AND account.user_status_id='entity-status-user-active'
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".resolve_notification_eligibility(
    p_component varchar,p_event varchar,p_channel varchar,p_language varchar,p_organization varchar,p_recipient varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT EXISTS (
      SELECT 1 FROM notification_event_definitions definition
      CROSS JOIN LATERAL get_notification_channel_settings(p_organization) settings
      CROSS JOIN LATERAL get_notification_scoped_preference(p_recipient,definition.consent_scope,p_channel) preference
      LEFT JOIN support_notification_user_settings customer_settings ON customer_settings.user_id=p_recipient
      WHERE definition.component_code=p_component AND definition.event_code=p_event AND preference.enabled
        AND EXISTS (SELECT 1 FROM resolve_notification_configuration(p_component,p_event,p_channel,p_language))
        AND CASE p_channel
          WHEN 'IN_APP' THEN settings."inAppEnabled" AND (definition.category='TRANSACTIONAL' OR preference.consent_granted)
          WHEN 'WHATSAPP' THEN settings."whatsappEnabled" AND preference.consent_granted
            AND coalesce(customer_settings.whatsapp_enabled,true)
            AND coalesce(customer_settings.delivery_mode,'DEFAULT')<>'MOCK'
          ELSE false END
    )
$body$;

-- Trusted producer calls in its transaction (with a notification savepoint).
-- Duplicate actions return no delivery IDs, including previously suppressed ones.
CREATE OR REPLACE FUNCTION "${schemaName}".prepare_notification_event(
    p_component varchar,p_event varchar,p_source_type varchar,p_source varchar,p_action varchar,
    p_organization varchar,p_recipient varchar,p_language varchar,
    p_parameters jsonb,p_context jsonb
) RETURNS TABLE(delivery_id varchar,channel varchar,status varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE prepared_event_id varchar;
BEGIN
    IF nullif(btrim(p_source),'') IS NULL OR nullif(btrim(p_action),'') IS NULL
       OR nullif(btrim(p_language),'') IS NULL
       OR jsonb_typeof(p_parameters) IS DISTINCT FROM 'object'
       OR (p_context IS NOT NULL AND jsonb_typeof(p_context) IS DISTINCT FROM 'object') THEN RETURN; END IF;
    INSERT INTO notification_events(event_id,component_code,event_code,source_type,source_id,source_action_id,organization_id,recipient_user_id,event_parameters,navigation_context)
    SELECT 'NFE-'||gen_random_uuid(),definition.component_code,definition.event_code,definition.source_type,
           p_source,p_action,p_organization,p_recipient,p_parameters,p_context
    FROM notification_event_definitions definition
    WHERE definition.component_code=p_component AND definition.event_code=p_event AND definition.source_type=p_source_type AND definition.supported AND definition.enabled
      AND NOT EXISTS (SELECT 1 FROM jsonb_each(p_parameters) p
          WHERE NOT (p.key=ANY(definition.allowed_parameters)) OR jsonb_typeof(p.value)<>'string'
             OR length(p.value #>> '{}')>1000)
    ON CONFLICT (component_code,event_code,source_type,source_id,source_action_id,recipient_user_id) DO NOTHING
    RETURNING event_id INTO prepared_event_id;
    IF NOT FOUND THEN RETURN; END IF;

    RETURN QUERY
    INSERT INTO notification_channel_deliveries AS delivery(delivery_id,event_id,channel,status,language_code,recipient_account_version)
    SELECT 'NFD-'||gen_random_uuid(),prepared_event_id,channels.code,
           CASE WHEN resolve_notification_eligibility(p_component,p_event,channels.code,p_language,p_organization,p_recipient)
                THEN 'PREPARED' ELSE 'SUPPRESSED' END,
           p_language,CASE WHEN channels.code='WHATSAPP' THEN account.version_no END
    FROM (VALUES ('IN_APP'::varchar),('WHATSAPP'::varchar)) channels(code)
    JOIN "user" account ON account.user_id=p_recipient
    RETURNING delivery.delivery_id,delivery.channel,delivery.status;
END $body$;

-- Use the delivery ID as the inbox ID. Row locking serializes retries and
-- commits inbox creation and the ledger result together.
CREATE OR REPLACE FUNCTION "${schemaName}".materialize_in_app_notification(
    p_delivery varchar,p_title varchar,p_message text,p_context jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
    delivery notification_channel_deliveries%ROWTYPE;
    event_record notification_events%ROWTYPE;
    created boolean;
BEGIN
    SELECT * INTO delivery FROM notification_channel_deliveries
    WHERE delivery_id=p_delivery AND channel='IN_APP' FOR UPDATE;
    IF NOT FOUND THEN RETURN false; END IF;
    IF delivery.status='DELIVERED' THEN RETURN true; END IF;
    IF delivery.status<>'PREPARED' THEN RETURN false; END IF;
    SELECT * INTO STRICT event_record FROM notification_events WHERE event_id=delivery.event_id;
    created := false;
    IF resolve_notification_eligibility(event_record.component_code,event_record.event_code,'IN_APP',
        delivery.language_code,event_record.organization_id,event_record.recipient_user_id) THEN
        created := create_in_app_notification(p_delivery,event_record.organization_id,event_record.recipient_user_id,
            event_record.event_code,p_title,p_message,p_context);
    END IF;
    UPDATE notification_channel_deliveries
       SET status=CASE WHEN created THEN 'DELIVERED' ELSE 'SUPPRESSED' END,updated_at=CURRENT_TIMESTAMP
     WHERE delivery_id=p_delivery;
    RETURN created;
END $body$;

-- Call only after the producer commits. The trusted publisher computes the
-- environment/recipient gate. Claims are never recycled automatically.
CREATE OR REPLACE FUNCTION "${schemaName}".claim_notification_delivery(
    p_delivery varchar
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
    delivery notification_channel_deliveries%ROWTYPE;
    event_record notification_events%ROWTYPE;
    destination varchar;
    config record;
    token uuid;
BEGIN
    SELECT * INTO delivery FROM notification_channel_deliveries
    WHERE delivery_id=p_delivery AND channel='WHATSAPP' AND status='PREPARED' FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO STRICT event_record FROM notification_events WHERE event_id=delivery.event_id;
    SELECT account.primary_phone INTO destination FROM "user" account
    WHERE account.user_id=event_record.recipient_user_id AND account.version_no=delivery.recipient_account_version
      AND account.primary_phone ~ '^[+][1-9][0-9]{7,14}$'
    FOR SHARE;
    SELECT * INTO config FROM resolve_notification_configuration(event_record.component_code,event_record.event_code,
        delivery.channel,delivery.language_code);
    IF destination IS NULL OR NOT FOUND OR NOT resolve_notification_eligibility(event_record.component_code,
        event_record.event_code,delivery.channel,delivery.language_code,event_record.organization_id,event_record.recipient_user_id)
       OR NOT EXISTS (
         SELECT 1 FROM notification_event_definitions definition
         JOIN notification_scoped_preferences preference ON preference.scope_code=definition.consent_scope
         WHERE definition.component_code=event_record.component_code AND definition.event_code=event_record.event_code
           AND preference.user_id=event_record.recipient_user_id AND preference.channel=delivery.channel
           AND preference.consent_granted_at<=event_record.created_at
       ) THEN
        UPDATE notification_channel_deliveries SET status='SUPPRESSED',updated_at=CURRENT_TIMESTAMP WHERE delivery_id=p_delivery;
        RETURN NULL;
    END IF;
    token := gen_random_uuid();
    UPDATE notification_channel_deliveries SET status='CLAIMED',claim_token=token,updated_at=CURRENT_TIMESTAMP
    WHERE delivery_id=p_delivery;
    RETURN jsonb_build_object('deliveryId',p_delivery,'claimToken',token,'eventId',event_record.event_id,
        'component',event_record.component_code,'eventType',event_record.event_code,
        'sourceType',event_record.source_type,'sourceId',event_record.source_id,'sourceActionId',event_record.source_action_id,
        'organizationId',event_record.organization_id,'recipientUserId',event_record.recipient_user_id,
        'destination',destination,'language',delivery.language_code,'providerTemplate',config.provider_template,
        'title',config.title,'message',config.message,'parameterNames',config.parameter_names,
        'parameters',event_record.event_parameters,'context',event_record.navigation_context,
        'allowedParameters',(SELECT d.allowed_parameters FROM notification_event_definitions d
          WHERE d.component_code=event_record.component_code AND d.event_code=event_record.event_code));
END $body$;

CREATE OR REPLACE FUNCTION "${schemaName}".record_notification_publication(
    p_delivery varchar,p_claim uuid,p_outcome varchar,p_submission varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
    IF p_outcome IS NULL OR p_outcome NOT IN ('PUBLISHED','FAILED','AMBIGUOUS')
       OR (p_outcome='PUBLISHED' AND nullif(btrim(p_submission),'') IS NULL)
       OR (p_outcome<>'PUBLISHED' AND p_submission IS NOT NULL) THEN RETURN false; END IF;
    UPDATE notification_channel_deliveries
    SET status=CASE WHEN status='CLAIMED' THEN p_outcome ELSE status END,
        submission_id=coalesce(submission_id,p_submission),updated_at=CURRENT_TIMESTAMP
    WHERE delivery_id=p_delivery AND channel='WHATSAPP' AND claim_token=p_claim
      AND (status IN ('CLAIMED','ACCEPTED','DELIVERED','READ')
           OR (status=p_outcome AND submission_id IS NOT DISTINCT FROM p_submission))
      AND (submission_id IS NULL OR p_submission IS NULL OR submission_id=p_submission);
    RETURN FOUND;
END $body$;

CREATE OR REPLACE FUNCTION "${schemaName}".acknowledge_notification_delivery(
    p_delivery varchar,p_provider_message varchar,p_provider_correlation varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
    IF nullif(btrim(p_provider_message),'') IS NULL THEN
        RAISE EXCEPTION 'Missing provider message reference' USING ERRCODE='22023';
    END IF;
    UPDATE notification_channel_deliveries
    SET provider_message_id=p_provider_message,provider_correlation_id=coalesce(provider_correlation_id,p_provider_correlation),
        status=CASE WHEN status IN ('DELIVERED','READ') THEN status ELSE 'ACCEPTED' END,updated_at=CURRENT_TIMESTAMP
    WHERE delivery_id=p_delivery AND channel='WHATSAPP'
      AND status IN ('CLAIMED','PUBLISHED','AMBIGUOUS','ACCEPTED','DELIVERED','READ')
      AND (provider_message_id IS NULL OR provider_message_id=p_provider_message)
      AND (provider_correlation_id IS NULL OR p_provider_correlation IS NULL OR provider_correlation_id=p_provider_correlation);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Notification delivery acknowledgement does not match an active delivery' USING ERRCODE='22023';
    END IF;
    RETURN true;
END $body$;

REVOKE ALL ON FUNCTION
    "${schemaName}".set_notification_scoped_preference(varchar,varchar,varchar,boolean,boolean,integer),
    "${schemaName}".get_notification_scoped_preference(varchar,varchar,varchar),
    "${schemaName}".resolve_notification_eligibility(varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".prepare_notification_event(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb,jsonb),
    "${schemaName}".materialize_in_app_notification(varchar,varchar,text,jsonb),
    "${schemaName}".claim_notification_delivery(varchar),
    "${schemaName}".record_notification_publication(varchar,uuid,varchar,varchar),
    "${schemaName}".acknowledge_notification_delivery(varchar,varchar,varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    "${schemaName}".set_notification_scoped_preference(varchar,varchar,varchar,boolean,boolean,integer),
    "${schemaName}".get_notification_scoped_preference(varchar,varchar,varchar),
    "${schemaName}".resolve_notification_eligibility(varchar,varchar,varchar,varchar,varchar,varchar),
    "${schemaName}".prepare_notification_event(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb,jsonb),
    "${schemaName}".materialize_in_app_notification(varchar,varchar,text,jsonb),
    "${schemaName}".claim_notification_delivery(varchar),
    "${schemaName}".record_notification_publication(varchar,uuid,varchar,varchar),
    "${schemaName}".acknowledge_notification_delivery(varchar,varchar,varchar)
TO "${appRole}";


-- Configured in-app read model. A worker is deliberately not introduced.
CREATE OR REPLACE FUNCTION "${schemaName}".get_prepared_notification_content(p_delivery varchar)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
 SELECT jsonb_build_object('deliveryId',d.delivery_id,'eventId',e.event_id,'eventType',e.event_code,
   'organizationId',e.organization_id,'recipientUserId',e.recipient_user_id,'language',d.language_code,
   'title',c.title,'message',c.message,'parameterNames',c.parameter_names,
   'allowedParameters',definition.allowed_parameters,'parameters',e.event_parameters,'context',e.navigation_context)
 FROM notification_channel_deliveries d JOIN notification_events e USING(event_id)
 JOIN notification_event_definitions definition ON definition.component_code=e.component_code AND definition.event_code=e.event_code
 CROSS JOIN LATERAL resolve_notification_configuration(e.component_code,e.event_code,d.channel,d.language_code) c
 WHERE d.delivery_id=p_delivery AND d.channel='IN_APP' AND d.status='PREPARED'
$body$;
CREATE OR REPLACE FUNCTION "${schemaName}".finish_unclaimed_notification_delivery(p_delivery varchar,p_outcome varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
 IF p_outcome IS NULL OR p_outcome NOT IN ('FAILED','SUPPRESSED','MOCKED') THEN RETURN false; END IF;
 UPDATE notification_channel_deliveries SET status=p_outcome,updated_at=CURRENT_TIMESTAMP
 WHERE delivery_id=p_delivery AND status='PREPARED';
 RETURN FOUND;
END $body$;
REVOKE ALL ON FUNCTION "${schemaName}".get_prepared_notification_content(varchar),
 "${schemaName}".finish_unclaimed_notification_delivery(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_prepared_notification_content(varchar),
 "${schemaName}".finish_unclaimed_notification_delivery(varchar,varchar) TO "${appRole}";

-- Enable implemented notification capabilities at platform level.
-- Actual delivery remains governed by Organization and Store policies,
-- channel configuration, template availability and customer consent.
UPDATE "${schemaName}".notification_event_definitions d
SET supported=true,
    enabled=true,
    source_action_codes=m.actions,
    source_target_status_code=m.target,
    allowed_parameters=ARRAY['customerName','organizationName','referenceNumber','storeName'] || m.extra
FROM (VALUES
 ('FULFILLMENT_PLACED',ARRAY['ACCEPTED'],'PLACED',ARRAY[]::text[]),
 ('FULFILLMENT_PREPARING',ARRAY['PREPARATION_STARTED'],'PREPARING',ARRAY[]::text[]),
 ('FULFILLMENT_READY',ARRAY['MARKED_READY'],'READY',ARRAY[]::text[]),
 ('FULFILLMENT_COLLECTION_REVISED',ARRAY['COLLECTION_CHANGE_APPROVED','STAFF_COLLECTION_EXTENDED'],NULL,ARRAY['revisedCollectionTime']),
 ('FULFILLMENT_COMPLETED',ARRAY['HANDOVER_CONFIRMED'],'FULFILLED',ARRAY[]::text[]),
 ('FULFILLMENT_CANCELLED',ARRAY['CANCELLATION_APPROVED','STAFF_ORDER_CANCELLED'],'CANCELLED',ARRAY[]::text[])
) m(event_code,actions,target,extra)
WHERE d.component_code='FULFILLMENT'
  AND d.event_code=m.event_code;

-- Business producer adapter only. All common storage/eligibility/rendering and
-- dispatch is handled by the generic notification functions/services.
-- The caller supplies exact newly inserted action IDs while holding the order
-- lock in the same transaction. Never expose this helper to appRole directly.
CREATE OR REPLACE FUNCTION "${schemaName}".prepare_fulfillment_action_notifications(p_order varchar,p_action_ids varchar[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE item record; delivery record; result jsonb := '[]'::jsonb; params jsonb; nav jsonb;
BEGIN
 FOR item IN
   SELECT f.fulfillment_id,f.organization_id,f.customer_user_id,f.fulfillment_number,
          f.effective_policy_snapshot, a.fulfillment_action_id,a.proposed_expected_collection_at,
          a.previous_expected_collection_at, action.status_code AS action_code,
          o.organization_name,s.store_name,s.timezone,
          coalesce(nullif(btrim(u.display_name),''),nullif(btrim(concat_ws(' ',u.first_name,u.last_name)),''),'Customer') AS customer_name,
          coalesce(r.subscription_id,c.subscription_id) AS subscription_id,
          d.component_code,d.event_code,d.source_type,d.allowed_parameters,
          fulfillment_resolve_org_policy(f.organization_id) AS org_policy,
          fulfillment_apply_store_overrides(fulfillment_resolve_org_policy(f.organization_id),s.fulfillment_overrides) AS store_policy
   FROM fulfillments f JOIN fulfillment_actions a ON a.fulfillment_id=f.fulfillment_id
   JOIN statuses action ON action.status_id=a.action_type_status_id
   JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
   JOIN statuses timing ON timing.status_id=f.request_timing_status_id AND timing.status_code='ADVANCE'
   JOIN statuses workflow ON workflow.status_id=f.workflow_mode_status_id
   LEFT JOIN statuses target ON target.status_id=a.new_fulfillment_status_id
   JOIN organization o ON o.organization_id=f.organization_id AND NOT o.is_deleted
   JOIN stores s ON s.store_id=f.store_id AND s.organization_id=f.organization_id AND NOT s.is_deleted
   JOIN "user" u ON u.user_id=f.customer_user_id AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
   LEFT JOIN redemption_transaction r ON r.redemption_transaction_id=f.redemption_transaction_id
   LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id
   JOIN notification_event_definitions d ON d.component_code='FULFILLMENT' AND d.source_type='FULFILLMENT_ACTION'
       AND d.supported AND d.enabled AND action.status_code=ANY(d.source_action_codes)
       AND (d.source_target_status_code IS NULL OR d.source_target_status_code=target.status_code)
   WHERE f.fulfillment_id=p_order AND a.fulfillment_action_id=ANY(p_action_ids)
     AND (target.status_code NOT IN ('PREPARING','READY') OR workflow.status_code IN ('SIMPLE','DETAILED'))
     AND (d.event_code<>'FULFILLMENT_COLLECTION_REVISED' OR
          (a.proposed_expected_collection_at IS NOT NULL AND a.proposed_expected_collection_at IS DISTINCT FROM a.previous_expected_collection_at))
 LOOP
   -- Current event selections apply to future actions, including accepted orders.
   -- Store overrides may narrow, but not bypass, organization event selection.
   IF NOT coalesce((item.org_policy #> '{fulfillmentTypes,ORDER,notificationEvents}') ? item.event_code,false)
      OR NOT coalesce((item.store_policy #> '{fulfillmentTypes,ORDER,notificationEvents}') ? item.event_code,false) THEN CONTINUE; END IF;
   params := jsonb_build_object('customerName',item.customer_name,'organizationName',item.organization_name,
      'referenceNumber',item.fulfillment_number,'storeName',item.store_name);
   IF item.proposed_expected_collection_at IS NOT NULL AND 'revisedCollectionTime'=ANY(item.allowed_parameters) THEN
      params := params || jsonb_build_object('revisedCollectionTime',to_char(
          (item.proposed_expected_collection_at AT TIME ZONE 'UTC') AT TIME ZONE coalesce(item.effective_policy_snapshot->>'collectionTimeZone',item.timezone),
          'YYYY-MM-DD HH24:MI') || ' ' || coalesce(item.effective_policy_snapshot->>'collectionTimeZone',item.timezone));
   END IF;
   nav := CASE WHEN item.subscription_id IS NOT NULL THEN jsonb_build_object('kind','FULFILLMENT',
       'organizationId',item.organization_id,'subscriptionId',item.subscription_id,'fulfillmentId',item.fulfillment_id) END;
   FOR delivery IN SELECT * FROM prepare_notification_event(item.component_code,item.event_code,item.source_type,
       item.fulfillment_id,item.fulfillment_action_id,item.organization_id,item.customer_user_id,'en',params,nav)
   LOOP
       result := result || jsonb_build_array(jsonb_build_object('deliveryId',delivery.delivery_id,'channel',delivery.channel,'status',delivery.status,'recipientUserId',item.customer_user_id));
   END LOOP;
 END LOOP;
 RETURN result;
END $body$;
REVOKE ALL ON FUNCTION "${schemaName}".prepare_fulfillment_action_notifications(varchar,varchar[]) FROM PUBLIC,"${appRole}";

-- Private helpers for the existing Counter transaction boundary. The order
-- lock prevents another writer from adding an action between the two reads.
CREATE OR REPLACE FUNCTION "${schemaName}".notification_counter_action_snapshot(p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar)
RETURNS varchar[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
 IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN RETURN NULL; END IF;
 PERFORM 1 FROM fulfillments WHERE fulfillment_id=p_order AND organization_id=p_org AND store_id=p_store FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN ARRAY(SELECT fulfillment_action_id FROM fulfillment_actions WHERE fulfillment_id=p_order);
EXCEPTION WHEN OTHERS THEN
 RAISE WARNING 'Notification action snapshot failed for fulfillment % (SQLSTATE %)',p_order,SQLSTATE;
 RETURN NULL;
END $body$;
CREATE OR REPLACE FUNCTION "${schemaName}".notification_capture_new_fulfillment_actions(p_order varchar,p_before varchar[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
BEGIN
 IF p_before IS NULL THEN RETURN '[]'::jsonb; END IF;
 RETURN prepare_fulfillment_action_notifications(p_order,ARRAY(SELECT fulfillment_action_id FROM fulfillment_actions
     WHERE fulfillment_id=p_order AND NOT (fulfillment_action_id=ANY(p_before))));
EXCEPTION WHEN OTHERS THEN
 -- Subtransaction rolls back notification writes only. Do not leak SQL/payload.
 RAISE WARNING 'Notification preparation failed for fulfillment % (SQLSTATE %)',p_order,SQLSTATE;
 RETURN '[]'::jsonb;
END $body$;
REVOKE ALL ON FUNCTION "${schemaName}".notification_counter_action_snapshot(varchar,varchar,varchar,varchar,varchar),
 "${schemaName}".notification_capture_new_fulfillment_actions(varchar,varchar[]) FROM PUBLIC,"${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_lifecycle_with_notifications(
 p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,p_version integer,p_command varchar,p_hash varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE before_ids varchar[]; result varchar; deliveries jsonb := '[]'::jsonb;
BEGIN
 before_ids := notification_counter_action_snapshot(p_org,p_store,p_staff,p_actor,p_order);
 result := update_counter_order_lifecycle(p_org,p_store,p_staff,p_actor,p_order,p_version,p_command,p_hash);
 IF result IN ('ORDER_UPDATED','COLLECTION_COMPLETED') THEN
   deliveries := notification_capture_new_fulfillment_actions(p_order,before_ids);
 END IF;
 RETURN jsonb_build_object('result',result,'deliveries',deliveries);
END $body$;
CREATE OR REPLACE FUNCTION "${schemaName}".counter_collection_extension_with_notifications(
 p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,p_version integer,p_action varchar,p_request varchar,p_local timestamp,p_reason varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE before_ids varchar[]; result text; deliveries jsonb := '[]'::jsonb;
BEGIN
 before_ids := notification_counter_action_snapshot(p_org,p_store,p_staff,p_actor,p_order);
 result := counter_order_collection_extension(p_org,p_store,p_staff,p_actor,p_order,p_version,p_action,p_request,p_local,p_reason);
 IF result='UPDATED' THEN deliveries := notification_capture_new_fulfillment_actions(p_order,before_ids); END IF;
 RETURN jsonb_build_object('result',result,'deliveries',deliveries);
END $body$;
CREATE OR REPLACE FUNCTION "${schemaName}".counter_cancellation_with_notifications(
 p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_order varchar,p_version integer,p_decision varchar,p_reason varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE before_ids varchar[]; result varchar; deliveries jsonb := '[]'::jsonb;
BEGIN
 before_ids := notification_counter_action_snapshot(p_org,p_store,p_staff,p_actor,p_order);
 result := counter_order_decide_cancellation(p_org,p_store,p_staff,p_actor,p_order,p_version,p_decision,p_reason);
 IF result IN ('ORDER_CANCELLED','ORDER_CANCELLED_REFUND_REVIEW') THEN
   deliveries := notification_capture_new_fulfillment_actions(p_order,before_ids);
 END IF;
 RETURN jsonb_build_object('result',result,'deliveries',deliveries);
END $body$;

-- Match the canonical acceptance advisory lock and check replay under that lock.
-- A new order has only the just-created ACCEPTED action. Existing replay never
-- prepares a historical notification, even when configuration changed.
CREATE OR REPLACE FUNCTION "${schemaName}".accept_customer_fulfillment_with_notifications(
 p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar,p_key varchar,p_hash varchar,
 p_benefits varchar[],p_offers varchar[],p_products jsonb,p_quote jsonb,p_expected_completion timestamptz,p_expected_collection timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE existing varchar; result varchar; deliveries jsonb := '[]'::jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org||':'||p_key,308));
 existing := get_customer_fulfillment_replay(p_org,p_actor,p_key,p_hash);
 result := accept_customer_fulfillment(p_org,p_store,p_subscription,p_actor,p_key,p_hash,p_benefits,p_offers,p_products,p_quote,p_expected_completion,p_expected_collection);
 IF existing IS NULL AND result IS NOT NULL AND EXISTS (SELECT 1 FROM fulfillments WHERE fulfillment_id=result AND organization_id=p_org AND customer_user_id=p_actor) THEN
   deliveries := notification_capture_new_fulfillment_actions(result,ARRAY[]::varchar[]);
 END IF;
 RETURN jsonb_build_object('result',result,'deliveries',deliveries);
END $body$;
CREATE OR REPLACE FUNCTION "${schemaName}".finalize_fulfillment_collect_with_notifications(p_org varchar,p_intent varchar,p_actor varchar)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE payment record; existing varchar; result varchar; deliveries jsonb := '[]'::jsonb;
BEGIN
 SELECT i.idempotency_key,i.fulfillment_checkout INTO payment FROM payment_intents i
 WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.fulfillment_checkout IS NOT NULL
   AND payment_actor_is_authorized(p_intent,p_actor);
 IF NOT FOUND THEN RETURN jsonb_build_object('result',finalize_customer_fulfillment_collect(p_org,p_intent,p_actor),'deliveries',deliveries); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_org||':'||payment.idempotency_key,308));
 existing := get_customer_fulfillment_replay(p_org,p_actor,payment.idempotency_key,(payment.fulfillment_checkout->>'requestHash')::varchar);
 result := finalize_customer_fulfillment_collect(p_org,p_intent,p_actor);
 IF existing IS NULL AND result IS NOT NULL AND EXISTS (SELECT 1 FROM fulfillments WHERE fulfillment_id=result AND organization_id=p_org AND customer_user_id=p_actor) THEN
   deliveries := notification_capture_new_fulfillment_actions(result,ARRAY[]::varchar[]);
 END IF;
 RETURN jsonb_build_object('result',result,'deliveries',deliveries);
END $body$;
REVOKE ALL ON FUNCTION
 "${schemaName}".counter_order_lifecycle_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar),
 "${schemaName}".counter_collection_extension_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar,timestamp,varchar),
 "${schemaName}".counter_cancellation_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar),
 "${schemaName}".accept_customer_fulfillment_with_notifications(varchar,varchar,varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,jsonb,timestamptz,timestamptz),
 "${schemaName}".finalize_fulfillment_collect_with_notifications(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
 "${schemaName}".counter_order_lifecycle_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar),
 "${schemaName}".counter_collection_extension_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar,timestamp,varchar),
 "${schemaName}".counter_cancellation_with_notifications(varchar,varchar,varchar,varchar,varchar,integer,varchar,varchar),
 "${schemaName}".accept_customer_fulfillment_with_notifications(varchar,varchar,varchar,varchar,varchar,varchar,varchar[],varchar[],jsonb,jsonb,timestamptz,timestamptz),
 "${schemaName}".finalize_fulfillment_collect_with_notifications(varchar,varchar,varchar) TO "${appRole}";

-- Customer UI options are sourced from the common registry. A scope is exposed
-- when it is supported, or when the customer already has a stored preference
-- (so withdrawal remains possible after an event is disabled).
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_notification_preference_options(p_user varchar)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
 SELECT coalesce(jsonb_agg(jsonb_build_object('scopeCode',scope.code,'channel','WHATSAPP',
   'label',status.status_name,'enabled',pref.enabled,'consentGranted',pref.consent_granted,
   'available',coalesce(u.primary_phone ~ '^[+][1-9][0-9]{7,14}$',false),
   'accountVersion',u.version_no) ORDER BY scope.code),'[]'::jsonb)
 FROM "user" u CROSS JOIN (
   SELECT DISTINCT d.consent_scope AS code FROM notification_event_definitions d
   WHERE d.consent_scope IS NOT NULL AND (d.supported OR EXISTS(
       SELECT 1 FROM notification_scoped_preferences p WHERE p.user_id=p_user AND p.scope_code=d.consent_scope AND p.channel='WHATSAPP'))
 ) scope
 JOIN statuses status ON status.status_code=scope.code
 CROSS JOIN LATERAL get_notification_scoped_preference(p_user,scope.code,'WHATSAPP') pref
 WHERE u.user_id=p_user AND NOT u.is_deleted AND u.user_status_id='entity-status-user-active'
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_notification_preference_options(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_notification_preference_options(varchar) TO "${appRole}";

-- Existing reference-choice contract already includes a supported flag.
CREATE OR REPLACE FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(
 p_organization_id varchar,p_actor_user_id varchar)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE result jsonb;
BEGIN
 IF NOT can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Fulfillment references access denied' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_object_agg(category,choices) INTO result FROM (
   SELECT et.entity_type_code AS category,
      coalesce(jsonb_agg(jsonb_build_object('code',s.status_code,'label',s.status_name,'supported',
       CASE WHEN et.entity_type_code='FULFILLMENT_TYPE' THEN s.status_code='ORDER'
            WHEN et.entity_type_code='FULFILLMENT_NOTIFICATION_EVENT' THEN EXISTS(
             SELECT 1 FROM notification_event_definitions d WHERE d.component_code='FULFILLMENT'
                 AND d.event_code=s.status_code AND d.supported)
            ELSE true END) ORDER BY es.display_order) FILTER(WHERE s.status_id IS NOT NULL),'[]'::jsonb) AS choices
   FROM entity_type et JOIN entity_status es ON es.entity_type_id=et.entity_type_id AND es.is_active
   JOIN statuses s ON s.status_id=es.status_id AND s.is_active
   WHERE et.is_active AND et.entity_type_code IN ('FULFILLMENT_TYPE','FULFILLMENT_REQUEST_CHANNEL',
     'FULFILLMENT_REQUEST_TIMING','PAYMENT_TIMING','FULFILLMENT_WORKFLOW','FULFILLMENT_NOTIFICATION_EVENT','COLLECTION_SCHEDULING_POLICY')
   GROUP BY et.entity_type_code
 ) q;
 RETURN coalesce(result,'{}'::jsonb);
END $body$;
REVOKE ALL ON FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_fulfillment_policy_reference_choices(varchar,varchar) TO "${appRole}";

-- Preserve previously saved unsupported selections. Only reject newly added
-- unsupported selections; canonical save functions retain validation/version checks.
CREATE OR REPLACE FUNCTION "${schemaName}".validate_new_fulfillment_notification_choices(p_before jsonb,p_after jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE event_code text;
BEGIN
 IF p_after IS NULL THEN RETURN; END IF;
 IF jsonb_typeof(p_after)<>'array' THEN RAISE EXCEPTION 'notificationEvents must be an array' USING ERRCODE='22023'; END IF;
 FOR event_code IN SELECT jsonb_array_elements_text(p_after) LOOP
   IF NOT coalesce(p_before ? event_code,false) AND NOT EXISTS(
      SELECT 1 FROM notification_event_definitions d WHERE d.component_code='FULFILLMENT' AND d.event_code=event_code AND d.supported) THEN
     RAISE EXCEPTION 'Notification event is not yet supported' USING ERRCODE='22023';
   END IF;
 END LOOP;
END $body$;
REVOKE ALL ON FUNCTION "${schemaName}".validate_new_fulfillment_notification_choices(jsonb,jsonb) FROM PUBLIC,"${appRole}";

-- Extend the canonical 307 save functions, preserving signatures, authorization,
-- optimistic concurrency, configuration defaults and existing return contracts.
CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_fulfillment_policy(
  p_organization_id varchar, p_policy jsonb, p_expected_version integer, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_current integer; v_result jsonb; v_exists boolean;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Organization fulfillment configuration update denied' USING ERRCODE='42501';
 END IF;
 IF p_expected_version IS NULL OR p_expected_version < 0 THEN
   RAISE EXCEPTION 'Expected version is required' USING ERRCODE='22023';
 END IF;
 PERFORM "${schemaName}".fulfillment_validate_policy(p_policy,FALSE);
 IF ("${schemaName}".fulfillment_merge_policy("${schemaName}".fulfillment_policy_defaults(),p_policy)
       #>> '{fulfillmentTypes,ORDER,minimumLeadMinutes}')::integer >
    ("${schemaName}".fulfillment_merge_policy("${schemaName}".fulfillment_policy_defaults(),p_policy)
       #>> '{fulfillmentTypes,ORDER,maximumHorizonMinutes}')::integer THEN
   RAISE EXCEPTION 'Minimum lead time cannot exceed booking horizon' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id AND NOT o.is_deleted) THEN
   RAISE EXCEPTION 'Organization not found' USING ERRCODE='P0002';
 END IF;
 -- Serialize concurrent first writes even when no config row exists.
 PERFORM 1 FROM "${schemaName}".organization o WHERE o.organization_id=p_organization_id FOR UPDATE;
 SELECT c.version_no INTO v_current
 FROM "${schemaName}".organization_redemption_configurations c
 WHERE c.organization_id=p_organization_id FOR UPDATE;
 v_exists := FOUND;
 -- Validate only after the canonical locks and version check, before mutation.
 IF NOT v_exists THEN
   IF p_expected_version <> 0 THEN RAISE EXCEPTION 'Stale fulfillment policy version' USING ERRCODE='40001'; END IF;
 ELSE
   IF v_current <> p_expected_version THEN RAISE EXCEPTION 'Stale fulfillment policy version' USING ERRCODE='40001'; END IF;
 END IF;
 PERFORM "${schemaName}".validate_new_fulfillment_notification_choices(
   "${schemaName}".fulfillment_resolve_org_policy(p_organization_id)#>'{fulfillmentTypes,ORDER,notificationEvents}',
   "${schemaName}".fulfillment_merge_policy("${schemaName}".fulfillment_policy_defaults(),p_policy)#>'{fulfillmentTypes,ORDER,notificationEvents}');
 IF NOT v_exists THEN
   -- QR expiry = 10 retains legacy effective fallback; never use a dummy subscription.
   INSERT INTO "${schemaName}".organization_redemption_configurations
     (organization_id,configuration_key,redemption_qr_expiry_minutes,fulfillment_policy,
      created_by,updated_by,is_deleted,version_no)
   VALUES (p_organization_id,'REDEMPTION_QR_EXPIRY_MINUTES',10,p_policy,
           p_actor_user_id,p_actor_user_id,FALSE,1);
 ELSE
   UPDATE "${schemaName}".organization_redemption_configurations c SET
     fulfillment_policy=p_policy,
     updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
     updated_by=p_actor_user_id,
     version_no=c.version_no+1
   WHERE c.organization_id=p_organization_id;
   -- Preserve redemption_qr_expiry_minutes, configuration_key, and is_deleted EXACTLY.
 END IF;
 RETURN "${schemaName}".get_organization_fulfillment_policy(p_organization_id,p_actor_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_store_fulfillment_overrides(
 p_organization_id varchar, p_store_id varchar, p_overrides jsonb,
 p_expected_version integer, p_actor_user_id varchar
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_store record; v_org jsonb; v_org_order jsonb; v_store_order jsonb;
 v_key text; v_effective jsonb;
BEGIN
 IF NOT "${schemaName}".can_administer_organization(p_organization_id,p_actor_user_id) THEN
   RAISE EXCEPTION 'Store fulfillment configuration update denied' USING ERRCODE='42501';
 END IF;
 IF p_expected_version IS NULL OR p_expected_version < 1 THEN
   RAISE EXCEPTION 'Expected Store version is required' USING ERRCODE='22023';
 END IF;
 PERFORM "${schemaName}".fulfillment_validate_policy(p_overrides,TRUE);
 SELECT s.store_id,s.version_no,s.fulfillment_overrides INTO v_store
 FROM "${schemaName}".stores s
 WHERE s.organization_id=p_organization_id AND s.store_id=p_store_id AND NOT s.is_deleted
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store not found' USING ERRCODE='P0002'; END IF;
 IF v_store.version_no <> p_expected_version THEN
   RAISE EXCEPTION 'Stale Store fulfillment configuration version' USING ERRCODE='40001';
 END IF;
 v_org := "${schemaName}".fulfillment_resolve_org_policy(p_organization_id);
 v_org_order := v_org #> '{fulfillmentTypes,ORDER}';
 v_store_order := COALESCE(p_overrides #> '{fulfillmentTypes,ORDER}','{}'::jsonb);
 -- Store cannot make an org-disabled journey or unsupported type available.
 IF COALESCE((v_store_order->>'enabled')::boolean,FALSE) AND NOT (v_org_order->>'enabled')::boolean THEN
   RAISE EXCEPTION 'Store cannot enable an organization-disabled fulfillment type' USING ERRCODE='22023';
 END IF;
 FOR v_key IN SELECT jsonb_object_keys(COALESCE(v_store_order->'journeys','{}'::jsonb)) LOOP
   IF (v_store_order->'journeys'->>v_key)::boolean
      AND NOT COALESCE((v_org_order->'journeys'->>v_key)::boolean,FALSE) THEN
     RAISE EXCEPTION 'Store cannot enable an organization-disabled journey: %',v_key USING ERRCODE='22023';
   END IF;
 END LOOP;
 v_effective := "${schemaName}".fulfillment_apply_store_overrides(v_org,p_overrides);
 PERFORM "${schemaName}".fulfillment_validate_policy(v_effective,TRUE);
 -- Only validate explicitly submitted event overrides: removing an override
 -- restores inheritance and must not reject an existing organization selection.
 PERFORM "${schemaName}".validate_new_fulfillment_notification_choices(
   "${schemaName}".fulfillment_apply_store_overrides(v_org,v_store.fulfillment_overrides)#>'{fulfillmentTypes,ORDER,notificationEvents}',
   p_overrides#>'{fulfillmentTypes,ORDER,notificationEvents}');
 IF (v_effective #>> '{fulfillmentTypes,ORDER,minimumLeadMinutes}')::integer >
    (v_effective #>> '{fulfillmentTypes,ORDER,maximumHorizonMinutes}')::integer THEN
   RAISE EXCEPTION 'Store minimum lead time cannot exceed booking horizon' USING ERRCODE='22023';
 END IF;
 UPDATE "${schemaName}".stores s SET
   fulfillment_overrides=p_overrides,
   updated_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC', updated_by=p_actor_user_id,
   version_no=s.version_no+1
 WHERE s.store_id=p_store_id AND s.organization_id=p_organization_id;
 RETURN "${schemaName}".get_store_fulfillment_overrides(p_organization_id,p_store_id,p_actor_user_id);
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".save_organization_fulfillment_policy(varchar,jsonb,integer,varchar),
 "${schemaName}".save_store_fulfillment_overrides(varchar,varchar,jsonb,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_fulfillment_policy(varchar,jsonb,integer,varchar),
 "${schemaName}".save_store_fulfillment_overrides(varchar,varchar,jsonb,integer,varchar) TO "${appRole}";

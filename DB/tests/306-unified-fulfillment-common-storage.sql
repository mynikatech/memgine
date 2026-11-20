-- Migration 306 LOCAL read-only assertions. Run only AFTER applying 306 to LOCAL.
-- Uses the same ${schemaName} placeholder replacement mechanism as Liquibase.
DO $test$
DECLARE n integer; missing text;
BEGIN
 SELECT string_agg(x.rel, ', ') INTO missing FROM (VALUES
 ('fulfillments'),('redemption_entitlement_reservations'),
 ('fulfillment_actions'),('fulfillment_credentials')) x(rel)
 WHERE to_regclass(format('%I.%I','${schemaName}', x.rel)) IS NULL;
 IF missing IS NOT NULL THEN RAISE EXCEPTION '306 missing storage: %',missing; END IF;

 SELECT count(*) INTO n FROM information_schema.columns
 WHERE table_schema='${schemaName}' AND
 ((table_name='organization_redemption_configurations' AND column_name='fulfillment_policy' AND data_type='jsonb' AND is_nullable='NO')
 OR (table_name='stores' AND column_name='fulfillment_overrides' AND data_type='jsonb' AND is_nullable='NO'));
 IF n <> 2 THEN RAISE EXCEPTION '306 configuration storage missing: %/2',n; END IF;

 SELECT count(*) INTO n FROM information_schema.columns
 WHERE table_schema='${schemaName}' AND table_name='fulfillments'
 AND column_name IN ('fulfillment_id','redemption_transaction_id','commerce_transaction_id',
 'request_channel_status_id','request_timing_status_id','payment_timing_status_id',
 'fulfillment_type_status_id','workflow_mode_status_id','fulfillment_status_id',
 'effective_policy_snapshot','expected_completion_at','expected_collection_at','fulfilled_at');
 IF n <> 13 THEN RAISE EXCEPTION '306 expected fulfillment fields incomplete: %/13',n; END IF;

 SELECT count(*) INTO n FROM "${schemaName}".entity_type
 WHERE entity_type_code IN ('FULFILLMENT_TYPE','FULFILLMENT_REQUEST_CHANNEL','FULFILLMENT_REQUEST_TIMING','PAYMENT_TIMING','FULFILLMENT_WORKFLOW','FULFILLMENT_STATUS','ENTITLEMENT_RESERVATION_STATUS','FULFILLMENT_ACTION_TYPE','FULFILLMENT_NOTIFICATION_EVENT','COLLECTION_SCHEDULING_POLICY','FULFILLMENT_CREDENTIAL_TYPE');
 IF n <> 11 THEN RAISE EXCEPTION '306 missing categories: %/11',n; END IF;

 WITH choices(category,code) AS (VALUES
 ('FULFILLMENT_TYPE','ORDER'),
 ('FULFILLMENT_TYPE','APPOINTMENT'),
 ('FULFILLMENT_TYPE','SESSION'),
 ('FULFILLMENT_TYPE','RESERVATION'),
 ('FULFILLMENT_TYPE','SERVICE_REQUEST'),
 ('FULFILLMENT_TYPE','ADMISSION'),
 ('FULFILLMENT_REQUEST_CHANNEL','CUSTOMER_APP'),
 ('FULFILLMENT_REQUEST_CHANNEL','WEB'),
 ('FULFILLMENT_REQUEST_CHANNEL','COUNTER_STAFF'),
 ('FULFILLMENT_REQUEST_TIMING','IMMEDIATE'),
 ('FULFILLMENT_REQUEST_TIMING','ADVANCE'),
 ('PAYMENT_TIMING','PAY_NOW'),
 ('PAYMENT_TIMING','PAY_AT_COUNTER'),
 ('FULFILLMENT_WORKFLOW','NONE'),
 ('FULFILLMENT_WORKFLOW','SIMPLE'),
 ('FULFILLMENT_WORKFLOW','DETAILED'),
 ('FULFILLMENT_STATUS','PLACED'),
 ('FULFILLMENT_STATUS','PREPARING'),
 ('FULFILLMENT_STATUS','READY'),
 ('FULFILLMENT_STATUS','FULFILLED'),
 ('FULFILLMENT_STATUS','CANCEL_REQUESTED'),
 ('FULFILLMENT_STATUS','CANCELLED'),
 ('ENTITLEMENT_RESERVATION_STATUS','RESERVED'),
 ('ENTITLEMENT_RESERVATION_STATUS','CONSUMED'),
 ('ENTITLEMENT_RESERVATION_STATUS','RELEASED'),
 ('FULFILLMENT_ACTION_TYPE','ACCEPTED'),
 ('FULFILLMENT_ACTION_TYPE','PREPARATION_STARTED'),
 ('FULFILLMENT_ACTION_TYPE','MARKED_READY'),
 ('FULFILLMENT_ACTION_TYPE','HANDOVER_CONFIRMED'),
 ('FULFILLMENT_ACTION_TYPE','DELAY_RECORDED'),
 ('FULFILLMENT_ACTION_TYPE','COMPLETION_TIME_REVISED'),
 ('FULFILLMENT_ACTION_TYPE','COLLECTION_CHANGE_REQUESTED'),
 ('FULFILLMENT_ACTION_TYPE','COLLECTION_CHANGE_APPROVED'),
 ('FULFILLMENT_ACTION_TYPE','COLLECTION_CHANGE_REJECTED'),
 ('FULFILLMENT_ACTION_TYPE','CANCELLATION_REQUESTED'),
 ('FULFILLMENT_ACTION_TYPE','CANCELLED'),
 ('FULFILLMENT_ACTION_TYPE','NO_SHOW_RECORDED'),
 ('FULFILLMENT_ACTION_TYPE','OVERRIDE_APPLIED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_PLACED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_PREPARING'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_DELAYED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_COMPLETION_REVISED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_COLLECTION_REVISED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_READY'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_PICKUP_REMINDER'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_COMPLETED'),
 ('FULFILLMENT_NOTIFICATION_EVENT','FULFILLMENT_CANCELLED'),
 ('COLLECTION_SCHEDULING_POLICY','ASAP_ONLY'),
 ('COLLECTION_SCHEDULING_POLICY','ASAP_OR_SCHEDULED'),
 ('FULFILLMENT_CREDENTIAL_TYPE','PICKUP_QR'),
 ('FULFILLMENT_CREDENTIAL_TYPE','PICKUP_CODE')
 )
 SELECT count(*) INTO n FROM choices c
 JOIN "${schemaName}".entity_type et ON et.entity_type_code=c.category
 JOIN "${schemaName}".statuses st ON st.status_code=c.code
 JOIN "${schemaName}".entity_status es ON es.entity_type_id=et.entity_type_id AND es.status_id=st.status_id;
 IF n <> 51 THEN RAISE EXCEPTION '306 missing reference associations: %/51',n; END IF;

 SELECT count(*) INTO n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace ns ON ns.oid=c.relnamespace
 WHERE ns.nspname='${schemaName}' AND NOT t.tgisinternal AND
 c.relname IN ('fulfillments','redemption_entitlement_reservations','fulfillment_actions','fulfillment_credentials');
 IF n <> 0 THEN RAISE EXCEPTION '306 unexpected application triggers: %',n; END IF;

 -- Type compatibility enforced in future functions: only ORDER is executable in 307-309.
 RAISE NOTICE '306 storage checks passed: 4 tables, 2 columns, 11 categories, 51 choices';
END;
$test$;

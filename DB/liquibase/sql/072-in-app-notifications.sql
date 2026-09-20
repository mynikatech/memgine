CREATE TABLE IF NOT EXISTS "${schemaName}".notifications (
  notification_id varchar(64) PRIMARY KEY,
  organization_id varchar(64) REFERENCES "${schemaName}".organization(organization_id),
  recipient_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
  event_type varchar(100) NOT NULL, title varchar(200) NOT NULL, message text NOT NULL,
  context_json jsonb, read_at timestamp without time zone,
  created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_created ON "${schemaName}".notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_notifications_recipient_unread ON "${schemaName}".notifications(recipient_user_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION "${schemaName}".create_in_app_notification(p_id varchar,p_organization_id varchar,p_recipient_user_id varchar,p_event_type varchar,p_title varchar,p_message text,p_context_json jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN
  IF nullif(trim(p_id),'') IS NULL OR nullif(trim(p_recipient_user_id),'') IS NULL OR nullif(trim(p_event_type),'') IS NULL OR nullif(trim(p_title),'') IS NULL OR nullif(trim(p_message),'') IS NULL THEN RAISE EXCEPTION 'Invalid notification' USING ERRCODE='22023'; END IF;
  IF p_organization_id IS NOT NULL AND EXISTS (SELECT 1 FROM notification_configurations c WHERE c.organization_id=p_organization_id AND c.is_deleted=false AND c.in_app_enabled=false) THEN RETURN false; END IF;
  INSERT INTO notifications(notification_id,organization_id,recipient_user_id,event_type,title,message,context_json) VALUES(p_id,p_organization_id,p_recipient_user_id,p_event_type,p_title,p_message,p_context_json);
  RETURN true;
END $f$;
CREATE OR REPLACE FUNCTION "${schemaName}".get_my_notifications(p_recipient_user_id varchar)
RETURNS TABLE(id varchar,"organizationId" varchar,"eventType" varchar,title varchar,message text,context jsonb,"createdAt" text,"readAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT notification_id,organization_id,event_type,title,message,context_json,created_at::text,read_at::text FROM notifications WHERE recipient_user_id=p_recipient_user_id ORDER BY created_at DESC,notification_id DESC
$f$;
CREATE OR REPLACE FUNCTION "${schemaName}".get_my_unread_notification_count(p_recipient_user_id varchar) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
 SELECT count(*)::integer FROM notifications WHERE recipient_user_id=p_recipient_user_id AND read_at IS NULL
$f$;
CREATE OR REPLACE FUNCTION "${schemaName}".mark_my_notification_read(p_notification_id varchar,p_recipient_user_id varchar) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
BEGIN UPDATE notifications SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE notification_id=p_notification_id AND recipient_user_id=p_recipient_user_id; RETURN FOUND; END $f$;
CREATE OR REPLACE FUNCTION "${schemaName}".mark_my_notifications_read(p_recipient_user_id varchar) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
DECLARE n integer; BEGIN UPDATE notifications SET read_at=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' WHERE recipient_user_id=p_recipient_user_id AND read_at IS NULL; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END $f$;
REVOKE ALL ON FUNCTION "${schemaName}".create_in_app_notification(varchar,varchar,varchar,varchar,varchar,text,jsonb),"${schemaName}".get_my_notifications(varchar),"${schemaName}".get_my_unread_notification_count(varchar),"${schemaName}".mark_my_notification_read(varchar,varchar),"${schemaName}".mark_my_notifications_read(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".create_in_app_notification(varchar,varchar,varchar,varchar,varchar,text,jsonb),"${schemaName}".get_my_notifications(varchar),"${schemaName}".get_my_unread_notification_count(varchar),"${schemaName}".mark_my_notification_read(varchar,varchar),"${schemaName}".mark_my_notifications_read(varchar) TO "${appRole}";

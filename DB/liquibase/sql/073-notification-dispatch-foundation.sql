CREATE OR REPLACE FUNCTION "${schemaName}".get_notification_channel_settings(p_organization_id varchar)
RETURNS TABLE("emailEnabled" boolean,"smsEnabled" boolean,"whatsappEnabled" boolean,"pushEnabled" boolean,"inAppEnabled" boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $f$
  SELECT c.email_enabled,c.sms_enabled,c.whatsapp_enabled,c.push_enabled,c.in_app_enabled
  FROM notification_configurations c WHERE c.organization_id=p_organization_id AND c.is_deleted=false
$f$;
REVOKE ALL ON FUNCTION "${schemaName}".get_notification_channel_settings(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_notification_channel_settings(varchar) TO "${appRole}";

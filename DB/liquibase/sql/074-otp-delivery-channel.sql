ALTER TABLE "${schemaName}".notification_configurations
    ADD COLUMN IF NOT EXISTS otp_delivery_channel varchar(20) NOT NULL DEFAULT 'SMS';

UPDATE "${schemaName}".notification_configurations
SET otp_delivery_channel = 'SMS'
WHERE otp_delivery_channel IS NULL;

DO $ddl$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_notification_configuration_otp_delivery_channel'
          AND conrelid = '"${schemaName}".notification_configurations'::regclass
    ) THEN
        ALTER TABLE "${schemaName}".notification_configurations
            ADD CONSTRAINT ck_notification_configuration_otp_delivery_channel
            CHECK (otp_delivery_channel IN ('SMS', 'EMAIL', 'WHATSAPP'));
    END IF;
END;
$ddl$;

DROP FUNCTION IF EXISTS "${schemaName}".get_organization_notification_configuration(varchar, varchar);
CREATE FUNCTION "${schemaName}".get_organization_notification_configuration(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "configurationName" varchar,
    "emailEnabled" boolean, "smsEnabled" boolean, "whatsappEnabled" boolean,
    "pushEnabled" boolean, "inAppEnabled" boolean, "otpDeliveryChannel" varchar,
    "notificationStatusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean, "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT n.notification_configuration_id, n.organization_id, n.configuration_name,
        n.email_enabled, n.sms_enabled, n.whatsapp_enabled, n.push_enabled,
        n.in_app_enabled, n.otp_delivery_channel, n.notification_status_id,
        n.created_at::text, n.created_by, n.updated_at::text, n.updated_by,
        n.is_deleted, n.version_no
    FROM "${schemaName}".notification_configurations n
    WHERE n.organization_id = p_organization_id AND n.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

DROP FUNCTION IF EXISTS "${schemaName}".save_organization_notification_configuration(varchar, varchar, boolean, boolean, boolean, boolean, boolean, varchar, integer, varchar);
CREATE FUNCTION "${schemaName}".save_organization_notification_configuration(
    p_organization_id varchar, p_name varchar, p_email_enabled boolean,
    p_sms_enabled boolean, p_whatsapp_enabled boolean, p_push_enabled boolean,
    p_in_app_enabled boolean, p_otp_delivery_channel varchar, p_status_id varchar,
    p_version_no integer, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_existing_id varchar(40); v_existing_deleted boolean;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_otp_delivery_channel NOT IN ('SMS', 'EMAIL', 'WHATSAPP')
       OR (p_otp_delivery_channel = 'SMS' AND NOT p_sms_enabled)
       OR (p_otp_delivery_channel = 'EMAIL' AND NOT p_email_enabled)
       OR (p_otp_delivery_channel = 'WHATSAPP' AND NOT p_whatsapp_enabled) THEN
        RAISE EXCEPTION 'Invalid OTP delivery channel configuration' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".entity_status es JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'NOTIFICATION_CONFIGURATION' AND es.is_active) THEN
        RAISE EXCEPTION 'Invalid Notification Configuration status' USING ERRCODE = '22023';
    END IF;
    SELECT notification_configuration_id, is_deleted INTO v_existing_id, v_existing_deleted FROM "${schemaName}".notification_configurations WHERE organization_id = p_organization_id FOR UPDATE;
    IF v_existing_id IS NULL THEN
        INSERT INTO "${schemaName}".notification_configurations (notification_configuration_id, organization_id, configuration_name, email_enabled, sms_enabled, whatsapp_enabled, push_enabled, in_app_enabled, otp_delivery_channel, notification_status_id, created_by, updated_at, updated_by)
        VALUES (gen_random_uuid()::text, p_organization_id, p_name, p_email_enabled, p_sms_enabled, p_whatsapp_enabled, p_push_enabled, p_in_app_enabled, p_otp_delivery_channel, p_status_id, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id);
    ELSE
        UPDATE "${schemaName}".notification_configurations SET configuration_name = p_name, email_enabled = p_email_enabled, sms_enabled = p_sms_enabled, whatsapp_enabled = p_whatsapp_enabled, push_enabled = p_push_enabled, in_app_enabled = p_in_app_enabled, otp_delivery_channel = p_otp_delivery_channel, notification_status_id = p_status_id, updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, is_deleted = false, version_no = version_no + 1
        WHERE notification_configuration_id = v_existing_id AND (v_existing_deleted OR version_no = p_version_no);
        IF NOT FOUND THEN RAISE EXCEPTION 'Notification Configuration changed since load' USING ERRCODE = '40001'; END IF;
    END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_otp_delivery_channel(p_organization_id varchar)
RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT COALESCE((SELECT c.otp_delivery_channel FROM notification_configurations c WHERE c.organization_id = p_organization_id AND NOT c.is_deleted), 'SMS');
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".otp_delivery_recipient(p_destination varchar)
RETURNS TABLE(user_id varchar, email varchar) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT u.user_id, u.primary_email FROM "user" u WHERE u.primary_phone = p_destination AND NOT u.is_deleted LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_notification_configuration(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_notification_configuration(varchar, varchar, boolean, boolean, boolean, boolean, boolean, varchar, varchar, integer, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_otp_delivery_channel(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".otp_delivery_recipient(varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".business_otp_create_context(
    p_id varchar, p_challenge varchar, p_purpose varchar, p_org varchar,
    p_store varchar, p_plan varchar, p_subscription varchar, p_user varchar,
    p_staff varchar, p_phone varchar, p_benefits jsonb, p_payload jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM "${schemaName}".otp_challenges c
        WHERE c.otp_challenge_id = p_challenge AND c.purpose = p_purpose
          AND c.destination = p_phone AND c.delivery_channel IN ('SMS', 'EMAIL', 'WHATSAPP')
          AND c.status = 'PENDING' AND c.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')) THEN
        RAISE EXCEPTION 'Business verification is unavailable' USING ERRCODE = '22023';
    END IF;
    INSERT INTO "${schemaName}".business_otp_context (business_otp_context_id, otp_challenge_id, purpose, organization_id, store_id, plan_id, subscription_id, user_id, staff_id, normalized_phone, benefit_ids, payload)
    VALUES (p_id, p_challenge, p_purpose, p_org, p_store, p_plan, p_subscription, p_user, p_staff, p_phone, p_benefits, COALESCE(p_payload, '{}'::jsonb));
    RETURN TRUE;
END;
$function$;

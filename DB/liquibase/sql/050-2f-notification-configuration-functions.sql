-- Batch 2F: the existing one-row-per-organization channel configuration.
CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_notification_configuration(
    p_organization_id varchar, p_actor_user_id varchar
)
RETURNS TABLE (
    id varchar, "organizationId" varchar, "configurationName" varchar,
    "emailEnabled" boolean, "smsEnabled" boolean, "whatsappEnabled" boolean,
    "pushEnabled" boolean, "inAppEnabled" boolean,
    "notificationStatusId" varchar, "createdAt" text, "createdBy" varchar,
    "updatedAt" text, "updatedBy" varchar, "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT n.notification_configuration_id, n.organization_id,
        n.configuration_name, n.email_enabled, n.sms_enabled,
        n.whatsapp_enabled, n.push_enabled, n.in_app_enabled,
        n.notification_status_id, n.created_at::text, n.created_by,
        n.updated_at::text, n.updated_by, n.is_deleted, n.version_no
    FROM "${schemaName}".notification_configurations n
    WHERE n.organization_id = p_organization_id AND n.is_deleted = false
      AND "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_notification_configuration(
    p_organization_id varchar, p_name varchar, p_email_enabled boolean,
    p_sms_enabled boolean, p_whatsapp_enabled boolean, p_push_enabled boolean,
    p_in_app_enabled boolean, p_status_id varchar, p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE
    v_existing_id varchar(40);
    v_existing_deleted boolean;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR p_email_enabled IS NULL OR p_sms_enabled IS NULL
       OR p_whatsapp_enabled IS NULL OR p_push_enabled IS NULL
       OR p_in_app_enabled IS NULL OR p_version_no IS NULL OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Invalid Notification Configuration fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'NOTIFICATION_CONFIGURATION' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Notification Configuration status' USING ERRCODE = '22023';
    END IF;
    SELECT notification_configuration_id, is_deleted
      INTO v_existing_id, v_existing_deleted
    FROM "${schemaName}".notification_configurations
    WHERE organization_id = p_organization_id FOR UPDATE;
    IF v_existing_id IS NULL THEN
        INSERT INTO "${schemaName}".notification_configurations (
            notification_configuration_id, organization_id, configuration_name,
            email_enabled, sms_enabled, whatsapp_enabled, push_enabled,
            in_app_enabled, notification_status_id, created_by,
            updated_at, updated_by
        ) VALUES (
            gen_random_uuid()::text, p_organization_id, p_name,
            p_email_enabled, p_sms_enabled, p_whatsapp_enabled, p_push_enabled,
            p_in_app_enabled, p_status_id, p_actor_user_id,
            CURRENT_TIMESTAMP, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".notification_configurations SET
            configuration_name = p_name, email_enabled = p_email_enabled,
            sms_enabled = p_sms_enabled, whatsapp_enabled = p_whatsapp_enabled,
            push_enabled = p_push_enabled, in_app_enabled = p_in_app_enabled,
            notification_status_id = p_status_id, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, is_deleted = false,
            version_no = version_no + 1
        WHERE notification_configuration_id = v_existing_id
          AND (v_existing_deleted OR version_no = p_version_no);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Notification Configuration changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_notification_configuration(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_notification_configuration(varchar, varchar, boolean, boolean, boolean, boolean, boolean, varchar, integer, varchar) TO "${appRole}";

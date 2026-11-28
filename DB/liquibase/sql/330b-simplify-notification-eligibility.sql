-- Phase 330b
-- Reuse existing customer WhatsApp notification preferences
-- for transactional fulfillment notifications.
-- Simplify fulfillment template activation checks.
-- Preserve existing tables, columns and function signatures.

CREATE OR REPLACE FUNCTION "${schemaName}".resolve_notification_configuration(
    p_component varchar,
    p_event varchar,
    p_channel varchar,
    p_language varchar
)
RETURNS TABLE(
    title text,
    message text,
    provider_template varchar,
    parameter_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$

    SELECT
        template.title,
        template.message,
        template.provider_template,
        template.parameter_names

    FROM notification_event_definitions definition

    JOIN notification_channel_templates template
        ON template.component_code=definition.component_code
       AND template.event_code=definition.event_code

    WHERE definition.component_code=p_component
      AND definition.event_code=p_event
      AND definition.supported
      AND definition.enabled
      AND template.channel=p_channel
      AND template.language_code=p_language

      AND (
          definition.component_code='FULFILLMENT'
          OR template.enabled
      )

      AND (
          p_channel<>'WHATSAPP'
          OR (
              nullif(btrim(template.provider_template),'')
                  IS NOT NULL
              AND (
                  definition.component_code='FULFILLMENT'
                  OR template.provider_approved
              )
          )
      );

$body$;


CREATE OR REPLACE FUNCTION "${schemaName}".resolve_notification_eligibility(
    p_component varchar,
    p_event varchar,
    p_channel varchar,
    p_language varchar,
    p_organization varchar,
    p_recipient varchar
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$

    SELECT EXISTS (
        SELECT 1

        FROM notification_event_definitions definition

        CROSS JOIN LATERAL
            get_notification_channel_settings(
                p_organization
            ) settings

        JOIN "user" account
            ON account.user_id=p_recipient
           AND NOT account.is_deleted
           AND account.user_status_id=
               'entity-status-user-active'

        LEFT JOIN LATERAL
            get_notification_scoped_preference(
                p_recipient,
                definition.consent_scope,
                p_channel
            ) preference ON true

        LEFT JOIN support_notification_user_settings
            customer_settings
            ON customer_settings.user_id=p_recipient

        WHERE definition.component_code=p_component
          AND definition.event_code=p_event

          AND EXISTS (
              SELECT 1
              FROM resolve_notification_configuration(
                  p_component,
                  p_event,
                  p_channel,
                  p_language
              )
          )

          AND CASE

              WHEN definition.component_code='FULFILLMENT'
               AND definition.category='TRANSACTIONAL'

              THEN CASE p_channel

                  WHEN 'IN_APP' THEN
                      settings."inAppEnabled"

                  WHEN 'WHATSAPP' THEN
                      settings."whatsappEnabled"

                      AND coalesce(
                          customer_settings.whatsapp_enabled,
                          false
                      )

                      AND coalesce(
                          customer_settings.whatsapp_opted_in,
                          false
                      )

                      AND customer_settings.whatsapp_consent_at
                          IS NOT NULL

                      AND customer_settings.whatsapp_consent_withdrawn_at
                          IS NULL

                      AND coalesce(
                          customer_settings.delivery_mode,
                          'DEFAULT'
                      ) <> 'MOCK'

                      AND account.primary_phone
                          ~ '^[+][1-9][0-9]{7,14}$'

                  ELSE false

              END

              ELSE

                  coalesce(preference.enabled,false)

                  AND CASE p_channel

                      WHEN 'IN_APP' THEN
                          settings."inAppEnabled"
                          AND (
                              definition.category='TRANSACTIONAL'
                              OR preference.consent_granted
                          )

                      WHEN 'WHATSAPP' THEN
                          settings."whatsappEnabled"
                          AND preference.consent_granted
                          AND coalesce(
                              customer_settings.whatsapp_enabled,
                              true
                          )
                          AND coalesce(
                              customer_settings.delivery_mode,
                              'DEFAULT'
                          ) <> 'MOCK'

                      ELSE false

                  END

          END
    );

$body$;


CREATE OR REPLACE FUNCTION "${schemaName}".claim_notification_delivery(
    p_delivery varchar
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$

DECLARE
    v_delivery notification_channel_deliveries%ROWTYPE;
    v_event notification_events%ROWTYPE;
    v_destination varchar;
    v_config record;
    v_token uuid;
    v_consent_valid boolean;

BEGIN

    SELECT *
    INTO v_delivery
    FROM notification_channel_deliveries d
    WHERE d.delivery_id=p_delivery
      AND d.channel='WHATSAPP'
      AND d.status='PREPARED'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT *
    INTO STRICT v_event
    FROM notification_events e
    WHERE e.event_id=v_delivery.event_id;

    SELECT account.primary_phone
    INTO v_destination
    FROM "user" account
    WHERE account.user_id=v_event.recipient_user_id
      AND account.version_no=
          v_delivery.recipient_account_version
      AND NOT account.is_deleted
      AND account.user_status_id=
          'entity-status-user-active'
      AND account.primary_phone
          ~ '^[+][1-9][0-9]{7,14}$'
    FOR SHARE;

    SELECT *
    INTO v_config
    FROM resolve_notification_configuration(
        v_event.component_code,
        v_event.event_code,
        v_delivery.channel,
        v_delivery.language_code
    );

    IF v_destination IS NULL
       OR NOT FOUND
       OR NOT resolve_notification_eligibility(
           v_event.component_code,
           v_event.event_code,
           v_delivery.channel,
           v_delivery.language_code,
           v_event.organization_id,
           v_event.recipient_user_id
       )
    THEN

        UPDATE notification_channel_deliveries d
        SET status='SUPPRESSED',
            updated_at=CURRENT_TIMESTAMP
        WHERE d.delivery_id=p_delivery;

        RETURN NULL;

    END IF;


    -- Fulfillment transactional notifications reuse
    -- existing customer WhatsApp consent.

    IF v_event.component_code='FULFILLMENT'
       AND EXISTS (
           SELECT 1
           FROM notification_event_definitions def
           WHERE def.component_code=v_event.component_code
             AND def.event_code=v_event.event_code
             AND def.category='TRANSACTIONAL'
       )
    THEN

        SELECT EXISTS (
            SELECT 1
            FROM support_notification_user_settings s
            WHERE s.user_id=v_event.recipient_user_id
              AND s.whatsapp_enabled
              AND s.whatsapp_opted_in
              AND s.whatsapp_consent_at IS NOT NULL
              AND s.whatsapp_consent_withdrawn_at IS NULL
              AND s.whatsapp_consent_at<=v_event.created_at
              AND coalesce(
                  s.delivery_mode,
                  'DEFAULT'
              ) <> 'MOCK'
        )
        INTO v_consent_valid;

    ELSE

        -- Preserve scoped consent validation for other
        -- notification categories and components.

        SELECT EXISTS (
            SELECT 1
            FROM notification_event_definitions def
            JOIN notification_scoped_preferences pref
                ON pref.scope_code=def.consent_scope
            WHERE def.component_code=v_event.component_code
              AND def.event_code=v_event.event_code
              AND pref.user_id=v_event.recipient_user_id
              AND pref.channel=v_delivery.channel
              AND pref.consent_granted_at<=v_event.created_at
        )
        INTO v_consent_valid;

    END IF;


    IF NOT v_consent_valid THEN

        UPDATE notification_channel_deliveries d
        SET status='SUPPRESSED',
            updated_at=CURRENT_TIMESTAMP
        WHERE d.delivery_id=p_delivery;

        RETURN NULL;

    END IF;


    v_token := gen_random_uuid();

    UPDATE notification_channel_deliveries d
    SET status='CLAIMED',
        claim_token=v_token,
        updated_at=CURRENT_TIMESTAMP
    WHERE d.delivery_id=p_delivery;


    RETURN jsonb_build_object(
        'deliveryId',p_delivery,
        'claimToken',v_token,
        'eventId',v_event.event_id,
        'component',v_event.component_code,
        'eventType',v_event.event_code,
        'sourceType',v_event.source_type,
        'sourceId',v_event.source_id,
        'sourceActionId',v_event.source_action_id,
        'organizationId',v_event.organization_id,
        'recipientUserId',v_event.recipient_user_id,
        'destination',v_destination,
        'language',v_delivery.language_code,
        'providerTemplate',v_config.provider_template,
        'title',v_config.title,
        'message',v_config.message,
        'parameterNames',v_config.parameter_names,
        'parameters',v_event.event_parameters,
        'context',v_event.navigation_context,
        'allowedParameters',(
            SELECT def.allowed_parameters
            FROM notification_event_definitions def
            WHERE def.component_code=v_event.component_code
              AND def.event_code=v_event.event_code
        )
    );

END;
$body$;


-- Preserve existing permissions.

REVOKE ALL ON FUNCTION
    "${schemaName}".resolve_notification_configuration(
        varchar,varchar,varchar,varchar
    ),
    "${schemaName}".resolve_notification_eligibility(
        varchar,varchar,varchar,varchar,varchar,varchar
    ),
    "${schemaName}".claim_notification_delivery(varchar)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".resolve_notification_configuration(
        varchar,varchar,varchar,varchar
    ),
    "${schemaName}".resolve_notification_eligibility(
        varchar,varchar,varchar,varchar,varchar,varchar
    ),
    "${schemaName}".claim_notification_delivery(varchar)
TO "${appRole}";
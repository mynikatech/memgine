-- Fix PL/pgSQL variable and column name ambiguity
-- in fulfillment notification selection validation.

CREATE OR REPLACE FUNCTION "${schemaName}".validate_new_fulfillment_notification_choices(
    p_before jsonb,
    p_after jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp
AS $body$
DECLARE
    v_event_code text;
BEGIN
    IF p_after IS NULL THEN
        RETURN;
    END IF;

    IF jsonb_typeof(p_after) <> 'array' THEN
        RAISE EXCEPTION 'notificationEvents must be an array'
            USING ERRCODE='22023';
    END IF;

    FOR v_event_code IN
        SELECT jsonb_array_elements_text(p_after)
    LOOP
        IF NOT coalesce(p_before ? v_event_code,false)
           AND NOT EXISTS (
               SELECT 1
               FROM notification_event_definitions d
               WHERE d.component_code='FULFILLMENT'
                 AND d.event_code=v_event_code
                 AND d.supported
           )
        THEN
            RAISE EXCEPTION 'Notification event is not yet supported'
                USING ERRCODE='22023';
        END IF;
    END LOOP;
END;
$body$;

REVOKE ALL ON FUNCTION
    "${schemaName}".validate_new_fulfillment_notification_choices(jsonb,jsonb)
FROM PUBLIC,"${appRole}";
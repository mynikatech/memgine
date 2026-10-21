-- Cancellation and the Collect charge claim both lock payment_intents first.
-- The winner determines the durable state: a pending checkout can be canceled,
-- while a claimed PROCESSING checkout remains available only for recovery.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_cancel_intent(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_payment payment_intents%ROWTYPE;
    v_is_poynt_collect boolean := false;
BEGIN
    SELECT *
      INTO v_payment
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND payment_intent_id = p_intent_id
     FOR UPDATE;

    IF NOT FOUND
       OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    -- Repeating an already-confirmed cancellation is safe and idempotent.
    IF v_payment.status = 'CANCELED' THEN
        RETURN true;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_payment.payment_provider_config_id
           AND pc.provider_code = 'POYNT_COLLECT'
    )
      INTO v_is_poynt_collect;

    IF v_is_poynt_collect THEN
        -- payment_claim_poynt_collect_charge locks this same row before it
        -- changes PENDING to PROCESSING. A Collect charge is never canceled
        -- after that claim succeeds.
        IF v_payment.status <> 'PENDING' THEN
            RETURN false;
        END IF;
    ELSIF v_payment.status NOT IN ('PENDING', 'PROCESSING') THEN
        -- Preserve the established cancellation behavior for non-Collect
        -- providers; this migration narrows only Poynt Collect semantics.
        RETURN false;
    END IF;

    UPDATE payment_intents
       SET status = 'CANCELED',
           cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment.payment_intent_id;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_cancel_intent(varchar, varchar, varchar)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_cancel_intent(varchar, varchar, varchar)
TO "${appRole}";

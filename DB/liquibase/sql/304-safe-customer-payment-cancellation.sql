
-- 304-safe-customer-payment-cancellation.sql
--
-- Preserve the provider-neutral cancellation contract established by
-- Migration 201 while strengthening Poynt Collect cancellation safety.
--
-- Poynt Collect:
--   Cancel only PENDING, unclaimed, uncharged payment intents.
--
-- Other providers:
--   Preserve Migration 201's existing PENDING / PROCESSING behavior.
--
-- No triggers. No pgcrypto.

CREATE OR REPLACE FUNCTION "${schemaName}".payment_cancel_intent(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_payment payment_intents%ROWTYPE;
    v_is_poynt_collect boolean := false;
BEGIN
    -- Preserve the established row-lock order from Migration 201.
    --
    -- payment_claim_poynt_collect_charge() also locks the payment
    -- intent before changing its status to PROCESSING.
    --
    -- Do not acquire the customer-membership advisory lock here:
    -- the payment-start function acquires it before the row lock,
    -- and reversing that order could introduce a deadlock.

    SELECT *
      INTO v_payment
      FROM payment_intents
     WHERE organization_id = p_organization_id
       AND payment_intent_id = p_intent_id
     FOR UPDATE;

    IF NOT FOUND
       OR NOT payment_actor_is_authorized(
           p_intent_id,
           p_actor_user_id
       )
    THEN
        RAISE EXCEPTION 'Payment is not available'
            USING ERRCODE = '42501';
    END IF;

    -- Preserve existing idempotent cancellation behavior.
    IF v_payment.status = 'CANCELED' THEN
        RETURN TRUE;
    END IF;

    SELECT EXISTS (
        SELECT 1
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id =
               v_payment.payment_provider_config_id
           AND pc.provider_code = 'POYNT_COLLECT'
    )
    INTO v_is_poynt_collect;

    IF v_is_poynt_collect THEN

        -- A Collect charge may only begin after the atomic
        -- PENDING -> PROCESSING claim.
        --
        -- Reject cancellation if that claim has occurred,
        -- if a provider reference exists, or if fulfillment
        -- has already been recorded.

        IF v_payment.status <> 'PENDING'
           OR v_payment.provider_reference_id IS NOT NULL
           OR v_payment.finalized_subscription_id IS NOT NULL
        THEN
            RETURN FALSE;
        END IF;

        -- Do not cancel if any attempt has advanced beyond
        -- its original pending state or carries provider evidence.

        IF EXISTS (
            SELECT 1
              FROM payment_attempts a
             WHERE a.payment_intent_id = p_intent_id
               AND (
                   a.status <> 'PENDING'
                   OR a.provider_reference_id IS NOT NULL
               )
        ) THEN
            RETURN FALSE;
        END IF;

        -- Verified captures always take priority over abandonment.

        IF EXISTS (
            SELECT 1
              FROM poynt_collect_verified_captures c
             WHERE c.organization_id = p_organization_id
               AND c.payment_intent_id = p_intent_id
        ) THEN
            RETURN FALSE;
        END IF;

    ELSIF v_payment.status NOT IN ('PENDING', 'PROCESSING') THEN

        -- Preserve Migration 201's established behavior for
        -- all other payment providers.
        --
        -- Provider-specific improvements must be introduced
        -- independently, after reviewing their charge lifecycles.

        RETURN FALSE;

    END IF;

    UPDATE payment_intents
       SET status = 'CANCELED',
           cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id
     WHERE payment_intent_id = v_payment.payment_intent_id;

    -- Keep the existing non-Collect attempt behavior unchanged.
    -- For Collect, synchronize only untouched pending attempts.

    IF v_is_poynt_collect THEN
        UPDATE payment_attempts
           SET status = 'CANCELED',
               processed_at = CURRENT_TIMESTAMP
         WHERE payment_intent_id = p_intent_id
           AND status = 'PENDING';
    END IF;

    RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".payment_cancel_intent(
        varchar, varchar, varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".payment_cancel_intent(
        varchar, varchar, varchar
    )
TO "${appRole}";

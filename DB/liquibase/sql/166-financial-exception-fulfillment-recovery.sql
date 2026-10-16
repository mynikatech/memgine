-- Stage P4-B: recover fulfillment only from durable, verified financial evidence.
-- These functions never contact a provider, create a charge, or dispatch a terminal payment.

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    DROP CONSTRAINT ck_financial_exception_fulfillment_outcome,
    ADD CONSTRAINT ck_financial_exception_fulfillment_outcome
    CHECK (fulfillment_outcome IN ('UNFULFILLED', 'FAILED', 'UNKNOWN', 'FULFILLED'));

CREATE OR REPLACE FUNCTION "${schemaName}".payment_recover_collect_financial_exception(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "subscriptionId" varchar, "organizationUserId" varchar, "userId" varchar,
    "subscriptionNumber" varchar, "subscriptionPlanId" varchar, "subscriptionDate" text,
    "startDate" text, "endDate" text, "subscriptionStatusId" varchar,
    "totalAmount" double precision, "currencyCode" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_result record;
BEGIN
    SELECT * INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM payment_provider_configs pc
         WHERE pc.payment_provider_config_id = v_intent.payment_provider_config_id
           AND (pc.organization_id = v_intent.organization_id OR pc.organization_id IS NULL)
           AND pc.provider_code = 'POYNT_COLLECT'
    )
       OR v_intent.authorization_mode <> 'CUSTOMER_SESSION'
       OR v_intent.customer_user_id IS NULL
    THEN
        RAISE EXCEPTION 'Payment is not eligible for fulfillment recovery' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id;

    IF NOT FOUND
       OR v_capture.provider_transaction_id IS DISTINCT FROM v_intent.provider_reference_id
       OR round(v_intent.amount * 100)::bigint <> v_capture.amount_minor
       OR upper(v_intent.currency_code) <> upper(v_capture.currency_code)
    THEN
        RAISE EXCEPTION 'Verified capture is unavailable' USING ERRCODE = '22023';
    END IF;

    IF v_intent.finalized_subscription_id IS NULL THEN
        IF v_intent.status <> 'PROCESSING' THEN
            RAISE EXCEPTION 'Payment is not eligible for fulfillment recovery' USING ERRCODE = '22023';
        END IF;
        IF NOT payment_record_result(
            p_intent_id, NULL, 'SUCCEEDED', v_capture.provider_transaction_id,
            NULL, NULL, p_actor_user_id
        ) THEN
            RAISE EXCEPTION 'Payment cannot be confirmed' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT * INTO v_result
      FROM payment_finalize_membership(p_intent_id, p_actor_user_id);

    IF v_result."subscriptionId" IS NULL THEN
        RAISE EXCEPTION 'Membership fulfillment was unavailable' USING ERRCODE = 'P0002';
    END IF;

    UPDATE poynt_collect_financial_exceptions
       SET case_status = 'RESOLVED',
           fulfillment_outcome = 'FULFILLED',
           related_subscription_id = v_result."subscriptionId",
           resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = p_organization_id
       AND payment_intent_id = p_intent_id;

    RETURN QUERY SELECT
        v_result."subscriptionId", v_result."organizationUserId", v_result."userId",
        v_result."subscriptionNumber", v_result."subscriptionPlanId", v_result."subscriptionDate",
        v_result."startDate", v_result."endDate", v_result."subscriptionStatusId",
        v_result."totalAmount", v_result."currencyCode";
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_open_counter_financial_exception_for_recovery(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    -- Validate the requested transaction without taking its row lock. The
    -- financial lock order begins with the attempt below.
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        RAISE EXCEPTION 'Counter fulfillment recovery is not permitted' USING ERRCODE = '42501';
    END IF;

    -- Match and lock the payment attempt first, exactly as the existing
    -- callback finalizer does. The join constrains it to this organization and
    -- transaction but deliberately does not lock the Commerce row yet.
    SELECT a.* INTO v_attempt
      FROM commerce_provider_payment_attempts a
      JOIN commerce_transactions t
        ON t.commerce_transaction_id = a.commerce_transaction_id
       AND t.organization_id = p_organization_id
       AND NOT t.is_deleted
     WHERE a.commerce_transaction_id = p_transaction_id
       AND a.payment_channel = 'REMOTE_TERMINAL'
       AND a.provider_status = 'SUCCEEDED'
     ORDER BY a.created_at DESC
     LIMIT 1
     FOR UPDATE OF a;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verified Counter capture is unavailable' USING ERRCODE = '22023';
    END IF;

    -- Lock the exact Commerce row second and revalidate all correlation and
    -- authorization data under that lock before opening the exception case.
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = v_attempt.commerce_transaction_id
       AND commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        RAISE EXCEPTION 'Counter fulfillment recovery is not permitted' USING ERRCODE = '42501';
    END IF;

    PERFORM commerce_counter_checkout_actor_organization_user(
        v_transaction.commerce_transaction_id,
        p_actor_user_id
    );

    -- A completed redemption or a Counter membership already linked to a
    -- subscription is fulfilled; do not fabricate a new exception case.
    IF (v_transaction.source_channel = 'COUNTER_REDEMPTION' AND v_transaction.status = 'COMPLETED')
       OR (v_transaction.source_channel = 'COUNTER' AND NULLIF(btrim(v_transaction.subscription_id), '') IS NOT NULL)
    THEN
        RETURN NULL;
    END IF;

    IF v_transaction.status <> 'PROVIDER_SUCCEEDED'
       OR NULLIF(btrim(v_attempt.provider_reference_id), '') IS NULL
       OR NULLIF(btrim(v_attempt.provider_transaction_id), '') IS NULL
       OR v_attempt.amount_minor IS DISTINCT FROM v_transaction.total_minor
       OR upper(v_attempt.currency_code) IS DISTINCT FROM upper(v_transaction.currency_code)
    THEN
        RAISE EXCEPTION 'Verified Counter capture is unavailable' USING ERRCODE = '22023';
    END IF;

    -- The existing opener locks the same attempt first and transaction second;
    -- reentrant row locks preserve the established order.
    RETURN commerce_open_remote_terminal_financial_exception(v_attempt.provider_reference_id);
END;
$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_recover_counter_financial_exception(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_result varchar;
BEGIN
    -- Validate the requested transaction without locking it. The callback and
    -- finalizer lock the attempt before the Commerce transaction.
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        RAISE EXCEPTION 'Counter fulfillment recovery is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT a.* INTO v_attempt
      FROM commerce_provider_payment_attempts a
      JOIN commerce_transactions t
        ON t.commerce_transaction_id = a.commerce_transaction_id
       AND t.organization_id = p_organization_id
       AND NOT t.is_deleted
     WHERE a.commerce_transaction_id = p_transaction_id
       AND a.payment_channel = 'REMOTE_TERMINAL'
       AND a.provider_status = 'SUCCEEDED'
     ORDER BY a.created_at DESC
     LIMIT 1
     FOR UPDATE OF a;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verified Counter capture is unavailable' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = v_attempt.commerce_transaction_id
       AND commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        RAISE EXCEPTION 'Counter fulfillment recovery is not permitted' USING ERRCODE = '42501';
    END IF;

    PERFORM commerce_counter_checkout_actor_organization_user(
        v_transaction.commerce_transaction_id,
        p_actor_user_id
    );

    IF NULLIF(btrim(v_attempt.provider_reference_id), '') IS NULL
       OR NULLIF(btrim(v_attempt.provider_transaction_id), '') IS NULL
       OR v_attempt.amount_minor IS DISTINCT FROM v_transaction.total_minor
       OR upper(v_attempt.currency_code) IS DISTINCT FROM upper(v_transaction.currency_code)
    THEN
        RAISE EXCEPTION 'Verified Counter capture is unavailable' USING ERRCODE = '22023';
    END IF;

    IF (v_transaction.source_channel = 'COUNTER_REDEMPTION' AND v_transaction.status = 'COMPLETED')
       OR (v_transaction.source_channel = 'COUNTER' AND NULLIF(btrim(v_transaction.subscription_id), '') IS NOT NULL)
    THEN
        v_result := v_transaction.commerce_transaction_id;
    ELSE
        IF v_transaction.status <> 'PROVIDER_SUCCEEDED' THEN
            RAISE EXCEPTION 'Counter fulfillment is not eligible for recovery' USING ERRCODE = '22023';
        END IF;
        -- Existing finalization locks the same attempt and then transaction,
        -- so this nested call cannot introduce an inverse lock order.
        v_result := commerce_finalize_counter_payment_by_reference(v_attempt.provider_reference_id);
    END IF;

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Counter fulfillment was unavailable' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF v_transaction.source_channel = 'COUNTER_REDEMPTION'
       AND v_transaction.status <> 'COMPLETED'
    THEN
        RAISE EXCEPTION 'Counter redemption fulfillment was unavailable' USING ERRCODE = 'P0002';
    END IF;

    IF v_transaction.source_channel = 'COUNTER'
       AND NULLIF(btrim(v_transaction.subscription_id), '') IS NULL
    THEN
        RAISE EXCEPTION 'Counter membership fulfillment was unavailable' USING ERRCODE = 'P0002';
    END IF;

    UPDATE poynt_collect_financial_exceptions
       SET case_status = 'RESOLVED',
           fulfillment_outcome = 'FULFILLED',
           related_subscription_id = CASE
               WHEN v_transaction.source_channel = 'COUNTER' THEN v_transaction.subscription_id
               ELSE related_subscription_id
           END,
           resolved_at = COALESCE(resolved_at, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
     WHERE organization_id = p_organization_id
       AND commerce_transaction_id = p_transaction_id;

    RETURN p_transaction_id;
END;
$function$;
REVOKE ALL ON FUNCTION
    "${schemaName}".payment_recover_collect_financial_exception(varchar, varchar, varchar),
    "${schemaName}".commerce_open_counter_financial_exception_for_recovery(varchar, varchar, varchar),
    "${schemaName}".commerce_recover_counter_financial_exception(varchar, varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".payment_recover_collect_financial_exception(varchar, varchar, varchar),
    "${schemaName}".commerce_open_counter_financial_exception_for_recovery(varchar, varchar, varchar),
    "${schemaName}".commerce_recover_counter_financial_exception(varchar, varchar, varchar)
TO "${appRole}";

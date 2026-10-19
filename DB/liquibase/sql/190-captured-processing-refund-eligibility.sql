-- 190: Accept verified captured-but-stuck Collect payments with a linked exception.
-- Creation only. This changes no refund execution, no Poynt dispatch, and no membership status.
-- DO NOT ENABLE DISPATCH until pre-execution live-provider verification is in place.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_request(
    p_refund_id varchar,
    p_organization_id varchar,
    p_payment_intent_id varchar,
    p_amount_minor bigint,
    p_reason_code varchar,
    p_explanation varchar,
    p_support_request_id varchar,
    p_financial_exception_id varchar,
    p_idempotency_key varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,
    "approvalStatus" varchar,
    "executionStatus" varchar,
    "refundAmountMinor" bigint,
    "currencyCode" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_existing payment_refunds%ROWTYPE;
    v_reserved bigint;
    v_reference varchar;
    v_channel varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Refund request is not permitted' USING ERRCODE = '42501';
    END IF;

    IF NULLIF(btrim(p_idempotency_key), '') IS NULL
       OR length(p_idempotency_key) > 160 THEN
        RAISE EXCEPTION 'Refund idempotency key is required' USING ERRCODE = '22023';
    END IF;

    IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
        RAISE EXCEPTION 'Refund amount is required' USING ERRCODE = '22023';
    END IF;

    IF p_reason_code NOT IN (
        'DUPLICATE_PAYMENT',
        'CAPTURED_NOT_FULFILLED',
        'GOODWILL',
        'INCORRECT_AMOUNT',
        'MEMBERSHIP_CANCELLATION',
        'OTHER_APPROVED'
    ) THEN
        RAISE EXCEPTION 'Refund reason is invalid' USING ERRCODE = '22023';
    END IF;

    IF p_reason_code IN ('GOODWILL', 'OTHER_APPROVED')
       AND length(btrim(COALESCE(p_explanation, ''))) < 10 THEN
        RAISE EXCEPTION 'A meaningful refund explanation is required' USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_existing
      FROM payment_refunds
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key
     FOR UPDATE;

    IF FOUND THEN
        IF v_existing.payment_intent_id IS DISTINCT FROM p_payment_intent_id
           OR v_existing.refund_amount_minor IS DISTINCT FROM p_amount_minor
           OR v_existing.reason_code IS DISTINCT FROM p_reason_code
           OR COALESCE(v_existing.explanation, '') IS DISTINCT FROM COALESCE(NULLIF(btrim(p_explanation), ''), '')
           OR v_existing.support_request_id IS DISTINCT FROM p_support_request_id
           OR v_existing.financial_exception_id IS DISTINCT FROM p_financial_exception_id THEN
            RAISE EXCEPTION 'Refund idempotency key conflicts with existing request'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
            v_existing.payment_refund_id,
            v_existing.approval_status,
            v_existing.execution_status,
            v_existing.refund_amount_minor,
            v_existing.currency_code,
            v_existing.version_no;
        RETURN;
    END IF;

    -- Serialize refundable-amount reservations without holding locks during provider work.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('payment-refund:' || p_payment_intent_id, 0)
    );

    SELECT *
      INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_payment_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original payment is unavailable' USING ERRCODE = '22023';
    END IF;
    -- A non-final Collect payment can be genuinely captured while fulfillment is
    -- stranded. Only an explicitly linked financial exception + verified capture
    -- may pass this eligibility gate. The later verified-capture guard still runs.
    IF v_intent.status <> 'SUCCEEDED' AND NOT (
        v_intent.status = 'PROCESSING'
        AND p_financial_exception_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM poynt_collect_financial_exceptions f
            WHERE f.financial_exception_id = p_financial_exception_id
              AND f.organization_id = p_organization_id
              AND f.payment_intent_id = p_payment_intent_id
        )
        AND EXISTS (
            SELECT 1 FROM payment_provider_configs pc
            WHERE pc.payment_provider_config_id = v_intent.payment_provider_config_id
              AND pc.provider_code = 'POYNT_COLLECT'
              AND (pc.organization_id = p_organization_id OR pc.organization_id IS NULL)
        )
        AND EXISTS (
            SELECT 1 FROM poynt_collect_verified_captures c
            WHERE c.payment_intent_id = v_intent.payment_intent_id
              AND c.organization_id = p_organization_id
              AND c.provider_transaction_id = v_intent.provider_reference_id
              AND c.amount_minor = round(v_intent.amount * 100)::bigint
              AND upper(c.currency_code) = upper(v_intent.currency_code)
        )
    ) THEN
        RAISE EXCEPTION 'Original payment capture is not verified for refund' USING ERRCODE = '22023';
    END IF;

    -- Use original payment evidence, never current provider routing.
    SELECT provider_code
      INTO v_provider_code
      FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id
       AND (organization_id = p_organization_id OR organization_id IS NULL);

    v_reference := NULLIF(btrim(v_intent.provider_reference_id), '');

    IF v_provider_code IS NULL OR v_reference IS NULL THEN
        RAISE EXCEPTION 'Original provider transaction requires manual investigation'
            USING ERRCODE = '22023';
    END IF;

    IF v_provider_code = 'POYNT_COLLECT'
       AND NOT EXISTS (
           SELECT 1
             FROM poynt_collect_verified_captures c
            WHERE c.payment_intent_id = v_intent.payment_intent_id
              AND c.organization_id = p_organization_id
              AND c.provider_transaction_id = v_reference
              AND c.amount_minor = round(v_intent.amount * 100)::bigint
              AND upper(c.currency_code) = upper(v_intent.currency_code)
       ) THEN
        RAISE EXCEPTION 'Verified provider capture is unavailable' USING ERRCODE = '22023';
    END IF;

    -- PENDING and unknown refunds continue to reserve their amounts.
    SELECT COALESCE(sum(refund_amount_minor), 0)
      INTO v_reserved
      FROM payment_refunds
     WHERE payment_intent_id = p_payment_intent_id
       AND NOT (execution_status = 'FAILED' OR approval_status = 'REJECTED');

    IF v_reserved + p_amount_minor > round(v_intent.amount * 100)::bigint THEN
        RAISE EXCEPTION 'Refund amount exceeds remaining refundable amount'
            USING ERRCODE = '22023';
    END IF;

    IF p_financial_exception_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM poynt_collect_financial_exceptions f
            WHERE f.financial_exception_id = p_financial_exception_id
              AND f.organization_id = p_organization_id
              AND f.payment_intent_id = p_payment_intent_id
       ) THEN
        RAISE EXCEPTION 'Financial exception is unavailable for this payment'
            USING ERRCODE = '22023';
    END IF;

    IF p_support_request_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM customer_support_requests s
            WHERE s.support_request_id = p_support_request_id
              AND s.organization_id = p_organization_id
              AND s.customer_user_id = v_intent.customer_user_id
       ) THEN
        RAISE EXCEPTION 'Support request is unavailable for this payment customer'
            USING ERRCODE = '22023';
    END IF;

    v_channel := CASE
        WHEN v_intent.authorization_mode = 'CUSTOMER_SESSION' THEN 'CUSTOMER_MEMBERSHIP'
        ELSE 'COUNTER'
    END;

    INSERT INTO payment_refunds (
        payment_refund_id,
        organization_id,
        payment_intent_id,
        original_provider_code,
        original_provider_transaction_reference,
        original_provider_config_id,
        original_integration_configuration_id,
        original_store_id,
        original_channel,
        captured_amount_minor,
        currency_code,
        refund_amount_minor,
        reason_code,
        explanation,
        support_request_id,
        financial_exception_id,
        idempotency_key,
        requested_by,
        approval_status,
        execution_status,
        approved_at
    ) VALUES (
        p_refund_id,
        p_organization_id,
        p_payment_intent_id,
        v_provider_code,
        v_reference,
        v_intent.payment_provider_config_id,
        v_intent.collect_integration_configuration_id,
        v_intent.store_id,
        v_channel,
        round(v_intent.amount * 100)::bigint,
        upper(v_intent.currency_code),
        p_amount_minor,
        p_reason_code,
        NULLIF(btrim(p_explanation), ''),
        p_support_request_id,
        p_financial_exception_id,
        p_idempotency_key,
        p_actor_user_id,
        'APPROVED',
        'READY',
        CURRENT_TIMESTAMP
    );

    INSERT INTO payment_refund_events (
        payment_refund_event_id,
        payment_refund_id,
        organization_id,
        event_type,
        previous_approval_status,
        new_approval_status,
        previous_execution_status,
        new_execution_status,
        actor_user_id,
        actor_origin,
        description,
        event_identity
    ) VALUES (
        'PRE_' || gen_random_uuid()::text,
        p_refund_id,
        p_organization_id,
        'AUTO_APPROVED',
        NULL,
        'APPROVED',
        NULL,
        'READY',
        NULL,
        'SYSTEM_POLICY',
        'MVP refund policy automatically approved the eligible refund request.',
        'AUTO_APPROVED:' || p_refund_id
    );

    -- Only fix: upper() yields text; RETURN QUERY requires varchar in column 5.
    RETURN QUERY
    SELECT
        p_refund_id,
        'APPROVED'::varchar,
        'READY'::varchar,
        p_amount_minor,
        upper(v_intent.currency_code)::varchar,
        1;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_request(
    varchar, varchar, varchar, bigint, varchar, varchar, varchar, varchar, varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_request(
    varchar, varchar, varchar, bigint, varchar, varchar, varchar, varchar, varchar, varchar
) TO "${appRole}";

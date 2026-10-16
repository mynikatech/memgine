-- Stage 4A: broaden the existing durable Collect exception relation into the
-- common, provider-neutral financial-exception case store. The historical table
-- name is retained so migrations 159-161 and their existing Collect records do
-- not need a data migration. Existing Collect cases remain one-per-payment-intent.

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    DROP CONSTRAINT poynt_collect_financial_exceptions_provider_transaction_id_key,
    DROP CONSTRAINT poynt_collect_financial_exceptions_classification_check;

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    ALTER COLUMN payment_intent_id DROP NOT NULL,
    ALTER COLUMN customer_user_id DROP NOT NULL,
    ALTER COLUMN membership_plan_id DROP NOT NULL,
    ALTER COLUMN provider_transaction_id DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS commerce_transaction_id varchar(64)
        REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    ADD COLUMN IF NOT EXISTS source_channel varchar(32) NOT NULL DEFAULT 'CUSTOMER_MEMBERSHIP',
    ADD COLUMN IF NOT EXISTS provider_code varchar(64) NOT NULL DEFAULT 'POYNT_COLLECT',
    ADD COLUMN IF NOT EXISTS provider_reference_id varchar(160),
    ADD COLUMN IF NOT EXISTS provider_outcome varchar(32) NOT NULL DEFAULT 'CAPTURED',
    ADD COLUMN IF NOT EXISTS fulfillment_outcome varchar(32) NOT NULL DEFAULT 'UNFULFILLED',
    ADD COLUMN IF NOT EXISTS evidence_reason varchar(500);

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    ADD CONSTRAINT ck_financial_exception_classification
    CHECK (classification IN ('CAPTURED_UNFULFILLED', 'PROVIDER_OUTCOME_UNRESOLVED',
                              'POSSIBLE_DUPLICATE', 'VERIFIED_DUPLICATE',
                              'FINALIZATION_RETRY_REQUIRED', 'MANUAL_REVIEW')),
    ADD CONSTRAINT ck_financial_exception_source
    CHECK (
        (payment_intent_id IS NOT NULL AND commerce_transaction_id IS NULL)
        OR (payment_intent_id IS NULL AND commerce_transaction_id IS NOT NULL)
    ),
    ADD CONSTRAINT ck_financial_exception_source_channel
    CHECK (source_channel IN ('CUSTOMER_MEMBERSHIP', 'COUNTER', 'COUNTER_REDEMPTION')),
    ADD CONSTRAINT ck_financial_exception_provider_outcome
    CHECK (provider_outcome IN ('CAPTURED', 'UNRESOLVED')),
    ADD CONSTRAINT ck_financial_exception_fulfillment_outcome
    CHECK (fulfillment_outcome IN ('UNFULFILLED', 'FAILED', 'UNKNOWN'));

CREATE UNIQUE INDEX uq_financial_exception_provider_transaction
    ON "${schemaName}".poynt_collect_financial_exceptions
       (provider_code, provider_transaction_id)
    WHERE provider_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX uq_financial_exception_commerce_transaction
    ON "${schemaName}".poynt_collect_financial_exceptions (commerce_transaction_id)
    WHERE commerce_transaction_id IS NOT NULL;

CREATE INDEX ix_financial_exception_commerce_open
    ON "${schemaName}".poynt_collect_financial_exceptions
       (organization_id, commerce_transaction_id, case_status, opened_at DESC)
    WHERE commerce_transaction_id IS NOT NULL;

-- Called only after a Payment Bridge callback was persisted and downstream
-- Counter fulfillment subsequently failed. It derives every financial field
-- from immutable Commerce/attempt evidence; it never treats progress callbacks
-- or a failed/cancelled attempt as a capture.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_open_remote_terminal_financial_exception(
    p_reference_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_transaction commerce_transactions%ROWTYPE;
    v_provider_code varchar(64);
    v_case_id varchar(64);
BEGIN
    IF NULLIF(btrim(p_reference_id), '') IS NULL OR length(p_reference_id) > 160 THEN
        RAISE EXCEPTION 'Invalid remote payment reference' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
      FROM commerce_provider_payment_attempts
     WHERE provider_reference_id = btrim(p_reference_id)
       AND payment_channel = 'REMOTE_TERMINAL'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Remote payment reference not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = v_attempt.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    -- Only the two Counter flows are supported by this callback evidence path.
    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        RETURN NULL;
    END IF;

    -- A case is evidence-backed only when the persisted callback validation has
    -- already marked a complete, amount/currency-matching capture successful.
    -- DISPATCHING, DISPATCHED, RECEIVED, STARTED, FAILED, and CANCELLED are not
    -- financial-success evidence and must never be classified as CAPTURED.
    IF v_attempt.provider_status <> 'SUCCEEDED'
       OR v_transaction.status <> 'PROVIDER_SUCCEEDED'
       OR NULLIF(btrim(v_attempt.provider_transaction_id), '') IS NULL
       OR v_attempt.amount_minor IS DISTINCT FROM v_transaction.total_minor
       OR upper(v_attempt.currency_code) IS DISTINCT FROM upper(v_transaction.currency_code)
    THEN
        RETURN NULL;
    END IF;

    SELECT upper(i.provider) INTO v_provider_code
      FROM integration_configurations i
     WHERE i.integration_configuration_id = v_transaction.integration_configuration_id
       AND i.organization_id = v_transaction.organization_id
       AND NOT i.is_deleted;

    v_provider_code := COALESCE(v_provider_code, 'POYNT');

    INSERT INTO poynt_collect_financial_exceptions (
        financial_exception_id,
        organization_id,
        commerce_transaction_id,
        source_channel,
        provider_code,
        provider_reference_id,
        provider_transaction_id,
        amount_minor,
        currency_code,
        classification,
        classification_reason,
        evidence_reason,
        provider_outcome,
        fulfillment_outcome
    ) VALUES (
        'PFE_' || gen_random_uuid()::text,
        v_transaction.organization_id,
        v_transaction.commerce_transaction_id,
        v_transaction.source_channel,
        v_provider_code,
        v_attempt.provider_reference_id,
        v_attempt.provider_transaction_id,
        v_attempt.amount_minor,
        upper(v_attempt.currency_code),
        'CAPTURED_UNFULFILLED',
        'Provider capture was confirmed, but Counter fulfillment did not complete.',
        'Persisted REMOTE_TERMINAL attempt is SUCCEEDED with matching Commerce amount and currency.',
        'CAPTURED',
        'FAILED'
    )
    ON CONFLICT (commerce_transaction_id)
        WHERE commerce_transaction_id IS NOT NULL
        DO NOTHING;

    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE commerce_transaction_id = v_transaction.commerce_transaction_id
       AND organization_id = v_transaction.organization_id;

    RETURN v_case_id;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_open_remote_terminal_financial_exception(varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_open_remote_terminal_financial_exception(varchar)
TO "${appRole}";

-- Preserve the established Collect verifier and one-per-intent behavior while
-- recording the same common evidence fields for all new Collect cases. Existing
-- rows are deliberately left untouched.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_open_collect_financial_exception(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_case_id varchar;
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
       OR v_intent.status <> 'PROCESSING'
       OR v_intent.finalized_subscription_id IS NOT NULL THEN
        RAISE EXCEPTION 'Payment is not eligible for exception review' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id;

    IF NOT FOUND
       OR v_capture.provider_transaction_id IS DISTINCT FROM v_intent.provider_reference_id
       OR round(v_intent.amount * 100)::bigint <> v_capture.amount_minor
       OR upper(v_intent.currency_code) <> upper(v_capture.currency_code) THEN
        RAISE EXCEPTION 'Verified capture is unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO poynt_collect_financial_exceptions (
        financial_exception_id, payment_intent_id, organization_id,
        customer_user_id, membership_plan_id, provider_transaction_id,
        amount_minor, currency_code, source_channel, provider_code,
        provider_reference_id, provider_outcome, fulfillment_outcome,
        evidence_reason
    ) VALUES (
        'PFE_' || gen_random_uuid()::text, p_intent_id, p_organization_id,
        v_intent.customer_user_id, v_intent.membership_plan_id,
        v_capture.provider_transaction_id, v_capture.amount_minor,
        upper(v_capture.currency_code), 'CUSTOMER_MEMBERSHIP', 'POYNT_COLLECT',
        v_intent.provider_reference_id, 'CAPTURED', 'UNFULFILLED',
        'Verified Poynt Collect capture evidence matches the persisted payment intent.'
    ) ON CONFLICT (payment_intent_id) DO NOTHING;

    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id;
    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'Exception case was not created' USING ERRCODE = '23514';
    END IF;
    RETURN v_case_id;
END;
$function$;
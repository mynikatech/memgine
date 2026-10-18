-- R2-B: explicit, provider-specific execution for an already approved refund.
-- The claim is committed before any provider call; no database lock is held while
-- Poynt is contacted.

-- Capture-time merchant identity is immutable refund evidence. Existing capture
-- records without it deliberately require manual investigation rather than a
-- guessed merchant/store selection.
ALTER TABLE "${schemaName}".poynt_collect_verified_captures
    ADD COLUMN IF NOT EXISTS merchant_business_id varchar(160),
    ADD COLUMN IF NOT EXISTS merchant_store_id varchar(160);

CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_verified_collect_capture(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar,
    p_transaction_id varchar,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_verified_business_id varchar,
    p_verified_store_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_saved poynt_collect_verified_captures%ROWTYPE;
    v_business_id varchar;
    v_store_id varchar;
BEGIN
    IF p_transaction_id IS NULL OR length(p_transaction_id) NOT BETWEEN 1 AND 160
       OR p_transaction_id !~ '^[A-Za-z0-9_-]+$'
       OR p_amount_minor IS NULL OR p_amount_minor <= 0
       OR p_currency_code IS NULL OR length(p_currency_code) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid verified capture' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_intent
      FROM payment_intents
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;

    SELECT provider_code INTO v_provider_code
      FROM payment_provider_configs
     WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF v_provider_code IS DISTINCT FROM 'POYNT_COLLECT'
       OR v_intent.provider_reference_id IS DISTINCT FROM p_transaction_id
       OR round(v_intent.amount * 100)::bigint <> p_amount_minor
       OR upper(v_intent.currency_code) <> upper(p_currency_code)
       OR v_intent.status NOT IN ('PROCESSING', 'SUCCEEDED') THEN
        RAISE EXCEPTION 'Verified capture conflicts with payment' USING ERRCODE = '23514';
    END IF;

    IF (p_verified_business_id IS NULL) <> (p_verified_store_id IS NULL) THEN
        RAISE EXCEPTION 'Verified capture merchant identity is incomplete' USING ERRCODE = '22023';
    END IF;
    IF p_verified_business_id IS NOT NULL THEN
        IF NULLIF(btrim(p_verified_business_id), '') IS NULL
           OR NULLIF(btrim(p_verified_store_id), '') IS NULL
           OR length(p_verified_business_id) > 160
           OR length(p_verified_store_id) > 160 THEN
            RAISE EXCEPTION 'Verified capture merchant identity is invalid' USING ERRCODE = '22023';
        END IF;
        SELECT c.provider_business_id, c.provider_store_id
          INTO v_business_id, v_store_id
          FROM commerce_provider_catalog_configurations c
          JOIN integration_configurations ic
            ON ic.integration_configuration_id = c.integration_configuration_id
           AND ic.organization_id = c.organization_id
         WHERE c.integration_configuration_id = v_intent.collect_integration_configuration_id
           AND c.organization_id = p_organization_id
           AND upper(ic.provider) = 'POYNT'
           AND NOT c.is_deleted
           AND NOT ic.is_deleted
           AND c.provider_business_id = p_verified_business_id
           AND c.provider_store_id = p_verified_store_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Verified capture merchant identity conflicts with payment configuration' USING ERRCODE = '23514';
        END IF;
    END IF;

    SELECT * INTO v_saved
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = p_intent_id
     FOR UPDATE;
    IF FOUND THEN
        IF v_saved.organization_id <> p_organization_id
           OR v_saved.provider_transaction_id <> p_transaction_id
           OR v_saved.amount_minor <> p_amount_minor
           OR upper(v_saved.currency_code) <> upper(p_currency_code)
           OR (v_saved.merchant_business_id IS NOT NULL
               AND p_verified_business_id IS NOT NULL
               AND v_saved.merchant_business_id IS DISTINCT FROM p_verified_business_id)
           OR (v_saved.merchant_store_id IS NOT NULL
               AND p_verified_store_id IS NOT NULL
               AND v_saved.merchant_store_id IS DISTINCT FROM p_verified_store_id) THEN
            RAISE EXCEPTION 'Conflicting verified capture' USING ERRCODE = '23514';
        END IF;
        RETURN true;
    END IF;

    INSERT INTO poynt_collect_verified_captures (
        payment_intent_id, organization_id, provider_transaction_id,
        amount_minor, currency_code, merchant_business_id, merchant_store_id
    ) VALUES (
        p_intent_id, p_organization_id, p_transaction_id,
        p_amount_minor, upper(p_currency_code), p_verified_business_id, p_verified_store_id
    );
    RETURN true;
END;
$function$;

-- Existing deployed callers remain functional, but cannot manufacture refund
-- merchant evidence from current configuration. They record an incomplete
-- capture that remains eligible for payment finalisation only.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_verified_collect_capture(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar,
    p_transaction_id varchar,
    p_amount_minor bigint,
    p_currency_code varchar
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT payment_record_verified_collect_capture(
        p_organization_id,
        p_intent_id,
        p_actor_user_id,
        p_transaction_id,
        p_amount_minor,
        p_currency_code,
        NULL::varchar,
        NULL::varchar
    );
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_claim_poynt_collect_execution(
    p_organization_id varchar,
    p_refund_id varchar,
    p_attempt_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,
    "paymentRefundAttemptId" varchar,
    "dispatchRequired" boolean,
    "attemptStatus" varchar,
    "originalCaptureId" varchar,
    "refundAmountMinor" bigint,
    "currencyCode" varchar,
    "integrationConfigurationId" varchar,
    "businessId" varchar,
    "providerStoreId" varchar,
    "applicationId" varchar,
    "secretReference" varchar,
    "merchantCurrencyCode" varchar
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_refund payment_refunds%ROWTYPE;
    v_attempt payment_refund_attempts%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_configuration commerce_provider_catalog_configurations%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Refund execution is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_refund
      FROM payment_refunds
     WHERE payment_refund_id = p_refund_id
       AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund request was not found' USING ERRCODE = '22023';
    END IF;
    IF v_refund.original_provider_code <> 'POYNT_COLLECT' THEN
        RAISE EXCEPTION 'Refund provider is not supported for Collect execution' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_attempt
      FROM payment_refund_attempts
     WHERE payment_refund_id = v_refund.payment_refund_id
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;
    IF FOUND AND v_attempt.status IN ('DISPATCHING', 'PENDING', 'UNKNOWN_REQUIRES_RECONCILIATION', 'SUCCEEDED') THEN
        RETURN QUERY
        SELECT v_refund.payment_refund_id, v_attempt.payment_refund_attempt_id, false,
               v_attempt.status, v_refund.original_provider_transaction_reference,
               v_refund.refund_amount_minor, v_refund.currency_code,
               NULL::varchar, NULL::varchar, NULL::varchar, NULL::varchar,
               NULL::varchar, NULL::varchar;
        RETURN;
    END IF;

    IF v_refund.approval_status <> 'APPROVED' OR v_refund.execution_status <> 'READY' THEN
        RAISE EXCEPTION 'Refund is not ready for execution' USING ERRCODE = '22023';
    END IF;
    IF v_refund.payment_intent_id IS NULL
       OR v_refund.original_integration_configuration_id IS NULL
       OR NULLIF(btrim(v_refund.original_provider_transaction_reference), '') IS NULL THEN
        RAISE EXCEPTION 'Original Collect payment requires investigation' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures
     WHERE payment_intent_id = v_refund.payment_intent_id
       AND organization_id = p_organization_id
       AND provider_transaction_id = v_refund.original_provider_transaction_reference
       AND amount_minor = v_refund.captured_amount_minor
       AND upper(currency_code) = upper(v_refund.currency_code)
       AND NULLIF(btrim(merchant_business_id), '') IS NOT NULL
       AND NULLIF(btrim(merchant_store_id), '') IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verified original Collect capture is unavailable' USING ERRCODE = '22023';
    END IF;

    -- Historical identity is selected by the immutable intent binding. It does
    -- not consult current customer payment routing or enabled-provider state.
    SELECT c.* INTO v_configuration
      FROM commerce_provider_catalog_configurations c
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = c.integration_configuration_id
       AND ic.organization_id = c.organization_id
     WHERE c.integration_configuration_id = v_refund.original_integration_configuration_id
       AND c.organization_id = p_organization_id
       AND upper(ic.provider) = 'POYNT'
       AND NOT c.is_deleted
       AND NOT ic.is_deleted
       AND NULLIF(btrim(c.application_id), '') IS NOT NULL
       AND NULLIF(btrim(c.provider_business_id), '') IS NOT NULL
       AND NULLIF(btrim(c.provider_store_id), '') IS NOT NULL
       AND NULLIF(btrim(c.credential_secret_reference), '') IS NOT NULL
       AND upper(c.merchant_currency_code) = upper(v_refund.currency_code)
       AND c.provider_business_id = v_capture.merchant_business_id
       AND c.provider_store_id = v_capture.merchant_store_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original Collect merchant configuration requires investigation' USING ERRCODE = '22023';
    END IF;

    INSERT INTO payment_refund_attempts (
        payment_refund_attempt_id, payment_refund_id, provider_code,
        idempotency_reference, status
    ) VALUES (
        p_attempt_id, v_refund.payment_refund_id, 'POYNT_COLLECT',
        p_attempt_id, 'DISPATCHING'
    );

    UPDATE payment_refunds
       SET execution_status = 'PENDING',
           executed_by = p_actor_user_id,
           executed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           version_no = version_no + 1
     WHERE payment_refund_id = v_refund.payment_refund_id;

    INSERT INTO payment_refund_events (
        payment_refund_event_id, payment_refund_id, organization_id, event_type,
        previous_approval_status, new_approval_status,
        previous_execution_status, new_execution_status,
        actor_user_id, actor_origin, description, event_identity
    ) VALUES (
        'PRE_' || gen_random_uuid()::text, v_refund.payment_refund_id,
        p_organization_id, 'EXECUTION_CLAIMED', 'APPROVED', 'APPROVED',
        'READY', 'PENDING', p_actor_user_id, 'ORG_ADMIN',
        'Collect refund execution was claimed.', 'EXECUTION_CLAIMED:' || p_attempt_id
    ) ON CONFLICT (event_identity) DO NOTHING;

    RETURN QUERY
    SELECT v_refund.payment_refund_id, p_attempt_id, true, 'DISPATCHING'::varchar,
           v_capture.provider_transaction_id, v_refund.refund_amount_minor,
           v_refund.currency_code, v_configuration.integration_configuration_id,
           v_configuration.provider_business_id, v_configuration.provider_store_id,
           v_configuration.application_id, v_configuration.credential_secret_reference,
           v_configuration.merchant_currency_code;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_poynt_collect_context(
    p_organization_id varchar,
    p_refund_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,
    "paymentRefundAttemptId" varchar,
    "attemptStatus" varchar,
    "providerReference" varchar,
    "originalCaptureId" varchar,
    "refundAmountMinor" bigint,
    "currencyCode" varchar,
    "integrationConfigurationId" varchar,
    "businessId" varchar,
    "providerStoreId" varchar,
    "applicationId" varchar,
    "secretReference" varchar,
    "merchantCurrencyCode" varchar
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Refund execution is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT r.payment_refund_id, a.payment_refund_attempt_id, a.status,
           a.provider_reference, c.provider_transaction_id,
           r.refund_amount_minor, r.currency_code,
           cfg.integration_configuration_id, cfg.provider_business_id,
           cfg.provider_store_id, cfg.application_id,
           cfg.credential_secret_reference, cfg.merchant_currency_code
      FROM payment_refunds r
      JOIN payment_refund_attempts a ON a.payment_refund_id = r.payment_refund_id
      JOIN poynt_collect_verified_captures c
        ON c.payment_intent_id = r.payment_intent_id
       AND c.organization_id = r.organization_id
       AND c.provider_transaction_id = r.original_provider_transaction_reference
       AND c.amount_minor = r.captured_amount_minor
       AND upper(c.currency_code) = upper(r.currency_code)
       AND NULLIF(btrim(c.merchant_business_id), '') IS NOT NULL
       AND NULLIF(btrim(c.merchant_store_id), '') IS NOT NULL
      JOIN commerce_provider_catalog_configurations cfg
        ON cfg.integration_configuration_id = r.original_integration_configuration_id
       AND cfg.organization_id = r.organization_id
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = cfg.integration_configuration_id
       AND ic.organization_id = cfg.organization_id
     WHERE r.payment_refund_id = p_refund_id
       AND r.organization_id = p_organization_id
       AND r.original_provider_code = 'POYNT_COLLECT'
       AND upper(ic.provider) = 'POYNT'
       AND NOT cfg.is_deleted
       AND NOT ic.is_deleted
       AND NULLIF(btrim(cfg.application_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.provider_business_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.provider_store_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.credential_secret_reference), '') IS NOT NULL
       AND upper(cfg.merchant_currency_code) = upper(r.currency_code)
       AND cfg.provider_business_id = c.merchant_business_id
       AND cfg.provider_store_id = c.merchant_store_id
     ORDER BY a.created_at DESC
     LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_refund_record_poynt_collect_outcome(
    p_organization_id varchar,
    p_refund_id varchar,
    p_attempt_id varchar,
    p_outcome varchar,
    p_provider_reference varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,
    "executionStatus" varchar,
    "providerRefundReference" varchar,
    "versionNo" integer
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_refund payment_refunds%ROWTYPE;
    v_attempt payment_refund_attempts%ROWTYPE;
    v_previous varchar;
    v_incoming_reference varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Refund execution is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_outcome NOT IN ('SUCCEEDED', 'FAILED', 'PENDING', 'UNKNOWN_REQUIRES_RECONCILIATION') THEN
        RAISE EXCEPTION 'Refund outcome is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_refund FROM payment_refunds
     WHERE payment_refund_id = p_refund_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund request was not found' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_attempt FROM payment_refund_attempts
     WHERE payment_refund_attempt_id = p_attempt_id AND payment_refund_id = p_refund_id FOR UPDATE;
    IF NOT FOUND OR v_attempt.provider_code <> 'POYNT_COLLECT' THEN
        RAISE EXCEPTION 'Refund attempt was not found' USING ERRCODE = '22023';
    END IF;
    v_incoming_reference := NULLIF(btrim(p_provider_reference), '');

    IF v_refund.provider_refund_reference IS NOT NULL
       AND v_incoming_reference IS NOT NULL
       AND v_refund.provider_refund_reference <> v_incoming_reference THEN
        RAISE EXCEPTION 'Provider refund reference conflicts with existing evidence' USING ERRCODE = '23514';
    END IF;
    IF v_attempt.provider_reference IS NOT NULL
       AND v_incoming_reference IS NOT NULL
       AND v_attempt.provider_reference <> v_incoming_reference THEN
        RAISE EXCEPTION 'Provider refund reference conflicts with attempt evidence' USING ERRCODE = '23514';
    END IF;

    -- A terminal ledger result is immutable. Replays are allowed only when they
    -- present the exact same verified outcome and reference.
    IF v_refund.execution_status IN ('SUCCEEDED', 'FAILED') THEN
        IF v_attempt.status IS DISTINCT FROM v_refund.execution_status
           OR v_attempt.provider_reference IS DISTINCT FROM v_refund.provider_refund_reference THEN
            RAISE EXCEPTION 'Refund terminal evidence is inconsistent' USING ERRCODE = '23514';
        END IF;
        IF p_outcome IS DISTINCT FROM v_refund.execution_status
           OR v_incoming_reference IS DISTINCT FROM v_refund.provider_refund_reference THEN
            RAISE EXCEPTION 'Refund has a conflicting terminal outcome' USING ERRCODE = '23514';
        END IF;
        RETURN QUERY SELECT v_refund.payment_refund_id, v_refund.execution_status,
                             v_refund.provider_refund_reference, v_refund.version_no;
        RETURN;
    END IF;

    IF v_attempt.status IN ('SUCCEEDED', 'FAILED') THEN
        RAISE EXCEPTION 'Refund attempt conflicts with nonterminal refund state' USING ERRCODE = '23514';
    END IF;
    IF v_attempt.status NOT IN ('DISPATCHING', 'PENDING', 'UNKNOWN_REQUIRES_RECONCILIATION')
       OR v_refund.execution_status NOT IN ('PENDING', 'UNKNOWN_REQUIRES_RECONCILIATION') THEN
        RAISE EXCEPTION 'Refund is not in an active execution state' USING ERRCODE = '23514';
    END IF;

    -- A terminal provider result must always carry the provider transaction ID.
    IF p_outcome IN ('SUCCEEDED', 'FAILED') AND v_incoming_reference IS NULL THEN
        RAISE EXCEPTION 'Verified terminal provider evidence is required' USING ERRCODE = '22023';
    END IF;

    -- Exact replay is intentionally a no-op: no version increment, timestamp
    -- modification, or duplicate financial event.
    IF v_refund.execution_status = p_outcome
       AND v_attempt.status = p_outcome
       AND COALESCE(v_refund.provider_refund_reference, '') = COALESCE(v_incoming_reference, '')
       AND COALESCE(v_attempt.provider_reference, '') = COALESCE(v_incoming_reference, '') THEN
        RETURN QUERY SELECT v_refund.payment_refund_id, v_refund.execution_status,
                             v_refund.provider_refund_reference, v_refund.version_no;
        RETURN;
    END IF;

    v_previous := v_refund.execution_status;
    UPDATE payment_refund_attempts
       SET status = p_outcome,
           provider_reference = COALESCE(v_incoming_reference, provider_reference),
           updated_at = CURRENT_TIMESTAMP
     WHERE payment_refund_attempt_id = p_attempt_id;
    UPDATE payment_refunds
       SET execution_status = p_outcome,
           provider_refund_reference = COALESCE(v_incoming_reference, provider_refund_reference),
           updated_at = CURRENT_TIMESTAMP,
           version_no = version_no + 1
     WHERE payment_refund_id = p_refund_id;
    INSERT INTO payment_refund_events (
        payment_refund_event_id, payment_refund_id, organization_id, event_type,
        previous_execution_status, new_execution_status, actor_user_id,
        actor_origin, description, event_identity
    ) VALUES (
        'PRE_' || gen_random_uuid()::text, p_refund_id, p_organization_id,
        'EXECUTION_' || p_outcome, v_previous, p_outcome, p_actor_user_id,
        'ORG_ADMIN', 'Collect refund execution outcome was recorded.',
        'EXECUTION_OUTCOME:' || p_attempt_id || ':' || p_outcome || ':' || COALESCE(p_provider_reference, '')
    ) ON CONFLICT (event_identity) DO NOTHING;
    SELECT * INTO v_refund FROM payment_refunds WHERE payment_refund_id = p_refund_id;
    RETURN QUERY SELECT v_refund.payment_refund_id, v_refund.execution_status,
                         v_refund.provider_refund_reference, v_refund.version_no;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_claim_poynt_collect_execution(varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_poynt_collect_context(varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_refund_record_poynt_collect_outcome(varchar, varchar, varchar, varchar, varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar, varchar, varchar, varchar, bigint, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar, varchar, varchar, varchar, bigint, varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_claim_poynt_collect_execution(varchar, varchar, varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_poynt_collect_context(varchar, varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_refund_record_poynt_collect_outcome(varchar, varchar, varchar, varchar, varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar, varchar, varchar, varchar, bigint, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar, varchar, varchar, varchar, bigint, varchar, varchar, varchar) TO "${appRole}";

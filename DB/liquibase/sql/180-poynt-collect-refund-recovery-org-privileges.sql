-- R2-B: align Poynt Collect verified-reference recovery with organization-scoped privileges.
-- Both ORG_ADMIN_ACCESS and BUSINESS_OWNER_ACCESS are checked as active effective capabilities.
-- Replaces only the three existing recovery functions; preserves all financial safeguards from 179.
-- No provider refund is dispatched by these functions.

CREATE OR REPLACE FUNCTION "${schemaName}".platform_payment_refund_poynt_collect_recovery_context(
    p_organization_id varchar,
    p_refund_id varchar,
    p_attempt_id varchar,
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
    "merchantCurrencyCode" varchar,
    "recoveryAmbiguous" boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_refund payment_refunds%ROWTYPE;
    v_attempt payment_refund_attempts%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_ambiguous boolean;
BEGIN
    IF NOT (
        rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
        OR rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS')
    ) THEN
        RAISE EXCEPTION 'Platform refund recovery is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_refund
      FROM payment_refunds
     WHERE payment_refund_id = p_refund_id
       AND organization_id = p_organization_id
       AND original_provider_code = 'POYNT_COLLECT';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Collect refund was not found' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_attempt
      FROM payment_refund_attempts
     WHERE payment_refund_attempt_id = p_attempt_id
       AND payment_refund_id = p_refund_id
       AND provider_code = 'POYNT_COLLECT';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Collect refund attempt was not found' USING ERRCODE = '22023';
    END IF;
    IF v_refund.execution_status <> 'UNKNOWN_REQUIRES_RECONCILIATION'
       OR v_attempt.status <> 'UNKNOWN_REQUIRES_RECONCILIATION'
       OR v_refund.provider_refund_reference IS NOT NULL
       OR v_attempt.provider_reference IS NOT NULL THEN
        RAISE EXCEPTION 'Collect refund attempt is not eligible for reference recovery' USING ERRCODE = '23514';
    END IF;

    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures c
     WHERE c.payment_intent_id = v_refund.payment_intent_id
       AND c.organization_id = v_refund.organization_id
       AND c.provider_transaction_id = v_refund.original_provider_transaction_reference
       AND c.amount_minor = v_refund.captured_amount_minor
       AND upper(c.currency_code) = upper(v_refund.currency_code)
       AND NULLIF(btrim(c.merchant_business_id), '') IS NOT NULL
       AND NULLIF(btrim(c.merchant_store_id), '') IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verified original capture evidence is unavailable' USING ERRCODE = '23514';
    END IF;

    -- Equal partial amounts against one capture are ambiguous while more than one
    -- unresolved attempt remains. Kotlin may still perform the exact-ID GET; the
    -- write gate below requires Poynt's matching original request ID in that case.
    SELECT EXISTS (
        SELECT 1
          FROM payment_refunds r2
          JOIN payment_refund_attempts a2 ON a2.payment_refund_id = r2.payment_refund_id
         WHERE r2.payment_refund_id <> v_refund.payment_refund_id
           AND r2.organization_id = v_refund.organization_id
           AND r2.original_provider_code = 'POYNT_COLLECT'
           AND r2.original_provider_transaction_reference = v_refund.original_provider_transaction_reference
           AND r2.refund_amount_minor = v_refund.refund_amount_minor
           AND upper(r2.currency_code) = upper(v_refund.currency_code)
           AND r2.execution_status = 'UNKNOWN_REQUIRES_RECONCILIATION'
           AND a2.provider_code = 'POYNT_COLLECT'
           AND a2.status = 'UNKNOWN_REQUIRES_RECONCILIATION'
           AND a2.provider_reference IS NULL
    ) INTO v_ambiguous;
    RETURN QUERY
    SELECT v_refund.payment_refund_id, v_attempt.payment_refund_attempt_id,
           v_attempt.status, v_attempt.provider_reference,
           v_capture.provider_transaction_id, v_refund.refund_amount_minor,
           v_refund.currency_code, cfg.integration_configuration_id,
           cfg.provider_business_id, cfg.provider_store_id, cfg.application_id,
           cfg.credential_secret_reference, cfg.merchant_currency_code, v_ambiguous
      FROM commerce_provider_catalog_configurations cfg
      JOIN integration_configurations ic
        ON ic.integration_configuration_id = cfg.integration_configuration_id
       AND ic.organization_id = cfg.organization_id
     WHERE cfg.integration_configuration_id = v_refund.original_integration_configuration_id
       AND cfg.organization_id = v_refund.organization_id
       AND upper(ic.provider) = 'POYNT'
       AND NOT cfg.is_deleted
       AND NOT ic.is_deleted
       AND NULLIF(btrim(cfg.application_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.provider_business_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.provider_store_id), '') IS NOT NULL
       AND NULLIF(btrim(cfg.credential_secret_reference), '') IS NOT NULL
       AND upper(cfg.merchant_currency_code) = upper(v_refund.currency_code)
       AND cfg.provider_business_id = v_capture.merchant_business_id
       AND cfg.provider_store_id = v_capture.merchant_store_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_payment_refund_record_poynt_collect_reference_verification(
    p_verification_id varchar,
    p_organization_id varchar,
    p_refund_id varchar,
    p_attempt_id varchar,
    p_provider_reference varchar,
    p_provider_original_request_id varchar,
    p_attestation varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "verificationId" varchar,
    "paymentRefundId" varchar,
    "paymentRefundAttemptId" varchar,
    "providerRefundReference" varchar,
    "verificationOutcome" varchar,
    "verifiedAt" text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_refund payment_refunds%ROWTYPE;
    v_attempt payment_refund_attempts%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_existing payment_refund_poynt_collect_recovery_audits%ROWTYPE;
    v_ambiguous boolean;
    v_reference varchar;
    v_provider_request_id varchar;
BEGIN
    IF NOT (
        rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
        OR rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS')
    ) THEN
        RAISE EXCEPTION 'Platform refund recovery is not permitted' USING ERRCODE = '42501';
    END IF;
    v_reference := NULLIF(btrim(p_provider_reference), '');
    v_provider_request_id := NULLIF(btrim(p_provider_original_request_id), '');
    IF v_reference IS NULL OR length(v_reference) > 160
       OR length(btrim(COALESCE(p_attestation, ''))) NOT BETWEEN 10 AND 1000
       OR (v_provider_request_id IS NOT NULL AND length(v_provider_request_id) > 160) THEN
        RAISE EXCEPTION 'Refund reference verification is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_refund FROM payment_refunds
     WHERE payment_refund_id = p_refund_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund request was not found' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_attempt FROM payment_refund_attempts
     WHERE payment_refund_attempt_id = p_attempt_id AND payment_refund_id = p_refund_id
       AND provider_code = 'POYNT_COLLECT' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund attempt was not found' USING ERRCODE = '22023'; END IF;

    SELECT * INTO v_existing
      FROM payment_refund_poynt_collect_recovery_audits
     WHERE payment_refund_attempt_id = p_attempt_id
       AND event_type = 'VERIFICATION'
       AND recovery_outcome = 'VERIFIED'
     ORDER BY created_at LIMIT 1;
    IF FOUND THEN
        IF v_existing.provider_refund_reference <> v_reference
           OR v_existing.attestation <> btrim(p_attestation)
           OR v_existing.provider_original_request_id IS DISTINCT FROM v_provider_request_id THEN
            RAISE EXCEPTION 'Verified provider evidence conflicts with the immutable verification record' USING ERRCODE = '23514';
        END IF;
        RETURN QUERY SELECT v_existing.payment_refund_poynt_collect_recovery_audit_id,
                             v_existing.payment_refund_id, v_existing.payment_refund_attempt_id,
                             v_existing.provider_refund_reference, v_existing.recovery_outcome,
                             v_existing.created_at::text;
        RETURN;
    END IF;

    IF v_refund.execution_status <> 'UNKNOWN_REQUIRES_RECONCILIATION'
       OR v_attempt.status <> 'UNKNOWN_REQUIRES_RECONCILIATION'
       OR v_refund.provider_refund_reference IS NOT NULL
       OR v_attempt.provider_reference IS NOT NULL
       OR v_refund.original_provider_code <> 'POYNT_COLLECT' THEN
        RAISE EXCEPTION 'Refund attempt is not eligible for reference recovery' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_capture
      FROM poynt_collect_verified_captures c
     WHERE c.payment_intent_id = v_refund.payment_intent_id
       AND c.organization_id = v_refund.organization_id
       AND c.provider_transaction_id = v_refund.original_provider_transaction_reference
       AND c.amount_minor = v_refund.captured_amount_minor
       AND upper(c.currency_code) = upper(v_refund.currency_code)
       AND NULLIF(btrim(c.merchant_business_id), '') IS NOT NULL
       AND NULLIF(btrim(c.merchant_store_id), '') IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified original capture evidence is unavailable' USING ERRCODE = '23514'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM payment_refunds r2
        JOIN payment_refund_attempts a2 ON a2.payment_refund_id = r2.payment_refund_id
        WHERE r2.payment_refund_id <> v_refund.payment_refund_id
          AND r2.organization_id = v_refund.organization_id
          AND r2.original_provider_code = 'POYNT_COLLECT'
          AND r2.original_provider_transaction_reference = v_refund.original_provider_transaction_reference
          AND r2.refund_amount_minor = v_refund.refund_amount_minor
          AND upper(r2.currency_code) = upper(v_refund.currency_code)
          AND r2.execution_status = 'UNKNOWN_REQUIRES_RECONCILIATION'
          AND a2.provider_code = 'POYNT_COLLECT'
          AND a2.status = 'UNKNOWN_REQUIRES_RECONCILIATION'
          AND a2.provider_reference IS NULL
    ) INTO v_ambiguous;
    IF v_ambiguous AND v_provider_request_id IS DISTINCT FROM p_attempt_id THEN
        RAISE EXCEPTION 'Multiple unresolved Collect refunds require explicit investigation' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
        SELECT 1 FROM payment_refund_poynt_collect_recovery_audits a
         WHERE a.provider_refund_reference = v_reference
           AND a.event_type = 'VERIFICATION' AND a.recovery_outcome = 'VERIFIED'
    ) OR EXISTS (
        SELECT 1 FROM payment_refund_attempts a
         WHERE a.provider_code = 'POYNT_COLLECT' AND a.provider_reference = v_reference
    ) OR EXISTS (
        SELECT 1 FROM payment_refunds r
         WHERE r.original_provider_code = 'POYNT_COLLECT' AND r.provider_refund_reference = v_reference
    ) THEN
        RAISE EXCEPTION 'Provider refund reference is already assigned' USING ERRCODE = '23514';
    END IF;

    -- The server route does not accept an outcome flag. This function records only
    -- provider-verified evidence after Kotlin has completed the exact-ID GET check.
    INSERT INTO payment_refund_poynt_collect_recovery_audits (
        payment_refund_poynt_collect_recovery_audit_id, organization_id,
        payment_refund_id, payment_refund_attempt_id, provider_refund_reference,
        provider_original_request_id, event_type, recovery_outcome, attestation,
        original_capture_id, refund_amount_minor, currency_code, merchant_business_id,
        merchant_store_id, refund_execution_status, attempt_status, refund_version_no,
        attempt_created_at, attempt_updated_at, actor_user_id, event_identity
    ) VALUES (
        p_verification_id, p_organization_id, p_refund_id, p_attempt_id, v_reference,
        v_provider_request_id, 'VERIFICATION', 'VERIFIED', btrim(p_attestation),
        v_capture.provider_transaction_id, v_refund.refund_amount_minor, v_refund.currency_code,
        v_capture.merchant_business_id, v_capture.merchant_store_id,
        v_refund.execution_status, v_attempt.status, v_refund.version_no,
        v_attempt.created_at, v_attempt.updated_at, p_actor_user_id,
        'REFERENCE_VERIFICATION:' || p_attempt_id || ':' || v_reference
    );

    RETURN QUERY SELECT p_verification_id, p_refund_id, p_attempt_id, v_reference,
                         'VERIFIED'::varchar, CURRENT_TIMESTAMP::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_payment_refund_confirm_poynt_collect_reference(
    p_organization_id varchar,
    p_refund_id varchar,
    p_attempt_id varchar,
    p_verification_id varchar,
    p_actor_user_id varchar
) RETURNS TABLE (
    "paymentRefundId" varchar,
    "executionStatus" varchar,
    "providerRefundReference" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_refund payment_refunds%ROWTYPE;
    v_attempt payment_refund_attempts%ROWTYPE;
    v_verification payment_refund_poynt_collect_recovery_audits%ROWTYPE;
    v_capture poynt_collect_verified_captures%ROWTYPE;
    v_ambiguous boolean;
BEGIN
    IF NOT (
        rbac_has_capability(p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS')
        OR rbac_has_capability(p_actor_user_id, p_organization_id, 'BUSINESS_OWNER_ACCESS')
    ) THEN
        RAISE EXCEPTION 'Platform refund recovery is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_refund FROM payment_refunds
     WHERE payment_refund_id = p_refund_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund request was not found' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_attempt FROM payment_refund_attempts
     WHERE payment_refund_attempt_id = p_attempt_id AND payment_refund_id = p_refund_id
       AND provider_code = 'POYNT_COLLECT' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Refund attempt was not found' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_verification FROM payment_refund_poynt_collect_recovery_audits
     WHERE payment_refund_poynt_collect_recovery_audit_id = p_verification_id
       AND organization_id = p_organization_id AND payment_refund_id = p_refund_id
       AND payment_refund_attempt_id = p_attempt_id
       AND event_type = 'VERIFICATION' AND recovery_outcome = 'VERIFIED' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified provider reference was not found' USING ERRCODE = '22023'; END IF;

    IF v_refund.execution_status = 'SUCCEEDED' THEN
        IF v_attempt.status IS DISTINCT FROM 'SUCCEEDED'
           OR v_refund.provider_refund_reference IS DISTINCT FROM v_verification.provider_refund_reference
           OR v_attempt.provider_reference IS DISTINCT FROM v_verification.provider_refund_reference THEN
            RAISE EXCEPTION 'Refund terminal evidence is inconsistent' USING ERRCODE = '23514';
        END IF;
        RETURN QUERY SELECT v_refund.payment_refund_id, v_refund.execution_status,
                             v_refund.provider_refund_reference, v_refund.version_no;
        RETURN;
    END IF;
    IF v_refund.execution_status IN ('FAILED', 'SUCCEEDED') OR v_attempt.status IN ('FAILED', 'SUCCEEDED') THEN
        RAISE EXCEPTION 'Refund has a conflicting terminal outcome' USING ERRCODE = '23514';
    END IF;

    IF v_refund.execution_status IS DISTINCT FROM v_verification.refund_execution_status
       OR v_attempt.status IS DISTINCT FROM v_verification.attempt_status
       OR v_refund.version_no IS DISTINCT FROM v_verification.refund_version_no
       OR v_attempt.created_at IS DISTINCT FROM v_verification.attempt_created_at
       OR v_attempt.updated_at IS DISTINCT FROM v_verification.attempt_updated_at
       OR v_refund.refund_amount_minor IS DISTINCT FROM v_verification.refund_amount_minor
       OR upper(v_refund.currency_code) IS DISTINCT FROM upper(v_verification.currency_code)
       OR v_refund.original_provider_transaction_reference IS DISTINCT FROM v_verification.original_capture_id
       OR v_refund.provider_refund_reference IS NOT NULL OR v_attempt.provider_reference IS NOT NULL THEN
        RAISE EXCEPTION 'Verified provider evidence is stale or inconsistent' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_capture FROM poynt_collect_verified_captures c
     WHERE c.payment_intent_id = v_refund.payment_intent_id
       AND c.organization_id = v_refund.organization_id
       AND c.provider_transaction_id = v_verification.original_capture_id
       AND c.amount_minor = v_refund.captured_amount_minor
       AND upper(c.currency_code) = upper(v_refund.currency_code)
       AND c.merchant_business_id = v_verification.merchant_business_id
       AND c.merchant_store_id = v_verification.merchant_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified capture evidence changed or is unavailable' USING ERRCODE = '23514'; END IF;

    SELECT EXISTS (
        SELECT 1 FROM payment_refunds r2
        JOIN payment_refund_attempts a2 ON a2.payment_refund_id = r2.payment_refund_id
        WHERE r2.payment_refund_id <> v_refund.payment_refund_id
          AND r2.organization_id = v_refund.organization_id
          AND r2.original_provider_code = 'POYNT_COLLECT'
          AND r2.original_provider_transaction_reference = v_refund.original_provider_transaction_reference
          AND r2.refund_amount_minor = v_refund.refund_amount_minor
          AND upper(r2.currency_code) = upper(v_refund.currency_code)
          AND r2.execution_status = 'UNKNOWN_REQUIRES_RECONCILIATION'
          AND a2.provider_code = 'POYNT_COLLECT'
          AND a2.status = 'UNKNOWN_REQUIRES_RECONCILIATION'
          AND a2.provider_reference IS NULL
    ) INTO v_ambiguous;
    IF v_ambiguous AND v_verification.provider_original_request_id IS DISTINCT FROM p_attempt_id THEN
        RAISE EXCEPTION 'Multiple unresolved Collect refunds require explicit investigation' USING ERRCODE = '23514';
    END IF;

    UPDATE payment_refund_attempts
       SET status = 'SUCCEEDED', provider_reference = v_verification.provider_refund_reference,
           updated_at = CURRENT_TIMESTAMP
     WHERE payment_refund_attempt_id = p_attempt_id;
    UPDATE payment_refunds
       SET execution_status = 'SUCCEEDED', provider_refund_reference = v_verification.provider_refund_reference,
           updated_at = CURRENT_TIMESTAMP, version_no = version_no + 1
     WHERE payment_refund_id = p_refund_id;
    INSERT INTO payment_refund_poynt_collect_recovery_audits (
        payment_refund_poynt_collect_recovery_audit_id, organization_id, payment_refund_id,
        payment_refund_attempt_id, provider_refund_reference, event_type, recovery_outcome,
        actor_user_id, event_identity
    ) VALUES (
        'PRV_' || gen_random_uuid()::text, p_organization_id, p_refund_id, p_attempt_id,
        v_verification.provider_refund_reference, 'CONFIRMATION', 'SUCCEEDED', p_actor_user_id,
        'REFERENCE_CONFIRMATION:' || p_verification_id
    ) ON CONFLICT (event_identity) DO NOTHING;
    INSERT INTO payment_refund_events (
        payment_refund_event_id, payment_refund_id, organization_id, event_type,
        previous_execution_status, new_execution_status, actor_user_id, actor_origin,
        description, event_identity
    ) VALUES (
        'PRE_' || gen_random_uuid()::text, p_refund_id, p_organization_id,
        'REFERENCE_RECOVERY_SUCCEEDED', 'UNKNOWN_REQUIRES_RECONCILIATION', 'SUCCEEDED',
        p_actor_user_id, 'ORGANIZATION_PRIVILEGE',
        'Organization-privilege-authorized Poynt Collect provider reference recovery was confirmed.',
        'REFERENCE_RECOVERY_SUCCEEDED:' || p_verification_id
    ) ON CONFLICT (event_identity) DO NOTHING;

    SELECT * INTO v_refund FROM payment_refunds WHERE payment_refund_id = p_refund_id;
    RETURN QUERY SELECT v_refund.payment_refund_id, v_refund.execution_status,
                         v_refund.provider_refund_reference, v_refund.version_no;
END;
$function$;

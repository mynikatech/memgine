-- Stage B hotfix: payment_intents stores payment_provider_config_id, not provider_code.
-- Replaces only the case-opening function introduced in migration 159.
-- Provider configurations can be shared (organization_id IS NULL) or organization-scoped.
-- No payment, subscription, capture, case, or refund records are modified by this migration.
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
        amount_minor, currency_code
    ) VALUES (
        'PFE_' || gen_random_uuid()::text, p_intent_id, p_organization_id,
        v_intent.customer_user_id, v_intent.membership_plan_id,
        v_capture.provider_transaction_id, v_capture.amount_minor,
        upper(v_capture.currency_code)
    ) ON CONFLICT (payment_intent_id) DO NOTHING;

    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE payment_intent_id = p_intent_id
       AND organization_id = p_organization_id;

    IF v_case_id IS NULL THEN
        RAISE EXCEPTION 'Exception case was not created' USING ERRCODE = '23514';
    END IF;

    RETURN v_case_id;
END;
$function$;

-- CREATE OR REPLACE FUNCTION preserves existing privileges on this function.

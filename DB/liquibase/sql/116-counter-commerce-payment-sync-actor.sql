-- Phase 3D-B follow-up:
-- Counter membership payment synchronization must authorize the Counter operator,
-- not require organization-administration privileges.
--
-- Migrations 114 and 115 are already applied and remain immutable.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_sync_membership_payment_result(
    p_organization_id varchar,
    p_payment_intent_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_payment payment_intents%ROWTYPE;
    v_commerce commerce_transactions%ROWTYPE;
    v_actor_organization_user_id varchar(64);
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_payment_status varchar(32);
    v_provider_reference varchar(160);
    v_evidence_reference varchar(160);
    v_sync_actor_user_id varchar(64);
    v_existing_evidence boolean := false;
BEGIN
    SELECT *
      INTO v_payment
      FROM payment_intents
     WHERE payment_intent_id = p_payment_intent_id
       AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment intent does not belong to organization'
            USING ERRCODE = '42501';
    END IF;

    IF v_payment.commerce_transaction_id IS NULL THEN
        RETURN true;
    END IF;

    SELECT *
      INTO v_commerce
      FROM commerce_transactions
     WHERE commerce_transaction_id = v_payment.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND
       OR v_commerce.organization_id IS DISTINCT FROM p_organization_id
       OR v_commerce.source_channel IS DISTINCT FROM 'COUNTER_MEMBERSHIP'
       OR v_commerce.integration_configuration_id IS NOT NULL
       OR v_commerce.customer_user_id IS DISTINCT FROM v_payment.customer_user_id
       OR v_commerce.store_id IS DISTINCT FROM v_payment.store_id THEN
        RAISE EXCEPTION 'Payment Commerce correlation is inconsistent'
            USING ERRCODE = '23505';
    END IF;

    v_payment_status := v_payment.status;
    IF v_payment_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') THEN
        RETURN true;
    END IF;

    IF round(v_payment.amount * 100)::bigint IS DISTINCT FROM v_commerce.total_minor
       OR v_payment.currency_code IS DISTINCT FROM v_commerce.currency_code THEN
        RAISE EXCEPTION 'Payment amount or currency does not match Commerce transaction'
            USING ERRCODE = '23505';
    END IF;

    v_sync_actor_user_id := COALESCE(
        NULLIF(btrim(p_actor_user_id), ''),
        v_payment.created_by
    );

    IF v_sync_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'Payment actor is unavailable'
            USING ERRCODE = '42501';
    END IF;

    IF v_payment.store_id IS NULL
       OR v_payment.staff_id IS NULL
       OR NOT counter_can_operate(
           p_organization_id,
           v_payment.store_id,
           v_payment.staff_id,
           v_sync_actor_user_id
       ) THEN
        RAISE EXCEPTION 'Counter payment operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT ou.organization_user_id
      INTO v_actor_organization_user_id
      FROM organization_user ou
     WHERE ou.organization_id = p_organization_id
       AND ou.user_id = v_sync_actor_user_id
       AND NOT ou.is_deleted
     LIMIT 1;

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    v_provider_reference := NULLIF(btrim(v_payment.provider_reference_id), '');
    v_evidence_reference := 'PAYMENT_INTENT:' || v_payment.payment_intent_id;

    SELECT *
      INTO v_attempt
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = v_commerce.commerce_transaction_id
       AND payment_channel = 'LEGACY_PAYMENT_INTENT'
       AND provider_reference_id = v_evidence_reference
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    v_existing_evidence := FOUND;

    IF v_existing_evidence THEN
        IF v_attempt.provider_status IS DISTINCT FROM v_payment_status
           OR v_attempt.amount_minor IS DISTINCT FROM v_commerce.total_minor
           OR v_attempt.currency_code IS DISTINCT FROM v_commerce.currency_code THEN
            RAISE EXCEPTION 'Conflicting payment result for Commerce transaction'
                USING ERRCODE = '23505';
        END IF;
    ELSE
        INSERT INTO commerce_provider_payment_attempts (
            commerce_provider_payment_attempt_id,
            commerce_transaction_id,
            provider_transaction_id,
            provider_status,
            amount_minor,
            currency_code,
            failure_code,
            failure_message,
            created_by,
            payment_channel,
            provider_reference_id
        ) VALUES (
            generate_runtime_id('CPA'),
            v_commerce.commerce_transaction_id,
            v_provider_reference,
            v_payment_status,
            v_commerce.total_minor,
            v_commerce.currency_code,
            CASE WHEN v_payment_status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_code END,
            CASE WHEN v_payment_status = 'SUCCEEDED' THEN NULL ELSE v_payment.failure_message END,
            v_actor_organization_user_id,
            'LEGACY_PAYMENT_INTENT',
            v_evidence_reference
        );
    END IF;

    IF v_payment_status = 'SUCCEEDED' THEN
        IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN
            RETURN true;
        END IF;

        IF v_commerce.status NOT IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS') THEN
            RAISE EXCEPTION 'Commerce transaction cannot accept payment success'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_transactions
           SET status = 'PROVIDER_SUCCEEDED',
               provider_transaction_id = v_provider_reference,
               failure_code = NULL,
               failure_message = NULL,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_commerce.commerce_transaction_id;
    ELSE
        IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN
            RETURN true;
        END IF;

        IF v_commerce.status NOT IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS') THEN
            RAISE EXCEPTION 'Commerce transaction cannot accept payment failure'
                USING ERRCODE = '23505';
        END IF;

        IF v_existing_evidence AND v_commerce.status = 'ORDER_CREATED' THEN
            RETURN true;
        END IF;

        UPDATE commerce_transactions
           SET status = 'ORDER_CREATED',
               provider_transaction_id = NULL,
               failure_code = COALESCE(NULLIF(btrim(v_payment.failure_code), ''), v_payment_status),
               failure_message = NULLIF(btrim(v_payment.failure_message), ''),
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor_organization_user_id,
               version_no = version_no + 1
         WHERE commerce_transaction_id = v_commerce.commerce_transaction_id;
    END IF;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_sync_membership_payment_result(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_sync_membership_payment_result(varchar, varchar, varchar) TO "${appRole}";

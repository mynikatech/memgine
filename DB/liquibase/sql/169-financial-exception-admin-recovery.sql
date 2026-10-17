-- P5-A2 PROPOSED MIGRATION 169. REVIEW AND TEST ON LOCAL FIRST.
-- Uses proven P4-B fulfillment-only functions. NO provider dispatch or charge.
-- Important: preserve lock ordering of P4-B finalizers; no FOR UPDATE here.
CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_admin_recover(
    p_organization_id varchar,
    p_exception_id varchar,
    p_actor_user_id varchar,
    p_reason varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_case poynt_collect_financial_exceptions%ROWTYPE;
    v_customer_user_id varchar;
    v_counter_user_id varchar;
    v_result varchar;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Financial exception administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_reason), '') IS NULL OR length(p_reason) > 500
       OR p_reason ~* '(token|nonce|pan|cvv|card[ _-]?(number|data)|secret|private[ _-]?key|authorization|bearer|jwt|payload|[{}])'
    THEN
        RAISE EXCEPTION 'A sanitized recovery reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_case FROM poynt_collect_financial_exceptions
    WHERE financial_exception_id = p_exception_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial exception unavailable' USING ERRCODE = 'P0002'; END IF;
    IF v_case.fulfillment_outcome = 'FULFILLED' THEN
        -- Idempotent already-fulfilled answer, no new event.
        RETURN v_case.related_subscription_id;
    END IF;
    IF v_case.case_status NOT IN ('OPEN','UNDER_REVIEW')
       OR v_case.fulfillment_outcome NOT IN ('UNFULFILLED','FAILED','UNKNOWN') THEN
        RAISE EXCEPTION 'Financial exception is not eligible for recovery' USING ERRCODE = '22023';
    END IF;

    -- The trigger must attribute the resulting RECOVERY_SUCCEEDED to the admin,
    -- while legacy finalizers still validate the original customer/checkout actor.
    PERFORM set_config('memgine.financial_exception_actor', p_actor_user_id, true);
    PERFORM set_config('memgine.financial_exception_origin', 'ORG_ADMIN', true);
    PERFORM set_config('memgine.financial_exception_reason', btrim(p_reason), true);

    IF v_case.payment_intent_id IS NOT NULL AND v_case.commerce_transaction_id IS NULL
       AND v_case.source_channel = 'CUSTOMER_MEMBERSHIP' THEN
        SELECT i.customer_user_id INTO v_customer_user_id
        FROM payment_intents i
        WHERE i.payment_intent_id = v_case.payment_intent_id
          AND i.organization_id = p_organization_id;
        IF v_customer_user_id IS NULL THEN
            RAISE EXCEPTION 'Original customer identity unavailable' USING ERRCODE = '22023';
        END IF;
        SELECT r."subscriptionId" INTO v_result
        FROM payment_recover_collect_financial_exception(
            p_organization_id, v_case.payment_intent_id, v_customer_user_id
        ) r;
        IF v_result IS NULL THEN RAISE EXCEPTION 'Membership recovery was unavailable' USING ERRCODE = 'P0002'; END IF;
    ELSIF v_case.commerce_transaction_id IS NOT NULL AND v_case.payment_intent_id IS NULL
       AND v_case.source_channel IN ('COUNTER','COUNTER_REDEMPTION') THEN
        -- commerce_transactions.created_by is organization_user_id, not user_id.
        -- Use original checkout identity for P4-B's existing authorization check.
        SELECT ou.user_id INTO v_counter_user_id
        FROM commerce_transactions c
        JOIN organization_user ou ON ou.organization_user_id = c.created_by
        WHERE c.commerce_transaction_id = v_case.commerce_transaction_id
          AND c.organization_id = p_organization_id AND NOT c.is_deleted
          AND ou.organization_id = p_organization_id AND NOT ou.is_deleted;
        IF v_counter_user_id IS NULL THEN
            RAISE EXCEPTION 'Original Counter actor unavailable' USING ERRCODE = '22023';
        END IF;
        v_result := commerce_recover_counter_financial_exception(
            p_organization_id, v_case.commerce_transaction_id, v_counter_user_id
        );
        IF v_result IS NULL THEN RAISE EXCEPTION 'Counter recovery was unavailable' USING ERRCODE = 'P0002'; END IF;
    ELSE
        RAISE EXCEPTION 'Unsupported exception source for administrative recovery' USING ERRCODE = '22023';
    END IF;
    RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".financial_exception_admin_recover(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".financial_exception_admin_recover(varchar,varchar,varchar,varchar) TO "${appRole}";

-- Record a failed admin attempt in a separate committed transaction after
-- the fulfillment transaction has rolled back. This function never edits case
-- outcome, provider evidence or fulfillment entities.
CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_admin_record_failure(
    p_organization_id varchar, p_exception_id varchar,
    p_actor_user_id varchar, p_attempt_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_case poynt_collect_financial_exceptions%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Financial exception administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_attempt_id), '') IS NULL OR length(p_attempt_id) > 100 THEN
        RAISE EXCEPTION 'Recovery attempt identity is required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_case FROM poynt_collect_financial_exceptions
    WHERE financial_exception_id = p_exception_id AND organization_id = p_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial exception unavailable' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO financial_exception_events (
        financial_exception_event_id, financial_exception_id, organization_id, event_type,
        previous_case_status, new_case_status,
        previous_fulfillment_outcome, new_fulfillment_outcome,
        actor_user_id, actor_origin, description, event_identity
    ) VALUES (
        'FEE_' || gen_random_uuid()::text, v_case.financial_exception_id,
        v_case.organization_id, 'RECOVERY_FAILED',
        v_case.case_status, v_case.case_status,
        v_case.fulfillment_outcome, v_case.fulfillment_outcome,
        p_actor_user_id, 'ORG_ADMIN',
        'An administrative fulfillment recovery attempt did not complete; persisted payment evidence was not changed.',
        'RECOVERY_FAILED:' || v_case.financial_exception_id || ':' || p_attempt_id
    ) ON CONFLICT (event_identity) DO NOTHING;
    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".financial_exception_admin_record_failure(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".financial_exception_admin_record_failure(varchar,varchar,varchar,varchar) TO "${appRole}";

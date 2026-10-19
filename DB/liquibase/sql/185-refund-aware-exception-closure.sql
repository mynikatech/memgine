-- Migration 185: allow verified refund resolution without claiming fulfillment.
-- No provider execution or refund status updates occur here.
CREATE OR REPLACE FUNCTION "${schemaName}".financial_exception_transition(
    p_organization_id varchar, p_financial_exception_id varchar,
    p_new_status varchar, p_reason varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_case poynt_collect_financial_exceptions%ROWTYPE;
    v_valid boolean := false;
    v_refund_succeeded boolean := false;
    v_refund_unresolved boolean := false;
    v_fulfillment_proven boolean := false;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Financial exception administration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NULLIF(btrim(p_reason), '') IS NULL OR length(p_reason) > 500 THEN
        RAISE EXCEPTION 'A sanitized lifecycle reason is required' USING ERRCODE = '22023';
    END IF;
    IF p_reason ~* '(token|nonce|pan|cvv|card[ _-]?(number|data)|secret|private[ _-]?key|authorization|bearer|jwt|payload|[{}])' THEN
        RAISE EXCEPTION 'Lifecycle reason must not contain payment or credential data' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_case FROM poynt_collect_financial_exceptions
     WHERE financial_exception_id = p_financial_exception_id AND organization_id = p_organization_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Financial exception is unavailable' USING ERRCODE = 'P0002'; END IF;

    -- Read linked refund ledger records, not a client-provided refund outcome.
    SELECT EXISTS (
        SELECT 1 FROM payment_refunds r
         WHERE r.organization_id = p_organization_id
           AND r.financial_exception_id = p_financial_exception_id
           AND r.execution_status = 'SUCCEEDED'
    ) INTO v_refund_succeeded;

    -- Conservative rule: a linked financial action not proven terminal-success
    -- must not be treated as a completed financial resolution. FAILED can be
    -- investigated separately, but does not prove successful financial action.
    SELECT EXISTS (
        SELECT 1 FROM payment_refunds r
         WHERE r.organization_id = p_organization_id
           AND r.financial_exception_id = p_financial_exception_id
           AND r.execution_status NOT IN ('SUCCEEDED', 'FAILED')
    ) INTO v_refund_unresolved;

    v_fulfillment_proven := v_case.fulfillment_outcome = 'FULFILLED';
    IF v_fulfillment_proven THEN
        v_fulfillment_proven :=
            (v_case.payment_intent_id IS NOT NULL
             AND NULLIF(btrim(v_case.related_subscription_id), '') IS NOT NULL)
            OR (v_case.commerce_transaction_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM commerce_transactions c
                 WHERE c.commerce_transaction_id = v_case.commerce_transaction_id
                   AND c.organization_id = p_organization_id
                   AND NOT c.is_deleted
                   AND ((c.source_channel = 'COUNTER_REDEMPTION' AND c.status = 'COMPLETED')
                     OR (c.source_channel = 'COUNTER' AND NULLIF(btrim(c.subscription_id), '') IS NOT NULL))
            ));
    END IF;

    v_valid := (v_case.case_status = 'OPEN' AND p_new_status = 'UNDER_REVIEW')
            OR (v_case.case_status = 'UNDER_REVIEW' AND p_new_status = 'OPEN')
            OR (v_case.case_status IN ('OPEN','UNDER_REVIEW') AND p_new_status = 'RESOLVED'
                AND (v_fulfillment_proven OR (v_refund_succeeded AND NOT v_refund_unresolved)))
            OR (v_case.case_status = 'RESOLVED' AND p_new_status = 'CLOSED'
                AND NOT v_refund_unresolved);
    IF NOT v_valid THEN
        RAISE EXCEPTION 'Financial exception lifecycle transition is not permitted' USING ERRCODE = '22023';
    END IF;
    PERFORM set_config('memgine.financial_exception_actor', p_actor_user_id, true);
    PERFORM set_config('memgine.financial_exception_origin', 'ORG_ADMIN', true);
    PERFORM set_config('memgine.financial_exception_reason', btrim(p_reason), true);
    UPDATE poynt_collect_financial_exceptions
       SET case_status = p_new_status,
           resolved_at = CASE WHEN p_new_status IN ('RESOLVED','CLOSED') THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
     WHERE financial_exception_id = v_case.financial_exception_id;
    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".financial_exception_transition(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".financial_exception_transition(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

-- 216: Fix PL/pgSQL RETURN QUERY column types for Counter pending redemption reads.
-- Non-mutating replacement of the function introduced in 214; no payment state changes.
-- Preserve existing 214 privileges and SECURITY DEFINER authorization.

-- R2-4A: server-backed Counter recovery.  These operations never dispatch,
-- cancel, capture, or retry a provider payment.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_list_counter_pending_redemption_transactions(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar,
    p_customer_user_id varchar,
    p_limit integer,
    p_offset integer
)
RETURNS TABLE (
    "redemptionTransactionId" varchar, "transactionNumber" varchar,
    "commerceTransactionId" varchar, "organizationId" varchar, "storeId" varchar,
    "customerUserId" varchar, "customerDisplayName" varchar,
    "redemptionStatus" varchar, "commerceStatus" varchar, "providerCode" varchar,
    "amountMinor" bigint, "currencyCode" varchar, "createdAt" text,
    "lastAttemptAt" text, "lastAttemptStatus" varchar, "retryAllowed" boolean,
    "unresolvedPayment" boolean, "financialExceptionId" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;
    IF coalesce(p_limit, 0) NOT BETWEEN 1 AND 100 OR coalesce(p_offset, -1) < 0 THEN
        RAISE EXCEPTION 'Invalid pending transaction pagination' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH latest_attempt AS (
        SELECT DISTINCT ON (a.commerce_transaction_id)
            a.commerce_transaction_id, a.created_at, a.provider_status
        FROM commerce_provider_payment_attempts a
        WHERE a.payment_channel = 'REMOTE_TERMINAL'
        ORDER BY a.commerce_transaction_id, a.created_at DESC, a.commerce_provider_payment_attempt_id DESC
    )
    SELECT r.redemption_transaction_id::varchar, r.redemption_transaction_number::varchar,
           c.commerce_transaction_id::varchar, c.organization_id::varchar, c.store_id::varchar, c.customer_user_id::varchar,
           coalesce(nullif(btrim(u.display_name), ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.user_code)::varchar,
           r.status::varchar, c.status::varchar,
           CASE WHEN c.integration_configuration_id IS NULL THEN 'TEST'::varchar ELSE upper(i.provider)::varchar END,
           c.total_minor::bigint, c.currency_code::varchar, c.created_at::text,
           la.created_at::text, la.provider_status::varchar,
           (
             -- The authenticated Bridge callback is the only terminal-failure
             -- path that returns a redemption checkout to ORDER_CREATED.  A
             -- new attempt then reuses the persisted provider order.
             c.status = 'ORDER_CREATED'
             AND la.provider_status IN ('FAILED', 'CANCELLED')
             AND NOT EXISTS (
               SELECT 1 FROM commerce_provider_payment_attempts active
               WHERE active.commerce_transaction_id = c.commerce_transaction_id
                 AND active.payment_channel = 'REMOTE_TERMINAL'
                 AND active.provider_status IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
             )
             AND r.status = 'PENDING'
             AND NOT EXISTS (
               SELECT 1 FROM poynt_collect_financial_exceptions e
               WHERE e.commerce_transaction_id = c.commerce_transaction_id
                 AND NOT (
                   e.case_status IN ('RESOLVED', 'CLOSED')
                   AND e.provider_outcome IN ('FAILED', 'CANCELLED')
                   AND e.classification = 'PROVIDER_OUTCOME_FAILED'
                 )
             )
           ),
           EXISTS (
             SELECT 1 FROM commerce_provider_payment_attempts active
             WHERE active.commerce_transaction_id = c.commerce_transaction_id
               AND active.payment_channel = 'REMOTE_TERMINAL'
               AND active.provider_status IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
           ) OR EXISTS (
             SELECT 1 FROM poynt_collect_financial_exceptions e
             WHERE e.commerce_transaction_id = c.commerce_transaction_id
               AND e.provider_outcome = 'UNRESOLVED'
               AND e.case_status <> 'CLOSED'
           ),
           e.financial_exception_id::varchar
      FROM redemption_transaction r
      JOIN commerce_transaction_redemptions x ON x.redemption_transaction_id = r.redemption_transaction_id AND NOT x.is_deleted
      JOIN commerce_transactions c ON c.commerce_transaction_id = x.commerce_transaction_id AND NOT c.is_deleted
      JOIN "user" u ON u.user_id = c.customer_user_id
      LEFT JOIN integration_configurations i ON i.integration_configuration_id = c.integration_configuration_id AND NOT i.is_deleted
      LEFT JOIN latest_attempt la ON la.commerce_transaction_id = c.commerce_transaction_id
      LEFT JOIN poynt_collect_financial_exceptions e ON e.commerce_transaction_id = c.commerce_transaction_id
     WHERE r.organization_id = p_organization_id
       AND r.store_id = p_store_id
       AND c.organization_id = p_organization_id
       AND c.store_id = p_store_id
       AND c.source_channel = 'COUNTER_REDEMPTION'
       AND r.status = 'PENDING'
       AND c.status IN ('ORDER_CREATED', 'PROVIDER_IN_PROGRESS', 'PROVIDER_FAILED', 'PROVIDER_SUCCEEDED', 'FULFILLMENT_PENDING')
       AND (p_customer_user_id IS NULL OR c.customer_user_id = p_customer_user_id)
     ORDER BY c.created_at DESC, c.commerce_transaction_id
     LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_list_counter_pending_redemption_transactions(varchar,varchar,varchar,varchar,varchar,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_list_counter_pending_redemption_transactions(varchar,varchar,varchar,varchar,varchar,integer,integer) TO "${appRole}";

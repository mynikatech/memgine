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
    SELECT r.redemption_transaction_id, r.redemption_transaction_number,
           c.commerce_transaction_id, c.organization_id, c.store_id, c.customer_user_id,
           coalesce(nullif(btrim(u.display_name), ''), nullif(trim(concat_ws(' ', u.first_name, u.last_name)), ''), u.user_code),
           r.status, c.status,
           CASE WHEN c.integration_configuration_id IS NULL THEN 'TEST'::varchar ELSE upper(i.provider)::varchar END,
           c.total_minor, c.currency_code, c.created_at::text,
           la.created_at::text, la.provider_status,
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
           e.financial_exception_id
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

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_open_overdue_remote_terminal_financial_exception(
    p_reference_id varchar,
    p_grace_seconds integer DEFAULT 300
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_transaction commerce_transactions%ROWTYPE;
    v_case_id varchar;
    v_provider_code varchar(64);
BEGIN
    IF nullif(btrim(p_reference_id), '') IS NULL OR length(p_reference_id) > 160
       OR coalesce(p_grace_seconds, 0) < 60 OR p_grace_seconds > 86400 THEN
        RAISE EXCEPTION 'Invalid unresolved remote payment request' USING ERRCODE = '22023';
    END IF;

    -- Lock order deliberately matches callback/finalization: attempt, then transaction.
    SELECT * INTO v_attempt FROM commerce_provider_payment_attempts
     WHERE provider_reference_id = btrim(p_reference_id) AND payment_channel = 'REMOTE_TERMINAL'
     FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v_transaction FROM commerce_transactions
     WHERE commerce_transaction_id = v_attempt.commerce_transaction_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RETURN NULL; END IF;

    IF v_transaction.source_channel NOT IN ('COUNTER', 'COUNTER_REDEMPTION')
       OR v_transaction.status <> 'PROVIDER_IN_PROGRESS'
       OR v_attempt.provider_status NOT IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
       OR coalesce(v_attempt.dispatched_at, v_attempt.created_at) > (CURRENT_TIMESTAMP - make_interval(secs => p_grace_seconds))
    THEN RETURN NULL; END IF;

    -- Never replace verified capture evidence with an unresolved observation.
    SELECT financial_exception_id INTO v_case_id
      FROM poynt_collect_financial_exceptions
     WHERE commerce_transaction_id = v_transaction.commerce_transaction_id
     FOR UPDATE;
    IF FOUND THEN RETURN v_case_id; END IF;

    SELECT upper(provider)::varchar INTO v_provider_code
      FROM integration_configurations
     WHERE integration_configuration_id = v_transaction.integration_configuration_id
       AND organization_id = v_transaction.organization_id AND NOT is_deleted;

    INSERT INTO poynt_collect_financial_exceptions(
        financial_exception_id, organization_id, commerce_transaction_id, source_channel,
        provider_code, provider_reference_id, amount_minor, currency_code,
        classification, classification_reason, evidence_reason, provider_outcome, fulfillment_outcome
    ) VALUES (
        'PFE_' || gen_random_uuid()::text, v_transaction.organization_id,
        v_transaction.commerce_transaction_id, v_transaction.source_channel,
        coalesce(v_provider_code, 'POYNT'), v_attempt.provider_reference_id,
        v_attempt.amount_minor, upper(v_attempt.currency_code),
        'PROVIDER_OUTCOME_UNRESOLVED',
        'Remote terminal payment exceeded the configured reconciliation grace period.',
        'Persisted remote-terminal attempt remains nonterminal after the grace period; no provider outcome was inferred.',
        'UNRESOLVED', 'UNKNOWN'
    ) ON CONFLICT (commerce_transaction_id) WHERE commerce_transaction_id IS NOT NULL DO NOTHING
    RETURNING financial_exception_id INTO v_case_id;

    IF v_case_id IS NULL THEN
        SELECT financial_exception_id INTO v_case_id FROM poynt_collect_financial_exceptions
         WHERE commerce_transaction_id = v_transaction.commerce_transaction_id;
    END IF;
    RETURN v_case_id;
END;
$function$;

-- Bounded, idempotent processor entry point.  It is intentionally provider
-- read-only: it only opens unresolved cases from persisted attempt state.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_scan_overdue_remote_terminal_attempts(
    p_limit integer DEFAULT 20, p_grace_seconds integer DEFAULT 300
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_reference varchar; v_processed integer := 0;
BEGIN
 IF coalesce(p_limit,0) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid recovery batch limit' USING ERRCODE='22023'; END IF;
 FOR v_reference IN
   SELECT a.provider_reference_id
   FROM commerce_provider_payment_attempts a
   JOIN commerce_transactions c ON c.commerce_transaction_id=a.commerce_transaction_id AND NOT c.is_deleted
   WHERE a.payment_channel='REMOTE_TERMINAL'
     AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
     AND c.source_channel IN ('COUNTER','COUNTER_REDEMPTION')
     AND c.status='PROVIDER_IN_PROGRESS'
     AND a.provider_reference_id IS NOT NULL
     -- Exclude represented cases before limiting/locking so a repeated scan
     -- cannot starve later unrepresented overdue attempts.
     AND NOT EXISTS (
       SELECT 1 FROM poynt_collect_financial_exceptions e
       WHERE e.commerce_transaction_id=c.commerce_transaction_id
     )
     AND coalesce(a.dispatched_at,a.created_at) <= CURRENT_TIMESTAMP-make_interval(secs=>p_grace_seconds)
   ORDER BY coalesce(a.dispatched_at,a.created_at),a.commerce_provider_payment_attempt_id
   LIMIT p_limit
   FOR UPDATE OF a SKIP LOCKED
 LOOP
   PERFORM commerce_open_overdue_remote_terminal_financial_exception(v_reference,p_grace_seconds);
   v_processed:=v_processed+1;
 END LOOP;
 RETURN v_processed;
END;
$function$;

-- A later verified callback may settle an earlier unresolved case.  This does
-- not alter the attempt or transaction; their callback state remains the
-- authoritative financial evidence.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_reconcile_unresolved_remote_terminal_financial_exception(
    p_reference_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_attempt commerce_provider_payment_attempts%ROWTYPE; v_transaction commerce_transactions%ROWTYPE; v_case poynt_collect_financial_exceptions%ROWTYPE;
BEGIN
 SELECT * INTO v_attempt FROM commerce_provider_payment_attempts WHERE provider_reference_id=btrim(p_reference_id) AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_transaction FROM commerce_transactions WHERE commerce_transaction_id=v_attempt.commerce_transaction_id AND NOT is_deleted FOR UPDATE;
 SELECT * INTO v_case FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id=v_transaction.commerce_transaction_id FOR UPDATE;
 IF NOT FOUND OR v_case.provider_outcome<>'UNRESOLVED' THEN RETURN v_case.financial_exception_id; END IF;
 PERFORM set_config('memgine.financial_exception_origin','SYSTEM',true);
 PERFORM set_config('memgine.financial_exception_reason','Late verified terminal callback reconciled the prior unresolved outcome.',true);
 IF v_attempt.provider_status='SUCCEEDED'
    AND v_transaction.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED')
    AND NULLIF(btrim(v_attempt.provider_transaction_id),'') IS NOT NULL
    AND v_transaction.provider_transaction_id = v_attempt.provider_transaction_id
    AND v_attempt.amount_minor IS NOT DISTINCT FROM v_transaction.total_minor
    AND upper(v_attempt.currency_code) IS NOT DISTINCT FROM upper(v_transaction.currency_code)
    AND v_case.provider_reference_id = v_attempt.provider_reference_id
 THEN
   UPDATE poynt_collect_financial_exceptions
      SET provider_outcome='CAPTURED',
          provider_transaction_id=v_attempt.provider_transaction_id,
          classification=CASE WHEN v_transaction.status='COMPLETED'
                              THEN 'MANUAL_REVIEW' ELSE 'CAPTURED_UNFULFILLED' END,
          classification_reason=CASE WHEN v_transaction.status='COMPLETED'
                              THEN 'Late capture verified; Counter fulfillment completed.'
                              ELSE 'Late capture verified; Counter fulfillment requires verification.' END,
          fulfillment_outcome=CASE WHEN v_transaction.status='COMPLETED'
                                  THEN 'FULFILLED' ELSE fulfillment_outcome END,
          case_status=CASE WHEN v_transaction.status='COMPLETED' THEN 'RESOLVED' ELSE case_status END
    WHERE financial_exception_id=v_case.financial_exception_id;
 ELSIF v_attempt.provider_status IN ('FAILED','CANCELLED') AND v_transaction.status='ORDER_CREATED' THEN
   UPDATE poynt_collect_financial_exceptions
      SET provider_outcome=v_attempt.provider_status,
          classification='PROVIDER_OUTCOME_FAILED',
          case_status='RESOLVED',
          evidence_reason='Verified terminal failure/cancellation resolved the previously unresolved outcome.'
    WHERE financial_exception_id=v_case.financial_exception_id;
 END IF;
 RETURN v_case.financial_exception_id;
END;
$function$;

-- Historic CAPTURED/UNRESOLVED values are retained.  FAILED and CANCELLED are
-- used only after an authenticated terminal callback has persisted a matching
-- terminal outcome and returned the Commerce transaction to ORDER_CREATED.
ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    DROP CONSTRAINT IF EXISTS ck_financial_exception_provider_outcome,
    ADD CONSTRAINT ck_financial_exception_provider_outcome
    CHECK (provider_outcome IN ('CAPTURED', 'UNRESOLVED', 'FAILED', 'CANCELLED'));

ALTER TABLE "${schemaName}".poynt_collect_financial_exceptions
    DROP CONSTRAINT IF EXISTS ck_financial_exception_classification,
    ADD CONSTRAINT ck_financial_exception_classification
    CHECK (classification IN ('CAPTURED_UNFULFILLED', 'PROVIDER_OUTCOME_UNRESOLVED',
                              'PROVIDER_OUTCOME_FAILED', 'POSSIBLE_DUPLICATE',
                              'VERIFIED_DUPLICATE', 'FINALIZATION_RETRY_REQUIRED',
                              'MANUAL_REVIEW'));

REVOKE ALL ON FUNCTION "${schemaName}".commerce_list_counter_pending_redemption_transactions(varchar,varchar,varchar,varchar,varchar,integer,integer),
    "${schemaName}".commerce_open_overdue_remote_terminal_financial_exception(varchar,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_scan_overdue_remote_terminal_attempts(integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_reconcile_unresolved_remote_terminal_financial_exception(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_list_counter_pending_redemption_transactions(varchar,varchar,varchar,varchar,varchar,integer,integer),
    "${schemaName}".commerce_open_overdue_remote_terminal_financial_exception(varchar,integer) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_scan_overdue_remote_terminal_attempts(integer,integer) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_reconcile_unresolved_remote_terminal_financial_exception(varchar) TO "${appRole}";

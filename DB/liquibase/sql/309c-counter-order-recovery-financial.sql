-- ==========================================================================
-- FINANCIAL EXCEPTIONS — Captured but unfulfilled
-- Canonical PostgreSQL function: commerce_open_remote_terminal_financial_exception
-- ==========================================================================

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
    IF v_transaction.source_channel NOT IN ('COUNTER','COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT') THEN
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



-- ==========================================================================
-- FINANCIAL EXCEPTIONS — Overdue unresolved attempts
-- Canonical PostgreSQL function: commerce_open_overdue_remote_terminal_financial_exception
-- ==========================================================================

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

    IF v_transaction.source_channel NOT IN ('COUNTER','COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       OR v_transaction.status <> 'PROVIDER_IN_PROGRESS'
       OR v_attempt.provider_status NOT IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
       OR coalesce(v_attempt.dispatched_at,
           v_attempt.created_at) > (CURRENT_TIMESTAMP - make_interval(secs => p_grace_seconds))
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



-- ==========================================================================
-- FINANCIAL EXCEPTIONS — Overdue scanner
-- Canonical PostgreSQL function: commerce_scan_overdue_remote_terminal_attempts
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_scan_overdue_remote_terminal_attempts(
    p_limit integer DEFAULT 20, p_grace_seconds integer DEFAULT 300
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_reference varchar; v_processed integer := 0;
BEGIN
 IF coalesce(p_limit,0) NOT BETWEEN 1
     AND 100 THEN RAISE EXCEPTION 'Invalid recovery batch limit' USING ERRCODE='22023'; END IF;
 FOR v_reference IN
   SELECT a.provider_reference_id
   FROM commerce_provider_payment_attempts a
   JOIN commerce_transactions c ON c.commerce_transaction_id=a.commerce_transaction_id AND NOT c.is_deleted
   WHERE a.payment_channel='REMOTE_TERMINAL'
     AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
     AND c.source_channel IN ('COUNTER','COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
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



-- ==========================================================================
-- FINANCIAL EXCEPTIONS — Late outcome reconciliation
-- Canonical PostgreSQL function: commerce_reconcile_unresolved_remote_terminal_financial_exception
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_reconcile_unresolved_remote_terminal_financial_exception(
    p_reference_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_attempt commerce_provider_payment_attempts%ROWTYPE; v_transaction commerce_transactions%ROWTYPE;
    v_case poynt_collect_financial_exceptions%ROWTYPE; v_pending_handover boolean;
BEGIN
 SELECT * INTO v_attempt FROM commerce_provider_payment_attempts WHERE provider_reference_id=btrim(p_reference_id)
     AND payment_channel='REMOTE_TERMINAL';
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO v_transaction FROM commerce_transactions WHERE commerce_transaction_id=v_attempt.commerce_transaction_id
     AND NOT is_deleted FOR UPDATE;
 SELECT * INTO v_attempt FROM commerce_provider_payment_attempts
  WHERE commerce_provider_payment_attempt_id=v_attempt.commerce_provider_payment_attempt_id FOR UPDATE;
 SELECT * INTO v_case FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id=v_transaction.commerce_transaction_id FOR UPDATE;
 IF NOT FOUND OR v_case.provider_outcome<>'UNRESOLVED' THEN RETURN v_case.financial_exception_id; END IF;
 PERFORM set_config('memgine.financial_exception_origin','SYSTEM',true);
 PERFORM set_config('memgine.financial_exception_reason',
     'Late verified terminal callback reconciled the prior unresolved outcome.',true);
 IF v_attempt.provider_status='SUCCEEDED'
    AND v_transaction.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED')
    AND NULLIF(btrim(v_attempt.provider_transaction_id),'') IS NOT NULL
    AND v_transaction.provider_transaction_id = v_attempt.provider_transaction_id
    AND v_attempt.amount_minor IS NOT DISTINCT FROM v_transaction.total_minor
    AND upper(v_attempt.currency_code) IS NOT DISTINCT FROM upper(v_transaction.currency_code)
    AND v_case.provider_reference_id = v_attempt.provider_reference_id
 THEN
   v_pending_handover := EXISTS (
     SELECT 1 FROM fulfillments f JOIN statuses s ON s.status_id=f.fulfillment_status_id
     WHERE f.commerce_transaction_id=v_transaction.commerce_transaction_id
       AND s.status_code IN ('PLACED','PREPARING','READY') AND f.cancelled_at IS NULL
       AND f.cancellation_requested_at IS NULL AND f.fulfilled_at IS NULL
   ) AND NOT EXISTS (
     SELECT 1 FROM commerce_counter_timeout_recoveries r WHERE r.commerce_transaction_id=v_transaction.commerce_transaction_id
   ) AND NOT EXISTS (
     SELECT 1 FROM payment_refunds r WHERE r.commerce_transaction_id=v_transaction.commerce_transaction_id
         AND r.approval_status<>'REJECTED'
   );
   UPDATE poynt_collect_financial_exceptions
      SET provider_outcome='CAPTURED',
          provider_transaction_id=v_attempt.provider_transaction_id,
          classification=CASE WHEN v_transaction.status='COMPLETED'
                              THEN 'MANUAL_REVIEW' ELSE 'CAPTURED_UNFULFILLED' END,
          classification_reason=CASE WHEN v_transaction.status='COMPLETED'
                              THEN 'Late capture verified; Counter fulfillment completed.'
                              WHEN v_pending_handover THEN 'Verified capture resolved the payment uncertainty. Physical handover is pending.'
                              ELSE 'Late capture verified; Counter fulfillment requires verification.' END,
          fulfillment_outcome=CASE WHEN v_transaction.status='COMPLETED'
                                  THEN 'FULFILLED' ELSE fulfillment_outcome END,
          case_status=CASE WHEN v_transaction.status='COMPLETED'
              OR v_pending_handover THEN 'RESOLVED' ELSE case_status END,
          resolved_at=CASE WHEN v_pending_handover THEN current_timestamp ELSE resolved_at END
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

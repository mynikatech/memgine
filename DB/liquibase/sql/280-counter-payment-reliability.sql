-- P0 Counter terminal reliability.  This migration does not add a state
-- machine, a table, a trigger, or a ledger: it records safe callback detail
-- on the existing attempt and exposes the current persisted attempt to checkout.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_remote_payment_callback_detail(
    p_reference_id varchar,
    p_callback_status varchar,
    p_provider_transaction_id varchar,
    p_transaction_status varchar,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_provider_business_id varchar,
    p_provider_store_id varchar,
    p_failure_code varchar,
    p_failure_message varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_status varchar(32);
    v_transaction_id varchar(64);
    v_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_transaction commerce_transactions%ROWTYPE;
    v_case poynt_collect_financial_exceptions%ROWTYPE;
    v_provider_code varchar(64);
BEGIN
    IF NULLIF(btrim(p_reference_id), '') IS NULL
       OR NULLIF(btrim(p_callback_status), '') IS NULL
       OR length(COALESCE(p_failure_code,'')) > 80
       OR length(COALESCE(p_failure_message,'')) > 500 THEN
        RAISE EXCEPTION 'Invalid remote payment callback detail' USING ERRCODE='22023';
    END IF;
    v_status := upper(btrim(p_callback_status));
    IF v_status = 'CANCELLED' THEN v_status := 'CANCELED'; END IF;

    -- All current Counter paths acquire the Commerce transaction before its
    -- attempts. Resolve correlation without a row lock, lock the transaction,
    -- then lock this attempt. The historical callback function subsequently
    -- sees locks already owned by this transaction, so it cannot invert this
    -- effective lock order.
    SELECT a.commerce_transaction_id INTO v_transaction_id
      FROM commerce_provider_payment_attempts a
     WHERE a.provider_reference_id=btrim(p_reference_id)
       AND a.payment_channel='REMOTE_TERMINAL';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Remote payment reference not found' USING ERRCODE='P0002';
    END IF;
    SELECT * INTO v_transaction FROM commerce_transactions
     WHERE commerce_transaction_id=v_transaction_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002';
    END IF;
    SELECT * INTO v_attempt FROM commerce_provider_payment_attempts
     WHERE provider_reference_id=btrim(p_reference_id)
       AND commerce_transaction_id=v_transaction_id
       AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Remote payment reference not found' USING ERRCODE='P0002';
    END IF;

    -- A verified CAPTURED callback can arrive after its own attempt was
    -- terminally failed/cancelled and a later staff retry has begun. Preserve
    -- that evidence as a financial-review case; never overwrite either
    -- attempt or silently turn the later attempt into a success.
    IF v_status='PROCESSED' AND v_attempt.provider_status IN ('FAILED','CANCELLED')
       AND NULLIF(btrim(p_provider_transaction_id),'') IS NOT NULL
       AND length(p_provider_transaction_id) <= 160
       AND upper(NULLIF(btrim(p_transaction_status),''))='CAPTURED'
       AND p_amount_minor IS NOT DISTINCT FROM v_attempt.amount_minor
       AND upper(NULLIF(btrim(p_currency_code),'')) IS NOT DISTINCT FROM upper(v_attempt.currency_code)
       AND (p_provider_business_id IS NULL OR btrim(p_provider_business_id)=v_attempt.provider_business_id)
       AND (p_provider_store_id IS NULL OR btrim(p_provider_store_id)=v_attempt.provider_store_id)
    THEN
      IF v_transaction.source_channel IN ('COUNTER','COUNTER_REDEMPTION') THEN
        SELECT upper(provider)::varchar INTO v_provider_code FROM integration_configurations
          WHERE integration_configuration_id=v_transaction.integration_configuration_id
            AND organization_id=v_transaction.organization_id AND NOT is_deleted;
        SELECT * INTO v_case FROM poynt_collect_financial_exceptions
          WHERE commerce_transaction_id=v_transaction.commerce_transaction_id FOR UPDATE;
        IF FOUND THEN
          -- An exact replay is idempotent. A late capture for the same failed
          -- attempt may fill a previously absent provider transaction ID, but
          -- it may never replace a captured reference already on the case.
          IF v_case.provider_reference_id IS NOT DISTINCT FROM v_attempt.provider_reference_id
             AND v_case.provider_transaction_id IS NOT NULL
             AND v_case.provider_transaction_id IS DISTINCT FROM btrim(p_provider_transaction_id) THEN
            -- The first captured evidence remains durable and unchanged. The
            -- Kotlin caller logs this false result using only the reference.
            RETURN false;
          ELSIF v_case.provider_reference_id IS DISTINCT FROM v_attempt.provider_reference_id THEN
            -- One exception row exists per Commerce transaction. Do not
            -- overwrite its capture correlation with another attempt.
            RETURN false;
          ELSIF v_case.provider_outcome='CAPTURED'
             AND v_case.provider_transaction_id IS NOT DISTINCT FROM btrim(p_provider_transaction_id) THEN
            RETURN true;
          END IF;

          UPDATE poynt_collect_financial_exceptions
             SET provider_outcome='CAPTURED',
                 provider_transaction_id=COALESCE(v_case.provider_transaction_id,btrim(p_provider_transaction_id)),
                 classification='MANUAL_REVIEW',
                 classification_reason='Late captured terminal callback conflicts with an earlier terminal outcome.',
                 evidence_reason='Authenticated callback has matching attempt amount/currency and terminal context; fulfillment was not changed.',
                 fulfillment_outcome='UNKNOWN',case_status='OPEN',updated_at=CURRENT_TIMESTAMP
           WHERE financial_exception_id=v_case.financial_exception_id;
          RETURN true;
        END IF;

        INSERT INTO poynt_collect_financial_exceptions(
          financial_exception_id,organization_id,commerce_transaction_id,source_channel,
          provider_code,provider_reference_id,provider_transaction_id,amount_minor,currency_code,
          classification,classification_reason,evidence_reason,provider_outcome,fulfillment_outcome
        ) VALUES (
          'PFE_' || gen_random_uuid()::text,v_transaction.organization_id,v_transaction.commerce_transaction_id,
          v_transaction.source_channel,COALESCE(v_provider_code,'POYNT'),v_attempt.provider_reference_id,
          btrim(p_provider_transaction_id),v_attempt.amount_minor,upper(v_attempt.currency_code),
          'MANUAL_REVIEW','Late captured terminal callback conflicts with an earlier terminal outcome.',
          'Authenticated callback has matching attempt amount/currency and terminal context; fulfillment was not changed.',
          'CAPTURED','UNKNOWN'
        );
        RETURN true;
      END IF;
    END IF;

    -- Existing function is the authoritative state-transition and replay guard.
    PERFORM commerce_record_remote_payment_callback(
        p_reference_id, v_status, p_provider_transaction_id, p_transaction_status,
        p_amount_minor, p_currency_code, p_provider_business_id, p_provider_store_id
    );

    IF v_status NOT IN ('FAILED','CANCELED') THEN RETURN true; END IF;
    SELECT * INTO v_attempt FROM commerce_provider_payment_attempts
      WHERE provider_reference_id=btrim(p_reference_id) AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
    SELECT * INTO v_transaction FROM commerce_transactions
      WHERE commerce_transaction_id=v_attempt.commerce_transaction_id AND NOT is_deleted FOR UPDATE;
    -- The underlying callback function has already proven that this is the
    -- same terminal attempt and returned it to ORDER_CREATED.  Only sanitized,
    -- provider-supplied diagnostic detail is appended to that evidence.
    UPDATE commerce_provider_payment_attempts
       SET failure_code=COALESCE(NULLIF(btrim(p_failure_code),''), CASE WHEN v_status='CANCELED' THEN 'CANCELED' ELSE 'DECLINED' END),
           failure_message=NULLIF(btrim(regexp_replace(COALESCE(p_failure_message,''),'[[:cntrl:]]',' ','g')),'')
     WHERE commerce_provider_payment_attempt_id=v_attempt.commerce_provider_payment_attempt_id
       AND provider_status=CASE WHEN v_status='CANCELED' THEN 'CANCELLED' ELSE 'FAILED' END;
    UPDATE commerce_transactions
       SET failure_code=COALESCE(NULLIF(btrim(p_failure_code),''), CASE WHEN v_status='CANCELED' THEN 'REMOTE_PAYMENT_CANCELLED' ELSE 'REMOTE_PAYMENT_DECLINED' END),
           failure_message=NULLIF(btrim(regexp_replace(COALESCE(p_failure_message,''),'[[:cntrl:]]',' ','g')),'')
     WHERE commerce_transaction_id=v_transaction.commerce_transaction_id
       AND status='ORDER_CREATED';
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_payment_attempt_summary(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "paymentAttemptId" varchar, "providerReferenceId" varchar, "providerStatus" varchar,
    "providerTransactionId" varchar, "failureCode" varchar, "failureMessage" varchar,
    "lastCallbackAt" text, "retryAllowed" boolean, "unresolvedPayment" boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE c commerce_transactions%ROWTYPE;
BEGIN
    SELECT * INTO c FROM commerce_transactions
     WHERE commerce_transaction_id=p_transaction_id AND source_channel='COUNTER_REDEMPTION' AND NOT is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Counter redemption Commerce transaction not found' USING ERRCODE='P0002'; END IF;
    PERFORM commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    RETURN QUERY
    WITH latest AS (
      SELECT a.* FROM commerce_provider_payment_attempts a
       WHERE a.commerce_transaction_id=c.commerce_transaction_id AND a.payment_channel='REMOTE_TERMINAL'
       ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC LIMIT 1
    ), active AS (
      SELECT EXISTS(SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=c.commerce_transaction_id
        AND ((a.payment_channel='REMOTE_TERMINAL' AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED'))
          OR (a.payment_channel='CASH' AND a.provider_status='PENDING'))) AS value
    ), unresolved AS (
      SELECT EXISTS(SELECT 1 FROM poynt_collect_financial_exceptions e WHERE e.commerce_transaction_id=c.commerce_transaction_id
        AND NOT (e.case_status IN ('RESOLVED','CLOSED')
          AND e.provider_outcome IN ('FAILED','CANCELLED')
          AND e.classification='PROVIDER_OUTCOME_FAILED')) AS value
    )
    SELECT a.commerce_provider_payment_attempt_id::varchar,a.provider_reference_id::varchar,a.provider_status::varchar,
      a.provider_transaction_id::varchar,a.failure_code::varchar,a.failure_message::varchar,a.callback_received_at::text,
      (c.status='ORDER_CREATED' AND a.provider_status IN ('FAILED','CANCELLED') AND NOT active.value AND NOT unresolved.value)::boolean,
      (active.value OR unresolved.value)::boolean
    FROM latest a CROSS JOIN active CROSS JOIN unresolved;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_close_counter_redemption_unpaid(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE c commerce_transactions%ROWTYPE; r redemption_transaction%ROWTYPE; v_actor varchar(64);
BEGIN
    SELECT * INTO c FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id
      AND organization_id=p_organization_id AND source_channel='COUNTER_REDEMPTION' AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Counter redemption Commerce transaction not found' USING ERRCODE='P0002'; END IF;
    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    SELECT rt.* INTO r FROM commerce_transaction_redemptions x JOIN redemption_transaction rt ON rt.redemption_transaction_id=x.redemption_transaction_id
      WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted FOR UPDATE OF rt;
    IF NOT FOUND THEN RAISE EXCEPTION 'Counter redemption is unavailable' USING ERRCODE='23505'; END IF;
    IF r.status='CANCELLED' AND c.status='CANCELLED' THEN RETURN true; END IF;
    IF r.status <> 'PENDING' OR c.status <> 'ORDER_CREATED' THEN RAISE EXCEPTION 'Counter redemption cannot be closed unpaid' USING ERRCODE='23505'; END IF;
    -- Lock the evidence rows while c is locked. Callback and payment-start
    -- functions also serialize through the Commerce transaction, so a close
    -- cannot inspect stale evidence and then transition the redemption.
    PERFORM 1 FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    PERFORM 1 FROM poynt_collect_financial_exceptions e
      WHERE e.commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=c.commerce_transaction_id
      AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED','SUCCEEDED'))
       OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e WHERE e.commerce_transaction_id=c.commerce_transaction_id
          AND NOT (e.case_status IN ('RESOLVED','CLOSED')
            AND e.provider_outcome IN ('FAILED','CANCELLED')
            AND e.classification='PROVIDER_OUTCOME_FAILED')) THEN
      RAISE EXCEPTION 'Counter redemption has an active, successful, or unresolved payment' USING ERRCODE='23505';
    END IF;
    UPDATE redemption_transaction_item SET status='FAILED',failure_reason='Closed unpaid by Counter staff',updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1
      WHERE redemption_transaction_id=r.redemption_transaction_id AND status='PENDING';
    UPDATE redemption_transaction SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE redemption_transaction_id=r.redemption_transaction_id;
    UPDATE commerce_transactions SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=c.commerce_transaction_id;
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_record_remote_payment_callback_detail(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar),
  "${schemaName}".commerce_get_counter_redemption_payment_attempt_summary(varchar,varchar),
  "${schemaName}".commerce_close_counter_redemption_unpaid(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_record_remote_payment_callback_detail(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar),
  "${schemaName}".commerce_get_counter_redemption_payment_attempt_summary(varchar,varchar),
  "${schemaName}".commerce_close_counter_redemption_unpaid(varchar,varchar,varchar) TO "${appRole}";

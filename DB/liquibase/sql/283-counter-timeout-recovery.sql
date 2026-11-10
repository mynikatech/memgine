-- Staff-confirmed timeout recovery for COUNTER_REDEMPTION.
-- Two minutes is a business waiting period, NOT evidence of Poynt failure.
-- Preserve the original terminal attempt and separately flag every late capture.

CREATE TABLE "${schemaName}".commerce_counter_timeout_recoveries (
    commerce_transaction_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL,
    store_id varchar(64) NOT NULL,
    terminal_payment_attempt_id varchar(64) NOT NULL,
    provider_reference_id varchar(160) NOT NULL,
    action varchar(16) NOT NULL CHECK (action IN ('CASH','CANCEL')),
    actor_user_id varchar(64) NOT NULL,
    staff_id varchar(64) NOT NULL,
    confirmed_no_success boolean NOT NULL CHECK (confirmed_no_success),
    recovered_at timestamptz NOT NULL DEFAULT now(),
    late_capture_seen boolean NOT NULL DEFAULT false,
    late_capture_at timestamptz,
    late_provider_transaction_id varchar(160),
    CHECK (NOT late_capture_seen OR late_capture_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_counter_timeout_recovery_attempt
    ON "${schemaName}".commerce_counter_timeout_recoveries (terminal_payment_attempt_id);
CREATE INDEX ix_counter_timeout_recovery_late
    ON "${schemaName}".commerce_counter_timeout_recoveries (organization_id, late_capture_seen)
    WHERE late_capture_seen;

-- App can only access recovery data through SECURITY DEFINER functions.
REVOKE ALL ON "${schemaName}".commerce_counter_timeout_recoveries FROM PUBLIC;
REVOKE ALL ON "${schemaName}".commerce_counter_timeout_recoveries FROM "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_timeout_recover(
    p_organization_id varchar, p_transaction_id varchar, p_store_id varchar,
    p_staff_id varchar, p_actor_user_id varchar, p_attempt_id varchar,
    p_action varchar, p_confirmed boolean
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    c commerce_transactions%ROWTYPE;
    a commerce_provider_payment_attempts%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    existing commerce_counter_timeout_recoveries%ROWTYPE;
    v_actor varchar(64);
    v_action varchar(16) := upper(btrim(coalesce(p_action,'')));
BEGIN
    IF p_confirmed IS DISTINCT FROM true OR v_action NOT IN ('CASH','CANCEL') THEN
       RAISE EXCEPTION 'Please confirm the terminal check and choose an action' USING ERRCODE='22023';
    END IF;
    IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN
       RAISE EXCEPTION 'Counter access is not permitted' USING ERRCODE='42501';
    END IF;
    SELECT * INTO c FROM commerce_transactions
     WHERE organization_id=p_organization_id AND commerce_transaction_id=p_transaction_id
       AND store_id=p_store_id AND source_channel='COUNTER_REDEMPTION' AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE='P0002'; END IF;
    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    SELECT * INTO existing FROM commerce_counter_timeout_recoveries
     WHERE commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    IF FOUND THEN
        IF existing.action=v_action AND existing.terminal_payment_attempt_id=p_attempt_id THEN
            RETURN CASE WHEN v_action='CASH' THEN 'CASH_READY' ELSE 'CANCELLED' END;
        END IF;
        RAISE EXCEPTION 'A different action was already selected for this redemption' USING ERRCODE='23505';
    END IF;
    SELECT * INTO a FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id=c.commerce_transaction_id
       AND commerce_provider_payment_attempt_id=p_attempt_id
       AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
    IF NOT FOUND OR a.provider_status NOT IN ('DISPATCHED','RECEIVED','STARTED')
       OR a.commerce_provider_payment_attempt_id IS DISTINCT FROM (
           SELECT newest.commerce_provider_payment_attempt_id
           FROM commerce_provider_payment_attempts newest
           WHERE newest.commerce_transaction_id=c.commerce_transaction_id
             AND newest.payment_channel='REMOTE_TERMINAL'
           ORDER BY newest.created_at DESC,newest.commerce_provider_payment_attempt_id DESC LIMIT 1
       )
       OR a.created_at > current_timestamp - interval '120 seconds'
       OR nullif(btrim(a.provider_reference_id),'') IS NULL THEN
        RAISE EXCEPTION 'Please wait for the payment check to finish, then try again' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts
      WHERE commerce_transaction_id=c.commerce_transaction_id
        AND (provider_status='SUCCEEDED' OR payment_channel='CASH'
          OR (payment_channel='REMOTE_TERMINAL' AND provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
               AND commerce_provider_payment_attempt_id IS DISTINCT FROM a.commerce_provider_payment_attempt_id)))
       OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions
         WHERE commerce_transaction_id=c.commerce_transaction_id
           AND provider_outcome='CAPTURED') THEN
        RAISE EXCEPTION 'A payment was recorded. Please check its status before proceeding' USING ERRCODE='23505';
    END IF;
    IF c.status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') THEN
        RAISE EXCEPTION 'This redemption cannot be changed now' USING ERRCODE='23505';
    END IF;
    SELECT rt.* INTO t FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt ON rt.redemption_transaction_id=x.redemption_transaction_id
      WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
      FOR UPDATE OF rt;
    IF NOT FOUND OR t.status<>'PENDING' THEN
        RAISE EXCEPTION 'Redemption is not pending' USING ERRCODE='23505';
    END IF;
    INSERT INTO commerce_counter_timeout_recoveries (
       commerce_transaction_id,organization_id,store_id,terminal_payment_attempt_id,
       provider_reference_id,action,actor_user_id,staff_id,confirmed_no_success
    ) VALUES (
       c.commerce_transaction_id,c.organization_id,c.store_id,a.commerce_provider_payment_attempt_id,
       a.provider_reference_id,v_action,p_actor_user_id,p_staff_id,true
    );
    IF v_action='CANCEL' THEN
       UPDATE redemption_transaction_item
         SET status='FAILED',failure_reason='Cancelled after terminal check',
             updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
         WHERE redemption_transaction_id=t.redemption_transaction_id AND status='PENDING';
       UPDATE redemption_transaction
         SET status='CANCELLED',updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
         WHERE redemption_transaction_id=t.redemption_transaction_id;
       UPDATE commerce_transactions
         SET status='CANCELLED',updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
         WHERE commerce_transaction_id=c.commerce_transaction_id;
       RETURN 'CANCELLED';
    END IF;
    -- The terminal attempt remains DISPATCHED as truthful historical evidence.
    -- The dedicated CASH start function below checks the recovery authorization.
    UPDATE commerce_transactions
       SET status='ORDER_CREATED',updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
     WHERE commerce_transaction_id=c.commerce_transaction_id;
    RETURN 'CASH_READY';
END;
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_timeout_cash_allowed(
    p_transaction_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(p_transaction_id,p_actor_user_id);
    RETURN EXISTS (
        SELECT 1 FROM commerce_counter_timeout_recoveries r
        WHERE r.commerce_transaction_id=p_transaction_id AND r.action='CASH'
    );
END;
$body$;

-- Keep every existing cash safety check except the carefully authorized
-- case where the same terminal attempt was checked after the timeout.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_redemption_cash_payment(
    p_organization_id varchar, p_transaction_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    cash_attempt commerce_provider_payment_attempts%ROWTYPE;
    recovery commerce_counter_timeout_recoveries%ROWTYPE;
BEGIN
    SELECT * INTO c FROM commerce_transactions
     WHERE commerce_transaction_id=p_transaction_id AND organization_id=p_organization_id
       AND source_channel='COUNTER_REDEMPTION' AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE='P0002'; END IF;
    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    SELECT * INTO recovery FROM commerce_counter_timeout_recoveries
      WHERE commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    SELECT * INTO cash_attempt FROM commerce_provider_payment_attempts
      WHERE commerce_transaction_id=c.commerce_transaction_id AND payment_channel='CASH'
      ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        IF cash_attempt.amount_minor IS DISTINCT FROM c.total_minor
            OR cash_attempt.currency_code IS DISTINCT FROM c.currency_code
            OR cash_attempt.provider_status NOT IN ('PENDING','SUCCEEDED') THEN
            RAISE EXCEPTION 'Existing cash payment does not match this redemption' USING ERRCODE='23505';
        END IF;
        IF cash_attempt.provider_status='SUCCEEDED' AND c.status='COMPLETED' THEN RETURN true; END IF;
        IF cash_attempt.provider_status='PENDING' AND c.status='PROVIDER_IN_PROGRESS' THEN RETURN true; END IF;
        RAISE EXCEPTION 'Cash payment cannot be restarted' USING ERRCODE='23505';
    END IF;
    IF c.status <> 'ORDER_CREATED' OR c.total_minor IS NULL OR c.total_minor <= 0
       OR c.currency_code !~ '^[A-Z]{3}$' OR nullif(btrim(c.provider_order_id),'') IS NULL THEN
       RAISE EXCEPTION 'Redemption is not ready for cash' USING ERRCODE='23505';
    END IF;
    IF NOT commerce_counter_redemption_pricing_is_acknowledged(c.commerce_transaction_id,p_actor_user_id) THEN
       RAISE EXCEPTION 'Confirm the checkout total first' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=c.commerce_transaction_id
      AND a.payment_channel='REMOTE_TERMINAL' AND a.provider_status='SUCCEEDED') THEN
       RAISE EXCEPTION 'Card payment already completed' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=c.commerce_transaction_id
      AND a.payment_channel='REMOTE_TERMINAL'
      AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')) THEN
        IF recovery.commerce_transaction_id IS NULL OR recovery.action<>'CASH'
          OR EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
            WHERE a.commerce_transaction_id=c.commerce_transaction_id
              AND a.payment_channel='REMOTE_TERMINAL'
              AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED')
              AND a.commerce_provider_payment_attempt_id IS DISTINCT FROM recovery.terminal_payment_attempt_id)
        THEN
          RAISE EXCEPTION 'Please check the terminal before taking cash' USING ERRCODE='23505';
        END IF;
    END IF;
    IF recovery.late_capture_seen OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e
        WHERE e.commerce_transaction_id=c.commerce_transaction_id
          AND e.provider_outcome='CAPTURED') THEN
        RAISE EXCEPTION 'A card payment was recorded' USING ERRCODE='23505';
    END IF;
    INSERT INTO commerce_provider_payment_attempts (
       commerce_provider_payment_attempt_id,commerce_transaction_id,provider_status,
       amount_minor,currency_code,created_by,payment_channel,provider_reference_id
    ) VALUES (generate_runtime_id('CPA'),c.commerce_transaction_id,'PENDING',
        c.total_minor,c.currency_code,v_actor,'CASH','cash:'||c.commerce_transaction_id);
    UPDATE commerce_transactions
       SET status='PROVIDER_IN_PROGRESS',failure_code=NULL,failure_message=NULL,
           updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
     WHERE commerce_transaction_id=c.commerce_transaction_id;
    RETURN true;
END;
$body$;

-- A late captured card payment must stop a still-unconfirmed cash attempt.
-- Once cash is completed, the callback is separately flagged for refund review.
ALTER FUNCTION "${schemaName}".commerce_confirm_counter_redemption_cash_payment(
    varchar,varchar,varchar
) RENAME TO commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_confirm_counter_redemption_cash_payment(
    p_organization_id varchar,p_transaction_id varchar,p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE c commerce_transactions%ROWTYPE;
BEGIN
    SELECT * INTO c FROM commerce_transactions
      WHERE commerce_transaction_id=p_transaction_id
        AND organization_id=p_organization_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE='P0002'; END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id=c.commerce_transaction_id
           AND a.payment_channel='REMOTE_TERMINAL'
           AND a.provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED','STARTED'))
       AND NOT EXISTS (SELECT 1 FROM commerce_counter_timeout_recoveries r
         WHERE r.commerce_transaction_id=c.commerce_transaction_id AND r.action='CASH') THEN
        RAISE EXCEPTION 'Please check the terminal before taking cash' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_counter_timeout_recoveries r
         WHERE r.commerce_transaction_id=c.commerce_transaction_id AND r.late_capture_seen) THEN
        RAISE EXCEPTION 'A card payment was received. Check it before collecting cash' USING ERRCODE='23505';
    END IF;
    RETURN commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery(
       p_organization_id,p_transaction_id,p_actor_user_id);
END;
$body$;

-- Intercept late callbacks for redemptions that the staff has already moved
-- to cash or canceled. Never feed them into the old payment finalizer.
-- Rename preserves the exact historical implementation for all other payments.
ALTER FUNCTION "${schemaName}".commerce_record_remote_payment_callback_detail(
    varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar
) RENAME TO commerce_record_remote_payment_callback_detail_before_timeout_recovery;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_remote_payment_callback_detail(
    p_reference_id varchar, p_callback_status varchar,
    p_provider_transaction_id varchar, p_transaction_status varchar,
    p_amount_minor bigint,p_currency_code varchar,p_provider_business_id varchar,
    p_provider_store_id varchar,p_failure_code varchar,p_failure_message varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    v_transaction_id varchar(64);
    c commerce_transactions%ROWTYPE;
    a commerce_provider_payment_attempts%ROWTYPE;
    r commerce_counter_timeout_recoveries%ROWTYPE;
    v_captured boolean;
BEGIN
    -- First determine transaction ID without locking, then follow the
    -- established lock order: Commerce -> attempt -> recovery.
    SELECT commerce_transaction_id INTO v_transaction_id
      FROM commerce_provider_payment_attempts
      WHERE payment_channel='REMOTE_TERMINAL' AND provider_reference_id=p_reference_id;
    IF NOT FOUND THEN
      RETURN commerce_record_remote_payment_callback_detail_before_timeout_recovery(
         p_reference_id,p_callback_status,p_provider_transaction_id,p_transaction_status,
         p_amount_minor,p_currency_code,p_provider_business_id,p_provider_store_id,
         p_failure_code,p_failure_message);
    END IF;
    SELECT * INTO c FROM commerce_transactions
      WHERE commerce_transaction_id=v_transaction_id AND NOT is_deleted FOR UPDATE;
    SELECT * INTO a FROM commerce_provider_payment_attempts
      WHERE commerce_transaction_id=v_transaction_id
       AND payment_channel='REMOTE_TERMINAL' AND provider_reference_id=p_reference_id FOR UPDATE;
    SELECT * INTO r FROM commerce_counter_timeout_recoveries
      WHERE commerce_transaction_id=v_transaction_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN commerce_record_remote_payment_callback_detail_before_timeout_recovery(
         p_reference_id,p_callback_status,p_provider_transaction_id,p_transaction_status,
         p_amount_minor,p_currency_code,p_provider_business_id,p_provider_store_id,
         p_failure_code,p_failure_message);
    END IF;
    IF r.terminal_payment_attempt_id IS DISTINCT FROM a.commerce_provider_payment_attempt_id
      OR r.provider_reference_id IS DISTINCT FROM p_reference_id THEN
       RAISE EXCEPTION 'Callback does not match the recovered payment' USING ERRCODE='23505';
    END IF;
    v_captured := upper(coalesce(p_callback_status,''))='PROCESSED'
      AND upper(coalesce(p_transaction_status,''))='CAPTURED'
      AND nullif(btrim(coalesce(p_provider_transaction_id,'')),'') IS NOT NULL
      AND p_amount_minor IS NOT DISTINCT FROM a.amount_minor
      AND upper(p_currency_code) IS NOT DISTINCT FROM upper(a.currency_code)
      AND (p_provider_business_id IS NULL OR p_provider_business_id=a.provider_business_id)
      AND (p_provider_store_id IS NULL OR p_provider_store_id=a.provider_store_id);
    IF v_captured THEN
       IF r.late_capture_seen AND r.late_provider_transaction_id IS DISTINCT FROM p_provider_transaction_id THEN
           RAISE EXCEPTION 'Different captured payment reference requires investigation' USING ERRCODE='23505';
       END IF;
       UPDATE commerce_counter_timeout_recoveries
         SET late_capture_seen=true,late_capture_at=coalesce(late_capture_at,current_timestamp),
             late_provider_transaction_id=coalesce(late_provider_transaction_id,p_provider_transaction_id)
         WHERE commerce_transaction_id=c.commerce_transaction_id;
    END IF;
    -- Do not change commerce status, entitlement, or the historical attempt.
    -- Reconciliation team queries late_capture_seen=true.
    RETURN true;
END;
$body$;

REVOKE ALL ON FUNCTION
  "${schemaName}".commerce_counter_timeout_recover(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean),
  "${schemaName}".commerce_counter_timeout_cash_allowed(varchar,varchar),
  "${schemaName}".commerce_begin_counter_redemption_cash_payment(varchar,varchar,varchar),
  "${schemaName}".commerce_confirm_counter_redemption_cash_payment(varchar,varchar,varchar),
  "${schemaName}".commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery(varchar,varchar,varchar),
  "${schemaName}".commerce_record_remote_payment_callback_detail(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar),
  "${schemaName}".commerce_record_remote_payment_callback_detail_before_timeout_recovery(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar)
FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION
  "${schemaName}".commerce_record_remote_payment_callback_detail_before_timeout_recovery(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar),
  "${schemaName}".commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery(varchar,varchar,varchar)
FROM "${appRole}";
GRANT EXECUTE ON FUNCTION
  "${schemaName}".commerce_counter_timeout_recover(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean),
  "${schemaName}".commerce_counter_timeout_cash_allowed(varchar,varchar),
  "${schemaName}".commerce_begin_counter_redemption_cash_payment(varchar,varchar,varchar),
  "${schemaName}".commerce_confirm_counter_redemption_cash_payment(varchar,varchar,varchar),
  "${schemaName}".commerce_record_remote_payment_callback_detail(varchar,varchar,varchar,varchar,bigint,varchar,varchar,varchar,varchar,varchar)
TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_terminal_attempt_recovered(
    p_reference_id varchar
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
    SELECT EXISTS (
      SELECT 1 FROM commerce_counter_timeout_recoveries
      WHERE provider_reference_id=p_reference_id
    );
$body$;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_counter_terminal_attempt_recovered(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_counter_terminal_attempt_recovered(varchar) TO "${appRole}";

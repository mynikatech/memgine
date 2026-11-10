-- Migration 284: immediate safe Counter redemption recovery and FK-correct audit actor.
-- Apply AFTER executed migration 283. Do not rerun or edit migration 283.
-- No table changes. SECURITY DEFINER functions retain the schema-constrained search_path.
-- A staff request has no artificial 120-second delay. However, a terminal payment
-- still in progress MUST remain UNRESOLVED; staff confirmation is not proof of failure.

-- Resolve the audit identity against the actual updated_by foreign key. The
-- Commerce actor can be an organization-user ID; Redemption might reference
-- an application-user ID. Never guess or suppress the FK constraint.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_recovery_fk_actor(
    p_table regclass, p_authenticated_user_id varchar, p_commerce_actor_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    v_ref_table regclass;
    v_ref_column text;
    v_matched boolean;
BEGIN
    SELECT con.confrelid::regclass, referenced.attname
      INTO v_ref_table, v_ref_column
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_attribute source
        ON source.attrelid = con.conrelid AND source.attnum = con.conkey[1]
      JOIN pg_catalog.pg_attribute referenced
        ON referenced.attrelid = con.confrelid AND referenced.attnum = con.confkey[1]
     WHERE con.contype = 'f'
       AND con.conrelid = p_table
       AND pg_catalog.array_length(con.conkey, 1) = 1
       AND source.attname = 'updated_by'
     LIMIT 1;

    IF v_ref_table IS NULL THEN
        RAISE EXCEPTION 'The redemption updated_by foreign key cannot be resolved for %', p_table
          USING ERRCODE = '23503';
    END IF;

    IF NULLIF(BTRIM(p_authenticated_user_id), '') IS NOT NULL THEN
        EXECUTE pg_catalog.format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I::text = $1)',
            v_ref_table, v_ref_column
        ) INTO v_matched USING p_authenticated_user_id;
        IF v_matched THEN RETURN p_authenticated_user_id; END IF;
    END IF;

    IF NULLIF(BTRIM(p_commerce_actor_id), '') IS NOT NULL THEN
        EXECUTE pg_catalog.format(
            'SELECT EXISTS (SELECT 1 FROM %s WHERE %I::text = $1)',
            v_ref_table, v_ref_column
        ) INTO v_matched USING p_commerce_actor_id;
        IF v_matched THEN RETURN p_commerce_actor_id; END IF;
    END IF;

    RAISE EXCEPTION 'Neither authenticated user nor Commerce actor satisfies the redemption audit FK for %', p_table
      USING ERRCODE = '23503';
END;
$body$;

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
    v_item_actor varchar(64);
    v_redemption_actor varchar(64);
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
    -- Retain idempotency, but validate current provider state BEFORE returning
    -- an old authorization; 283 could have recorded an active terminal attempt.
    IF existing.commerce_transaction_id IS NOT NULL AND
       (existing.action IS DISTINCT FROM v_action OR
        existing.terminal_payment_attempt_id IS DISTINCT FROM p_attempt_id) THEN
        RAISE EXCEPTION 'A different action was already selected for this redemption' USING ERRCODE='23505';
    END IF;
    SELECT * INTO a FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id=c.commerce_transaction_id
       AND commerce_provider_payment_attempt_id=p_attempt_id
       AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Terminal payment attempt not found' USING ERRCODE='P0002';
    END IF;
    IF a.commerce_provider_payment_attempt_id IS DISTINCT FROM (
        SELECT newest.commerce_provider_payment_attempt_id
        FROM commerce_provider_payment_attempts newest
        WHERE newest.commerce_transaction_id=c.commerce_transaction_id
          AND newest.payment_channel='REMOTE_TERMINAL'
        ORDER BY newest.created_at DESC,newest.commerce_provider_payment_attempt_id DESC
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'A newer terminal payment attempt exists' USING ERRCODE='23505';
    END IF;
    IF nullif(btrim(a.provider_reference_id),'') IS NULL THEN
        RAISE EXCEPTION 'Terminal payment reference is missing' USING ERRCODE='22023';
    END IF;
    -- No 120-second gate. The request immediately returns UNRESOLVED if the
    -- gateway outcome is not verified. Never mark an active attempt failed.
    IF a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED') THEN
        RETURN 'UNRESOLVED';
    END IF;
    IF a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED') THEN
        RAISE EXCEPTION 'Terminal payment is not verified as unsuccessful' USING ERRCODE='23505';
    END IF;
    -- Failed/cancelled means a verified durable provider result, not merely an
    -- operator checkbox or a UI polling timeout.
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
    IF existing.commerce_transaction_id IS NOT NULL THEN
        RETURN CASE WHEN v_action='CASH' THEN 'CASH_READY' ELSE 'CANCELLED' END;
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
        v_item_actor := commerce_counter_recovery_fk_actor(
            'redemption_transaction_item'::regclass, p_actor_user_id, v_actor);
        v_redemption_actor := commerce_counter_recovery_fk_actor(
            'redemption_transaction'::regclass, p_actor_user_id, v_actor);
       UPDATE redemption_transaction_item
         SET status='FAILED',failure_reason='Cancelled after terminal check',
             updated_at=current_timestamp,updated_by=v_item_actor,version_no=version_no+1
         WHERE redemption_transaction_id=t.redemption_transaction_id AND status='PENDING';
       UPDATE redemption_transaction
         SET status='CANCELLED',updated_at=current_timestamp,updated_by=v_redemption_actor,version_no=version_no+1
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
        JOIN commerce_provider_payment_attempts a
          ON a.commerce_provider_payment_attempt_id=r.terminal_payment_attempt_id
        WHERE r.commerce_transaction_id=p_transaction_id AND r.action='CASH'
          AND a.provider_status IN ('FAILED','CANCELLED','CANCELED')
          AND NOT r.late_capture_seen
    ) AND NOT EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id=p_transaction_id
           AND (a.provider_status='SUCCEEDED'
                OR (a.payment_channel='REMOTE_TERMINAL'
                    AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED')))
    ) AND NOT EXISTS (
        SELECT 1 FROM poynt_collect_financial_exceptions e
         WHERE e.commerce_transaction_id=p_transaction_id AND e.provider_outcome='CAPTURED'
    );
END;
$body$;

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
    -- 283 authorized CASH against a still-dispatched card payment based only
    -- on staff confirmation. Close that bypass, including for existing 283 rows.
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
       WHERE a.commerce_transaction_id=c.commerce_transaction_id
         AND a.payment_channel='REMOTE_TERMINAL'
         AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED')) THEN
        RAISE EXCEPTION 'Terminal payment unresolved; cash cannot be collected yet' USING ERRCODE='23505';
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
    PERFORM commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id=c.commerce_transaction_id
           AND a.payment_channel='REMOTE_TERMINAL'
           AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED','SUCCEEDED')) THEN
        RAISE EXCEPTION 'Card payment unresolved or captured; cannot confirm cash' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_counter_timeout_recoveries r
          WHERE r.commerce_transaction_id=c.commerce_transaction_id AND r.late_capture_seen)
       OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e
          WHERE e.commerce_transaction_id=c.commerce_transaction_id AND e.provider_outcome='CAPTURED') THEN
        RAISE EXCEPTION 'A card payment was received; check before collecting cash' USING ERRCODE='23505';
    END IF;
    RETURN commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery(
       p_organization_id,p_transaction_id,p_actor_user_id);
END;
$body$;

-- Explicit permissions for the new helper; existing app-role grants on
-- replaced functions are retained by PostgreSQL CREATE OR REPLACE FUNCTION.
REVOKE ALL ON FUNCTION "${schemaName}".commerce_counter_recovery_fk_actor(regclass,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_counter_recovery_fk_actor(regclass,varchar,varchar) TO "${appRole}";

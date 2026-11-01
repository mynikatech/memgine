-- Cash settlement for an already prepared Counter redemption checkout.
-- The browser never provides an amount, currency, provider reference, or
-- idempotency key: every financial fact is read from the persisted Commerce
-- transaction while the relevant rows are locked.

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_provider_payment_attempts_cash
    ON "${schemaName}".commerce_provider_payment_attempts(
        commerce_transaction_id
    )
    WHERE payment_channel = 'CASH';


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_redemption_cash_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_cash_attempt commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Counter redemption cash payment request'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    SELECT *
      INTO v_cash_attempt
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND payment_channel = 'CASH'
     ORDER BY created_at, commerce_provider_payment_attempt_id
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        IF v_cash_attempt.amount_minor IS DISTINCT FROM c.total_minor
           OR v_cash_attempt.currency_code IS DISTINCT FROM c.currency_code
           OR v_cash_attempt.provider_status NOT IN ('PENDING', 'SUCCEEDED') THEN
            RAISE EXCEPTION 'Counter redemption cash payment conflicts with persisted financial state'
                USING ERRCODE = '23505';
        END IF;

        IF v_cash_attempt.provider_status = 'SUCCEEDED'
           AND c.status = 'COMPLETED' THEN
            RETURN true;
        END IF;

        IF v_cash_attempt.provider_status = 'PENDING'
           AND c.status = 'PROVIDER_IN_PROGRESS' THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION 'Counter redemption cash payment conflicts with transaction state'
            USING ERRCODE = '23505';
    END IF;

    -- Cash is never a fallback for an uncertain terminal payment.
    IF EXISTS (
        SELECT 1
          FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id = c.commerce_transaction_id
           AND a.payment_channel = 'REMOTE_TERMINAL'
           AND a.provider_status IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
    ) THEN
        RAISE EXCEPTION 'Counter redemption already has an unresolved terminal payment'
            USING ERRCODE = '23505';
    END IF;

    IF c.status IS DISTINCT FROM 'ORDER_CREATED'
       OR c.total_minor IS NULL
       OR c.total_minor <= 0
       OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$'
       OR NULLIF(btrim(c.provider_order_id), '') IS NULL THEN
        RAISE EXCEPTION 'Counter redemption is not ready for cash payment'
            USING ERRCODE = '23505';
    END IF;

    IF NOT commerce_counter_redemption_pricing_is_acknowledged(
        c.commerce_transaction_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter redemption price reconciliation is incomplete'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        created_by,
        payment_channel,
        provider_reference_id
    ) VALUES (
        generate_runtime_id('CPA'),
        c.commerce_transaction_id,
        'PENDING',
        c.total_minor,
        c.currency_code,
        v_actor,
        'CASH',
        'cash:' || c.commerce_transaction_id
    );

    -- Reuse the established in-progress state so all existing terminal and
    -- recovery paths safely reject a concurrent second payment method.
    UPDATE commerce_transactions
       SET status = 'PROVIDER_IN_PROGRESS',
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_confirm_counter_redemption_cash_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_cash_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_reference varchar(160);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Counter redemption cash confirmation'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    SELECT *
      INTO v_cash_attempt
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND payment_channel = 'CASH'
     ORDER BY created_at, commerce_provider_payment_attempt_id
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption cash payment has not been started'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.amount_minor IS DISTINCT FROM c.total_minor
       OR v_cash_attempt.currency_code IS DISTINCT FROM c.currency_code THEN
        RAISE EXCEPTION 'Counter redemption cash payment conflicts with persisted financial state'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.provider_status = 'SUCCEEDED' THEN
        IF c.status = 'COMPLETED' THEN
            RETURN true;
        END IF;
        IF c.status = 'PROVIDER_SUCCEEDED' THEN
            RETURN commerce_finalize_counter_redemption_transaction(
                c.commerce_transaction_id,
                p_actor_user_id
            );
        END IF;
        RAISE EXCEPTION 'Counter redemption cash payment conflicts with transaction state'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.provider_status IS DISTINCT FROM 'PENDING'
       OR c.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
        RAISE EXCEPTION 'Counter redemption is not awaiting cash confirmation'
            USING ERRCODE = '23505';
    END IF;

    v_reference := 'cash-' || c.commerce_transaction_id;

    UPDATE commerce_provider_payment_attempts
       SET provider_status = 'SUCCEEDED',
           provider_transaction_id = v_reference,
           callback_received_at = CURRENT_TIMESTAMP
     WHERE commerce_provider_payment_attempt_id =
           v_cash_attempt.commerce_provider_payment_attempt_id;

    UPDATE commerce_transactions
       SET status = 'PROVIDER_SUCCEEDED',
           provider_transaction_id = v_reference,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN commerce_finalize_counter_redemption_transaction(
        c.commerce_transaction_id,
        p_actor_user_id
    );
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_cash_payment_state(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "cashPaymentStatus" varchar,
    "paymentMethod" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        COALESCE(a.provider_status, 'NOT_STARTED')::varchar,
        CASE WHEN a.provider_status = 'SUCCEEDED' THEN 'CASH'::varchar END
      FROM (SELECT 1) seed
      LEFT JOIN LATERAL (
          SELECT provider_status
            FROM commerce_provider_payment_attempts
           WHERE commerce_transaction_id = p_transaction_id
             AND payment_channel = 'CASH'
           ORDER BY created_at DESC, commerce_provider_payment_attempt_id DESC
           LIMIT 1
      ) a ON true;
END;
$function$;


REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_begin_counter_redemption_cash_payment(varchar, varchar, varchar),
    "${schemaName}".commerce_confirm_counter_redemption_cash_payment(varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_cash_payment_state(varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_begin_counter_redemption_cash_payment(varchar, varchar, varchar),
    "${schemaName}".commerce_confirm_counter_redemption_cash_payment(varchar, varchar, varchar),
    "${schemaName}".commerce_get_counter_redemption_cash_payment_state(varchar, varchar)
TO "${appRole}";

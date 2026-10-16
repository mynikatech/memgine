-- Successful Payment Bridge callbacks can be replayed after Counter fulfillment.
-- The existing callback correlation and capture validation remain unchanged.
-- A matching callback against a COMPLETED Commerce transaction returns before any update.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_remote_payment_callback(
    p_reference_id varchar,
    p_callback_status varchar,
    p_provider_transaction_id varchar,
    p_transaction_status varchar,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_provider_business_id varchar,
    p_provider_store_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
    t commerce_transactions%ROWTYPE;
    s varchar(32);
BEGIN
    /*
     * Required callback correlation fields.
     */
    IF NULLIF(btrim(p_reference_id), '') IS NULL
       OR NULLIF(btrim(p_callback_status), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid remote payment callback'
            USING ERRCODE = '22023';
    END IF;

    IF length(p_reference_id) > 160
       OR length(p_callback_status) > 32
    THEN
        RAISE EXCEPTION 'Invalid remote payment callback'
            USING ERRCODE = '22023';
    END IF;

    s := upper(btrim(p_callback_status));

    SELECT *
    INTO a
    FROM commerce_provider_payment_attempts
    WHERE provider_reference_id = p_reference_id
      AND payment_channel = 'REMOTE_TERMINAL'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Remote payment reference not found'
            USING ERRCODE = 'P0002';
    END IF;

    SELECT *
    INTO t
    FROM commerce_transactions
    WHERE commerce_transaction_id = a.commerce_transaction_id
      AND NOT is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;


    -- ========================================================
    -- RECEIVED
    -- ========================================================

    IF s = 'RECEIVED' THEN

        /*
         * Never regress a terminal attempt because of a late or
         * retried progress callback.
         */
        IF a.provider_status = 'SUCCEEDED' THEN
        IF t.status = 'PROVIDER_SUCCEEDED'
        AND t.provider_transaction_id IS NOT DISTINCT FROM a.provider_transaction_id
        THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION
            'Remote payment attempt conflicts with transaction state'
            USING ERRCODE = '23505';
        END IF;

        IF a.provider_status IN ('FAILED', 'CANCELLED') THEN
            IF t.status = 'ORDER_CREATED' THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION
                'Remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        IF a.provider_status = 'STARTED' THEN
            /*
             * Out-of-order RECEIVED after STARTED is an
             * idempotent no-op. Do not regress STARTED.
             */
            UPDATE commerce_provider_payment_attempts
            SET callback_received_at = CURRENT_TIMESTAMP
            WHERE commerce_provider_payment_attempt_id =
                  a.commerce_provider_payment_attempt_id;

            RETURN true;
        END IF;

        IF a.provider_status NOT IN (
            'DISPATCHING',
            'DISPATCHED',
            'RECEIVED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_provider_payment_attempts
        SET
            provider_status = 'RECEIVED',
            callback_received_at = CURRENT_TIMESTAMP
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        RETURN true;
    END IF;


    -- ========================================================
    -- STARTED
    -- ========================================================

    IF s = 'STARTED' THEN

        /*
         * Late progress callback after a terminal outcome is
         * an idempotent no-op and must never reactivate attempt.
         */
        IF a.provider_status = 'SUCCEEDED' THEN
            IF t.status = 'PROVIDER_SUCCEEDED'
            AND t.provider_transaction_id IS NOT DISTINCT FROM a.provider_transaction_id
            THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION
                'Remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        IF a.provider_status IN ('FAILED', 'CANCELLED') THEN
            IF t.status = 'ORDER_CREATED' THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION
                'Remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        IF a.provider_status NOT IN (
            'DISPATCHING',
            'DISPATCHED',
            'RECEIVED',
            'STARTED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_provider_payment_attempts
        SET
            provider_status = 'STARTED',
            callback_received_at = CURRENT_TIMESTAMP
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        RETURN true;
    END IF;


    -- ========================================================
    -- CANCELED
    -- ========================================================

    IF s = 'CANCELED' THEN

        /*
         * Exact replay.
         */
        IF a.provider_status = 'CANCELLED' THEN
            IF t.status = 'ORDER_CREATED' THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION
                'Cancelled remote payment conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        /*
         * A different terminal outcome must not overwrite an
         * already-finalized attempt.
         */
        IF a.provider_status IN (
            'SUCCEEDED',
            'FAILED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with terminal attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF a.provider_status NOT IN (
            'DISPATCHING',
            'DISPATCHED',
            'RECEIVED',
            'STARTED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_provider_payment_attempts
        SET
            provider_status = 'CANCELLED',
            callback_received_at = CURRENT_TIMESTAMP
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        UPDATE commerce_transactions
        SET
            status = 'ORDER_CREATED',
            failure_code = NULL,
            failure_message = NULL,
            updated_at = CURRENT_TIMESTAMP,
            version_no = version_no + 1
        WHERE commerce_transaction_id =
              t.commerce_transaction_id;

        RETURN true;
    END IF;


    -- ========================================================
    -- FAILED
    -- ========================================================

    IF s = 'FAILED' THEN

        /*
         * Exact replay.
         */
        IF a.provider_status = 'FAILED' THEN
            IF t.status = 'ORDER_CREATED' THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION
                'Failed remote payment conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        /*
         * Never overwrite another terminal outcome.
         */
        IF a.provider_status IN (
            'SUCCEEDED',
            'CANCELLED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with terminal attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF a.provider_status NOT IN (
            'DISPATCHING',
            'DISPATCHED',
            'RECEIVED',
            'STARTED'
        ) THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with attempt state'
                USING ERRCODE = '23505';
        END IF;

        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION
                'Remote payment callback conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        UPDATE commerce_provider_payment_attempts
        SET
            provider_status = 'FAILED',
            callback_received_at = CURRENT_TIMESTAMP
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        UPDATE commerce_transactions
        SET
            status = 'ORDER_CREATED',
            failure_code = 'REMOTE_PAYMENT_FAILED',
            failure_message = NULL,
            updated_at = CURRENT_TIMESTAMP,
            version_no = version_no + 1
        WHERE commerce_transaction_id =
              t.commerce_transaction_id;

        RETURN true;
    END IF;


    -- ========================================================
    -- PROCESSED / successful captured transaction
    -- ========================================================

    IF s IS DISTINCT FROM 'PROCESSED' THEN
        RAISE EXCEPTION 'Invalid remote payment callback'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Required fields for successful payment completion.
     *
     * All checks are explicitly NULL-safe.
     */
    IF NULLIF(btrim(p_provider_transaction_id), '') IS NULL
       OR length(p_provider_transaction_id) > 160
       OR NULLIF(btrim(p_transaction_status), '') IS NULL
       OR upper(NULLIF(btrim(p_transaction_status), ''))
            IS DISTINCT FROM 'CAPTURED'
       OR p_amount_minor IS NULL
       OR p_amount_minor IS DISTINCT FROM t.total_minor
       OR NULLIF(btrim(p_currency_code), '') IS NULL
       OR upper(NULLIF(btrim(p_currency_code), ''))
            IS DISTINCT FROM t.currency_code
    THEN
        RAISE EXCEPTION 'Invalid remote payment callback'
            USING ERRCODE = '22023';
    END IF;

    /*
     * Context fields are optional in callback, but if Poynt
     * supplies them they must exactly match the persisted target.
     */
    IF p_provider_business_id IS NOT NULL THEN
        IF NULLIF(btrim(p_provider_business_id), '') IS NULL
           OR btrim(p_provider_business_id)
                IS DISTINCT FROM a.provider_business_id
        THEN
            RAISE EXCEPTION 'Invalid remote payment callback'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_provider_store_id IS NOT NULL THEN
        IF NULLIF(btrim(p_provider_store_id), '') IS NULL
           OR btrim(p_provider_store_id)
                IS DISTINCT FROM a.provider_store_id
        THEN
            RAISE EXCEPTION 'Invalid remote payment callback'
                USING ERRCODE = '22023';
        END IF;
    END IF;

    /*
     * Exact successful callback replay is idempotent.
     */
    IF a.provider_status = 'SUCCEEDED' THEN
        IF a.provider_transaction_id IS NOT DISTINCT FROM
               p_provider_transaction_id
           AND t.status IN ('PROVIDER_SUCCEEDED', 'COMPLETED')
           AND t.provider_transaction_id IS NOT DISTINCT FROM
               p_provider_transaction_id
        THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION
            'Remote payment callback conflicts with successful payment'
            USING ERRCODE = '23505';
    END IF;

    /*
     * A successful callback must never silently overwrite a
     * previously finalized failed/cancelled attempt.
     */
    IF a.provider_status IN (
        'FAILED',
        'CANCELLED'
    ) THEN
        RAISE EXCEPTION
            'Remote payment callback conflicts with terminal attempt state'
            USING ERRCODE = '23505';
    END IF;

    IF a.provider_status NOT IN (
        'DISPATCHING',
        'DISPATCHED',
        'RECEIVED',
        'STARTED'
    ) THEN
        RAISE EXCEPTION
            'Remote payment callback conflicts with attempt state'
            USING ERRCODE = '23505';
    END IF;

    IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
        RAISE EXCEPTION
            'Remote payment callback conflicts with transaction state'
            USING ERRCODE = '23505';
    END IF;

    UPDATE commerce_provider_payment_attempts
    SET
        provider_status = 'SUCCEEDED',
        provider_transaction_id = p_provider_transaction_id,
        callback_received_at = CURRENT_TIMESTAMP
    WHERE commerce_provider_payment_attempt_id =
          a.commerce_provider_payment_attempt_id;

    UPDATE commerce_transactions
    SET
        status = 'PROVIDER_SUCCEEDED',
        provider_transaction_id = p_provider_transaction_id,
        failure_code = NULL,
        failure_message = NULL,
        updated_at = CURRENT_TIMESTAMP,
        version_no = version_no + 1
    WHERE commerce_transaction_id =
          t.commerce_transaction_id;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_record_remote_payment_callback(
        varchar,
        varchar,
        varchar,
        varchar,
        bigint,
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_record_remote_payment_callback(
        varchar,
        varchar,
        varchar,
        varchar,
        bigint,
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";

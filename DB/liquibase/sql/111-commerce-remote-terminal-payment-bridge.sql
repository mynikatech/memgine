-- Provider-neutral remote terminal payment correlation.
-- No cardholder data is stored.

ALTER TABLE "${schemaName}".commerce_provider_payment_attempts
    ADD COLUMN IF NOT EXISTS payment_channel varchar(32) NOT NULL DEFAULT 'TERMINAL_LOCAL',
    ADD COLUMN IF NOT EXISTS provider_reference_id varchar(160),
    ADD COLUMN IF NOT EXISTS target_pos_device_id varchar(64),
    ADD COLUMN IF NOT EXISTS provider_business_id varchar(128),
    ADD COLUMN IF NOT EXISTS provider_store_id varchar(128),
    ADD COLUMN IF NOT EXISTS provider_device_id varchar(128),
    ADD COLUMN IF NOT EXISTS dispatched_at timestamptz,
    ADD COLUMN IF NOT EXISTS callback_received_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_provider_payment_attempt_reference
    ON "${schemaName}".commerce_provider_payment_attempts(provider_reference_id)
    WHERE provider_reference_id IS NOT NULL;


-- ============================================================
-- Begin remote terminal payment
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_remote_terminal_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_pos_device_id varchar,
    p_reference_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "alreadyDispatched" boolean,
    "integrationConfigurationId" varchar,
    "providerOrderId" varchar,
    "amountMinor" bigint,
    "currencyCode" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "providerDeviceId" varchar,
    "providerReferenceId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    a commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_pos_device_id), '') IS NULL
       OR NULLIF(btrim(p_reference_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid remote payment request'
            USING ERRCODE = '22023';
    END IF;

    IF length(p_reference_id) > 160 THEN
        RAISE EXCEPTION 'Remote payment reference is too long'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
    INTO t
    FROM commerce_transactions
    WHERE commerce_transaction_id = p_transaction_id
      AND NOT is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.organization_id IS DISTINCT FROM p_organization_id THEN
        RAISE EXCEPTION 'Commerce transaction does not belong to organization'
            USING ERRCODE = '22023';
    END IF;

    v_actor :=
        commerce_actor_organization_user(
            t.organization_id,
            p_actor_user_id
        );

    /*
     * An existing active remote attempt suppresses duplicate dispatch.
     *
     * The Commerce transaction must still be PROVIDER_IN_PROGRESS.
     * Otherwise the persisted attempt and transaction are inconsistent
     * and should not silently block a legitimate future retry.
     */
    SELECT *
    INTO a
    FROM commerce_provider_payment_attempts
    WHERE commerce_transaction_id = t.commerce_transaction_id
      AND payment_channel = 'REMOTE_TERMINAL'
      AND provider_status IN (
          'DISPATCHING',
          'DISPATCHED',
          'RECEIVED',
          'STARTED'
      )
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION
                'Active remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
            true,
            t.integration_configuration_id,
            t.provider_order_id,
            t.total_minor,
            t.currency_code,
            a.provider_business_id,
            a.provider_store_id,
            a.provider_device_id,
            a.provider_reference_id;

        RETURN;
    END IF;

    /*
     * Explicit NULL-safe readiness validation.
     */
    IF t.status IS DISTINCT FROM 'ORDER_CREATED'
       OR NULLIF(btrim(t.provider_order_id), '') IS NULL
       OR t.total_minor IS NULL
       OR t.total_minor <= 0
       OR t.currency_code IS NULL
       OR t.currency_code !~ '^[A-Z]{3}$'
       OR NULLIF(btrim(t.integration_configuration_id), '') IS NULL
    THEN
        RAISE EXCEPTION
            'Commerce transaction is not ready for remote payment'
            USING ERRCODE = '23505';
    END IF;

    /*
     * Resolve the actual registered terminal server-side.
     *
     * Never trust the browser for provider business/store/device IDs.
     */
    SELECT
        b.poynt_business_id,
        b.poynt_store_id,
        b.poynt_terminal_id
    INTO
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
    FROM poynt_terminal_bindings b
    JOIN pos_devices d
      ON d.pos_device_id = b.pos_device_id
    WHERE b.pos_device_id = p_pos_device_id
      AND b.organization_id = t.organization_id
      AND b.store_id IS NOT DISTINCT FROM t.store_id
      AND NOT b.is_deleted
      AND NOT d.is_deleted
      AND d.revoked_at IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Registered Poynt terminal is unavailable'
            USING ERRCODE = '22023';
    END IF;

    /*
     * businessId and deviceId are mandatory for the targeted
     * Payment Bridge request.
     *
     * storeId is intentionally allowed to remain NULL because
     * Payment Bridge can operate without it.
     */
    IF NULLIF(btrim(a.provider_business_id), '') IS NULL
       OR NULLIF(btrim(a.provider_device_id), '') IS NULL
    THEN
        RAISE EXCEPTION
            'Registered Poynt terminal configuration is incomplete'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        created_by,
        payment_channel,
        provider_reference_id,
        target_pos_device_id,
        provider_business_id,
        provider_store_id,
        provider_device_id
    )
    VALUES(
        generate_runtime_id('CPA'),
        t.commerce_transaction_id,
        'DISPATCHING',
        t.total_minor,
        t.currency_code,
        v_actor,
        'REMOTE_TERMINAL',
        p_reference_id,
        p_pos_device_id,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
    );

    UPDATE commerce_transactions
    SET
        status = 'PROVIDER_IN_PROGRESS',
        failure_code = NULL,
        failure_message = NULL,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_actor,
        version_no = version_no + 1
    WHERE commerce_transaction_id = t.commerce_transaction_id;

    RETURN QUERY
    SELECT
        false,
        t.integration_configuration_id,
        t.provider_order_id,
        t.total_minor,
        t.currency_code,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id,
        p_reference_id;
END;
$function$;


-- ============================================================
-- Mark Payment Bridge dispatch accepted
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_mark_remote_payment_dispatched(
    p_reference_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_reference_id), '') IS NULL THEN
        RAISE EXCEPTION 'Remote payment reference is required'
            USING ERRCODE = '22023';
    END IF;

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

    /*
     * Normal dispatch acknowledgement.
     */
    IF a.provider_status = 'DISPATCHING' THEN
        UPDATE commerce_provider_payment_attempts
        SET
            provider_status = 'DISPATCHED',
            dispatched_at = COALESCE(
                dispatched_at,
                CURRENT_TIMESTAMP
            )
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        RETURN true;
    END IF;

    /*
     * Callback may arrive before the outbound HTTP request has
     * returned to Memgine.
     *
     * Do not regress RECEIVED / STARTED / terminal states back
     * to DISPATCHED. The existence of such a callback proves the
     * remote dispatch reached Poynt/the terminal path.
     */
    IF a.provider_status IN (
        'DISPATCHED',
        'RECEIVED',
        'STARTED',
        'SUCCEEDED',
        'FAILED',
        'CANCELLED'
    ) THEN
        UPDATE commerce_provider_payment_attempts
        SET dispatched_at =
            COALESCE(
                dispatched_at,
                CURRENT_TIMESTAMP
            )
        WHERE commerce_provider_payment_attempt_id =
              a.commerce_provider_payment_attempt_id;

        RETURN true;
    END IF;

    RAISE EXCEPTION
        'Remote payment dispatch conflicts with attempt state'
        USING ERRCODE = '23505';
END;
$function$;


-- ============================================================
-- Record Payment Bridge callback
-- ============================================================

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
           AND t.status = 'PROVIDER_SUCCEEDED'
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


-- ============================================================
-- Permissions
-- ============================================================

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_begin_remote_terminal_payment(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".commerce_mark_remote_payment_dispatched(
        varchar
    ),
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
    "${schemaName}".commerce_begin_remote_terminal_payment(
        varchar,
        varchar,
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".commerce_mark_remote_payment_dispatched(
        varchar
    ),
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
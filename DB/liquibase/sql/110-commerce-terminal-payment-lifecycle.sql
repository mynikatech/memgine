-- Provider-neutral terminal payment attempts. No cardholder data is stored.
CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_provider_payment_attempts (
    commerce_provider_payment_attempt_id varchar(64) PRIMARY KEY,
    commerce_transaction_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    provider_transaction_id varchar(160),
    provider_status varchar(32) NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    currency_code varchar(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
    failure_code varchar(80),
    failure_message varchar(500),
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id)
);

CREATE INDEX IF NOT EXISTS ix_commerce_provider_payment_attempts_transaction
    ON "${schemaName}".commerce_provider_payment_attempts(
        commerce_transaction_id,
        created_at DESC
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_provider_payment_attempt_provider_txn
    ON "${schemaName}".commerce_provider_payment_attempts(
        commerce_transaction_id,
        provider_transaction_id
    )
    WHERE provider_transaction_id IS NOT NULL;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_start_terminal_payment(
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
    t commerce_transactions%ROWTYPE;
    v_actor varchar(64);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid terminal payment start request'
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

    IF t.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Commerce transaction does not belong to organization'
            USING ERRCODE = '22023';
    END IF;

    v_actor := commerce_actor_organization_user(
        t.organization_id,
        p_actor_user_id
    );

    IF t.status <> 'ORDER_CREATED' THEN
        RAISE EXCEPTION 'Commerce transaction is not ready for terminal payment'
            USING ERRCODE = '23505';
    END IF;

    IF NULLIF(btrim(t.provider_order_id), '') IS NULL
       OR t.total_minor IS NULL
       OR t.total_minor <= 0
       OR t.currency_code IS NULL
       OR t.currency_code !~ '^[A-Z]{3}$'
    THEN
        RAISE EXCEPTION 'Commerce provider order is incomplete'
            USING ERRCODE = '22023';
    END IF;

    UPDATE commerce_transactions
       SET status = 'PROVIDER_IN_PROGRESS',
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = t.commerce_transaction_id;

    RETURN true;
END;
$function$;


CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_terminal_payment_result(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_provider_transaction_id varchar,
    p_provider_status varchar,
    p_amount_minor bigint,
    p_currency_code varchar,
    p_failure_code varchar,
    p_failure_message varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_status varchar(32);
    v_provider_transaction_id varchar(160);
    prior commerce_provider_payment_attempts%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid terminal payment result'
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

    IF t.organization_id <> p_organization_id THEN
        RAISE EXCEPTION 'Commerce transaction does not belong to organization'
            USING ERRCODE = '22023';
    END IF;

    v_actor := commerce_actor_organization_user(
        t.organization_id,
        p_actor_user_id
    );

    v_status := upper(btrim(p_provider_status));

    v_provider_transaction_id :=
        NULLIF(btrim(p_provider_transaction_id), '');

    IF p_provider_status IS NULL
       OR v_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELLED')
       OR p_amount_minor IS NULL
       OR t.total_minor IS NULL
       OR p_amount_minor <> t.total_minor
       OR p_currency_code IS NULL
       OR t.currency_code IS NULL
       OR p_currency_code !~ '^[A-Z]{3}$'
       OR p_currency_code <> t.currency_code
       OR length(COALESCE(p_failure_code, '')) > 80
       OR length(COALESCE(p_failure_message, '')) > 500
       OR (
            v_status = 'SUCCEEDED'
            AND v_provider_transaction_id IS NULL
       )
       OR (
            v_provider_transaction_id IS NOT NULL
            AND length(v_provider_transaction_id) > 160
       )
    THEN
        RAISE EXCEPTION 'Invalid terminal payment result'
            USING ERRCODE = '22023';
    END IF;

    IF v_provider_transaction_id IS NOT NULL THEN
        SELECT *
          INTO prior
          FROM commerce_provider_payment_attempts
         WHERE commerce_transaction_id = t.commerce_transaction_id
           AND provider_transaction_id = v_provider_transaction_id;

        IF FOUND THEN
            IF prior.provider_status <> v_status
               OR prior.amount_minor <> p_amount_minor
               OR prior.currency_code <> p_currency_code
            THEN
                RAISE EXCEPTION 'Conflicting terminal payment result'
                    USING ERRCODE = '23505';
            END IF;

            IF t.status = 'PROVIDER_SUCCEEDED'
               AND v_status = 'SUCCEEDED'
               AND t.provider_transaction_id = v_provider_transaction_id
            THEN
                RETURN true;
            END IF;

            RAISE EXCEPTION 'Terminal payment result was already recorded'
                USING ERRCODE = '23505';
        END IF;
    END IF;

    IF t.status <> 'PROVIDER_IN_PROGRESS' THEN
        RAISE EXCEPTION 'Commerce transaction is not awaiting terminal payment result'
            USING ERRCODE = '23505';
    END IF;

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        failure_code,
        failure_message,
        created_by
    )
    VALUES(
        generate_runtime_id('CPA'),
        t.commerce_transaction_id,
        v_provider_transaction_id,
        v_status,
        p_amount_minor,
        p_currency_code,
        NULLIF(btrim(p_failure_code), ''),
        NULLIF(btrim(p_failure_message), ''),
        v_actor
    );

    IF v_status = 'SUCCEEDED' THEN
        UPDATE commerce_transactions
           SET status = 'PROVIDER_SUCCEEDED',
               provider_transaction_id = v_provider_transaction_id,
               failure_code = NULL,
               failure_message = NULL,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor,
               version_no = version_no + 1
         WHERE commerce_transaction_id = t.commerce_transaction_id;
    ELSE
        UPDATE commerce_transactions
           SET status = 'ORDER_CREATED',
               provider_transaction_id = NULL,
               failure_code = COALESCE(
                   NULLIF(btrim(p_failure_code), ''),
                   v_status
               ),
               failure_message = NULLIF(
                   btrim(p_failure_message),
                   ''
               ),
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor,
               version_no = version_no + 1
         WHERE commerce_transaction_id = t.commerce_transaction_id;
    END IF;

    RETURN true;
END;
$function$;


REVOKE ALL ON TABLE "${schemaName}".commerce_provider_payment_attempts
FROM PUBLIC;


REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_start_terminal_payment(
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_record_terminal_payment_result(
        varchar,
        varchar,
        varchar,
        varchar,
        bigint,
        varchar,
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_start_terminal_payment(
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_record_terminal_payment_result(
        varchar,
        varchar,
        varchar,
        varchar,
        bigint,
        varchar,
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";
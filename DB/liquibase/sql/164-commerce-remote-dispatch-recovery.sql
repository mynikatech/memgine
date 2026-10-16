-- Read-only recovery state for a persisted Payment Bridge dispatch.
-- A caller may inspect only an attempt belonging to an authorized Commerce transaction.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_active_remote_terminal_payment_attempt(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "providerReferenceId" varchar,
    "providerStatus" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_reference_id varchar(160);
    v_provider_status varchar(32);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
    THEN
        RAISE EXCEPTION 'Invalid remote payment attempt lookup'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.source_channel IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        PERFORM commerce_counter_checkout_actor_organization_user(
            t.commerce_transaction_id,
            p_actor_user_id
        );
    ELSE
        PERFORM commerce_actor_organization_user(
            t.organization_id,
            p_actor_user_id
        );
    END IF;

    SELECT a.provider_reference_id, a.provider_status
      INTO v_reference_id, v_provider_status
      FROM commerce_provider_payment_attempts a
     WHERE a.commerce_transaction_id = t.commerce_transaction_id
       AND a.payment_channel = 'REMOTE_TERMINAL'
       AND a.provider_status IN ('DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
     ORDER BY a.created_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF NULLIF(btrim(v_reference_id), '') IS NULL
       OR t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
        RAISE EXCEPTION 'Active remote payment attempt conflicts with transaction state'
            USING ERRCODE = '23505';
    END IF;

    RETURN QUERY SELECT v_reference_id, v_provider_status;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_remote_terminal_payment_attempt_state(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_reference_id varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_provider_status varchar(32);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_reference_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR length(p_reference_id) > 160
    THEN
        RAISE EXCEPTION 'Invalid remote payment attempt lookup'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF t.source_channel IN ('COUNTER', 'COUNTER_REDEMPTION') THEN
        PERFORM commerce_counter_checkout_actor_organization_user(
            t.commerce_transaction_id,
            p_actor_user_id
        );
    ELSE
        PERFORM commerce_actor_organization_user(
            t.organization_id,
            p_actor_user_id
        );
    END IF;

    SELECT a.provider_status
      INTO v_provider_status
      FROM commerce_provider_payment_attempts a
     WHERE a.commerce_transaction_id = t.commerce_transaction_id
       AND a.provider_reference_id = p_reference_id
       AND a.payment_channel = 'REMOTE_TERMINAL';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Remote payment attempt not found'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN v_provider_status;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_get_active_remote_terminal_payment_attempt(
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".commerce_get_remote_terminal_payment_attempt_state(
        varchar,
        varchar,
        varchar,
        varchar
    )
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".commerce_get_active_remote_terminal_payment_attempt(
        varchar,
        varchar,
        varchar
    ),
    "${schemaName}".commerce_get_remote_terminal_payment_attempt_state(
        varchar,
        varchar,
        varchar,
        varchar
    )
TO "${appRole}";

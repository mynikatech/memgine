-- Persist a provider-neutral order result and the authoritative external line prices atomically.
-- This function intentionally records ORDER_CREATED only; it has no payment semantics.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_persist_provider_order(
    p_transaction_id varchar,
    p_provider_order_id varchar,
    p_line_prices jsonb,
    p_subtotal_minor bigint,
    p_adjustment_total_minor bigint,
    p_tax_total_minor bigint,
    p_total_minor bigint,
    p_currency_code varchar,
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
    v_expected_count integer;
    v_received_count integer;
    v_duplicate_count integer;
    v_invalid_count integer;
BEGIN
    SELECT * INTO t
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_actor_organization_user(t.organization_id, p_actor_user_id);

    IF t.status = 'ORDER_CREATED' AND t.provider_order_id = p_provider_order_id THEN
        RETURN true;
    END IF;
    IF t.status <> 'READY_FOR_PROVIDER' THEN
        RAISE EXCEPTION 'Commerce transaction is not ready for provider order' USING ERRCODE = '23505';
    END IF;
    IF NULLIF(btrim(p_provider_order_id), '') IS NULL
       OR p_line_prices IS NULL
       OR jsonb_typeof(p_line_prices) <> 'array'
       OR p_subtotal_minor IS NULL OR p_adjustment_total_minor IS NULL
       OR p_tax_total_minor IS NULL OR p_total_minor IS NULL
       OR p_subtotal_minor < 0 OR p_adjustment_total_minor < 0
       OR p_tax_total_minor < 0 OR p_total_minor < 0
       OR p_currency_code IS NULL
       OR p_currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Invalid provider order result' USING ERRCODE = '22023';
    END IF;
    IF p_adjustment_total_minor <> 0 THEN
        RAISE EXCEPTION 'Commerce adjustments are not supported for provider order persistence' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_expected_count
      FROM commerce_transaction_lines
     WHERE commerce_transaction_id = t.commerce_transaction_id
       AND NOT is_deleted
       AND line_type = 'EXTERNAL_PRODUCT';
    IF v_expected_count = 0 OR EXISTS (
        SELECT 1
          FROM commerce_transaction_lines
         WHERE commerce_transaction_id = t.commerce_transaction_id
           AND NOT is_deleted
           AND line_type <> 'EXTERNAL_PRODUCT'
    ) THEN
        RAISE EXCEPTION 'Only external product lines may be persisted as a provider order' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM commerce_transaction_adjustments
         WHERE commerce_transaction_id = t.commerce_transaction_id
           AND NOT is_deleted
    ) THEN
        RAISE EXCEPTION 'Commerce adjustments are not supported for provider order persistence' USING ERRCODE = '22023';
    END IF;

    WITH supplied AS (
        SELECT line_id, unit_price_minor, line_subtotal_minor, currency_code
          FROM jsonb_to_recordset(p_line_prices) AS x(
              line_id varchar,
              unit_price_minor bigint,
              line_subtotal_minor bigint,
              currency_code varchar
          )
    )
    SELECT count(*), count(*) - count(DISTINCT line_id), count(*) FILTER (
        WHERE NULLIF(btrim(line_id), '') IS NULL
           OR unit_price_minor IS NULL OR unit_price_minor < 0
           OR line_subtotal_minor IS NULL OR line_subtotal_minor < 0
           OR currency_code IS NULL OR currency_code <> p_currency_code
    )
      INTO v_received_count, v_duplicate_count, v_invalid_count
      FROM supplied;
    IF v_received_count <> v_expected_count OR v_duplicate_count <> 0 OR v_invalid_count <> 0 THEN
        RAISE EXCEPTION 'Provider line prices do not match commerce transaction lines' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_line_id, quantity
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = t.commerce_transaction_id
               AND NOT is_deleted
               AND line_type = 'EXTERNAL_PRODUCT'
        ), supplied AS (
            SELECT line_id, unit_price_minor, line_subtotal_minor
              FROM jsonb_to_recordset(p_line_prices) AS x(
                  line_id varchar,
                  unit_price_minor bigint,
                  line_subtotal_minor bigint,
                  currency_code varchar
              )
        )
        SELECT 1
          FROM actual a
          FULL JOIN supplied s ON s.line_id = a.commerce_transaction_line_id
         WHERE a.commerce_transaction_line_id IS NULL
            OR s.line_id IS NULL
            OR s.line_subtotal_minor <> s.unit_price_minor * a.quantity
    ) THEN
        RAISE EXCEPTION 'Provider line prices do not match commerce transaction lines' USING ERRCODE = '22023';
    END IF;
    IF p_subtotal_minor <> (
        SELECT COALESCE(sum(line_subtotal_minor), 0)
          FROM jsonb_to_recordset(p_line_prices) AS x(
              line_id varchar,
              unit_price_minor bigint,
              line_subtotal_minor bigint,
              currency_code varchar
          )
    ) THEN
        RAISE EXCEPTION 'Provider subtotal does not match commerce transaction lines'
            USING ERRCODE = '22023';
    END IF;

    IF p_total_minor <> p_subtotal_minor + p_tax_total_minor THEN
        RAISE EXCEPTION 'Provider total does not match subtotal and tax'
            USING ERRCODE = '22023';
    END IF;

    UPDATE commerce_transaction_lines l
       SET unit_price_minor_authoritative = s.unit_price_minor,
           line_subtotal_minor = s.line_subtotal_minor,
           currency_code = p_currency_code,
           price_source = 'PROVIDER_FINAL',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = l.version_no + 1
      FROM jsonb_to_recordset(p_line_prices) AS s(
          line_id varchar,
          unit_price_minor bigint,
          line_subtotal_minor bigint,
          currency_code varchar
      )
     WHERE l.commerce_transaction_line_id = s.line_id
       AND l.commerce_transaction_id = t.commerce_transaction_id
       AND NOT l.is_deleted;

    PERFORM commerce_record_order_created(
        p_transaction_id,
        p_provider_order_id,
        p_subtotal_minor,
        p_adjustment_total_minor,
        p_tax_total_minor,
        p_total_minor,
        p_currency_code,
        p_actor_user_id
    );
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_persist_provider_order(varchar,varchar,jsonb,bigint,bigint,bigint,bigint,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_persist_provider_order(varchar,varchar,jsonb,bigint,bigint,bigint,bigint,varchar,varchar) TO "${appRole}";

-- Provider-neutral persistence for external products, Memgine memberships, and materialized adjustments.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_persist_materialized_provider_order(
    p_transaction_id varchar,
    p_provider_order_id varchar,
    p_line_prices jsonb,
    p_adjustments jsonb,
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
    v_lines integer;
    v_adjustments integer;
BEGIN
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

    v_actor := commerce_actor_organization_user(
        t.organization_id,
        p_actor_user_id
    );

    IF t.status = 'ORDER_CREATED'
       AND t.provider_order_id = p_provider_order_id THEN
        RETURN true;
    END IF;

    IF t.status <> 'READY_FOR_PROVIDER' THEN
        RAISE EXCEPTION 'Commerce transaction is not ready for provider order'
            USING ERRCODE = '23505';
    END IF;

    IF NULLIF(btrim(p_provider_order_id), '') IS NULL
       OR p_line_prices IS NULL
       OR jsonb_typeof(p_line_prices) <> 'array'
       OR p_adjustments IS NULL
       OR jsonb_typeof(p_adjustments) <> 'array'
       OR p_subtotal_minor IS NULL
       OR p_adjustment_total_minor IS NULL
       OR p_tax_total_minor IS NULL
       OR p_total_minor IS NULL
       OR p_subtotal_minor < 0
       OR p_adjustment_total_minor < 0
       OR p_tax_total_minor < 0
       OR p_total_minor < 0
       OR p_currency_code IS NULL
       OR p_currency_code !~ '^[A-Z]{3}$'
       OR p_total_minor <> p_subtotal_minor - p_adjustment_total_minor + p_tax_total_minor
    THEN
        RAISE EXCEPTION 'Invalid materialized provider order result'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_lines
      FROM commerce_transaction_lines
     WHERE commerce_transaction_id = p_transaction_id
       AND NOT is_deleted
       AND line_type IN ('EXTERNAL_PRODUCT', 'MEMBERSHIP');

    IF v_lines = 0
       OR EXISTS (
            SELECT 1
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = p_transaction_id
               AND NOT is_deleted
               AND line_type NOT IN ('EXTERNAL_PRODUCT', 'MEMBERSHIP')
       )
    THEN
        RAISE EXCEPTION 'Unsupported commerce transaction line'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_adjustments
      FROM commerce_transaction_adjustments
     WHERE commerce_transaction_id = p_transaction_id
       AND NOT is_deleted;

    IF (SELECT count(*) FROM jsonb_array_elements(p_line_prices)) <> v_lines
       OR (SELECT count(*) FROM jsonb_array_elements(p_adjustments)) <> v_adjustments
    THEN
        RAISE EXCEPTION 'Materialized provider order identifiers do not match transaction'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH x AS (
            SELECT *
              FROM jsonb_to_recordset(p_line_prices) AS r(
                  line_id varchar,
                  unit_price_minor bigint,
                  line_subtotal_minor bigint,
                  currency_code varchar,
                  price_source varchar
              )
        )
        SELECT 1
          FROM x
         GROUP BY line_id
        HAVING count(*) > 1
    )
    OR EXISTS (
        WITH x AS (
            SELECT *
              FROM jsonb_to_recordset(p_adjustments) AS r(
                  adjustment_id varchar,
                  applied_amount_minor bigint,
                  status varchar
              )
        )
        SELECT 1
          FROM x
         GROUP BY adjustment_id
        HAVING count(*) > 1
    )
    THEN
        RAISE EXCEPTION 'Duplicate materialized provider order identifier'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT
                commerce_transaction_line_id,
                line_type,
                quantity
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = p_transaction_id
               AND NOT is_deleted
        ),
        x AS (
            SELECT *
              FROM jsonb_to_recordset(p_line_prices) AS r(
                  line_id varchar,
                  unit_price_minor bigint,
                  line_subtotal_minor bigint,
                  currency_code varchar,
                  price_source varchar
              )
        )
        SELECT 1
          FROM actual l
          FULL JOIN x
            ON x.line_id = l.commerce_transaction_line_id
         WHERE l.commerce_transaction_line_id IS NULL
            OR x.line_id IS NULL
            OR NULLIF(btrim(x.line_id), '') IS NULL
            OR x.unit_price_minor IS NULL
            OR x.unit_price_minor < 0
            OR x.line_subtotal_minor IS NULL
            OR x.line_subtotal_minor < 0
            OR x.line_subtotal_minor <> x.unit_price_minor * l.quantity
            OR x.currency_code IS NULL
            OR x.currency_code <> p_currency_code
            OR x.price_source IS NULL
            OR (
                l.line_type = 'EXTERNAL_PRODUCT'
                AND x.price_source <> 'PROVIDER_FINAL'
            )
            OR (
                l.line_type = 'MEMBERSHIP'
                AND x.price_source <> 'MEMGINE_MEMBERSHIP'
            )
    )
    THEN
        RAISE EXCEPTION 'Materialized line values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_adjustment_id
              FROM commerce_transaction_adjustments
             WHERE commerce_transaction_id = p_transaction_id
               AND NOT is_deleted
        ),
        x AS (
            SELECT *
              FROM jsonb_to_recordset(p_adjustments) AS r(
                  adjustment_id varchar,
                  applied_amount_minor bigint,
                  status varchar
              )
        )
        SELECT 1
          FROM actual a
          FULL JOIN x
            ON x.adjustment_id = a.commerce_transaction_adjustment_id
         WHERE a.commerce_transaction_adjustment_id IS NULL
            OR x.adjustment_id IS NULL
            OR NULLIF(btrim(x.adjustment_id), '') IS NULL
            OR x.applied_amount_minor IS NULL
            OR x.applied_amount_minor < 0
            OR x.status IS NULL
            OR x.status <> 'APPLIED'
    )
    THEN
        RAISE EXCEPTION 'Materialized adjustments are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(
            sum((r->>'line_subtotal_minor')::bigint),
            0
        )
          FROM jsonb_array_elements(p_line_prices) r
    ) <> p_subtotal_minor
    OR (
        SELECT COALESCE(
            sum((r->>'applied_amount_minor')::bigint),
            0
        )
          FROM jsonb_array_elements(p_adjustments) r
    ) <> p_adjustment_total_minor
    THEN
        RAISE EXCEPTION 'Materialized provider order totals are invalid'
            USING ERRCODE = '22023';
    END IF;

    UPDATE commerce_transaction_lines l
       SET unit_price_minor_authoritative = x.unit_price_minor,
           line_subtotal_minor = x.line_subtotal_minor,
           currency_code = x.currency_code,
           price_source = x.price_source,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = l.version_no + 1
      FROM jsonb_to_recordset(p_line_prices) AS x(
          line_id varchar,
          unit_price_minor bigint,
          line_subtotal_minor bigint,
          currency_code varchar,
          price_source varchar
      )
     WHERE l.commerce_transaction_line_id = x.line_id
       AND l.commerce_transaction_id = p_transaction_id
       AND NOT l.is_deleted;

    UPDATE commerce_transaction_adjustments a
       SET applied_amount_minor = x.applied_amount_minor,
           status = 'APPLIED',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = a.version_no + 1
      FROM jsonb_to_recordset(p_adjustments) AS x(
          adjustment_id varchar,
          applied_amount_minor bigint,
          status varchar
      )
     WHERE a.commerce_transaction_adjustment_id = x.adjustment_id
       AND a.commerce_transaction_id = p_transaction_id
       AND NOT a.is_deleted;

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

REVOKE ALL ON FUNCTION "${schemaName}".commerce_persist_materialized_provider_order(
    varchar,
    varchar,
    jsonb,
    jsonb,
    bigint,
    bigint,
    bigint,
    bigint,
    varchar,
    varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_persist_materialized_provider_order(
    varchar,
    varchar,
    jsonb,
    jsonb,
    bigint,
    bigint,
    bigint,
    bigint,
    varchar,
    varchar
) TO "${appRole}";
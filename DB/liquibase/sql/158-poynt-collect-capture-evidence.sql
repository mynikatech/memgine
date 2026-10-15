-- Stage A: provider-verified capture evidence is committed independently of fulfillment.
CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_collect_verified_captures (
    payment_intent_id varchar(64) PRIMARY KEY
        REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    provider_transaction_id varchar(160) NOT NULL UNIQUE,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency_code varchar(10) NOT NULL,
    verified_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS ix_poynt_verified_capture_org
    ON "${schemaName}".poynt_collect_verified_captures(organization_id, verified_at DESC);

-- A SECURITY DEFINER, intent-bound write gate. The application role is not granted
-- INSERT/UPDATE/DELETE on the evidence table.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_verified_collect_capture(
    p_organization_id varchar,
    p_intent_id varchar,
    p_actor_user_id varchar,
    p_transaction_id varchar,
    p_amount_minor bigint,
    p_currency_code varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_intent payment_intents%ROWTYPE;
    v_provider_code varchar;
    v_saved poynt_collect_verified_captures%ROWTYPE;
BEGIN
    IF p_transaction_id IS NULL OR length(p_transaction_id) NOT BETWEEN 1 AND 160
       OR p_transaction_id !~ '^[A-Za-z0-9_-]+$'
       OR p_amount_minor IS NULL OR p_amount_minor <= 0
       OR p_currency_code IS NULL OR length(p_currency_code) NOT BETWEEN 1 AND 10 THEN
        RAISE EXCEPTION 'Invalid verified capture' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_intent FROM payment_intents
      WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id FOR UPDATE;
    IF NOT FOUND OR NOT payment_actor_is_authorized(p_intent_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Payment is not available' USING ERRCODE = '42501';
    END IF;
    SELECT provider_code INTO v_provider_code FROM payment_provider_configs
      WHERE payment_provider_config_id = v_intent.payment_provider_config_id;
    IF v_provider_code IS DISTINCT FROM 'POYNT_COLLECT'
       OR v_intent.provider_reference_id IS DISTINCT FROM p_transaction_id
       OR round(v_intent.amount * 100)::bigint <> p_amount_minor
       OR upper(v_intent.currency_code) <> upper(p_currency_code)
       OR v_intent.status NOT IN ('PROCESSING', 'SUCCEEDED') THEN
        RAISE EXCEPTION 'Verified capture conflicts with payment' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_saved FROM poynt_collect_verified_captures
       WHERE payment_intent_id = p_intent_id FOR UPDATE;
    IF FOUND THEN
       IF v_saved.organization_id <> p_organization_id
          OR v_saved.provider_transaction_id <> p_transaction_id
          OR v_saved.amount_minor <> p_amount_minor
          OR upper(v_saved.currency_code) <> upper(p_currency_code) THEN
           RAISE EXCEPTION 'Conflicting verified capture' USING ERRCODE = '23514';
       END IF;
       RETURN true;
    END IF;
    INSERT INTO poynt_collect_verified_captures (
        payment_intent_id, organization_id, provider_transaction_id, amount_minor, currency_code
    ) VALUES (p_intent_id, p_organization_id, p_transaction_id, p_amount_minor, upper(p_currency_code));
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_has_verified_collect_capture(
    p_organization_id varchar, p_intent_id varchar, p_actor_user_id varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT payment_actor_is_authorized(p_intent_id, p_actor_user_id)
       AND EXISTS (
           SELECT 1 FROM poynt_collect_verified_captures c
           JOIN payment_intents i ON i.payment_intent_id = c.payment_intent_id
           WHERE c.organization_id = p_organization_id
             AND c.payment_intent_id = p_intent_id
             AND i.organization_id = p_organization_id
             AND i.provider_reference_id = c.provider_transaction_id
       );
$function$;

REVOKE ALL ON "${schemaName}".poynt_collect_verified_captures FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar,varchar,varchar,varchar,bigint,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_has_verified_collect_capture(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_record_verified_collect_capture(varchar,varchar,varchar,varchar,bigint,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_has_verified_collect_capture(varchar,varchar,varchar) TO "${appRole}";

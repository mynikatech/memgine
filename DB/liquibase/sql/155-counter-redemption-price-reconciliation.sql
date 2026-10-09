-- 155-counter-redemption-price-reconciliation.sql
-- Persists a server-generated Poynt catalog-price reconciliation snapshot and
-- requires a matching Counter acknowledgement before remote-terminal dispatch.

ALTER TABLE "${schemaName}".commerce_transactions
    ADD COLUMN IF NOT EXISTS pricing_reconciliation_json jsonb,
    ADD COLUMN IF NOT EXISTS pricing_reconciliation_hash varchar(64),
    ADD COLUMN IF NOT EXISTS pricing_acknowledged_hash varchar(64);

DO $constraints$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_commerce_transactions_pricing_reconciliation_json') THEN
        ALTER TABLE "${schemaName}".commerce_transactions
            ADD CONSTRAINT ck_commerce_transactions_pricing_reconciliation_json
            CHECK (pricing_reconciliation_json IS NULL OR jsonb_typeof(pricing_reconciliation_json) = 'array');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_commerce_transactions_pricing_reconciliation_hash') THEN
        ALTER TABLE "${schemaName}".commerce_transactions
            ADD CONSTRAINT ck_commerce_transactions_pricing_reconciliation_hash
            CHECK (pricing_reconciliation_hash IS NULL OR pricing_reconciliation_hash ~ '^[0-9a-f]{64}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_commerce_transactions_pricing_acknowledged_hash') THEN
        ALTER TABLE "${schemaName}".commerce_transactions
            ADD CONSTRAINT ck_commerce_transactions_pricing_acknowledged_hash
            CHECK (pricing_acknowledged_hash IS NULL OR pricing_acknowledged_hash ~ '^[0-9a-f]{64}$');
    END IF;
END
$constraints$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_set_counter_redemption_pricing_reconciliation(
    p_transaction_id varchar,
    p_reconciliation jsonb,
    p_reconciliation_hash varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
    v_actor_organization_user_id varchar;
BEGIN
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption checkout was not found' USING ERRCODE = 'P0002';
    END IF;

    v_actor_organization_user_id := commerce_counter_checkout_actor_organization_user(
        p_transaction_id, p_actor_user_id);
    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Counter checkout actor is not permitted' USING ERRCODE = '42501';
    END IF;
    IF v_transaction.status <> 'ORDER_CREATED' THEN
        RAISE EXCEPTION 'Counter redemption checkout is not ready for price reconciliation' USING ERRCODE = 'P0001';
    END IF;
    IF p_reconciliation IS NULL
       OR p_reconciliation_hash IS NULL
       OR jsonb_typeof(p_reconciliation) <> 'array'
       OR p_reconciliation_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid Counter redemption price reconciliation' USING ERRCODE = '22023';
    END IF;

    IF v_transaction.pricing_reconciliation_json IS NOT DISTINCT FROM p_reconciliation
       AND v_transaction.pricing_reconciliation_hash IS NOT DISTINCT FROM p_reconciliation_hash THEN
        RETURN true;
    END IF;

    UPDATE commerce_transactions
       SET pricing_reconciliation_json = p_reconciliation,
           pricing_reconciliation_hash = p_reconciliation_hash,
           pricing_acknowledged_hash = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = p_transaction_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_acknowledge_counter_redemption_pricing(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_reconciliation_hash varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption checkout was not found' USING ERRCODE = 'P0002';
    END IF;
    IF commerce_counter_checkout_actor_organization_user(
        p_transaction_id, p_actor_user_id) IS NULL THEN
        RAISE EXCEPTION 'Counter checkout actor is not permitted' USING ERRCODE = '42501';
    END IF;
    IF v_transaction.status <> 'ORDER_CREATED'
       OR v_transaction.pricing_reconciliation_hash IS NULL
       OR v_transaction.pricing_reconciliation_hash <> p_reconciliation_hash THEN
        RAISE EXCEPTION 'Counter redemption pricing has changed; refresh checkout before continuing' USING ERRCODE = 'P0001';
    END IF;
    IF v_transaction.pricing_acknowledged_hash = p_reconciliation_hash THEN
        RETURN true;
    END IF;

    UPDATE commerce_transactions
       SET pricing_acknowledged_hash = p_reconciliation_hash,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = p_transaction_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_redemption_pricing_is_acknowledged(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_transaction commerce_transactions%ROWTYPE;
BEGIN
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted;
    IF NOT FOUND OR commerce_counter_checkout_actor_organization_user(
        p_transaction_id, p_actor_user_id) IS NULL THEN
        RAISE EXCEPTION 'Counter checkout actor is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN v_transaction.pricing_reconciliation_json IS NOT NULL
       AND v_transaction.pricing_reconciliation_hash IS NOT NULL
       AND (
            jsonb_array_length(v_transaction.pricing_reconciliation_json) = 0
            OR v_transaction.pricing_reconciliation_hash = v_transaction.pricing_acknowledged_hash
       );
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_set_counter_redemption_pricing_reconciliation(varchar, jsonb, varchar, varchar),
    "${schemaName}".commerce_acknowledge_counter_redemption_pricing(varchar, varchar, varchar, varchar),
    "${schemaName}".commerce_counter_redemption_pricing_is_acknowledged(varchar, varchar)
FROM PUBLIC;

DO $grant$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION
            "${schemaName}".commerce_set_counter_redemption_pricing_reconciliation(varchar, jsonb, varchar, varchar),
            "${schemaName}".commerce_acknowledge_counter_redemption_pricing(varchar, varchar, varchar, varchar),
            "${schemaName}".commerce_counter_redemption_pricing_is_acknowledged(varchar, varchar)
        TO "${appRole}";
    END IF;
END
$grant$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_pricing_reconciliation(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "pricingReconciliationJson" text,
    "pricingReconciliationHash" varchar,
    "pricingAcknowledgedHash" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    ) IS NULL THEN
        RAISE EXCEPTION 'Counter checkout actor is not permitted'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        c.pricing_reconciliation_json::text,
        c.pricing_reconciliation_hash,
        c.pricing_acknowledged_hash
      FROM commerce_transactions c
     WHERE c.commerce_transaction_id = p_transaction_id
       AND c.source_channel = 'COUNTER_REDEMPTION'
       AND NOT c.is_deleted;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".commerce_get_counter_redemption_pricing_reconciliation(varchar, varchar)
FROM PUBLIC;

DO $grant_reconciliation_read$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${appRole}') THEN
        GRANT EXECUTE ON FUNCTION
            "${schemaName}".commerce_get_counter_redemption_pricing_reconciliation(varchar, varchar)
        TO "${appRole}";
    END IF;
END
$grant_reconciliation_read$;
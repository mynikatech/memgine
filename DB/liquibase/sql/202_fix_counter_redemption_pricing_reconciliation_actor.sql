-- Liquibase migration: use the resolved organization-user audit identifier.
-- updated_by references organization_user(organization_user_id).
CREATE OR REPLACE FUNCTION memginedev.commerce_set_counter_redemption_pricing_reconciliation(p_transaction_id character varying, p_reconciliation jsonb, p_reconciliation_hash character varying, p_actor_user_id character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'memginedev'
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
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = p_transaction_id;
    RETURN true;
END;
$function$;

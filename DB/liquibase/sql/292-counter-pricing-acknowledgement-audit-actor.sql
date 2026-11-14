-- Migration 292: Correct the audit actor used during
-- Counter redemption pricing acknowledgement.
--
-- commerce_transactions.updated_by references
-- organization_user.organization_user_id.
--
-- Preserve existing authorization, transaction locking,
-- pricing validation and idempotency behaviour.

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
    v_actor_organization_user_id varchar;
BEGIN
    SELECT * INTO v_transaction
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Counter redemption checkout was not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor_organization_user_id :=
        commerce_counter_checkout_actor_organization_user(
            p_transaction_id,
            p_actor_user_id
        );

    IF v_actor_organization_user_id IS NULL THEN
        RAISE EXCEPTION
            'Counter checkout actor is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF v_transaction.status <> 'ORDER_CREATED'
       OR v_transaction.pricing_reconciliation_hash IS NULL
       OR p_reconciliation_hash IS NULL
       OR v_transaction.pricing_reconciliation_hash
            <> p_reconciliation_hash THEN

        RAISE EXCEPTION
            'Counter redemption pricing has changed; refresh checkout before continuing'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_transaction.pricing_acknowledged_hash =
        p_reconciliation_hash THEN
        RETURN true;
    END IF;

    UPDATE commerce_transactions
       SET pricing_acknowledged_hash = p_reconciliation_hash,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_transaction_id = p_transaction_id;

    RETURN true;
END;
$function$;

-- CREATE OR REPLACE preserves existing function ownership
-- and EXECUTE grants.
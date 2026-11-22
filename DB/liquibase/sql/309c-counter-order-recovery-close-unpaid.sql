-- ==========================================================================
-- PAYMENT — Close unpaid safeguards
-- Canonical PostgreSQL function: commerce_close_counter_redemption_unpaid
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_close_counter_redemption_unpaid(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    c commerce_transactions%ROWTYPE;
    f fulfillments%ROWTYPE;
    r redemption_transaction%ROWTYPE;
    v_actor varchar(64);
    v_item_actor varchar(64);
    v_redemption_actor varchar(64);
BEGIN
    SELECT * INTO f FROM fulfillments WHERE commerce_transaction_id=p_transaction_id
        AND organization_id=p_organization_id FOR UPDATE;
    SELECT * INTO c FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel = 'COUNTER_REDEMPTION'
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
          USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id, p_actor_user_id
    );

    SELECT rt.* INTO r
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     FOR UPDATE OF rt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption is unavailable'
          USING ERRCODE = '23505';
    END IF;

    IF r.status = 'CANCELLED' AND c.status = 'CANCELLED' THEN
        RETURN true;
    END IF;

    IF r.status <> 'PENDING' OR c.status <> 'ORDER_CREATED' THEN
        RAISE EXCEPTION 'Counter redemption cannot be closed unpaid'
          USING ERRCODE = '23505';
    END IF;

    -- Keep the original lock order: transaction, redemption, payment evidence.
    PERFORM 1 FROM commerce_provider_payment_attempts a
     WHERE a.commerce_transaction_id = c.commerce_transaction_id
     FOR UPDATE;
    PERFORM 1 FROM poynt_collect_financial_exceptions e
     WHERE e.commerce_transaction_id = c.commerce_transaction_id
     FOR UPDATE;

    -- Existing safety rule, unchanged: known success / active / unresolved blocks closure.
    IF EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
         WHERE a.commerce_transaction_id = c.commerce_transaction_id
           AND a.provider_status IN (
               'PENDING', 'DISPATCHING', 'DISPATCHED',
               'RECEIVED', 'STARTED', 'SUCCEEDED'
           )
    ) OR EXISTS (
        SELECT 1 FROM poynt_collect_financial_exceptions e
         WHERE e.commerce_transaction_id = c.commerce_transaction_id
           AND NOT (
               e.case_status IN ('RESOLVED', 'CLOSED')
               AND e.provider_outcome IN ('FAILED', 'CANCELLED')
               AND e.classification = 'PROVIDER_OUTCOME_FAILED'
           )
    ) THEN
        RAISE EXCEPTION 'Counter redemption has an active, successful, or unresolved payment'
          USING ERRCODE = '23505';
    END IF;

    -- 284 introduced this helper; 285 uses it for the analogous recovery-cancel path.
    -- Redemption rows can reference different identity tables than Commerce rows.
    v_item_actor := commerce_counter_recovery_fk_actor(
        'redemption_transaction_item'::regclass,
        p_actor_user_id,
        v_actor
    );
    v_redemption_actor := commerce_counter_recovery_fk_actor(
        'redemption_transaction'::regclass,
        p_actor_user_id,
        v_actor
    );

    UPDATE redemption_transaction_item
       SET status = 'FAILED',
           failure_reason = 'Closed unpaid by Counter staff',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_item_actor,
           version_no = version_no + 1
     WHERE redemption_transaction_id = r.redemption_transaction_id
       AND status = 'PENDING';

    UPDATE redemption_transaction
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_redemption_actor,
           version_no = version_no + 1
     WHERE redemption_transaction_id = r.redemption_transaction_id;

    UPDATE commerce_transactions
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    IF f.fulfillment_id IS NOT NULL THEN
      UPDATE redemption_entitlement_reservations SET released_quantity=reserved_quantity,
        reservation_status_id=(SELECT status_id FROM statuses WHERE status_code='RELEASED'),
        released_at=current_timestamp AT TIME ZONE 'UTC',updated_at=current_timestamp AT TIME ZONE 'UTC',
        updated_by=p_actor_user_id,version_no=version_no+1 WHERE fulfillment_id=f.fulfillment_id
            AND consumed_quantity=0;
      UPDATE fulfillments SET fulfillment_status_id=(SELECT status_id FROM statuses WHERE status_code='CANCELLED'),
        cancelled_at=current_timestamp AT TIME ZONE 'UTC',updated_at=current_timestamp AT TIME ZONE 'UTC',
        updated_by=p_actor_user_id,version_no=version_no+1 WHERE fulfillment_id=f.fulfillment_id;
      INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
        prior_fulfillment_status_id,new_fulfillment_status_id,created_by)
      SELECT generate_runtime_id('FAC'),f.fulfillment_id,s.status_id,p_actor_user_id,f.fulfillment_status_id,
          s.status_id,p_actor_user_id
      FROM statuses s WHERE s.status_code='CANCELLED';
    END IF;
    RETURN true;
END;
$body$;




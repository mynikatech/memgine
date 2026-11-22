-- ==========================================================================
-- PAYMENT — Timeout recovery
-- Canonical PostgreSQL function: commerce_counter_timeout_recover
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_timeout_recover(
    p_organization_id varchar, p_transaction_id varchar, p_store_id varchar,
    p_staff_id varchar, p_actor_user_id varchar, p_attempt_id varchar,
    p_action varchar, p_confirmed boolean
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    c commerce_transactions%ROWTYPE;
    f fulfillments%ROWTYPE;
    a commerce_provider_payment_attempts%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    existing commerce_counter_timeout_recoveries%ROWTYPE;
    v_actor varchar(64);
    v_item_actor varchar(64);
    v_redemption_actor varchar(64);
    v_action varchar(16) := upper(btrim(coalesce(p_action,'')));
BEGIN
    IF p_confirmed IS DISTINCT FROM true OR v_action NOT IN ('CASH','CANCEL') THEN
       RAISE EXCEPTION 'Please confirm the terminal check and choose an action' USING ERRCODE='22023';
    END IF;
    IF NOT counter_can_operate(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) THEN
       RAISE EXCEPTION 'Counter access is not permitted' USING ERRCODE='42501';
    END IF;
    SELECT * INTO f FROM fulfillments WHERE commerce_transaction_id=p_transaction_id
      AND organization_id=p_organization_id AND store_id=p_store_id FOR UPDATE;
    SELECT * INTO c FROM commerce_transactions
     WHERE organization_id=p_organization_id AND commerce_transaction_id=p_transaction_id
       AND store_id=p_store_id AND source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
           AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE='P0002'; END IF;
    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    IF c.source_channel='CUSTOMER_FULFILLMENT' AND f.fulfillment_id IS NULL THEN
      RAISE EXCEPTION 'Counter order is unavailable' USING ERRCODE='42501'; END IF;
    IF f.fulfillment_id IS NOT NULL AND (f.cancelled_at IS NOT NULL OR f.fulfilled_at IS NOT NULL OR
      (f.cancellation_requested_at IS NOT NULL AND v_action<>'CANCEL')) THEN
      RAISE EXCEPTION 'Order is unavailable for payment recovery' USING ERRCODE='23505'; END IF;
    SELECT * INTO existing FROM commerce_counter_timeout_recoveries
     WHERE commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    -- Retain idempotency, but validate current provider state BEFORE returning
    -- an old authorization; 283 could have recorded an active terminal attempt.
    IF existing.commerce_transaction_id IS NOT NULL AND
       (existing.action IS DISTINCT FROM v_action OR
        existing.terminal_payment_attempt_id IS DISTINCT FROM p_attempt_id) THEN
        RAISE EXCEPTION 'A different action was already selected for this redemption' USING ERRCODE='23505';
    END IF;
    SELECT * INTO a FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id=c.commerce_transaction_id
       AND commerce_provider_payment_attempt_id=p_attempt_id
       AND payment_channel='REMOTE_TERMINAL' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Terminal payment attempt not found' USING ERRCODE='P0002';
    END IF;
    IF a.commerce_provider_payment_attempt_id IS DISTINCT FROM (
        SELECT newest.commerce_provider_payment_attempt_id
        FROM commerce_provider_payment_attempts newest
        WHERE newest.commerce_transaction_id=c.commerce_transaction_id
          AND newest.payment_channel='REMOTE_TERMINAL'
        ORDER BY newest.created_at DESC,newest.commerce_provider_payment_attempt_id DESC
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'A newer terminal payment attempt exists' USING ERRCODE='23505';
    END IF;
    IF nullif(btrim(a.provider_reference_id),'') IS NULL THEN
        RAISE EXCEPTION 'Terminal payment reference is missing' USING ERRCODE='22023';
    END IF;
    -- Operator-confirmed override is allowed for a single most-recent terminal
    -- attempt whose outcome is not known to be successful. Keep attempt status
    -- unchanged: DISPATCHED is historical evidence, never a synthetic failure.
    IF a.provider_status NOT IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED',
                                  'FAILED','CANCELLED','CANCELED') THEN
        RAISE EXCEPTION 'Terminal attempt is not eligible for manual recovery' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts
      WHERE commerce_transaction_id=c.commerce_transaction_id
        AND (provider_status='SUCCEEDED' OR payment_channel='CASH'
          OR (payment_channel='REMOTE_TERMINAL' AND provider_status IN ('DISPATCHING','DISPATCHED','RECEIVED',
              'STARTED')
               AND commerce_provider_payment_attempt_id IS DISTINCT FROM a.commerce_provider_payment_attempt_id)))
       OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions
         WHERE commerce_transaction_id=c.commerce_transaction_id
           AND provider_outcome='CAPTURED') THEN
        RAISE EXCEPTION 'A payment was recorded. Please check its status before proceeding' USING ERRCODE='23505';
    END IF;
    IF f.fulfillment_id IS NOT NULL AND a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED')
      AND a.created_at+interval '120 seconds'>current_timestamp THEN
      RAISE EXCEPTION 'Wait for the terminal outcome before recovery' USING ERRCODE='23505'; END IF;
    IF existing.commerce_transaction_id IS NOT NULL THEN
        IF f.fulfillment_id IS NOT NULL AND v_action='CANCEL' THEN RETURN 'CANCELLATION_REQUESTED'; END IF;
        RETURN CASE WHEN v_action='CASH' THEN 'CASH_READY' ELSE 'CANCELLED' END;
    END IF;
    IF c.status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') THEN
        RAISE EXCEPTION 'This redemption cannot be changed now' USING ERRCODE='23505';
    END IF;
    SELECT rt.* INTO t FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt ON rt.redemption_transaction_id=x.redemption_transaction_id
      WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
      FOR UPDATE OF rt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Redemption is not pending' USING ERRCODE='23505';
    END IF;
    IF (c.source_channel='CUSTOMER_FULFILLMENT' AND t.status IS DISTINCT FROM 'RESERVED')
       OR (c.source_channel='COUNTER_REDEMPTION' AND t.status IS DISTINCT FROM 'PENDING') THEN
        RAISE EXCEPTION 'Redemption is not pending' USING ERRCODE='23505';
    END IF;
    INSERT INTO commerce_counter_timeout_recoveries (
       commerce_transaction_id,organization_id,store_id,terminal_payment_attempt_id,
       provider_reference_id,action,actor_user_id,staff_id,confirmed_no_success
    ) VALUES (
       c.commerce_transaction_id,c.organization_id,c.store_id,a.commerce_provider_payment_attempt_id,
       a.provider_reference_id,v_action,p_actor_user_id,p_staff_id,true
    );
    UPDATE commerce_counter_timeout_recoveries
       SET recovery_mode = CASE
           WHEN a.provider_status IN ('FAILED','CANCELLED','CANCELED') THEN 'VERIFIED'
           ELSE 'MANUAL_OVERRIDE'
       END
     WHERE commerce_transaction_id = c.commerce_transaction_id;
    IF v_action='CANCEL' AND f.fulfillment_id IS NOT NULL THEN
      UPDATE fulfillments SET fulfillment_status_id=(SELECT status_id FROM statuses WHERE status_code='CANCEL_REQUESTED'),
        cancellation_requested_at=current_timestamp AT TIME ZONE 'UTC',
            updated_at=current_timestamp AT TIME ZONE 'UTC',
        updated_by=p_actor_user_id,version_no=version_no+1 WHERE fulfillment_id=f.fulfillment_id;
      INSERT INTO fulfillment_actions(fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
        prior_fulfillment_status_id,new_fulfillment_status_id,action_details,created_by)
      SELECT generate_runtime_id('FAC'),f.fulfillment_id,s.status_id,p_actor_user_id,f.fulfillment_status_id,
        (SELECT status_id FROM statuses WHERE status_code='CANCEL_REQUESTED'),jsonb_build_object('staffId',
            p_staff_id,'storeId',p_store_id),
        p_actor_user_id FROM statuses s WHERE s.status_code='CANCELLATION_REQUESTED';
      RETURN 'CANCELLATION_REQUESTED';
    END IF;
    IF v_action='CANCEL' THEN
        v_item_actor := commerce_counter_recovery_fk_actor(
            'redemption_transaction_item'::regclass, p_actor_user_id, v_actor);
        v_redemption_actor := commerce_counter_recovery_fk_actor(
            'redemption_transaction'::regclass, p_actor_user_id, v_actor);
       UPDATE redemption_transaction_item
         SET status='FAILED',failure_reason='Cancelled after terminal check',
             updated_at=current_timestamp,updated_by=v_item_actor,version_no=version_no+1
         WHERE redemption_transaction_id=t.redemption_transaction_id AND status='PENDING';
       UPDATE redemption_transaction
         SET status='CANCELLED',updated_at=current_timestamp,updated_by=v_redemption_actor,version_no=version_no+1
         WHERE redemption_transaction_id=t.redemption_transaction_id;
       UPDATE commerce_transactions
         SET status='CANCELLED',updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
         WHERE commerce_transaction_id=c.commerce_transaction_id;
       RETURN 'CANCELLED';
    END IF;
    -- The terminal attempt remains DISPATCHED as truthful historical evidence.
    -- The dedicated CASH start function below checks the recovery authorization.
    UPDATE commerce_transactions
       SET status='ORDER_CREATED',updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
     WHERE commerce_transaction_id=c.commerce_transaction_id;
    RETURN 'CASH_READY';
END;
$body$;




-- 325D: Recognize advance-order settlement without consuming entitlements.
-- Forward-only replacement of the 309C finalizer; applies to all environments.
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_redemption_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    t redemption_transaction%ROWTYPE;
    i redemption_transaction_item%ROWTYPE;

    v_actor varchar(64);
    v_success varchar(64);
    v_id varchar(64);
    v_number varchar(64);
    v_sequence bigint;
    v_eligibility_reason text;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel IN ('COUNTER_REDEMPTION', 'CUSTOMER_FULFILLMENT')
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        c.commerce_transaction_id,
        p_actor_user_id
    );

    -- Advance orders must never fall through to legacy immediate consumption.
    -- The existing actor authorization also requires a matching Pay-at-Counter order.
    IF c.source_channel = 'CUSTOMER_FULFILLMENT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM fulfillments f
            JOIN statuses timing ON timing.status_id = f.payment_timing_status_id
                AND timing.status_code = 'PAY_AT_COUNTER'
            WHERE f.commerce_transaction_id = c.commerce_transaction_id
              AND f.organization_id = c.organization_id
              AND f.store_id = c.store_id
              AND f.customer_user_id = c.customer_user_id
        ) THEN
            RAISE EXCEPTION 'Advance order has no matching durable fulfillment; reconcile before completion'
                USING ERRCODE = '23505';
        END IF;
        IF c.status IS DISTINCT FROM 'COMPLETED'
           AND c.status IS DISTINCT FROM 'PROVIDER_SUCCEEDED' THEN
            RAISE EXCEPTION 'Counter redemption provider payment has not succeeded'
                USING ERRCODE = '23505';
        END IF;
        -- Settlement only; collection owns entitlement consumption and completion.
        RETURN true;
    END IF;

    IF c.status = 'COMPLETED' THEN
        RETURN true;
    END IF;

    IF c.status <> 'PROVIDER_SUCCEEDED' THEN
        RAISE EXCEPTION 'Counter redemption provider payment has not succeeded'
            USING ERRCODE = '23505';
    END IF;

    -- Callback, cash and zero-value handling record settlement only on unified orders.
    IF EXISTS (SELECT 1 FROM fulfillments f WHERE f.commerce_transaction_id=c.commerce_transaction_id) THEN
        RETURN true;
    END IF;

    -- New verified Counter orders cannot fall back to the historical path
    -- when order placement or entitlement reservation has failed.
    IF EXISTS (
        SELECT 1 FROM commerce_transaction_redemptions x
        JOIN redemption_transaction rt USING(redemption_transaction_id)
        WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
          AND rt.counter_verification IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Verified Counter order has no durable fulfillment; reconcile before completion'
          USING ERRCODE='23505';
    END IF;

    SELECT rt.*
      INTO t
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     FOR UPDATE OF rt;

    IF NOT FOUND OR t.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Pending redemption transaction is unavailable'
            USING ERRCODE = '23505';
    END IF;

    PERFORM 1 FROM subscriptions WHERE subscription_id=t.subscription_id FOR UPDATE;

    SELECT es.entity_status_id
      INTO v_success
      FROM entity_status es
      JOIN entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'REDEMPTION'
       AND st.status_code = 'SUCCESS'
       AND es.is_active;

    IF v_success IS NULL THEN
        RAISE EXCEPTION 'Successful redemption status is unavailable'
            USING ERRCODE = '23503';
    END IF;

    FOR i IN
        SELECT *
          FROM redemption_transaction_item
         WHERE redemption_transaction_id = t.redemption_transaction_id
         FOR UPDATE
    LOOP
        IF i.status = 'SUCCESS' THEN
            CONTINUE;
        END IF;

        IF i.status <> 'PENDING' THEN
            RAISE EXCEPTION 'Redemption transaction item is not pending'
                USING ERRCODE = '23505';
        END IF;

        -- A prepared QR is not evidence that entitlement capacity still exists.
        -- Existing payment recovery retains any capture when this check fails.
        v_eligibility_reason := CASE WHEN i.item_type='BENEFIT'
            THEN counter_benefit_rejection(c.organization_id,t.subscription_id,i.benefit_id,t.store_id)
            ELSE counter_offer_rejection(c.organization_id,t.subscription_id,i.offer_id,t.store_id) END;
        IF v_eligibility_reason IS NOT NULL THEN
            RAISE EXCEPTION '%', v_eligibility_reason USING ERRCODE='23505';
        END IF;

        IF i.item_type = 'BENEFIT' THEN
            v_id := generate_runtime_id('RDM');
            v_sequence := next_business_sequence(
                'REDEMPTION',
                t.subscription_id
            );

            SELECT (
                subscription_number
                || '_RDM_'
                || lpad(v_sequence::text, 3, '0')
            )::varchar(64)
              INTO v_number
              FROM subscriptions
             WHERE subscription_id = t.subscription_id;

            INSERT INTO redemptions (
                redemption_id,
                redemption_number,
                subscription_id,
                benefit_id,
                store_id,
                staff_id,
                redemption_status_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                v_number,
                t.subscription_id,
                i.benefit_id,
                c.store_id,
                t.staff_id,
                v_success,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSIF i.item_type = 'OFFER' THEN
            v_id := generate_runtime_id('ORD');

            INSERT INTO offer_redemptions (
                offer_redemption_id,
                redemption_transaction_id,
                redemption_transaction_item_id,
                organization_id,
                subscription_id,
                offer_id,
                store_id,
                staff_id,
                created_by,
                updated_by
            )
            VALUES (
                v_id,
                t.redemption_transaction_id,
                i.redemption_transaction_item_id,
                c.organization_id,
                t.subscription_id,
                i.offer_id,
                c.store_id,
                t.staff_id,
                p_actor_user_id,
                p_actor_user_id
            );

            UPDATE redemption_transaction_item
               SET offer_redemption_id = v_id,
                   status = 'SUCCESS',
                   updated_at = CURRENT_TIMESTAMP,
                   updated_by = p_actor_user_id,
                   version_no = version_no + 1
             WHERE redemption_transaction_item_id =
                   i.redemption_transaction_item_id;
        ELSE
            RAISE EXCEPTION 'Unsupported redemption transaction item type'
                USING ERRCODE = '23514';
        END IF;
    END LOOP;

    UPDATE redemption_transaction
       SET status = 'SUCCESS',
           store_id = c.store_id,
           completed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = version_no + 1
     WHERE redemption_transaction_id = t.redemption_transaction_id;

    UPDATE commerce_transactions
       SET status = 'COMPLETED',
           completed_at = CURRENT_TIMESTAMP,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN true;
END;
$function$;
-- CREATE OR REPLACE preserves the existing function owner and grants.

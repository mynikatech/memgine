-- Extend the canonical Counter Cash lane to the existing advance Commerce transaction.

-- ==========================================================================
-- COMMERCE — Counter actor authorization
-- Canonical PostgreSQL function: commerce_counter_checkout_actor_organization_user
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_counter_checkout_actor_organization_user(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    r redemption_transaction%ROWTYPE;
    v_organization_user_id varchar(64);
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND NOT is_deleted;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter Commerce transaction is unavailable'
            USING ERRCODE = '42501';
    END IF;

    IF c.source_channel = 'COUNTER' THEN
        RETURN commerce_counter_actor_organization_user(
            p_transaction_id,
            p_actor_user_id
        );
    END IF;

    IF c.source_channel <> 'COUNTER_REDEMPTION' AND NOT (
        c.source_channel='CUSTOMER_FULFILLMENT' AND EXISTS (
            SELECT 1 FROM fulfillments f
            JOIN statuses timing ON timing.status_id=f.payment_timing_status_id
                AND timing.status_code='PAY_AT_COUNTER'
            WHERE f.commerce_transaction_id=c.commerce_transaction_id AND f.organization_id=c.organization_id
              AND f.store_id=c.store_id AND f.customer_user_id=c.customer_user_id
        )
    ) THEN
        RAISE EXCEPTION 'Counter Commerce operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT rt.*
      INTO r
      FROM commerce_transaction_redemptions x
      JOIN redemption_transaction rt
        ON rt.redemption_transaction_id = x.redemption_transaction_id
     WHERE x.commerce_transaction_id = c.commerce_transaction_id
       AND NOT x.is_deleted
     ORDER BY x.created_at
     LIMIT 1;

    -- Keep the originating staff on the redemption for historical attribution.
    -- For financial actions, the authenticated actor must themselves be an
    -- active staff member assigned to this same Store. Do not authorize using
    -- an unrelated active staff row or the original staff member's identity.
    IF NOT FOUND
       OR c.store_id IS NULL
       OR r.store_id IS DISTINCT FROM c.store_id
       OR NOT EXISTS (
           SELECT 1
             FROM staff acting_staff
             JOIN organization_user acting_member
               ON acting_member.organization_user_id = acting_staff.organization_user_id
              AND acting_member.organization_id = c.organization_id
              AND acting_member.user_id = p_actor_user_id
              AND NOT acting_member.is_deleted
            WHERE acting_staff.organization_id = c.organization_id
              AND counter_can_operate(
                    c.organization_id,
                    c.store_id,
                    acting_staff.staff_id,
                    p_actor_user_id
                  )
       ) THEN
        RAISE EXCEPTION 'Counter Commerce operation is not permitted'
            USING ERRCODE = '42501';
    END IF;

    SELECT organization_user_id
      INTO v_organization_user_id
      FROM organization_user
     WHERE organization_id = c.organization_id
       AND user_id = p_actor_user_id
       AND NOT is_deleted
     ORDER BY organization_user_id
     LIMIT 1;

    IF v_organization_user_id IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found'
            USING ERRCODE = '42501';
    END IF;

    RETURN v_organization_user_id;
END;
$function$;


-- ==========================================================================
-- PAYMENT — Cash initiation and safeguards
-- Canonical PostgreSQL function: commerce_begin_counter_redemption_cash_payment
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_redemption_cash_payment(
    p_organization_id varchar, p_transaction_id varchar, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $body$
DECLARE
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    cash_attempt commerce_provider_payment_attempts%ROWTYPE;
    recovery commerce_counter_timeout_recoveries%ROWTYPE;
BEGIN
    SELECT * INTO c FROM commerce_transactions
     WHERE commerce_transaction_id=p_transaction_id AND organization_id=p_organization_id
       AND source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT') AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Redemption not found' USING ERRCODE='P0002'; END IF;
    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor_user_id);
    IF c.source_channel='COUNTER_REDEMPTION'
       AND EXISTS (
         SELECT 1 FROM commerce_transaction_redemptions x
         JOIN redemption_transaction rt USING(redemption_transaction_id)
         WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
           AND rt.counter_verification IS NOT NULL
       )
       AND NOT EXISTS (SELECT 1 FROM fulfillments f WHERE f.commerce_transaction_id=c.commerce_transaction_id)
    THEN
       RAISE EXCEPTION 'Verified Counter order must be placed before cash payment' USING ERRCODE='23505';
    END IF;
    SELECT * INTO recovery FROM commerce_counter_timeout_recoveries
      WHERE commerce_transaction_id=c.commerce_transaction_id FOR UPDATE;
    SELECT * INTO cash_attempt FROM commerce_provider_payment_attempts
      WHERE commerce_transaction_id=c.commerce_transaction_id AND payment_channel='CASH'
      ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF FOUND THEN
        IF cash_attempt.amount_minor IS DISTINCT FROM c.total_minor
            OR cash_attempt.currency_code IS DISTINCT FROM c.currency_code
            OR cash_attempt.provider_status NOT IN ('PENDING','SUCCEEDED') THEN
            RAISE EXCEPTION 'Existing cash payment does not match this redemption' USING ERRCODE='23505';
        END IF;
        IF cash_attempt.provider_status='SUCCEEDED' AND c.status='COMPLETED' THEN RETURN true; END IF;
        IF cash_attempt.provider_status='PENDING' AND c.status='PROVIDER_IN_PROGRESS' THEN RETURN true; END IF;
        RAISE EXCEPTION 'Cash payment cannot be restarted' USING ERRCODE='23505';
    END IF;
    IF c.status <> 'ORDER_CREATED' OR c.total_minor IS NULL OR c.total_minor <= 0
       OR c.currency_code !~ '^[A-Z]{3}$' OR (c.source_channel='COUNTER_REDEMPTION'
           AND nullif(btrim(c.provider_order_id),'') IS NULL) THEN
       RAISE EXCEPTION 'Redemption is not ready for cash' USING ERRCODE='23505';
    END IF;
    IF (c.source_channel='COUNTER_REDEMPTION'
        AND NOT commerce_counter_redemption_pricing_is_acknowledged(c.commerce_transaction_id,p_actor_user_id))
       OR (c.source_channel='CUSTOMER_FULFILLMENT' AND (c.currency_code IS DISTINCT FROM 'CAD'
        OR counter_order_collection_payment(c.organization_id,c.store_id,c.customer_user_id,
            c.commerce_transaction_id,'PAY_AT_COUNTER')
           NOT IN ('PAYMENT_REQUIRED','CASH_RECOVERY_READY'))) THEN
       RAISE EXCEPTION 'Confirm the checkout total first' USING ERRCODE='23505';
    END IF;
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=c.commerce_transaction_id
      AND a.payment_channel='REMOTE_TERMINAL' AND a.provider_status='SUCCEEDED') THEN
       RAISE EXCEPTION 'Card payment already completed' USING ERRCODE='23505';
    END IF;
    -- An active terminal attempt is allowed ONLY if this exact attempt was
    -- explicitly overridden by an authorized operator. Unrelated active
    -- attempts remain blocked, as do all known captured payments.
    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
       WHERE a.commerce_transaction_id=c.commerce_transaction_id
         AND a.payment_channel='REMOTE_TERMINAL'
         AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED')
         AND NOT (recovery.action='CASH'
                  AND recovery.confirmed_no_success
                  AND NOT recovery.late_capture_seen
                  AND recovery.terminal_payment_attempt_id=a.commerce_provider_payment_attempt_id
                  AND recovery.provider_reference_id=a.provider_reference_id)) THEN
        RAISE EXCEPTION 'Another terminal attempt is unresolved' USING ERRCODE='23505';
    END IF;
    IF recovery.late_capture_seen OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e
        WHERE e.commerce_transaction_id=c.commerce_transaction_id
          AND e.provider_outcome='CAPTURED') THEN
        RAISE EXCEPTION 'A card payment was recorded' USING ERRCODE='23505';
    END IF;
    INSERT INTO commerce_provider_payment_attempts (
       commerce_provider_payment_attempt_id,commerce_transaction_id,provider_status,
       amount_minor,currency_code,created_by,payment_channel,provider_reference_id
    ) VALUES (generate_runtime_id('CPA'),c.commerce_transaction_id,'PENDING',
        c.total_minor,c.currency_code,v_actor,'CASH','cash:'||c.commerce_transaction_id);
    UPDATE commerce_transactions
       SET status='PROVIDER_IN_PROGRESS',failure_code=NULL,failure_message=NULL,
           updated_at=current_timestamp,updated_by=v_actor,version_no=version_no+1
     WHERE commerce_transaction_id=c.commerce_transaction_id;
    RETURN true;
END;
$body$;


-- ==========================================================================
-- PAYMENT — Cash settlement and recovery
-- Canonical PostgreSQL function: commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_confirm_counter_redemption_cash_payment_before_timeout_recovery(
    p_organization_id varchar,
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
    v_actor varchar(64);
    v_cash_attempt commerce_provider_payment_attempts%ROWTYPE;
    v_reference varchar(160);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_transaction_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Counter redemption cash confirmation'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
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

    SELECT *
      INTO v_cash_attempt
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND payment_channel = 'CASH'
     ORDER BY created_at, commerce_provider_payment_attempt_id
     LIMIT 1
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption cash payment has not been started'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.amount_minor IS DISTINCT FROM c.total_minor
       OR v_cash_attempt.currency_code IS DISTINCT FROM c.currency_code THEN
        RAISE EXCEPTION 'Counter redemption cash payment conflicts with persisted financial state'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.provider_status = 'SUCCEEDED' THEN
        IF c.status = 'COMPLETED' OR (c.source_channel='CUSTOMER_FULFILLMENT'
            AND c.status='PROVIDER_SUCCEEDED') THEN
            RETURN true;
        END IF;
        IF c.status = 'PROVIDER_SUCCEEDED' THEN
            RETURN commerce_finalize_counter_redemption_transaction(
                c.commerce_transaction_id,
                p_actor_user_id
            );
        END IF;
        RAISE EXCEPTION 'Counter redemption cash payment conflicts with transaction state'
            USING ERRCODE = '23505';
    END IF;

    IF v_cash_attempt.provider_status IS DISTINCT FROM 'PENDING'
       OR c.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
        RAISE EXCEPTION 'Counter redemption is not awaiting cash confirmation'
            USING ERRCODE = '23505';
    END IF;

    v_reference := 'cash-' || c.commerce_transaction_id;

    UPDATE commerce_provider_payment_attempts
       SET provider_status = 'SUCCEEDED',
           provider_transaction_id = v_reference,
           callback_received_at = CURRENT_TIMESTAMP
     WHERE commerce_provider_payment_attempt_id =
           v_cash_attempt.commerce_provider_payment_attempt_id;

    UPDATE commerce_transactions
       SET status = 'PROVIDER_SUCCEEDED',
           provider_transaction_id = v_reference,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    IF c.source_channel='CUSTOMER_FULFILLMENT' THEN RETURN true; END IF;
    RETURN commerce_finalize_counter_redemption_transaction(
        c.commerce_transaction_id,
        p_actor_user_id
    );
END;
$function$;



-- ==========================================================================
-- IMMEDIATE COUNTER — QR authorization evidence
-- Canonical PostgreSQL function: resolve_counter_redemption_transaction_qr
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".resolve_counter_redemption_transaction_qr(
    p_organization_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_token_hash varchar,
    p_actor_user_id varchar
)
RETURNS TABLE("transactionId" varchar, "transactionNumber" varchar, status varchar, "expiresAt" text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT counter_can_operate(p_organization_id, p_store_id, p_staff_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted' USING ERRCODE = '42501';
    END IF;

    UPDATE redemption_transaction t SET counter_verification=jsonb_build_object(
      'method','QR','sourceId',q.redemption_transaction_qr_id,'actorId',p_actor_user_id,'staffId',p_staff_id,
      'storeId',p_store_id,'verifiedAt',clock_timestamp() AT TIME ZONE 'UTC')
    FROM redemption_transaction_qr q
    WHERE q.redemption_transaction_id=t.redemption_transaction_id AND q.organization_id=p_organization_id
      AND q.token_hash=p_token_hash::char(64) AND q.revoked_at IS NULL
          AND q.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
      AND t.organization_id=p_organization_id AND (t.store_id IS NULL OR t.store_id=p_store_id)
      AND t.status='PENDING' AND t.redemption_method='CUSTOMER_QR'
          AND t.expires_at>clock_timestamp() AT TIME ZONE 'UTC'
      AND NOT EXISTS (SELECT 1 FROM fulfillments f WHERE f.redemption_transaction_id=t.redemption_transaction_id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid redemption QR reference' USING ERRCODE='P0002'; END IF;
    RETURN QUERY
    SELECT t.redemption_transaction_id, t.redemption_transaction_number,
           t.status, t.expires_at::text
      FROM redemption_transaction_qr q
      JOIN redemption_transaction t
        ON t.redemption_transaction_id = q.redemption_transaction_id
     WHERE q.organization_id = p_organization_id
       AND q.token_hash = p_token_hash
       AND q.revoked_at IS NULL
       AND q.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
       AND t.organization_id = p_organization_id
       AND (t.store_id IS NULL OR t.store_id=p_store_id) AND t.status = 'PENDING'
       AND t.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid redemption QR reference' USING ERRCODE = 'P0002';
    END IF;
END;
$function$;



-- ==========================================================================
-- IMMEDIATE COUNTER — Transaction creation
-- Canonical PostgreSQL function: create_counter_redemption_transaction_with_products
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".create_counter_redemption_transaction_with_products(
  p_organization_id varchar,
  p_store_id varchar,
  p_staff_id varchar,
  p_subscription_id varchar,
  p_benefit_ids varchar[],
  p_offer_ids varchar[],
  p_redemption_method varchar,
  p_selections jsonb,
  p_actor_user_id varchar
)
RETURNS TABLE(
  "transactionId" varchar,
  "transactionNumber" varchar,
  status varchar,
  "expiresAt" text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE created record;
BEGIN
  SELECT * INTO created FROM create_redemption_transaction_with_products_internal(p_organization_id,p_store_id,
      p_staff_id,
    p_subscription_id,p_benefit_ids,p_offer_ids,p_redemption_method,p_selections,p_actor_user_id);
  IF NOT FOUND THEN RETURN; END IF;
  IF p_redemption_method='STAFF_ASSISTED' THEN
    UPDATE redemption_transaction r SET counter_verification=jsonb_build_object('method','STAFF_ASSISTED',
      'sourceId',s.organization_user_id,'actorId',p_actor_user_id,'staffId',p_staff_id,'storeId',p_store_id,
      'verifiedAt',clock_timestamp() AT TIME ZONE 'UTC')
    FROM subscriptions s JOIN organization_user ou USING(organization_user_id)
    WHERE r.redemption_transaction_id=created."transactionId" AND s.subscription_id=r.subscription_id
      AND ou.organization_id=p_organization_id AND customer_has_active_relationship(p_organization_id,ou.user_id)
      AND counter_order_operator(p_organization_id,p_store_id,p_staff_id,p_actor_user_id) IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Staff-Assisted redemption is unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN QUERY SELECT created."transactionId"::varchar,created."transactionNumber"::varchar,
      created.status::varchar,created."expiresAt"::text;
END;
$body$;



-- ==========================================================================
-- REDEMPTION — Defer consumption for linked orders
-- Canonical PostgreSQL function: commerce_finalize_counter_redemption_transaction
-- ==========================================================================

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
       AND source_channel = 'COUNTER_REDEMPTION'
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



-- ==========================================================================
-- PAYMENT — Provider order persistence
-- Canonical PostgreSQL function: commerce_persist_counter_redemption_provider_order
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_persist_counter_redemption_provider_order(
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
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    v_line_count integer;
    v_adjustment_count integer;
BEGIN
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF c.source_channel='CUSTOMER_FULFILLMENT' THEN
      IF c.status<>'ORDER_CREATED' OR nullif(btrim(p_provider_order_id),'') IS NULL
        OR c.subtotal_minor IS DISTINCT FROM p_subtotal_minor
            OR c.adjustment_total_minor IS DISTINCT FROM p_adjustment_total_minor
        OR c.tax_total_minor IS DISTINCT FROM p_tax_total_minor OR c.total_minor IS DISTINCT FROM p_total_minor
        OR c.currency_code IS DISTINCT FROM 'CAD' OR c.currency_code IS DISTINCT FROM p_currency_code
        OR (c.provider_order_id IS NOT NULL AND c.provider_order_id<>p_provider_order_id)
        OR NOT EXISTS (SELECT 1 FROM fulfillments f JOIN statuses timing
          ON timing.status_id=f.payment_timing_status_id AND timing.status_code='PAY_AT_COUNTER'
          WHERE f.commerce_transaction_id=p_transaction_id AND f.cancelled_at IS NULL
              AND f.cancellation_requested_at IS NULL
            AND f.fulfilled_at IS NULL)
      THEN RAISE EXCEPTION 'Provider order conflicts with the accepted checkout' USING ERRCODE='23505'; END IF;
      UPDATE commerce_transactions SET provider_order_id=p_provider_order_id,updated_at=current_timestamp,
          updated_by=v_actor,
        version_no=version_no+1 WHERE commerce_transaction_id=p_transaction_id AND provider_order_id IS NULL;
      RETURN true;
    END IF;

    IF c.status = 'ORDER_CREATED' THEN
        IF c.provider_order_id = p_provider_order_id
           AND c.subtotal_minor IS NOT DISTINCT FROM p_subtotal_minor
           AND c.adjustment_total_minor IS NOT DISTINCT FROM p_adjustment_total_minor
           AND c.tax_total_minor IS NOT DISTINCT FROM p_tax_total_minor
           AND c.total_minor IS NOT DISTINCT FROM p_total_minor
           AND c.currency_code IS NOT DISTINCT FROM p_currency_code THEN
            RETURN true;
        END IF;

        RAISE EXCEPTION 'Provider order conflicts with persisted Commerce order'
            USING ERRCODE = '23505';
    END IF;

    IF c.status <> 'READY_FOR_PROVIDER' THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction is not ready for provider order'
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
       OR p_total_minor <> p_subtotal_minor - p_adjustment_total_minor + p_tax_total_minor THEN
        RAISE EXCEPTION 'Invalid Counter redemption provider order result'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_line_count
      FROM commerce_transaction_lines
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND NOT is_deleted;

    IF v_line_count = 0
       OR EXISTS (
            SELECT 1
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
               AND line_type <> 'EXTERNAL_PRODUCT'
       )
       OR (SELECT count(*) FROM jsonb_array_elements(p_line_prices)) <> v_line_count THEN
        RAISE EXCEPTION 'Counter redemption provider order lines are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_line_id, quantity
              FROM commerce_transaction_lines
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
        ),
        supplied AS (
            SELECT *
              FROM jsonb_to_recordset(p_line_prices) AS x(
                  line_id varchar,
                  unit_price_minor bigint,
                  line_subtotal_minor bigint,
                  currency_code varchar,
                  price_source varchar
              )
        )
        SELECT 1
          FROM actual l
          FULL JOIN supplied x
            ON x.line_id = l.commerce_transaction_line_id
         WHERE l.commerce_transaction_line_id IS NULL
            OR x.line_id IS NULL
            OR x.unit_price_minor IS NULL
            OR x.unit_price_minor < 0
            OR x.line_subtotal_minor IS NULL
            OR x.line_subtotal_minor <> x.unit_price_minor * l.quantity
            OR x.currency_code IS DISTINCT FROM p_currency_code
            OR x.price_source IS DISTINCT FROM 'PROVIDER_FINAL'
    ) THEN
        RAISE EXCEPTION 'Counter redemption provider line values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(sum(x.line_subtotal_minor), 0)
          FROM jsonb_to_recordset(p_line_prices) AS x(
              line_id varchar,
              unit_price_minor bigint,
              line_subtotal_minor bigint,
              currency_code varchar,
              price_source varchar
          )
    ) IS DISTINCT FROM p_subtotal_minor THEN
        RAISE EXCEPTION 'Counter redemption provider subtotal is invalid'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_adjustment_count
      FROM commerce_transaction_adjustments
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND NOT is_deleted;

    IF (SELECT count(*) FROM jsonb_array_elements(p_adjustments)) <> v_adjustment_count THEN
        RAISE EXCEPTION 'Counter redemption provider adjustments are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        WITH actual AS (
            SELECT commerce_transaction_adjustment_id
              FROM commerce_transaction_adjustments
             WHERE commerce_transaction_id = c.commerce_transaction_id
               AND NOT is_deleted
        ),
        supplied AS (
            SELECT *
              FROM jsonb_to_recordset(p_adjustments) AS x(
                  adjustment_id varchar,
                  applied_amount_minor bigint,
                  status varchar
              )
        )
        SELECT 1
          FROM actual a
          FULL JOIN supplied x
            ON x.adjustment_id = a.commerce_transaction_adjustment_id
         WHERE a.commerce_transaction_adjustment_id IS NULL
            OR x.adjustment_id IS NULL
            OR x.applied_amount_minor IS NULL
            OR x.applied_amount_minor < 0
            OR x.status IS DISTINCT FROM 'APPLIED'
    ) THEN
        RAISE EXCEPTION 'Counter redemption provider adjustment values are invalid'
            USING ERRCODE = '22023';
    END IF;

    IF (
        SELECT COALESCE(sum(x.applied_amount_minor), 0)
          FROM jsonb_to_recordset(p_adjustments) AS x(
              adjustment_id varchar,
              applied_amount_minor bigint,
              status varchar
          )
    ) IS DISTINCT FROM p_adjustment_total_minor
       OR p_adjustment_total_minor > p_subtotal_minor THEN
        RAISE EXCEPTION 'Counter redemption provider discount total is invalid'
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
       AND l.commerce_transaction_id = c.commerce_transaction_id
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
       AND a.commerce_transaction_id = c.commerce_transaction_id
       AND NOT a.is_deleted;

    UPDATE commerce_transactions
       SET status = 'ORDER_CREATED',
           provider_order_id = p_provider_order_id,
           provider_transaction_id = NULL,
           subtotal_minor = p_subtotal_minor,
           adjustment_total_minor = p_adjustment_total_minor,
           tax_total_minor = p_tax_total_minor,
           total_minor = p_total_minor,
           currency_code = p_currency_code,
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    PERFORM place_immediate_counter_order(c.commerce_transaction_id,p_actor_user_id);
    RETURN true;
END;
$function$;



-- ==========================================================================
-- COMMERCE — Authoritative transaction lines
-- Canonical PostgreSQL function: commerce_get_counter_redemption_lines
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_lines(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "lineId" varchar,
    "transactionId" varchar,
    "lineType" varchar,
    "sourceEntityType" varchar,
    "sourceEntityId" varchar,
    "productMappingId" varchar,
    "externalProductId" varchar,
    "externalVariantId" varchar,
    description varchar,
    quantity integer,
    "unitPriceMinorSnapshot" bigint,
    "unitPriceMinorAuthoritative" bigint,
    "lineSubtotalMinor" bigint,
    "currencyCode" varchar,
    "priceSource" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        l.commerce_transaction_line_id,
        l.commerce_transaction_id,
        l.line_type,
        l.source_entity_type,
        l.source_entity_id,
        l.commerce_product_mapping_id,
        l.external_product_id,
        l.external_variant_id,
        l.description,
        l.quantity,
        l.unit_price_minor_snapshot,
        l.unit_price_minor_authoritative,
        l.line_subtotal_minor,
        l.currency_code,
        l.price_source
      FROM commerce_transaction_lines l
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = l.commerce_transaction_id
     WHERE l.commerce_transaction_id = p_transaction_id
       AND c.source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       AND NOT l.is_deleted
       AND NOT c.is_deleted
     ORDER BY l.created_at, l.commerce_transaction_line_id;
END;
$function$;



-- ==========================================================================
-- COMMERCE — Applied adjustments
-- Canonical PostgreSQL function: commerce_get_counter_redemption_adjustments
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_adjustments(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "adjustmentId" varchar,
    "transactionId" varchar,
    "targetLineId" varchar,
    "commerceAdjustmentId" varchar,
    "sourceType" varchar,
    "sourceId" varchar,
    "adjustmentType" varchar,
    percentage double precision,
    "requestedAmountMinor" bigint,
    "appliedAmountMinor" bigint,
    "currencyCode" varchar,
    status varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        a.commerce_transaction_adjustment_id,
        a.commerce_transaction_id,
        a.target_line_id,
        a.commerce_adjustment_id,
        a.source_type,
        a.source_id,
        a.adjustment_type,
        a.percentage::double precision,
        a.requested_amount_minor,
        a.applied_amount_minor,
        a.currency_code,
        a.status
      FROM commerce_transaction_adjustments a
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = a.commerce_transaction_id
     WHERE a.commerce_transaction_id = p_transaction_id
       AND c.source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       AND NOT a.is_deleted
       AND NOT c.is_deleted
     ORDER BY a.created_at, a.commerce_transaction_adjustment_id;
END;
$function$;



-- ==========================================================================
-- POYNT — Canonical catalog configuration
-- Canonical PostgreSQL function: commerce_get_poynt_catalog_configuration_for_counter_transaction
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_poynt_catalog_configuration_for_counter_transaction(
    p_transaction_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "organizationId" varchar,
    "applicationId" varchar,
    "businessId" varchar,
    "providerStoreId" varchar,
    "secretReference" varchar,
    "merchantCurrencyCode" varchar,
    "storeId" varchar,
    "lastFullSyncAt" text,
    "lastIncrementalSyncAt" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    RETURN QUERY
    SELECT
        cfg.integration_configuration_id,
        cfg.organization_id,
        cfg.application_id,
        cfg.provider_business_id,
        cfg.provider_store_id,
        cfg.credential_secret_reference,
        cfg.merchant_currency_code,
        sync.store_id,
        sync.last_full_sync_at::text,
        sync.last_incremental_sync_at::text
      FROM commerce_transactions t
      JOIN commerce_provider_catalog_configurations cfg
        ON cfg.integration_configuration_id = t.integration_configuration_id
       AND cfg.organization_id = t.organization_id
       AND NOT cfg.is_deleted
      JOIN integration_configurations i
        ON i.integration_configuration_id = cfg.integration_configuration_id
       AND i.organization_id = cfg.organization_id
       AND upper(i.provider) = 'POYNT'
       AND NOT i.is_deleted
      LEFT JOIN commerce_catalog_sync_states sync
        ON sync.integration_configuration_id = cfg.integration_configuration_id
       AND (sync.store_id = t.store_id OR sync.store_id IS NULL)
     WHERE t.commerce_transaction_id = p_transaction_id
       AND t.source_channel IN ('COUNTER','COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       AND NOT t.is_deleted
     ORDER BY CASE WHEN sync.store_id = t.store_id THEN 0 ELSE 1 END
     LIMIT 1;
END;
$function$;



-- ==========================================================================
-- COMMERCE — Checkout read model
-- Canonical PostgreSQL function: commerce_get_counter_redemption_checkout
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_counter_redemption_checkout(
    p_organization_id varchar,
    p_redemption_transaction_id varchar,
    p_store_id varchar,
    p_staff_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "redemptionTransactionId" varchar,
    "transactionNumber" varchar,
    "redemptionStatus" varchar,
    "redemptionCompletedAt" text,
    "commerceTransactionId" varchar,
    "organizationId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    "commerceStatus" varchar,
    "subtotalMinor" bigint,
    "adjustmentTotalMinor" bigint,
    "taxTotalMinor" bigint,
    "totalMinor" bigint,
    "currencyCode" varchar,
    "providerOrderId" varchar,
    "providerTransactionId" varchar,
    "failureCode" varchar,
    "failureMessage" varchar,
    "storeId" varchar,
    "customerUserId" varchar,
    "idempotencyKey" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT counter_can_operate(
        p_organization_id,
        p_store_id,
        p_staff_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Counter store or staff context is not permitted'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        r.redemption_transaction_id,
        r.redemption_transaction_number,
        r.status,
        r.completed_at::text,
        c.commerce_transaction_id,
        c.organization_id,
        CASE
            WHEN c.integration_configuration_id IS NULL THEN 'TEST'::varchar
            ELSE upper(ic.provider)::varchar
        END,
        c.integration_configuration_id,
        c.status,
        c.subtotal_minor,
        c.adjustment_total_minor,
        c.tax_total_minor,
        c.total_minor,
        c.currency_code,
        c.provider_order_id,
        c.provider_transaction_id,
        c.failure_code,
        c.failure_message,
        c.store_id,
        c.customer_user_id,
        c.idempotency_key
      FROM redemption_transaction r
      JOIN commerce_transaction_redemptions x
        ON x.redemption_transaction_id = r.redemption_transaction_id
       AND NOT x.is_deleted
      JOIN commerce_transactions c
        ON c.commerce_transaction_id = x.commerce_transaction_id
       AND (c.source_channel='COUNTER_REDEMPTION' OR (c.source_channel='CUSTOMER_FULFILLMENT' AND EXISTS (
          SELECT 1 FROM fulfillments f JOIN statuses timing ON timing.status_id=f.payment_timing_status_id
              AND timing.status_code='PAY_AT_COUNTER'
          WHERE f.commerce_transaction_id=c.commerce_transaction_id
              AND f.redemption_transaction_id=r.redemption_transaction_id
            AND f.organization_id=p_organization_id AND f.store_id=p_store_id)))
       AND NOT c.is_deleted
      LEFT JOIN integration_configurations ic
        ON ic.integration_configuration_id = c.integration_configuration_id
       AND ic.organization_id = c.organization_id
       AND NOT ic.is_deleted
     WHERE r.redemption_transaction_id = p_redemption_transaction_id
       AND r.organization_id = p_organization_id
       AND c.organization_id = p_organization_id
       AND c.store_id = p_store_id
       AND r.store_id = p_store_id
       -- Original staff attribution is not a checkout access restriction.
     ORDER BY x.created_at
     LIMIT 1;
END;
$function$;



-- ==========================================================================
-- POYNT — Terminal payment initiation
-- Canonical PostgreSQL function: commerce_begin_counter_redemption_remote_terminal_payment
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_begin_counter_redemption_remote_terminal_payment(
    p_organization_id varchar,
    p_transaction_id varchar,
    p_pos_device_id varchar,
    p_reference_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "alreadyDispatched" boolean,
    "integrationConfigurationId" varchar,
    "providerOrderId" varchar,
    "amountMinor" bigint,
    "currencyCode" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "providerDeviceId" varchar,
    "providerReferenceId" varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    c commerce_transactions%ROWTYPE;
    v_actor varchar(64);
    a commerce_provider_payment_attempts%ROWTYPE;
    f fulfillments%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_reference_id), '') IS NULL
       OR length(p_reference_id) > 160 THEN
        RAISE EXCEPTION 'Invalid remote payment reference'
            USING ERRCODE = '22023';
    END IF;

    SELECT * INTO f FROM fulfillments WHERE commerce_transaction_id=p_transaction_id
        AND organization_id=p_organization_id FOR UPDATE;
    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = p_transaction_id
       AND organization_id = p_organization_id
       AND source_channel IN ('COUNTER_REDEMPTION','CUSTOMER_FULFILLMENT')
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction not found'
            USING ERRCODE = 'P0002';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(
        p_transaction_id,
        p_actor_user_id
    );

    IF c.source_channel='COUNTER_REDEMPTION'
       AND EXISTS (
         SELECT 1 FROM commerce_transaction_redemptions x
         JOIN redemption_transaction rt USING(redemption_transaction_id)
         WHERE x.commerce_transaction_id=c.commerce_transaction_id AND NOT x.is_deleted
           AND rt.counter_verification IS NOT NULL
       ) AND f.fulfillment_id IS NULL
    THEN
       RAISE EXCEPTION 'Verified Counter order must be placed before terminal payment' USING ERRCODE='23505';
    END IF;

    IF f.fulfillment_id IS NOT NULL AND (f.cancelled_at IS NOT NULL OR f.cancellation_requested_at IS NOT NULL
      OR f.fulfilled_at IS NOT NULL OR f.store_id IS DISTINCT FROM c.store_id
          OR f.customer_user_id IS DISTINCT FROM c.customer_user_id
      OR NOT EXISTS (SELECT 1 FROM statuses s WHERE s.status_id=f.payment_timing_status_id
          AND s.status_code='PAY_AT_COUNTER')
      OR EXISTS(SELECT 1 FROM fulfillment_actions fa JOIN customer_support_requests sr ON sr.support_request_id=fa.support_reference_id
        WHERE fa.fulfillment_id=f.fulfillment_id AND sr.status NOT IN ('RESOLVED','CLOSED')))
      THEN RAISE EXCEPTION 'Terminal payment is unavailable for this order' USING ERRCODE='23505'; END IF;
    IF c.source_channel='CUSTOMER_FULFILLMENT' AND (f.fulfillment_id IS NULL
        OR c.currency_code IS DISTINCT FROM 'CAD'
      OR f.effective_policy_snapshot->>'counterPaymentProvider' IS DISTINCT FROM 'POYNT'
      OR f.effective_policy_snapshot->>'counterPaymentIntegrationId' IS DISTINCT FROM c.integration_configuration_id
      OR NOT EXISTS (SELECT 1 FROM fulfillment_actions fa JOIN statuses s ON s.status_id=fa.action_type_status_id
        WHERE fa.fulfillment_id=f.fulfillment_id AND s.status_code='COLLECTION_AUTHORIZED'
          AND fa.action_details->>'storeId'=c.store_id AND fa.action_details->>'customerId'=c.customer_user_id
          AND fa.action_at+interval '15 minutes'>clock_timestamp() AT TIME ZONE 'UTC'
          AND counter_order_operator(c.organization_id,c.store_id,(fa.action_details->>'staffId')::varchar,
              fa.actor_user_id) IS NOT NULL))
      THEN RAISE EXCEPTION 'Verify the customer before terminal payment' USING ERRCODE='23505'; END IF;
    IF f.fulfillment_id IS NULL AND EXISTS (SELECT 1 FROM fulfillments WHERE commerce_transaction_id=p_transaction_id)
      THEN RAISE EXCEPTION 'The order changed. Refresh before taking payment' USING ERRCODE='23505'; END IF;

    SELECT *
      INTO a
      FROM commerce_provider_payment_attempts
     WHERE commerce_transaction_id = c.commerce_transaction_id
       AND payment_channel = 'REMOTE_TERMINAL'
       AND provider_status IN (
           'DISPATCHING',
           'DISPATCHED',
           'RECEIVED',
           'STARTED'
       )
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
        IF c.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN
            RAISE EXCEPTION 'Active remote payment attempt conflicts with transaction state'
                USING ERRCODE = '23505';
        END IF;

        RETURN QUERY
        SELECT
            true,
            c.integration_configuration_id,
            c.provider_order_id,
            c.total_minor,
            c.currency_code,
            a.provider_business_id,
            a.provider_store_id,
            a.provider_device_id,
            a.provider_reference_id;
        RETURN;
    END IF;

    IF f.fulfillment_id IS NOT NULL AND counter_order_collection_payment(
      c.organization_id,c.store_id,c.customer_user_id,c.commerce_transaction_id,
          'PAY_AT_COUNTER') IS DISTINCT FROM 'PAYMENT_REQUIRED'
      THEN RAISE EXCEPTION 'Order payment requires reconciliation' USING ERRCODE='23505'; END IF;

    IF c.status IS DISTINCT FROM 'ORDER_CREATED'
       OR c.integration_configuration_id IS NULL
       OR NULLIF(btrim(c.provider_order_id), '') IS NULL
       OR c.total_minor IS NULL
       OR c.total_minor <= 0
       OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Counter redemption Commerce transaction is not ready for remote payment'
            USING ERRCODE = '23505';
    END IF;

    SELECT
        b.poynt_business_id,
        b.poynt_store_id,
        b.poynt_terminal_id
      INTO
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
      FROM poynt_terminal_bindings b
      JOIN pos_devices d
        ON d.pos_device_id = b.pos_device_id
     WHERE b.pos_device_id = p_pos_device_id
       AND b.organization_id = c.organization_id
       AND b.store_id IS NOT DISTINCT FROM c.store_id
       AND NOT b.is_deleted
       AND NOT d.is_deleted
       AND d.revoked_at IS NULL;

    IF NOT FOUND
       OR NULLIF(btrim(a.provider_business_id), '') IS NULL
       OR NULLIF(btrim(a.provider_device_id), '') IS NULL THEN
        RAISE EXCEPTION 'Registered Poynt terminal is unavailable'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,
        commerce_transaction_id,
        provider_status,
        amount_minor,
        currency_code,
        created_by,
        payment_channel,
        provider_reference_id,
        target_pos_device_id,
        provider_business_id,
        provider_store_id,
        provider_device_id
    ) VALUES (
        generate_runtime_id('CPA'),
        c.commerce_transaction_id,
        'DISPATCHING',
        c.total_minor,
        c.currency_code,
        v_actor,
        'REMOTE_TERMINAL',
        p_reference_id,
        p_pos_device_id,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id
    );

    UPDATE commerce_transactions
       SET status = 'PROVIDER_IN_PROGRESS',
           failure_code = NULL,
           failure_message = NULL,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_transaction_id = c.commerce_transaction_id;

    RETURN QUERY
    SELECT
        false,
        c.integration_configuration_id,
        c.provider_order_id,
        c.total_minor,
        c.currency_code,
        a.provider_business_id,
        a.provider_store_id,
        a.provider_device_id,
        p_reference_id;
END;
$function$;



-- ==========================================================================
-- POYNT — Payment completion by reference
-- Canonical PostgreSQL function: commerce_finalize_counter_payment_by_reference
-- ==========================================================================

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_finalize_counter_payment_by_reference(
    p_reference_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    a commerce_provider_payment_attempts%ROWTYPE;
    c commerce_transactions%ROWTYPE;
    v_actor_user_id varchar(64);
BEGIN
    SELECT *
      INTO a
      FROM commerce_provider_payment_attempts
     WHERE provider_reference_id = p_reference_id
       AND payment_channel = 'REMOTE_TERMINAL'
     ORDER BY created_at DESC
     LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT *
      INTO c
      FROM commerce_transactions
     WHERE commerce_transaction_id = a.commerce_transaction_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO a FROM commerce_provider_payment_attempts
      WHERE commerce_provider_payment_attempt_id=a.commerce_provider_payment_attempt_id FOR UPDATE;
    IF c.source_channel='CUSTOMER_FULFILLMENT' THEN
      IF a.provider_status='SUCCEEDED' AND a.provider_transaction_id=c.provider_transaction_id
        AND EXISTS (SELECT 1 FROM fulfillments f JOIN statuses s ON s.status_id=f.payment_timing_status_id
          WHERE f.commerce_transaction_id=c.commerce_transaction_id AND s.status_code='PAY_AT_COUNTER')
      THEN RETURN c.commerce_transaction_id; END IF;
      RETURN NULL;
    END IF;
    IF c.source_channel = 'COUNTER_REDEMPTION' THEN
        IF a.provider_status <> 'SUCCEEDED' THEN
            RETURN NULL;
        END IF;

        SELECT ou.user_id
          INTO v_actor_user_id
          FROM organization_user ou
         WHERE ou.organization_user_id =
               COALESCE(c.updated_by, c.created_by)
           AND ou.organization_id = c.organization_id
           AND NOT ou.is_deleted
         LIMIT 1;

        IF v_actor_user_id IS NULL THEN
            RAISE EXCEPTION 'Counter redemption actor is unavailable'
                USING ERRCODE = '42501';
        END IF;

        PERFORM commerce_finalize_counter_redemption_transaction(
            c.commerce_transaction_id,
            v_actor_user_id
        );

        RETURN c.commerce_transaction_id;
    END IF;

    IF c.source_channel = 'COUNTER' THEN
        RETURN commerce_finalize_counter_membership_payment_by_reference(
            p_reference_id
        );
    END IF;

    RETURN NULL;
END;
$function$;




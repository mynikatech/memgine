-- Migration 314: narrowly authorize collection verification of a recorded CASH recovery
-- while retaining historical terminal attempts and all original payment guards.
-- Replaces only the function; no payment or order rows are modified.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_order_collection_payment(
    p_org varchar,p_store varchar,p_customer varchar,p_commerce varchar,p_timing varchar
) RETURNS varchar LANGUAGE plpgsql STABLE SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE c commerce_transactions%ROWTYPE; v_capture_count bigint; v_terminal_count bigint; v_cash_override varchar;
BEGIN
    SELECT * INTO c FROM commerce_transactions
    WHERE commerce_transaction_id=p_commerce AND organization_id=p_org AND store_id=p_store
      AND customer_user_id=p_customer AND source_channel IN ('CUSTOMER_FULFILLMENT','COUNTER_REDEMPTION')
          AND NOT is_deleted;
    IF NOT FOUND OR c.total_minor IS NULL OR c.total_minor<0 OR c.currency_code IS NULL
       OR c.currency_code !~ '^[A-Z]{3}$' OR c.subtotal_minor IS NULL OR c.adjustment_total_minor IS NULL
       OR c.tax_total_minor IS NULL OR c.adjustment_total_minor NOT BETWEEN 0 AND c.subtotal_minor
       OR c.tax_total_minor<0 OR c.total_minor IS DISTINCT FROM c.subtotal_minor-c.adjustment_total_minor+c.tax_total_minor
       OR p_timing IS NULL OR p_timing NOT IN ('PAY_NOW','PAY_AT_COUNTER') THEN
        RETURN 'PAYMENT_UNRESOLVED';
    END IF;
    IF EXISTS (
      SELECT 1 FROM poynt_collect_financial_exceptions e
      WHERE (e.commerce_transaction_id=p_commerce OR EXISTS (
        SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce
          AND i.payment_intent_id IN (e.payment_intent_id,e.related_payment_intent_id)))
        AND e.case_status NOT IN ('RESOLVED','CLOSED')
    ) OR EXISTS (
      SELECT 1 FROM commerce_counter_timeout_recoveries r
      WHERE r.commerce_transaction_id=p_commerce AND r.late_capture_seen
    ) THEN RETURN 'FINANCIAL_EXCEPTION'; END IF;
    IF EXISTS (
      SELECT 1 FROM payment_refunds r
      WHERE (r.commerce_transaction_id=p_commerce OR r.payment_intent_id IN
        (SELECT i.payment_intent_id FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce))
        AND (r.approval_status IS DISTINCT FROM 'REJECTED' OR r.execution_status = 'SUCCEEDED')
    ) THEN RETURN 'REFUND_CONFLICT'; END IF;
    SELECT r.terminal_payment_attempt_id INTO v_cash_override FROM commerce_counter_timeout_recoveries r
      WHERE r.commerce_transaction_id=p_commerce AND r.action='CASH' AND r.confirmed_no_success
          AND NOT r.late_capture_seen;
    IF p_timing='PAY_AT_COUNTER' AND c.currency_code='CAD' AND c.status='ORDER_CREATED' AND c.total_minor>0
      AND c.provider_transaction_id IS NULL AND v_cash_override IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce)
      AND NOT EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND (a.provider_status='SUCCEEDED' OR a.payment_channel='CASH'
          OR (a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED','DECLINED')
            AND a.commerce_provider_payment_attempt_id<>v_cash_override)))
      THEN RETURN 'CASH_RECOVERY_READY'; END IF;
    IF p_timing='PAY_AT_COUNTER' AND c.currency_code='CAD' AND c.total_minor>0 AND c.status='PROVIDER_IN_PROGRESS'
      AND c.provider_transaction_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce)
      AND (SELECT count(*) FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND a.provider_status NOT IN ('FAILED','CANCELLED','CANCELED','DECLINED')
        AND (a.commerce_provider_payment_attempt_id IS DISTINCT FROM v_cash_override
            OR a.provider_status='SUCCEEDED'))=1
      AND EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=p_commerce
        AND a.payment_channel='CASH' AND a.provider_status='PENDING' AND a.amount_minor=c.total_minor
        AND a.currency_code=c.currency_code AND a.provider_reference_id='cash:'||p_commerce)
      THEN RETURN 'CASH_CONFIRMATION_REQUIRED'; END IF;
    -- A terminal attempt may remain DISPATCHED for audit and late-capture detection
    -- after an independently authorized CASH recovery. Exclude ONLY that exact
    -- recovered terminal attempt from the unresolved-attempt test.
    -- All other unresolved attempts, successful terminal attempts, financial
    -- exceptions, late captures and refund conflicts retain their existing guards.
    IF c.status IN ('DRAFT','PROVIDER_IN_PROGRESS','PROVIDER_FAILED','CANCELLED') OR EXISTS (
      SELECT 1 FROM payment_intents i WHERE i.commerce_transaction_id=p_commerce AND (
        i.status IN ('PENDING','PROCESSING') OR EXISTS (
          SELECT 1 FROM payment_attempts pa WHERE pa.payment_intent_id=i.payment_intent_id
              AND pa.status IN ('PENDING','PROCESSING')
        ))
    ) OR EXISTS (
      SELECT 1 FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=p_commerce
        AND a.provider_status NOT IN ('SUCCEEDED','FAILED','CANCELLED','CANCELED','DECLINED')
        AND NOT (
          p_timing='PAY_AT_COUNTER'
          AND a.payment_channel='REMOTE_TERMINAL'
          AND a.commerce_provider_payment_attempt_id=v_cash_override
          AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED')
          -- Require an explicit CASH override for this precise terminal attempt.
          AND EXISTS (
            SELECT 1 FROM commerce_counter_timeout_recoveries r
            WHERE r.commerce_transaction_id=p_commerce
              AND r.action='CASH'
              AND r.confirmed_no_success=true
              AND r.late_capture_seen=false
              AND r.terminal_payment_attempt_id=a.commerce_provider_payment_attempt_id
          )
          -- Exactly one succeeded attempt, and it must be the matching CASH payment.
          AND (SELECT count(*) FROM commerce_provider_payment_attempts paid
               WHERE paid.commerce_transaction_id=p_commerce
                 AND paid.provider_status='SUCCEEDED')=1
          AND EXISTS (
            SELECT 1 FROM commerce_provider_payment_attempts cash
            WHERE cash.commerce_transaction_id=p_commerce
              AND cash.payment_channel='CASH'
              AND cash.provider_status='SUCCEEDED'
              AND cash.amount_minor=c.total_minor
              AND cash.currency_code=c.currency_code
              AND cash.provider_transaction_id=c.provider_transaction_id
              AND nullif(btrim(cash.provider_transaction_id),'') IS NOT NULL
          )
        )
    ) THEN RETURN 'PAYMENT_UNRESOLVED'; END IF;
    SELECT count(*) INTO v_capture_count FROM payment_intents i
    LEFT JOIN poynt_collect_verified_captures v USING(payment_intent_id)
    WHERE i.commerce_transaction_id=p_commerce AND (i.status='SUCCEEDED' OR v.payment_intent_id IS NOT NULL);
    SELECT count(*) INTO v_terminal_count FROM commerce_provider_payment_attempts a
    WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED';
    IF c.total_minor=0 THEN
      IF v_capture_count=0 AND v_terminal_count=0 AND c.provider_transaction_id IS NULL
         AND (c.status IN ('ORDER_CREATED','COMPLETED') OR
           (c.source_channel='COUNTER_REDEMPTION'
               AND c.status='PROVIDER_SUCCEEDED')) THEN RETURN 'NO_PAYMENT_REQUIRED'; END IF;
    ELSIF p_timing='PAY_NOW' AND v_capture_count=1
      AND (v_terminal_count=0 OR (v_terminal_count=1 AND EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
        WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED'
          AND a.payment_channel='LEGACY_PAYMENT_INTENT' AND a.amount_minor=c.total_minor
              AND a.currency_code=c.currency_code
          AND coalesce(a.provider_transaction_id,a.provider_reference_id)=c.provider_transaction_id
      )))
      AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED') AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
        WHERE i.commerce_transaction_id=p_commerce AND i.organization_id=p_org AND i.store_id=p_store
          AND i.customer_user_id=p_customer AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
          AND i.currency_code=c.currency_code AND i.amount*100=c.total_minor
          AND v.organization_id=p_org AND v.amount_minor=c.total_minor AND v.currency_code=c.currency_code
          AND v.provider_transaction_id=c.provider_transaction_id
              AND v.provider_transaction_id=i.provider_reference_id
          AND nullif(btrim(v.provider_transaction_id),'') IS NOT NULL
          AND nullif(btrim(v.merchant_business_id),'')=i.fulfillment_checkout->>'paymentBusinessId'
          AND nullif(btrim(v.merchant_store_id),'')=i.fulfillment_checkout->>'paymentStoreId'
          AND (SELECT count(*) FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
              AND a.status='SUCCEEDED')=1
          AND EXISTS (SELECT 1 FROM payment_attempts a WHERE a.payment_intent_id=i.payment_intent_id
            AND a.status='SUCCEEDED' AND a.amount*100=c.total_minor AND a.currency_code=c.currency_code
            AND a.provider_reference_id=v.provider_transaction_id)
      ) THEN RETURN 'VERIFIED_ONLINE';
    ELSIF p_timing='PAY_AT_COUNTER' AND v_capture_count=0 THEN
      IF v_terminal_count=0 AND c.status='ORDER_CREATED' AND c.provider_transaction_id IS NULL THEN
        RETURN 'PAYMENT_REQUIRED';
      END IF;
      IF v_terminal_count=1 AND c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED') AND EXISTS (
        SELECT 1 FROM commerce_provider_payment_attempts a
        WHERE a.commerce_transaction_id=p_commerce AND a.provider_status='SUCCEEDED'
          AND a.amount_minor=c.total_minor AND a.currency_code=c.currency_code
          AND a.provider_transaction_id=c.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),
              '') IS NOT NULL
          AND (a.payment_channel='CASH' OR (a.payment_channel='REMOTE_TERMINAL'
            AND nullif(btrim(a.provider_business_id),'') IS NOT NULL AND nullif(btrim(a.provider_device_id),
                '') IS NOT NULL))
      ) THEN RETURN 'VERIFIED_AT_COUNTER'; END IF;
    END IF;
    RETURN 'PAYMENT_UNRESOLVED';
END;
$body$;

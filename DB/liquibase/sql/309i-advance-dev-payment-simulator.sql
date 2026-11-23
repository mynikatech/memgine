-- 309I: DEV-only advance-order simulated terminal attempt initializer.
-- IMPORTANT: Deploy this changeSet to LOCAL/DEV only; never deploy it to PROD.
-- The calling Kotlin endpoint separately enforces MEMGINE_ENVIRONMENT=dev and
-- MEMGINE_ENABLE_POYNT_SIMULATOR=true before invoking this function.
-- No real Poynt HTTP order or terminal dispatch occurs.
-- Real callback normalization, success evidence and recovery remain authoritative.

CREATE FUNCTION "${schemaName}".commerce_begin_dev_advance_terminal_simulation(
    p_org varchar, p_store varchar, p_staff varchar, p_actor varchar,
    p_order varchar, p_redemption varchar, p_version integer, p_reference varchar
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
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $body$
DECLARE
    f fulfillments%ROWTYPE;
    c commerce_transactions%ROWTYPE;
    v_actor varchar;
    v_now timestamp := clock_timestamp() AT TIME ZONE 'UTC';
    v_business varchar := 'DEV_SIM_BUSINESS';
    v_store_provider varchar := 'DEV_SIM_STORE';
    v_device varchar := 'DEV_SIM_DEVICE';
BEGIN
    IF p_org IS NULL OR p_store IS NULL OR p_staff IS NULL OR p_actor IS NULL
       OR p_order IS NULL OR p_redemption IS NULL OR p_version IS NULL
       OR p_reference IS NULL OR p_reference !~ '^RDP-[0-9a-fA-F-]{36}$'
    THEN RAISE EXCEPTION 'Invalid simulated payment request' USING ERRCODE='22023'; END IF;

    IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN
        RAISE EXCEPTION 'Counter access denied' USING ERRCODE='42501';
    END IF;

    -- Shared lock ordering: fulfillment, then Commerce, then attempt/financial evidence.
    SELECT f0.* INTO f FROM fulfillments f0
      JOIN statuses k ON k.status_id=f0.fulfillment_type_status_id AND k.status_code='ORDER'
      JOIN statuses t ON t.status_id=f0.request_timing_status_id AND t.status_code='ADVANCE'
      JOIN statuses p ON p.status_id=f0.payment_timing_status_id AND p.status_code='PAY_AT_COUNTER'
      JOIN statuses s ON s.status_id=f0.fulfillment_status_id AND s.status_code IN ('PLACED','PREPARING','READY')
     WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.store_id=p_store
       AND f0.redemption_transaction_id=p_redemption
       AND f0.cancelled_at IS NULL AND f0.fulfilled_at IS NULL
       AND f0.cancellation_requested_at IS NULL
     FOR UPDATE OF f0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Advance order unavailable' USING ERRCODE='23505'; END IF;
    IF f.version_no IS DISTINCT FROM p_version THEN
        RAISE EXCEPTION 'Order changed; refresh before simulated payment' USING ERRCODE='40001';
    END IF;

    -- Mirror the real advance-payment verification requirement.
    IF NOT EXISTS (
        SELECT 1 FROM fulfillment_actions a JOIN statuses s ON s.status_id=a.action_type_status_id
         WHERE a.fulfillment_id=p_order AND s.status_code='COLLECTION_AUTHORIZED'
           AND a.action_details->>'storeId'=p_store
           AND a.action_details->>'customerId'=f.customer_user_id
           AND a.action_at + interval '15 minutes' > v_now
           AND counter_order_operator(p_org,p_store,(a.action_details->>'staffId')::varchar,a.actor_user_id) IS NOT NULL
    ) THEN RAISE EXCEPTION 'Verify customer before simulated payment' USING ERRCODE='23505'; END IF;

    SELECT c0.* INTO c FROM commerce_transactions c0
     WHERE c0.commerce_transaction_id=f.commerce_transaction_id
       AND c0.organization_id=p_org AND c0.store_id=p_store
       AND c0.customer_user_id=f.customer_user_id
       AND c0.source_channel='CUSTOMER_FULFILLMENT'
       AND c0.status='ORDER_CREATED' AND NOT c0.is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Commerce order unavailable for payment' USING ERRCODE='23505'; END IF;

    IF c.integration_configuration_id IS NULL
       OR c.currency_code IS DISTINCT FROM 'CAD' OR c.total_minor IS NULL OR c.total_minor<=0
       OR c.subtotal_minor IS NULL OR c.adjustment_total_minor IS NULL OR c.tax_total_minor IS NULL
       OR c.total_minor <> c.subtotal_minor-c.adjustment_total_minor+c.tax_total_minor
       OR f.total_minor IS DISTINCT FROM c.total_minor
       OR f.currency_code IS DISTINCT FROM c.currency_code
       OR f.effective_policy_snapshot->>'counterPaymentProvider' IS DISTINCT FROM 'POYNT'
       OR f.effective_policy_snapshot->>'counterPaymentIntegrationId' IS DISTINCT FROM c.integration_configuration_id
    THEN RAISE EXCEPTION 'Accepted advance pricing or Poynt configuration unavailable' USING ERRCODE='23505'; END IF;

    IF counter_order_collection_payment(p_org,p_store,f.customer_user_id,c.commerce_transaction_id,'PAY_AT_COUNTER')
           IS DISTINCT FROM 'PAYMENT_REQUIRED'
       OR EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a
                   WHERE a.commerce_transaction_id=c.commerce_transaction_id
                     AND a.provider_status IN ('PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED','SUCCEEDED'))
       OR EXISTS (SELECT 1 FROM poynt_collect_financial_exceptions e
                   WHERE e.commerce_transaction_id=c.commerce_transaction_id
                     AND (e.provider_outcome='CAPTURED' OR e.case_status NOT IN ('RESOLVED','CLOSED')))
       OR EXISTS (SELECT 1 FROM payment_refunds pr
                   WHERE (pr.commerce_transaction_id=c.commerce_transaction_id
                      OR pr.payment_intent_id IN (SELECT i.payment_intent_id FROM payment_intents i
                                      WHERE i.commerce_transaction_id=c.commerce_transaction_id))
                     AND pr.approval_status<>'REJECTED')
       OR EXISTS (SELECT 1 FROM fulfillment_actions fa JOIN customer_support_requests sr
                      ON sr.support_request_id=fa.support_reference_id
                   WHERE fa.fulfillment_id=f.fulfillment_id AND sr.status NOT IN ('RESOLVED','CLOSED'))
    THEN RAISE EXCEPTION 'Existing payment or Support evidence requires reconciliation' USING ERRCODE='23505'; END IF;

    IF EXISTS (SELECT 1 FROM commerce_provider_payment_attempts a WHERE a.provider_reference_id=p_reference) THEN
        RAISE EXCEPTION 'Payment attempt reference already exists' USING ERRCODE='23505';
    END IF;

    v_actor := commerce_counter_checkout_actor_organization_user(c.commerce_transaction_id,p_actor);
    -- Synthetic context is used only to correlate an internal DEV callback.
    -- The original provider_order_id and all accepted financial lines are untouched.
    INSERT INTO commerce_provider_payment_attempts(
        commerce_provider_payment_attempt_id,commerce_transaction_id,provider_status,
        amount_minor,currency_code,created_by,payment_channel,provider_reference_id,
        target_pos_device_id,provider_business_id,provider_store_id,provider_device_id
    ) VALUES (
        generate_runtime_id('CPA'),c.commerce_transaction_id,'DISPATCHING',
        c.total_minor,c.currency_code,v_actor,'REMOTE_TERMINAL',p_reference,
        NULL,v_business,v_store_provider,v_device
    );

    UPDATE commerce_transactions SET status='PROVIDER_IN_PROGRESS',failure_code=NULL,failure_message=NULL,
         updated_at=v_now,updated_by=v_actor,version_no=version_no+1
     WHERE commerce_transaction_id=c.commerce_transaction_id;

    RETURN QUERY SELECT false,c.integration_configuration_id,
        coalesce(c.provider_order_id,'DEV-SIM-'||c.commerce_transaction_id)::varchar,
        c.total_minor,c.currency_code,v_business,v_store_provider,v_device,p_reference;
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_begin_dev_advance_terminal_simulation(
    varchar,varchar,varchar,varchar,varchar,varchar,integer,varchar
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_begin_dev_advance_terminal_simulation(
    varchar,varchar,varchar,varchar,varchar,varchar,integer,varchar
) TO "${appRole}";

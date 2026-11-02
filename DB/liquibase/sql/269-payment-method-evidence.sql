-- W269: Persist the checkout method per payment intent before attempting a charge.
-- Existing signed receipt snapshots are deliberately untouched.
ALTER TABLE "${schemaName}".payment_intents
  ADD COLUMN IF NOT EXISTS checkout_payment_method varchar(16);

ALTER TABLE "${schemaName}".payment_intents
  ADD CONSTRAINT ck_payment_intents_checkout_payment_method
  CHECK (checkout_payment_method IS NULL OR checkout_payment_method IN ('CARD','APPLE_PAY','GOOGLE_PAY','CASH'));

-- Record the method from the authorized, claimed Collect payment attempt.
-- All writes remain inside PostgreSQL functions, not Kotlin/JDBI SQL updates.
CREATE OR REPLACE FUNCTION "${schemaName}".payment_record_checkout_method(
    p_intent_id varchar,
    p_organization_id varchar,
    p_actor_user_id varchar,
    p_method varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_rows integer;
BEGIN
    IF p_method IS NULL OR p_method NOT IN ('CARD','APPLE_PAY','GOOGLE_PAY') THEN
        RETURN false;
    END IF;

    UPDATE payment_intents pi
       SET checkout_payment_method = p_method
      FROM payment_provider_configs pc
     WHERE pi.payment_intent_id = p_intent_id
       AND pi.organization_id = p_organization_id
       AND pi.payment_provider_config_id = pc.payment_provider_config_id
       AND pc.provider_code = 'POYNT_COLLECT'
       AND pi.status = 'PROCESSING'
       AND payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)
       AND (pi.checkout_payment_method IS NULL OR pi.checkout_payment_method = p_method);

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows = 1;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".payment_record_checkout_method(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_record_checkout_method(varchar,varchar,varchar,varchar) TO "${appRole}";

-- New payment-intent receipts use the chosen method, not the provider code.
-- Retain the complete V2 snapshot generation contract and immutable insert behaviour.
CREATE OR REPLACE FUNCTION "${schemaName}".issue_payment_intent_receipt(p_payment_intent_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE p payment_intents%ROWTYPE; v_id varchar(64); v_number varchar(96); v_method varchar(64);
BEGIN
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id=p_payment_intent_id FOR UPDATE;
 IF NOT FOUND OR p.status <> 'SUCCEEDED' OR p.finalized_subscription_id IS NULL THEN RETURN NULL; END IF;
 SELECT transaction_receipt_id INTO v_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id;
 IF FOUND THEN RETURN v_id; END IF;
 v_id := 'RCP_' || replace(gen_random_uuid()::text, '-', '');
 v_number := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,16));
 SELECT COALESCE(p.checkout_payment_method,
     CASE WHEN pc.provider_code='CASH' THEN 'CASH'
          WHEN pc.provider_code='POYNT_COLLECT' THEN 'CARD'
          ELSE pc.provider_code END)
 INTO v_method FROM payment_provider_configs pc WHERE pc.payment_provider_config_id=p.payment_provider_config_id;
 INSERT INTO transaction_receipts(transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,
   source_transaction_id,source_payment_intent_id,currency_code,subtotal_minor,total_minor,payment_method,provider_reference,receipt_snapshot)
 SELECT v_id,v_number,p.organization_id,p.store_id,p.customer_user_id,'MEMBERSHIP_PURCHASE',p.payment_intent_id,p.payment_intent_id,p.currency_code,
   round(p.amount*100)::bigint,round(p.amount*100)::bigint,v_method,p.provider_reference_id,
   jsonb_build_object('schemaVersion',2,'receiptNumber',v_number,'orderNumber',v_number,'issuedAt',CURRENT_TIMESTAMP,
    'organization',jsonb_build_object('id',o.organization_id,'name',o.organization_name),
    'transaction',jsonb_build_object('id',p.payment_intent_id,'type','MEMBERSHIP_PURCHASE','subscriptionId',p.finalized_subscription_id),
    'payment',jsonb_build_object('method',v_method,'completed',true,'reference',p.provider_reference_id),
    'lines','[]'::jsonb,'discounts','[]'::jsonb,
    'totals',jsonb_build_object('subtotalMinor',round(p.amount*100)::bigint,'discountMinor',0,'taxMinor',0,'totalMinor',round(p.amount*100)::bigint,'currency',p.currency_code))
 FROM organization o WHERE o.organization_id=p.organization_id
 ON CONFLICT (source_payment_intent_id) WHERE source_payment_intent_id IS NOT NULL DO NOTHING;
 RETURN COALESCE((SELECT transaction_receipt_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id),v_id);
END;
$function$;

-- Commerce transaction receipts should resolve method from the succeeded intent
-- correlated via the successful provider transaction reference, where possible.
CREATE OR REPLACE FUNCTION "${schemaName}".receipt_successful_payment_facts(
    p_commerce_transaction_id varchar, p_total_minor bigint
)
RETURNS TABLE(payment_method varchar, customer_reference varchar)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
  SELECT (CASE
    WHEN COALESCE(p_total_minor,0) = 0 THEN 'NO_PAYMENT'
    WHEN a.payment_channel='CASH' THEN 'CASH'
    WHEN p.checkout_payment_method IS NOT NULL THEN p.checkout_payment_method
    WHEN a.payment_channel='REMOTE_TERMINAL' THEN 'CARD'
    WHEN a.payment_channel='LEGACY_PAYMENT_INTENT' AND pc.provider_code='POYNT_COLLECT' THEN 'CARD'
    WHEN a.payment_channel='LEGACY_PAYMENT_INTENT' THEN COALESCE(pc.provider_code,'CARD')
    ELSE COALESCE(NULLIF(btrim(a.payment_channel),''),'CARD')
  END)::varchar,
  NULLIF(btrim(COALESCE(a.provider_transaction_id,a.provider_reference_id)),'')::varchar
  FROM commerce_provider_payment_attempts a
  JOIN commerce_transactions ct ON ct.commerce_transaction_id=a.commerce_transaction_id
  LEFT JOIN payment_intents p ON p.organization_id=ct.organization_id
    AND p.status='SUCCEEDED'
    AND p.provider_reference_id = COALESCE(a.provider_transaction_id,a.provider_reference_id)
  LEFT JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
  WHERE a.commerce_transaction_id=p_commerce_transaction_id AND a.provider_status='SUCCEEDED'
  ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".issue_payment_intent_receipt(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".issue_payment_intent_receipt(varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".receipt_successful_payment_facts(varchar,bigint) FROM PUBLIC;

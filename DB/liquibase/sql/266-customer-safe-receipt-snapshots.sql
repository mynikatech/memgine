-- W265 follow-up.  Never mutate an existing receipt; enrich only snapshots
-- issued after this migration with customer-safe labels and verified payment facts.

CREATE OR REPLACE FUNCTION "${schemaName}".receipt_successful_payment_facts(
    p_commerce_transaction_id varchar,
    p_total_minor bigint
)
RETURNS TABLE(payment_method varchar, customer_reference varchar)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT CASE
             WHEN COALESCE(p_total_minor, 0) = 0 THEN 'NO_PAYMENT'
             WHEN a.payment_channel = 'CASH' THEN 'CASH'
             WHEN a.payment_channel = 'REMOTE_TERMINAL' THEN 'POYNT_TERMINAL'
             WHEN a.payment_channel = 'LEGACY_PAYMENT_INTENT' THEN 'CONFIGURED_PROVIDER'
             ELSE COALESCE(NULLIF(btrim(a.payment_channel), ''), 'VERIFIED_PROVIDER')
           END::varchar,
           NULLIF(btrim(COALESCE(a.provider_transaction_id, a.provider_reference_id)), '')::varchar
      FROM commerce_provider_payment_attempts a
     WHERE a.commerce_transaction_id = p_commerce_transaction_id
       AND a.provider_status = 'SUCCEEDED'
     ORDER BY a.created_at DESC, a.commerce_provider_payment_attempt_id DESC
     LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".issue_commerce_transaction_receipt(
    p_commerce_transaction_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    t commerce_transactions%ROWTYPE;
    v_receipt_id varchar(64);
    v_receipt_number varchar(96);
    v_order_number varchar(96);
    v_kind varchar(32);
    v_method varchar(64);
    v_reference varchar(160);
    v_snapshot jsonb;
BEGIN
    SELECT * INTO t FROM commerce_transactions
      WHERE commerce_transaction_id = p_commerce_transaction_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND OR t.status <> 'COMPLETED' THEN RETURN NULL; END IF;
    SELECT transaction_receipt_id INTO v_receipt_id FROM transaction_receipts
      WHERE source_commerce_transaction_id = t.commerce_transaction_id;
    IF FOUND THEN RETURN v_receipt_id; END IF;

    v_receipt_id := 'RCP_' || replace(gen_random_uuid()::text, '-', '');
    v_receipt_number := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
    SELECT r.redemption_transaction_number INTO v_order_number
      FROM commerce_transaction_redemptions x JOIN redemption_transaction r ON r.redemption_transaction_id=x.redemption_transaction_id
     WHERE x.commerce_transaction_id=t.commerce_transaction_id AND NOT x.is_deleted
     ORDER BY x.created_at, x.commerce_transaction_redemption_id LIMIT 1;
    v_order_number := COALESCE(v_order_number, v_receipt_number);
    SELECT payment_method, customer_reference INTO v_method, v_reference
      FROM receipt_successful_payment_facts(t.commerce_transaction_id, t.total_minor);
    v_method := COALESCE(v_method, CASE WHEN COALESCE(t.total_minor,0)=0 THEN 'NO_PAYMENT' ELSE 'PAYMENT_METHOD_NOT_RECORDED' END);
    v_kind := CASE WHEN v_order_number <> v_receipt_number THEN 'COUNTER_REDEMPTION' ELSE 'MEMBERSHIP_PURCHASE' END;

    SELECT jsonb_build_object(
      'schemaVersion', 2, 'receiptNumber', v_receipt_number, 'orderNumber', v_order_number,
      'issuedAt', COALESCE(t.completed_at, CURRENT_TIMESTAMP),
      'organization', jsonb_build_object('id',o.organization_id,'name',o.organization_name),
      'store', CASE WHEN s.store_id IS NULL THEN NULL ELSE jsonb_build_object('id',s.store_id,'name',s.store_name,'timezone',s.timezone) END,
      'transaction', jsonb_build_object('id',t.commerce_transaction_id,'type',v_kind),
      'payment', jsonb_build_object('method',v_method,'completed',true,'reference',v_reference),
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('description',l.description,'quantity',l.quantity,
          'unitPriceMinor',COALESCE(l.unit_price_minor_authoritative,l.unit_price_minor_snapshot,0),
          'subtotalMinor',COALESCE(l.line_subtotal_minor,0),'currency',l.currency_code)
          ORDER BY l.created_at,l.commerce_transaction_line_id)
        FROM commerce_transaction_lines l WHERE l.commerce_transaction_id=t.commerce_transaction_id AND NOT l.is_deleted),'[]'::jsonb),
      'discounts', COALESCE((SELECT jsonb_agg(jsonb_build_object('label',CASE
          WHEN a.source_type='BENEFIT' THEN 'Benefit discount'
          WHEN a.source_type='OFFER' THEN 'Offer discount'
          ELSE initcap(replace(lower(COALESCE(a.adjustment_type,'DISCOUNT')),'_',' ')) END,
          'amountMinor',COALESCE(a.applied_amount_minor,0),'currency',a.currency_code)
          ORDER BY a.created_at,a.commerce_transaction_adjustment_id)
        FROM commerce_transaction_adjustments a WHERE a.commerce_transaction_id=t.commerce_transaction_id AND NOT a.is_deleted),'[]'::jsonb),
      'totals',jsonb_build_object('subtotalMinor',COALESCE(t.subtotal_minor,0),'discountMinor',COALESCE(t.adjustment_total_minor,0),
          'taxMinor',COALESCE(t.tax_total_minor,0),'totalMinor',COALESCE(t.total_minor,0),'currency',t.currency_code)
    ) INTO v_snapshot FROM organization o LEFT JOIN stores s ON s.store_id=t.store_id WHERE o.organization_id=t.organization_id;

    INSERT INTO transaction_receipts(transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,
      source_transaction_id,source_commerce_transaction_id,currency_code,subtotal_minor,discount_minor,tax_minor,total_minor,payment_method,provider_reference,receipt_snapshot,issued_at)
    VALUES(v_receipt_id,v_receipt_number,t.organization_id,t.store_id,t.customer_user_id,v_kind,t.commerce_transaction_id,t.commerce_transaction_id,
      COALESCE(t.currency_code,'CAD'),COALESCE(t.subtotal_minor,0),COALESCE(t.adjustment_total_minor,0),COALESCE(t.tax_total_minor,0),COALESCE(t.total_minor,0),v_method,v_reference,v_snapshot,COALESCE(t.completed_at,CURRENT_TIMESTAMP))
    ON CONFLICT (source_commerce_transaction_id) WHERE source_commerce_transaction_id IS NOT NULL DO NOTHING;
    RETURN COALESCE((SELECT transaction_receipt_id FROM transaction_receipts WHERE source_commerce_transaction_id=t.commerce_transaction_id),v_receipt_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".issue_payment_intent_receipt(p_payment_intent_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE p payment_intents%ROWTYPE; v_id varchar(64); v_number varchar(96);
BEGIN
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id=p_payment_intent_id FOR UPDATE;
 IF NOT FOUND OR p.status <> 'SUCCEEDED' OR p.finalized_subscription_id IS NULL THEN RETURN NULL; END IF;
 SELECT transaction_receipt_id INTO v_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id; IF FOUND THEN RETURN v_id; END IF;
 v_id := 'RCP_' || replace(gen_random_uuid()::text, '-', ''); v_number := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,16));
 INSERT INTO transaction_receipts(transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,source_transaction_id,source_payment_intent_id,currency_code,subtotal_minor,total_minor,payment_method,provider_reference,receipt_snapshot)
 SELECT v_id,v_number,p.organization_id,p.store_id,p.customer_user_id,'MEMBERSHIP_PURCHASE',p.payment_intent_id,p.payment_intent_id,p.currency_code,
   round(p.amount*100)::bigint,round(p.amount*100)::bigint,pc.provider_code,p.provider_reference_id,
   jsonb_build_object('schemaVersion',2,'receiptNumber',v_number,'orderNumber',v_number,'issuedAt',CURRENT_TIMESTAMP,
    'organization',jsonb_build_object('id',o.organization_id,'name',o.organization_name),
    'transaction',jsonb_build_object('id',p.payment_intent_id,'type','MEMBERSHIP_PURCHASE','subscriptionId',p.finalized_subscription_id),
    'payment',jsonb_build_object('method',pc.provider_code,'completed',true,'reference',p.provider_reference_id),
    'lines','[]'::jsonb,'discounts','[]'::jsonb,
    'totals',jsonb_build_object('subtotalMinor',round(p.amount*100)::bigint,'discountMinor',0,'taxMinor',0,'totalMinor',round(p.amount*100)::bigint,'currency',p.currency_code))
 FROM organization o JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id WHERE o.organization_id=p.organization_id
 ON CONFLICT (source_payment_intent_id) WHERE source_payment_intent_id IS NOT NULL DO NOTHING;
 RETURN COALESCE((SELECT transaction_receipt_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id),v_id);
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".receipt_successful_payment_facts(varchar,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_commerce_transaction_receipt(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_payment_intent_receipt(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".issue_commerce_transaction_receipt(varchar), "${schemaName}".issue_payment_intent_receipt(varchar) TO "${appRole}";

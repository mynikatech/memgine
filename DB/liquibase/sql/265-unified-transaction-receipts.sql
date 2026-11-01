-- Immutable receipt projections.  The underlying Commerce/payment/refund rows
-- remain authoritative; a receipt captures their settled facts once and is
-- deliberately not regenerated when configuration or catalog data changes.

CREATE TABLE IF NOT EXISTS "${schemaName}".transaction_receipts (
    transaction_receipt_id varchar(64) PRIMARY KEY,
    receipt_number varchar(96) NOT NULL UNIQUE,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
    customer_user_id varchar(64) REFERENCES "${schemaName}"."user"(user_id),
    receipt_kind varchar(32) NOT NULL,
    source_transaction_id varchar(64) NOT NULL,
    source_commerce_transaction_id varchar(64) REFERENCES "${schemaName}".commerce_transactions(commerce_transaction_id),
    source_payment_intent_id varchar(64) REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    source_refund_id varchar(64) REFERENCES "${schemaName}".payment_refunds(payment_refund_id),
    original_transaction_receipt_id varchar(64) REFERENCES "${schemaName}".transaction_receipts(transaction_receipt_id),
    currency_code varchar(10) NOT NULL,
    subtotal_minor bigint NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
    discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
    tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    total_minor bigint NOT NULL,
    payment_method varchar(64),
    provider_reference varchar(160),
    receipt_snapshot jsonb NOT NULL,
    issued_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_transaction_receipts_kind CHECK (receipt_kind IN ('MEMBERSHIP_PURCHASE','COUNTER_REDEMPTION','REFUND')),
    CONSTRAINT ck_transaction_receipts_source CHECK (
        (source_commerce_transaction_id IS NOT NULL)::integer +
        (source_payment_intent_id IS NOT NULL)::integer +
        (source_refund_id IS NOT NULL)::integer = 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_receipts_commerce_source
    ON "${schemaName}".transaction_receipts(source_commerce_transaction_id)
    WHERE source_commerce_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_receipts_payment_intent_source
    ON "${schemaName}".transaction_receipts(source_payment_intent_id)
    WHERE source_payment_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_receipts_refund_source
    ON "${schemaName}".transaction_receipts(source_refund_id)
    WHERE source_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_transaction_receipts_customer_issued
    ON "${schemaName}".transaction_receipts(customer_user_id, issued_at DESC)
    WHERE customer_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_transaction_receipts_store_issued
    ON "${schemaName}".transaction_receipts(organization_id, store_id, issued_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".transaction_receipts_reject_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    RAISE EXCEPTION 'Transaction receipts are immutable' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS tr_transaction_receipts_immutable ON "${schemaName}".transaction_receipts;
CREATE TRIGGER tr_transaction_receipts_immutable
BEFORE UPDATE OR DELETE ON "${schemaName}".transaction_receipts
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".transaction_receipts_reject_mutation();

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
    v_kind varchar(32);
    v_snapshot jsonb;
BEGIN
    SELECT * INTO t FROM commerce_transactions
    WHERE commerce_transaction_id = p_commerce_transaction_id
      AND NOT is_deleted
    FOR UPDATE;
    IF NOT FOUND OR t.status <> 'COMPLETED' THEN RETURN NULL; END IF;

    SELECT transaction_receipt_id INTO v_receipt_id
    FROM transaction_receipts WHERE source_commerce_transaction_id = t.commerce_transaction_id;
    IF FOUND THEN RETURN v_receipt_id; END IF;

    v_kind := CASE WHEN t.source_channel = 'COUNTER_REDEMPTION' THEN 'COUNTER_REDEMPTION'
                   ELSE 'MEMBERSHIP_PURCHASE' END;
    SELECT jsonb_build_object(
        'schemaVersion', 1,
        'receiptNumber', 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
        'issuedAt', COALESCE(t.completed_at, CURRENT_TIMESTAMP),
        'organization', jsonb_build_object('id', o.organization_id, 'name', o.organization_name),
        'store', CASE WHEN s.store_id IS NULL THEN NULL ELSE jsonb_build_object('id', s.store_id, 'name', s.store_name) END,
        'transaction', jsonb_build_object('id', t.commerce_transaction_id, 'channel', t.source_channel,
          'providerOrderId', t.provider_order_id, 'providerTransactionId', t.provider_transaction_id),
        'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', l.commerce_transaction_line_id, 'description', l.description, 'quantity', l.quantity,
            'unitPriceMinor', COALESCE(l.unit_price_minor_authoritative,l.unit_price_minor_snapshot,0),
            'subtotalMinor', COALESCE(l.line_subtotal_minor,0), 'currency', l.currency_code)
            ORDER BY l.created_at, l.commerce_transaction_line_id)
          FROM commerce_transaction_lines l
          WHERE l.commerce_transaction_id=t.commerce_transaction_id AND NOT l.is_deleted), '[]'::jsonb),
        'adjustments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'type', a.adjustment_type, 'sourceType', a.source_type, 'sourceId', a.source_id,
            'amountMinor', COALESCE(a.applied_amount_minor,0), 'currency', a.currency_code)
            ORDER BY a.created_at, a.commerce_transaction_adjustment_id)
          FROM commerce_transaction_adjustments a
          WHERE a.commerce_transaction_id=t.commerce_transaction_id AND NOT a.is_deleted), '[]'::jsonb),
        'totals', jsonb_build_object('subtotalMinor',COALESCE(t.subtotal_minor,0),
          'discountMinor',COALESCE(t.adjustment_total_minor,0),'taxMinor',COALESCE(t.tax_total_minor,0),
          'totalMinor',COALESCE(t.total_minor,0),'currency',t.currency_code)
    ) INTO v_snapshot
    FROM organization o LEFT JOIN stores s ON s.store_id=t.store_id
    WHERE o.organization_id=t.organization_id;

    v_receipt_id := 'RCP_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO transaction_receipts(
        transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,
        source_transaction_id,source_commerce_transaction_id,currency_code,subtotal_minor,discount_minor,
        tax_minor,total_minor,payment_method,provider_reference,receipt_snapshot,issued_at
    ) VALUES (
        v_receipt_id, v_snapshot->>'receiptNumber', t.organization_id,t.store_id,t.customer_user_id,v_kind,
        t.commerce_transaction_id,t.commerce_transaction_id,COALESCE(t.currency_code,'CAD'),
        COALESCE(t.subtotal_minor,0),COALESCE(t.adjustment_total_minor,0),COALESCE(t.tax_total_minor,0),
        COALESCE(t.total_minor,0),CASE WHEN COALESCE(t.total_minor,0)=0 THEN 'BENEFIT_OR_OFFER' ELSE t.source_channel END,
        t.provider_transaction_id,v_snapshot,COALESCE(t.completed_at,CURRENT_TIMESTAMP)
    ) ON CONFLICT (source_commerce_transaction_id) WHERE source_commerce_transaction_id IS NOT NULL
      DO NOTHING RETURNING transaction_receipt_id INTO v_receipt_id;
    RETURN COALESCE(v_receipt_id, (SELECT transaction_receipt_id FROM transaction_receipts WHERE source_commerce_transaction_id=t.commerce_transaction_id));
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".transaction_receipts_on_commerce_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NEW.status = 'COMPLETED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        PERFORM issue_commerce_transaction_receipt(NEW.commerce_transaction_id);
    END IF;
    RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS tr_issue_commerce_transaction_receipt ON "${schemaName}".commerce_transactions;
CREATE TRIGGER tr_issue_commerce_transaction_receipt
AFTER INSERT OR UPDATE OF status ON "${schemaName}".commerce_transactions
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".transaction_receipts_on_commerce_completed();

CREATE OR REPLACE FUNCTION "${schemaName}".issue_payment_intent_receipt(p_payment_intent_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE p payment_intents%ROWTYPE; v_id varchar(64); v_number varchar(96);
BEGIN
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id=p_payment_intent_id FOR UPDATE;
 IF NOT FOUND OR p.status <> 'SUCCEEDED' OR p.finalized_subscription_id IS NULL THEN RETURN NULL; END IF;
 SELECT transaction_receipt_id INTO v_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id;
 IF FOUND THEN RETURN v_id; END IF;
 v_id := 'RCP_' || replace(gen_random_uuid()::text, '-', ''); v_number := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,16));
 INSERT INTO transaction_receipts(transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,
   source_transaction_id,source_payment_intent_id,currency_code,subtotal_minor,total_minor,payment_method,provider_reference,receipt_snapshot)
 SELECT v_id,v_number,p.organization_id,p.store_id,p.customer_user_id,'MEMBERSHIP_PURCHASE',p.payment_intent_id,p.payment_intent_id,
   p.currency_code,round(p.amount*100)::bigint,round(p.amount*100)::bigint,pc.provider_code,p.provider_reference_id,
   jsonb_build_object('schemaVersion',1,'receiptNumber',v_number,'issuedAt',CURRENT_TIMESTAMP,
     'organization',jsonb_build_object('id',o.organization_id,'name',o.organization_name),
     'transaction',jsonb_build_object('id',p.payment_intent_id,'subscriptionId',p.finalized_subscription_id),
     'totals',jsonb_build_object('subtotalMinor',round(p.amount*100)::bigint,'discountMinor',0,'taxMinor',0,'totalMinor',round(p.amount*100)::bigint,'currency',p.currency_code))
 FROM organization o JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
 WHERE o.organization_id=p.organization_id
 ON CONFLICT (source_payment_intent_id) WHERE source_payment_intent_id IS NOT NULL DO NOTHING;
 RETURN COALESCE((SELECT transaction_receipt_id FROM transaction_receipts WHERE source_payment_intent_id=p.payment_intent_id),v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".transaction_receipts_on_payment_finalized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
 IF NEW.status='SUCCEEDED' AND NEW.finalized_subscription_id IS NOT NULL
   AND (TG_OP='INSERT' OR OLD.finalized_subscription_id IS DISTINCT FROM NEW.finalized_subscription_id) THEN
   PERFORM issue_payment_intent_receipt(NEW.payment_intent_id);
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS tr_issue_payment_intent_receipt ON "${schemaName}".payment_intents;
CREATE TRIGGER tr_issue_payment_intent_receipt
AFTER INSERT OR UPDATE OF status, finalized_subscription_id ON "${schemaName}".payment_intents
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".transaction_receipts_on_payment_finalized();

CREATE OR REPLACE FUNCTION "${schemaName}".issue_refund_receipt(p_refund_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE r payment_refunds%ROWTYPE; v_id varchar(64); v_number varchar(96); v_original varchar(64);
BEGIN
 SELECT * INTO r FROM payment_refunds WHERE payment_refund_id=p_refund_id FOR UPDATE;
 IF NOT FOUND OR r.execution_status <> 'SUCCEEDED' THEN RETURN NULL; END IF;
 SELECT transaction_receipt_id INTO v_id FROM transaction_receipts WHERE source_refund_id=r.payment_refund_id; IF FOUND THEN RETURN v_id; END IF;
 SELECT transaction_receipt_id INTO v_original FROM transaction_receipts
 WHERE source_commerce_transaction_id=r.commerce_transaction_id OR source_payment_intent_id=r.payment_intent_id LIMIT 1;
 v_id := 'RCP_' || replace(gen_random_uuid()::text, '-', ''); v_number := 'RCP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''),1,16));
 INSERT INTO transaction_receipts(transaction_receipt_id,receipt_number,organization_id,store_id,customer_user_id,receipt_kind,source_transaction_id,source_refund_id,original_transaction_receipt_id,currency_code,total_minor,payment_method,provider_reference,receipt_snapshot)
 SELECT v_id,v_number,r.organization_id,r.original_store_id,COALESCE(ct.customer_user_id,pi.customer_user_id),'REFUND',r.payment_refund_id,r.payment_refund_id,v_original,r.currency_code,-r.refund_amount_minor,r.original_provider_code,r.provider_refund_reference,
 jsonb_build_object('schemaVersion',1,'receiptNumber',v_number,'issuedAt',COALESCE(r.executed_at,CURRENT_TIMESTAMP),'refund',jsonb_build_object('id',r.payment_refund_id,'reason',r.reason_code,'amountMinor',r.refund_amount_minor,'providerReference',r.provider_refund_reference),'originalReceiptId',v_original,'totals',jsonb_build_object('totalMinor',-r.refund_amount_minor,'currency',r.currency_code))
 FROM (SELECT 1) x LEFT JOIN commerce_transactions ct ON ct.commerce_transaction_id=r.commerce_transaction_id LEFT JOIN payment_intents pi ON pi.payment_intent_id=r.payment_intent_id
 ON CONFLICT (source_refund_id) WHERE source_refund_id IS NOT NULL DO NOTHING;
 RETURN COALESCE((SELECT transaction_receipt_id FROM transaction_receipts WHERE source_refund_id=r.payment_refund_id),v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".transaction_receipts_on_refund_succeeded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
 IF NEW.execution_status='SUCCEEDED' AND (TG_OP='INSERT' OR OLD.execution_status IS DISTINCT FROM NEW.execution_status) THEN
  PERFORM issue_refund_receipt(NEW.payment_refund_id);
 END IF; RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS tr_issue_refund_receipt ON "${schemaName}".payment_refunds;
CREATE TRIGGER tr_issue_refund_receipt
AFTER INSERT OR UPDATE OF execution_status ON "${schemaName}".payment_refunds
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".transaction_receipts_on_refund_succeeded();

REVOKE ALL ON TABLE "${schemaName}".transaction_receipts FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_commerce_transaction_receipt(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_payment_intent_receipt(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_refund_receipt(varchar) FROM PUBLIC;
GRANT SELECT ON "${schemaName}".transaction_receipts TO "${appRole}";

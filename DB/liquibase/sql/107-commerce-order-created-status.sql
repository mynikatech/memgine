-- Provider-neutral lifecycle correction: an order is prepared before payment succeeds.
ALTER TABLE "${schemaName}".commerce_transactions DROP CONSTRAINT IF EXISTS ck_commerce_transactions_status;
ALTER TABLE "${schemaName}".commerce_transactions ADD CONSTRAINT ck_commerce_transactions_status CHECK (status IN ('DRAFT','READY_FOR_PROVIDER','ORDER_CREATED','PROVIDER_IN_PROGRESS','PROVIDER_SUCCEEDED','PROVIDER_FAILED','FULFILLMENT_PENDING','COMPLETED','CANCELLED'));

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_mark_ready(p_transaction_id varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); v_currency varchar(3); v_subtotal bigint;
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF;
 v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status<>'DRAFT' THEN RETURN t.status IN ('READY_FOR_PROVIDER','ORDER_CREATED','PROVIDER_IN_PROGRESS','PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED'); END IF;
 IF NOT EXISTS(SELECT 1 FROM commerce_transaction_lines WHERE commerce_transaction_id=t.commerce_transaction_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Commerce transaction requires one or more lines' USING ERRCODE='22023'; END IF;
 SELECT min(currency_code),COALESCE(sum(line_subtotal_minor),0) INTO v_currency,v_subtotal FROM commerce_transaction_lines WHERE commerce_transaction_id=t.commerce_transaction_id AND NOT is_deleted AND price_source='MEMGINE_MEMBERSHIP';
 UPDATE commerce_transactions SET status='READY_FOR_PROVIDER',currency_code=v_currency,subtotal_minor=v_subtotal,adjustment_total_minor=0,tax_total_minor=NULL,total_minor=NULL,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_order_created(p_transaction_id varchar,p_provider_order_id varchar,p_subtotal_minor bigint,p_adjustment_total_minor bigint,p_tax_total_minor bigint,p_total_minor bigint,p_currency_code varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF;
 v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status='ORDER_CREATED' AND t.provider_order_id=p_provider_order_id THEN RETURN true; END IF;
 IF t.status<>'READY_FOR_PROVIDER' THEN RAISE EXCEPTION 'Commerce transaction is not ready for provider order' USING ERRCODE='23505'; END IF;
 IF NULLIF(btrim(p_provider_order_id),'') IS NULL OR p_subtotal_minor IS NULL OR p_adjustment_total_minor IS NULL OR p_tax_total_minor IS NULL OR p_total_minor IS NULL OR p_subtotal_minor<0 OR p_adjustment_total_minor<0 OR p_tax_total_minor<0 OR p_total_minor<0 OR p_currency_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid provider order result' USING ERRCODE='22023'; END IF;
 UPDATE commerce_transactions SET status='ORDER_CREATED',provider_order_id=p_provider_order_id,subtotal_minor=p_subtotal_minor,adjustment_total_minor=p_adjustment_total_minor,tax_total_minor=p_tax_total_minor,total_minor=p_total_minor,currency_code=p_currency_code,failure_code=NULL,failure_message=NULL,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_provider_result(p_transaction_id varchar,p_provider_status varchar,p_provider_order_id varchar,p_provider_transaction_id varchar,p_subtotal_minor bigint,p_adjustment_total_minor bigint,p_tax_total_minor bigint,p_total_minor bigint,p_currency_code varchar,p_failure_code varchar,p_failure_message varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE t commerce_transactions%ROWTYPE; v_actor varchar(64); v_next varchar(32);
BEGIN
 SELECT * INTO t FROM commerce_transactions WHERE commerce_transaction_id=p_transaction_id AND NOT is_deleted FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Commerce transaction not found' USING ERRCODE='P0002'; END IF; v_actor:=commerce_actor_organization_user(t.organization_id,p_actor_user_id);
 IF t.status IN ('COMPLETED','CANCELLED') THEN RETURN false; END IF;
 IF upper(p_provider_status)='SUCCEEDED' THEN v_next:='PROVIDER_SUCCEEDED'; ELSIF upper(p_provider_status)='FAILED' THEN v_next:='PROVIDER_FAILED'; ELSIF upper(p_provider_status) IN ('IN_PROGRESS','PROCESSING') THEN v_next:='PROVIDER_IN_PROGRESS'; ELSE RAISE EXCEPTION 'Invalid provider status' USING ERRCODE='22023'; END IF;
 IF v_next IN ('PROVIDER_IN_PROGRESS','PROVIDER_SUCCEEDED') AND t.status NOT IN ('ORDER_CREATED','PROVIDER_IN_PROGRESS') THEN RAISE EXCEPTION 'Provider payment requires an order-created transaction' USING ERRCODE='23505'; END IF;
 UPDATE commerce_transactions SET status=v_next,provider_order_id=COALESCE(p_provider_order_id,provider_order_id),provider_transaction_id=COALESCE(p_provider_transaction_id,provider_transaction_id),subtotal_minor=COALESCE(p_subtotal_minor,subtotal_minor),adjustment_total_minor=COALESCE(p_adjustment_total_minor,adjustment_total_minor),tax_total_minor=COALESCE(p_tax_total_minor,tax_total_minor),total_minor=COALESCE(p_total_minor,total_minor),currency_code=COALESCE(p_currency_code,currency_code),failure_code=CASE WHEN v_next='PROVIDER_FAILED' THEN p_failure_code ELSE NULL END,failure_message=CASE WHEN v_next='PROVIDER_FAILED' THEN p_failure_message ELSE NULL END,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE commerce_transaction_id=t.commerce_transaction_id;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_mark_ready(varchar,varchar),"${schemaName}".commerce_record_order_created(varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar),"${schemaName}".commerce_record_provider_result(varchar,varchar,varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_mark_ready(varchar,varchar),"${schemaName}".commerce_record_order_created(varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar),"${schemaName}".commerce_record_provider_result(varchar,varchar,varchar,varchar,bigint,bigint,bigint,bigint,varchar,varchar,varchar,varchar) TO "${appRole}";
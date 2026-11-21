-- Preserve the canonical acceptance workflow; add the required payment monetary snapshots.
CREATE OR REPLACE FUNCTION "${schemaName}".accept_customer_fulfillment(
    p_org varchar,p_store varchar,p_subscription varchar,p_actor varchar,p_key varchar,p_hash varchar,
    p_benefits varchar[],p_offers varchar[],p_products jsonb,p_quote jsonb,
    p_expected_completion timestamptz,p_expected_collection timestamptz,p_intent varchar DEFAULT NULL
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
    replay varchar; organization_user_key varchar; policy jsonb; shop record; created record;
    f_id varchar; commerce_id varchar; line_id varchar; row_data record; money_line jsonb;
    line_evidence jsonb := '[]'; line_workflow varchar; workflow varchar := 'NONE';
    item_count integer := 0; inserted_item_count integer := 0; integration_id varchar; placed varchar; source_type varchar; now_utc timestamp;
    local_pricing boolean; payment_provider varchar; payment_integration varchar;
    payment_timing varchar; pay_now boolean; collect record; payment payment_intents%ROWTYPE;
    quote_total bigint := (p_quote->>'totalMinor')::bigint; quote_currency varchar := p_quote->>'currencyCode';
    quote_subtotal bigint; quote_discount bigint; quote_tax bigint; payment_net_subtotal bigint;
    payment_tax_rate numeric;
    checkout jsonb;
BEGIN
    -- Serialize retries by organization and request key, and reservation decisions by subscription.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_org||':'||p_key,308));
    replay := get_customer_fulfillment_replay(p_org,p_actor,p_key,p_hash);
    IF replay IS NOT NULL THEN RETURN replay; END IF;
    pay_now := coalesce(p_quote->>'journey'='ADVANCE_PAY_NOW',false);
    payment_timing := CASE WHEN pay_now THEN 'PAY_NOW' ELSE 'PAY_AT_COUNTER' END;
    IF quote_total IS NULL OR quote_total<0 OR quote_currency IS NULL THEN
        RAISE EXCEPTION 'Authoritative quote totals are unavailable' USING ERRCODE='22023';
    END IF;
    SELECT s.organization_user_id INTO organization_user_key
    FROM subscriptions s JOIN organization_user u USING (organization_user_id)
    WHERE s.subscription_id=p_subscription AND u.organization_id=p_org AND u.user_id=p_actor
      AND NOT s.is_deleted AND NOT u.is_deleted FOR UPDATE OF s;
    IF NOT FOUND OR NOT customer_has_active_relationship(p_org,p_actor) THEN
        RAISE EXCEPTION 'Subscription is unavailable' USING ERRCODE='42501';
    END IF;
    IF p_intent IS NULL AND pay_now THEN
        SELECT i.* INTO payment FROM payment_intents i
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND i.idempotency_key=p_key
          AND i.fulfillment_checkout IS NOT NULL;
        IF FOUND THEN
            IF payment.fulfillment_checkout->>'requestHash' IS DISTINCT FROM p_hash THEN
                RAISE EXCEPTION 'This request key has already been used' USING ERRCODE='23505';
            END IF;
            RETURN payment.payment_intent_id;
        END IF;
    END IF;
    IF p_intent IS NULL AND EXISTS (
        SELECT 1 FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
        WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
          AND i.fulfillment_checkout IS NOT NULL AND i.status='PROCESSING' AND i.idempotency_key<>p_key
    ) THEN RAISE EXCEPTION 'An existing checkout requires payment confirmation' USING ERRCODE='23505'; END IF;
    SELECT * INTO shop FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s WHERE s.store_id=p_store;
    policy := shop.policy;
    IF NOT coalesce(policy @> '{"enabled":true}' AND policy->'journeys'->(
        CASE WHEN pay_now THEN 'ADVANCE_PAY_NOW' ELSE 'ADVANCE_PAY_AT_COUNTER' END)='true',false) THEN
        RAISE EXCEPTION 'Advance fulfillment is unavailable at this Store' USING ERRCODE='22023';
    END IF;
    IF policy IS DISTINCT FROM p_quote->'policy' OR shop.timezone IS DISTINCT FROM p_quote->>'timezone' THEN
        RAISE EXCEPTION 'Collection policy changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF pay_now THEN
        IF p_intent IS NULL THEN
            SELECT * INTO collect FROM fulfillment_collect_route(p_org,p_store) r WHERE r.currency=quote_currency;
            IF NOT FOUND THEN RAISE EXCEPTION 'Customer payment is unavailable at this Store' USING ERRCODE='22023'; END IF;
            payment_integration := collect.integration_id;
        ELSE
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            JOIN poynt_collect_verified_captures capture ON capture.payment_intent_id=i.payment_intent_id
              AND capture.organization_id=i.organization_id AND capture.provider_transaction_id=i.provider_reference_id
              AND capture.amount_minor=quote_total AND capture.currency_code=quote_currency
              AND capture.merchant_business_id IS NOT NULL AND capture.merchant_store_id IS NOT NULL
            WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.customer_user_id=p_actor
              AND i.store_id=p_store AND i.status='PROCESSING' AND i.fulfillment_checkout IS NOT NULL
              AND i.amount*100=quote_total AND i.currency_code=quote_currency
              AND i.fulfillment_checkout->'quote'=p_quote
              AND i.fulfillment_checkout->'products'=p_products
              AND i.fulfillment_checkout->'benefits'=to_jsonb(p_benefits)
              AND i.fulfillment_checkout->'offers'=to_jsonb(p_offers)
              AND (i.fulfillment_checkout->>'expectedCompletion')::timestamptz=p_expected_completion
              AND (i.fulfillment_checkout->>'expectedCollection')::timestamptz=p_expected_collection
              AND c.organization_id=p_org AND c.customer_user_id=p_actor AND c.store_id=p_store
              AND c.subscription_id=p_subscription AND c.source_channel='CUSTOMER_FULFILLMENT'
              AND c.status='DRAFT' AND c.idempotency_key=p_key AND NOT c.is_deleted FOR UPDATE OF i;
            IF NOT FOUND THEN RAISE EXCEPTION 'Verified fulfillment capture is unavailable' USING ERRCODE='23505'; END IF;
            IF EXISTS (SELECT 1 FROM payment_refunds r WHERE r.payment_intent_id=p_intent AND r.approval_status<>'REJECTED') THEN
                RAISE EXCEPTION 'Captured fulfillment payment has a refund under review' USING ERRCODE='23505';
            END IF;
            payment_integration := payment.collect_integration_configuration_id;
        END IF;
        payment_provider := 'POYNT_COLLECT';
    ELSE
        SELECT route.provider_code,route.integration_configuration_id INTO payment_provider,payment_integration
        FROM fulfillment_counter_quote_route(p_org,p_store) route;
        IF p_intent IS NOT NULL OR payment_provider IS NULL OR payment_provider IS DISTINCT FROM p_quote->>'counterPaymentProvider' THEN
            RAISE EXCEPTION 'Counter payment route changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
    END IF;
    IF p_expected_completion IS NULL OR p_expected_collection IS NULL OR p_expected_collection<p_expected_completion
       OR p_expected_collection<transaction_timestamp() THEN
        RAISE EXCEPTION 'Collection time is no longer available' USING ERRCODE='22023';
    END IF;

    PERFORM assert_fulfillment_pickup_entitlements(p_org,p_subscription,p_store,p_benefits,p_offers,p_expected_collection);
    IF fulfillment_has_competing_counter_redemption(p_org,p_subscription,p_benefits,p_offers) THEN
        RAISE EXCEPTION 'Finish the existing Counter redemption or wait for the QR to expire' USING ERRCODE='23505';
    END IF;

    now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    SELECT status_id INTO STRICT placed FROM statuses WHERE status_code='PLACED';
    f_id := generate_runtime_id('FUL');
    commerce_id := coalesce(payment.commerce_transaction_id,generate_runtime_id('CTX'));
    local_pricing := p_quote->>'providerCode' = 'MEMGINE';

    FOR row_data IN SELECT * FROM fulfillment_redemption_quote_rows(p_org,p_store,p_subscription,p_benefits,p_offers,p_products) LOOP
        item_count := item_count+1;
        SELECT element INTO STRICT money_line FROM jsonb_array_elements(p_quote->'lines') element
        WHERE element->>'itemType'=row_data."itemType" AND element->>'itemId'=row_data."itemId";
        IF money_line->>'mappingId' IS DISTINCT FROM row_data."commerceProductMappingId"
           OR (money_line->>'mappingVersion')::integer IS DISTINCT FROM row_data."mappingVersionNo"
           OR money_line->>'adjustmentId' IS DISTINCT FROM row_data."commerceAdjustmentId"
           OR (money_line->>'adjustmentVersion')::integer IS DISTINCT FROM row_data."adjustmentVersionNo"
           OR p_quote->>'providerCode' IS DISTINCT FROM row_data."providerCode"
           OR p_quote->>'integrationId' IS DISTINCT FROM row_data."integrationConfigurationId"
           OR (local_pricing AND ((money_line->>'unitPriceMinor')::bigint IS DISTINCT FROM row_data."snapshotUnitPriceMinor"
               OR p_quote->>'currencyCode' IS DISTINCT FROM row_data."snapshotCurrencyCode")) THEN
            RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
        END IF;
        integration_id := row_data."integrationConfigurationId";
        line_workflow := fulfillment_resolve_product_workflow(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId");
        IF line_workflow='DETAILED' OR (line_workflow='SIMPLE' AND workflow='NONE') THEN workflow := line_workflow; END IF;
        line_evidence := line_evidence || jsonb_build_array(money_line || jsonb_build_object(
            'productId',row_data."canonicalProductId",'workflow',line_workflow,
            'externalProductId',row_data."externalProductId",'externalVariantId',row_data."externalVariantId",
            'catalogId',(SELECT m.external_catalog_id FROM commerce_product_mappings m WHERE m.commerce_product_mapping_id=row_data."commerceProductMappingId"),
            'categoryIds',(SELECT coalesce(jsonb_agg(c.target_id ORDER BY c.target_id),'[]') FROM
                fulfillment_store_product_pos_categories(p_org,p_store,row_data."canonicalProductId",row_data."commerceProductMappingId") c),
            'canonicalCategoryId',(SELECT p.product_catalog_category_id FROM product p WHERE p.product_id=row_data."canonicalProductId"),
            'adjustmentType',row_data."adjustmentType",'percentage',row_data.percentage,'amountMinor',row_data."amountMinor",
            'snapshotPriceMinor',row_data."snapshotUnitPriceMinor"));
    END LOOP;
    IF item_count=0 OR item_count<>jsonb_array_length(p_quote->'lines') THEN
        RAISE EXCEPTION 'Prices changed. Review the updated quote.' USING ERRCODE='23505';
    END IF;
    IF p_intent IS NULL THEN
        IF pay_now AND quote_total>0 THEN
            -- The subscription lock serializes checkout initiation across request keys.
            SELECT i.* INTO payment FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
            WHERE i.organization_id=p_org AND i.customer_user_id=p_actor AND c.subscription_id=p_subscription
              AND c.organization_id=p_org AND i.fulfillment_checkout IS NOT NULL
              AND i.status IN ('PENDING','PROCESSING') AND NOT c.is_deleted;
            IF FOUND THEN
                IF payment.fulfillment_checkout->>'requestHash'=p_hash THEN RETURN payment.payment_intent_id; END IF;
                RAISE EXCEPTION 'Resume or cancel the existing checkout before starting a new one' USING ERRCODE='23505';
            END IF;
        END IF;
        INSERT INTO commerce_transactions(
        commerce_transaction_id,organization_id,store_id,customer_user_id,subscription_id,integration_configuration_id,
        source_channel,status,currency_code,subtotal_minor,adjustment_total_minor,tax_total_minor,total_minor,idempotency_key,created_by,updated_by
    ) VALUES (
        commerce_id,p_org,p_store,p_actor,p_subscription,integration_id,'CUSTOMER_FULFILLMENT',
        CASE WHEN pay_now AND quote_total>0 THEN 'DRAFT' ELSE 'ORDER_CREATED' END,
        p_quote->>'currencyCode',(p_quote->>'subtotalMinor')::bigint,(p_quote->>'adjustmentTotalMinor')::bigint,
        (p_quote->>'taxTotalMinor')::bigint,(p_quote->>'totalMinor')::bigint,p_key,organization_user_key,organization_user_key
        );
    ELSE
        UPDATE commerce_transactions SET status='PROVIDER_SUCCEEDED',provider_transaction_id=payment.provider_reference_id,
            updated_at=CURRENT_TIMESTAMP,updated_by=organization_user_key,version_no=version_no+1
        WHERE commerce_transaction_id=commerce_id AND currency_code=quote_currency AND total_minor=quote_total;
        IF NOT FOUND THEN RAISE EXCEPTION 'Commerce totals conflict with captured payment' USING ERRCODE='23505'; END IF;
    END IF;
    IF pay_now AND quote_total>0 AND p_intent IS NULL THEN
        quote_subtotal := (p_quote->>'subtotalMinor')::bigint;
        quote_discount := (p_quote->>'adjustmentTotalMinor')::bigint;
        quote_tax := (p_quote->>'taxTotalMinor')::bigint;
        IF quote_subtotal IS NULL OR quote_discount IS NULL OR quote_tax IS NULL
           OR quote_discount < 0 OR quote_discount > quote_subtotal OR quote_tax < 0
           OR quote_total IS DISTINCT FROM quote_subtotal - quote_discount + quote_tax THEN
            RAISE EXCEPTION 'Authoritative payment quote totals are inconsistent' USING ERRCODE='23505';
        END IF;
        payment_net_subtotal := quote_subtotal - quote_discount;
        -- The quote supplies aggregate tax, so record its effective percentage for the legacy snapshot.
        -- Tax amount and payable remain the frozen quote values, including any line-level rounding.
        payment_tax_rate := coalesce(round(quote_tax::numeric * 100 / nullif(payment_net_subtotal, 0), 4), 0);
        checkout := jsonb_build_object('requestHash',p_hash,'quote',p_quote,
            'benefits',to_jsonb(p_benefits),'offers',to_jsonb(p_offers),'products',p_products,
            'expectedCompletion',p_expected_completion,'expectedCollection',p_expected_collection,
            'paymentBusinessId',(SELECT c.provider_business_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration),
            'paymentStoreId',(SELECT c.provider_store_id FROM commerce_provider_catalog_configurations c WHERE c.integration_configuration_id=payment_integration));
        payment.payment_intent_id := generate_runtime_id('PAY');
        INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,authorization_mode,
            customer_user_id,store_id,subtotal_amount,tax_rate,tax_amount,amount,currency_code,idempotency_key,created_by,updated_by,
            commerce_transaction_id,collect_integration_configuration_id,fulfillment_checkout)
        VALUES (payment.payment_intent_id,p_org,collect.config_id,'CUSTOMER_SESSION',p_actor,p_store,
            payment_net_subtotal::numeric/100,payment_tax_rate,quote_tax::numeric/100,quote_total::numeric/100,
            quote_currency,p_key,p_actor,p_actor,commerce_id,payment_integration,checkout)
        RETURNING * INTO payment;
        INSERT INTO payment_attempts(payment_attempt_id,payment_intent_id,subtotal_amount,tax_rate,tax_amount,amount,currency_code,idempotency_key)
        VALUES (generate_runtime_id('PAT'),payment.payment_intent_id,payment.subtotal_amount,payment.tax_rate,
            payment.tax_amount,payment.amount,payment.currency_code,payment.idempotency_key);
        RETURN payment.payment_intent_id;
    END IF;
    IF local_pricing THEN
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_actor);
        UPDATE redemption_transaction_item item SET selected_product_id=evidence->>'productId',updated_at=now_utc,updated_by=p_actor
        FROM jsonb_array_elements(line_evidence) evidence
        WHERE item.redemption_transaction_id=created."transactionId" AND item.item_type=evidence->>'itemType'
          AND coalesce(item.benefit_id,item.offer_id)=evidence->>'itemId';
    ELSE
        SELECT * INTO STRICT created FROM create_customer_redemption_transaction_with_products(
            p_org,p_subscription,p_benefits,p_offers,'CUSTOMER_FULFILLMENT',p_products,p_actor);
    END IF;
    UPDATE redemption_transaction SET status='RESERVED',store_id=p_store,expires_at=NULL,updated_at=now_utc
    WHERE redemption_transaction_id=created."transactionId";
    FOR money_line IN SELECT value FROM jsonb_array_elements(line_evidence) LOOP
        line_id := generate_runtime_id('CTL');
        source_type := money_line->>'itemType';
        INSERT INTO commerce_transaction_lines(
            commerce_transaction_line_id,commerce_transaction_id,line_type,source_entity_type,source_entity_id,
            commerce_product_mapping_id,external_product_id,external_variant_id,description,quantity,
            unit_price_minor_snapshot,unit_price_minor_authoritative,line_subtotal_minor,currency_code,price_source,metadata_json,created_by,updated_by
        ) VALUES (
            line_id,commerce_id,CASE WHEN local_pricing THEN 'CUSTOM_ITEM' ELSE 'EXTERNAL_PRODUCT' END,
            source_type,money_line->>'itemId',money_line->>'mappingId',
            money_line->>'externalProductId',money_line->>'externalVariantId',money_line->>'productName',1,
            (money_line->>'snapshotPriceMinor')::bigint,(money_line->>'unitPriceMinor')::bigint,
            (money_line->>'subtotalMinor')::bigint,p_quote->>'currencyCode',
            CASE WHEN local_pricing THEN 'MEMGINE_PRODUCT' ELSE 'PROVIDER_FINAL' END,
            jsonb_build_object('canonicalProductId',money_line->>'productId'),organization_user_key,organization_user_key
        );
        INSERT INTO commerce_transaction_adjustments(
            commerce_transaction_adjustment_id,commerce_transaction_id,target_line_id,commerce_adjustment_id,
            source_type,source_id,adjustment_type,percentage,requested_amount_minor,applied_amount_minor,currency_code,
            status,created_by,updated_by
        ) VALUES (
            generate_runtime_id('CTA'),commerce_id,line_id,money_line->>'adjustmentId',source_type,money_line->>'itemId',
            money_line->>'adjustmentType',(money_line->>'percentage')::numeric,(money_line->>'amountMinor')::bigint,
            NULL,p_quote->>'currencyCode','REQUESTED',organization_user_key,organization_user_key
        );
    END LOOP;
    INSERT INTO commerce_transaction_redemptions(
        commerce_transaction_redemption_id,commerce_transaction_id,redemption_transaction_id,created_by,updated_by
    ) VALUES (generate_runtime_id('CTR'),commerce_id,created."transactionId",organization_user_key,organization_user_key);
    INSERT INTO fulfillments (
        fulfillment_id,organization_id,store_id,customer_user_id,redemption_transaction_id,commerce_transaction_id,fulfillment_number,
        request_channel_status_id,request_timing_status_id,payment_timing_status_id,fulfillment_type_status_id,
        workflow_mode_status_id,fulfillment_status_id,effective_policy_snapshot,
        original_expected_completion_at,expected_completion_at,original_expected_collection_at,expected_collection_at,created_by,updated_by
    )
    SELECT f_id,p_org,p_store,p_actor,created."transactionId",commerce_id,created."transactionNumber",
        (SELECT status_id FROM statuses WHERE status_code='CUSTOMER_APP'),(SELECT status_id FROM statuses WHERE status_code='ADVANCE'),
        (SELECT status_id FROM statuses WHERE status_code=payment_timing),(SELECT status_id FROM statuses WHERE status_code='ORDER'),
        (SELECT status_id FROM statuses WHERE status_code=workflow),placed,
        policy || jsonb_build_object('collectionTimeZone',shop.timezone,'requestHash',p_hash,'lines',line_evidence,
                                    'pricingSource',p_quote->>'providerCode','counterPaymentProvider',payment_provider,
                                    'counterPaymentIntegrationId',payment_integration),
        p_expected_completion AT TIME ZONE 'UTC',p_expected_completion AT TIME ZONE 'UTC',
        p_expected_collection AT TIME ZONE 'UTC',p_expected_collection AT TIME ZONE 'UTC',p_actor,p_actor;
    -- Persist the per-line operational obligations introduced by 307A/307B.
    -- Link exact Commerce and redemption lines; never infer product/category from a name.
    INSERT INTO fulfillment_items(
        fulfillment_item_id,fulfillment_id,line_reference,product_id,product_catalog_category_id,
        redemption_transaction_item_id,product_name_snapshot,quantity,workflow_code_snapshot,
        commerce_product_mapping_id,external_categories_snapshot,policy_snapshot,created_by,updated_by
    )
    SELECT generate_runtime_id('FUI'),f_id,l.commerce_transaction_line_id,p.product_id,p.product_catalog_category_id,
        item.redemption_transaction_item_id,left(l.description,200),l.quantity,
        (evidence.value->>'workflow')::varchar,l.commerce_product_mapping_id,
        CASE WHEN local_pricing THEN NULL ELSE (
            SELECT jsonb_agg(DISTINCT cat.external_category_id ORDER BY cat.external_category_id)
            FROM fulfillment_store_product_pos_categories(
                p_org,p_store,p.product_id,l.commerce_product_mapping_id) cat
        ) END,
        jsonb_build_object('pricingSource',p_quote->>'providerCode',
            'integrationConfigurationId',p_quote->>'integrationId',
            'externalCatalogId',evidence.value->>'catalogId',
            'externalCategoryKeys',evidence.value->'categoryIds',
            'workflow',evidence.value->>'workflow'),
        p_actor,p_actor
    FROM commerce_transaction_lines l
    JOIN redemption_transaction_item item
      ON item.redemption_transaction_id=created."transactionId"
     AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id
    JOIN product p ON p.product_id=(l.metadata_json->>'canonicalProductId')
      AND p.organization_id=p_org AND NOT p.is_deleted
    JOIN LATERAL jsonb_array_elements(line_evidence) evidence(value)
      ON evidence.value->>'itemType'=l.source_entity_type
     AND evidence.value->>'itemId'=l.source_entity_id
     AND evidence.value->>'productId'=p.product_id
    WHERE l.commerce_transaction_id=commerce_id AND NOT l.is_deleted;
    GET DIAGNOSTICS inserted_item_count = ROW_COUNT;
    IF inserted_item_count<>item_count THEN
        RAISE EXCEPTION 'Fulfillment item snapshots are inconsistent' USING ERRCODE='23505';
    END IF;
    INSERT INTO redemption_entitlement_reservations(
        redemption_entitlement_reservation_id,fulfillment_id,redemption_transaction_item_id,reservation_status_id,
        usage_window_key,reserved_quantity,created_by,updated_by
    ) SELECT generate_runtime_id('RES'),f_id,i.redemption_transaction_item_id,s.status_id,
        p_subscription||':'||i.item_type||':'||coalesce(i.benefit_id,i.offer_id),i.quantity,p_actor,p_actor
    FROM redemption_transaction_item i CROSS JOIN statuses s
    WHERE i.redemption_transaction_id=created."transactionId" AND s.status_code='RESERVED';
    INSERT INTO fulfillment_actions (
        fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,new_fulfillment_status_id,created_by
    ) SELECT generate_runtime_id('FAC'),f_id,status_id,p_actor,placed,p_actor FROM statuses WHERE status_code='ACCEPTED';
    IF p_intent IS NOT NULL THEN
        IF NOT payment_record_result(p_intent,NULL,'SUCCEEDED',payment.provider_reference_id,NULL,NULL,p_actor) THEN
            RAISE EXCEPTION 'Could not finalize captured fulfillment payment' USING ERRCODE='23505';
        END IF;
    END IF;
    RETURN f_id;
END;
$body$;

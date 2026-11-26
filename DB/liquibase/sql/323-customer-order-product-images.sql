-- 323: Canonical Product images in eligible store choices and order projections.
-- Based on 308d, 318 and 309a. No writes or changes to payment/eligibility rules.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_fulfillment_stores(
    p_org varchar,p_subscription varchar,p_benefits varchar[],p_offers varchar[],p_actor varchar,p_advance boolean,p_test boolean,p_collect boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH items AS MATERIALIZED (
        SELECT 'BENEFIT'::varchar AS kind,id FROM unnest(p_benefits) id
        UNION ALL SELECT 'OFFER'::varchar,id FROM unnest(p_offers) id
    ), candidates AS MATERIALIZED (
        SELECT s.*,source.provider_code,source.integration_id,source.catalog_id,
            (source.provider_code<>'MEMGINE' AND source.integration_id=route.integration_configuration_id
                AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,IMMEDIATE_PAY_AT_COUNTER}'='true') AS immediate,
            (p_advance AND (route.provider_code<>'TEST' OR p_test)
                AND s.policy #> '{journeys,ADVANCE_PAY_AT_COUNTER}'='true') AS advance,
            CASE WHEN p_advance AND p_collect AND s.policy #> '{journeys,ADVANCE_PAY_NOW}'='true'
                 THEN collect.currency END AS collect_currency
        FROM customer_fulfillment_store_context(p_org,p_subscription,p_actor) s
        CROSS JOIN LATERAL fulfillment_store_pricing_source(p_org,s.store_id) source
        LEFT JOIN LATERAL fulfillment_counter_quote_route(p_org,s.store_id) route ON true
        LEFT JOIN LATERAL fulfillment_collect_route(p_org,s.store_id) collect ON p_advance AND p_collect
        WHERE s.policy @> '{"enabled":true}'
          AND EXISTS (SELECT 1 FROM items)
          AND NOT EXISTS (
            SELECT 1 FROM items i WHERE (CASE WHEN i.kind='BENEFIT'
              THEN counter_benefit_rejection(p_org,p_subscription,i.id,s.store_id)
              ELSE counter_offer_rejection(p_org,p_subscription,i.id,s.store_id) END) IS NOT NULL
          )
    ), products AS MATERIALIZED (
        SELECT i.kind,i.id,p.product_id,adjustment.currency_code
        FROM items i CROSS JOIN LATERAL fulfillment_redemption_item_products(p_org,i.kind,i.id) p
        CROSS JOIN LATERAL fulfillment_redemption_item_adjustment(p_org,i.kind,i.id) adjustment
    ), available AS (
        SELECT c.store_id,p.kind,p.id,price.product_id,price.product_name,price.product_code,
               price.currency=c.collect_currency AS can_pay_now, image.image_url
        FROM candidates c
        CROSS JOIN LATERAL fulfillment_store_product_prices(p_org,c.store_id,c.provider_code,c.integration_id,c.catalog_id,
            ARRAY(SELECT DISTINCT product_id FROM products)) price
        JOIN products p ON p.product_id=price.product_id
        LEFT JOIN product image ON image.product_id=price.product_id
            AND image.organization_id=p_org AND NOT image.is_deleted
        WHERE (c.immediate OR c.advance OR price.currency=c.collect_currency)
          AND (p.currency_code IS NULL OR p.currency_code=price.currency)
    ), choices AS (
        SELECT a.store_id,a.kind,a.id,jsonb_agg(product ORDER BY a.product_name,a.product_id) AS options,
            jsonb_agg(product ORDER BY a.product_name,a.product_id) FILTER (WHERE a.can_pay_now) AS pay_now_options
        FROM available a CROSS JOIN LATERAL (SELECT jsonb_build_object(
            'productId',a.product_id,'productName',a.product_name,'productCode',a.product_code,
            'imageUrl',a.image_url) AS product) v
        GROUP BY a.store_id,a.kind,a.id
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',c.store_id,'name',c.store_name,'customerLabel',coalesce(c.policy->>'customerLabel','Order'),
        'journeys',(CASE WHEN c.immediate
                        THEN '["IMMEDIATE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN c.advance
                        THEN '["ADVANCE_PAY_AT_COUNTER"]'::jsonb ELSE '[]'::jsonb END) ||
                   (CASE WHEN p.collect_count=p.count
                        THEN '["ADVANCE_PAY_NOW"]'::jsonb ELSE '[]'::jsonb END),
        'products',p.options,'payNowProducts',p.pay_now_options
    ) ORDER BY c.store_name,c.store_id),'[]')::text
    FROM candidates c CROSS JOIN LATERAL (
        SELECT count(*) AS count,count(ch.pay_now_options) AS collect_count,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.options) AS options,
            jsonb_object_agg(ch.kind||':'||ch.id,ch.pay_now_options) FILTER (WHERE ch.pay_now_options IS NOT NULL) AS pay_now_options
        FROM choices ch WHERE ch.store_id=c.store_id
    ) p WHERE p.count=(SELECT count(*) FROM items) AND (c.immediate OR c.advance OR p.collect_count=p.count);
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".customer_fulfillment_orders_projection(
    p_org varchar,p_actor varchar,p_fulfillment varchar,p_subscription varchar,p_limit integer,p_offset integer,p_active_only boolean
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
WITH page AS MATERIALIZED (
    SELECT f.*, s.store_name,
           s.address_line1 AS pickup_address_line1,s.address_line2 AS pickup_address_line2,
           s.city AS pickup_city,s.state AS pickup_state,s.postal_code AS pickup_postal_code,
           s.country AS pickup_country, st.status_code AS state, w.status_code AS workflow, pt.status_code AS payment_timing,
           t.status_code AS fulfillment_type, rt_kind.status_code AS request_timing,
           c.subscription_id AS commerce_subscription, rt.subscription_id AS redemption_subscription,
           c.status AS commerce_status,c.subtotal_minor,c.adjustment_total_minor,c.tax_total_minor,c.total_minor,c.currency_code,c.provider_transaction_id,
           rt.status AS redemption_status,r.transaction_receipt_id,
           c.commerce_transaction_id AS owned_commerce_id,rt.redemption_transaction_id AS owned_redemption_id
    FROM fulfillments f
    JOIN stores s ON s.store_id=f.store_id AND s.organization_id=f.organization_id
    JOIN statuses st ON st.status_id=f.fulfillment_status_id
    JOIN statuses w ON w.status_id=f.workflow_mode_status_id
    JOIN statuses pt ON pt.status_id=f.payment_timing_status_id
    JOIN statuses t ON t.status_id=f.fulfillment_type_status_id
    JOIN statuses rt_kind ON rt_kind.status_id=f.request_timing_status_id
    LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id AND c.organization_id=f.organization_id
      AND c.customer_user_id=f.customer_user_id AND c.store_id=f.store_id AND NOT c.is_deleted
    LEFT JOIN redemption_transaction rt ON rt.redemption_transaction_id=f.redemption_transaction_id
      AND rt.organization_id=f.organization_id AND rt.store_id=f.store_id
      AND customer_fulfillment_subscription_owned(f.organization_id,rt.subscription_id,f.customer_user_id)
    LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id=c.commerce_transaction_id
      AND r.organization_id=f.organization_id AND r.customer_user_id=f.customer_user_id
    WHERE f.organization_id=p_org AND f.customer_user_id=p_actor
      AND (p_fulfillment IS NULL OR f.fulfillment_id=p_fulfillment) AND (NOT p_active_only OR st.status_code NOT IN ('FULFILLED','CANCELLED'))
      AND (p_subscription IS NULL OR (p_subscription=coalesce(rt.subscription_id,c.subscription_id)
        AND (f.redemption_transaction_id IS NULL OR rt.redemption_transaction_id IS NOT NULL)
        AND (f.commerce_transaction_id IS NULL OR c.commerce_transaction_id IS NOT NULL)
        AND (rt.subscription_id IS NULL OR c.subscription_id IS NULL OR rt.subscription_id=c.subscription_id)
        AND customer_fulfillment_subscription_owned(p_org,p_subscription,p_actor)))
    ORDER BY f.accepted_at DESC,f.fulfillment_id DESC
    LIMIT CASE WHEN p_active_only THEN NULL ELSE greatest(1,least(coalesce(p_limit,25),51)) END
    OFFSET greatest(coalesce(p_offset,0),0)
)
SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',f.fulfillment_id,'customerLabel',coalesce(f.effective_policy_snapshot->>'customerLabel','Order'),
    'referenceNumber',f.fulfillment_number,'storeName',f.store_name,
    'storeId',CASE WHEN p_fulfillment IS NOT NULL THEN f.store_id END,
    'storeAddress',CASE WHEN p_fulfillment IS NOT NULL THEN jsonb_build_object(
        'line1',f.pickup_address_line1,'line2',f.pickup_address_line2,
        'city',f.pickup_city,'region',f.pickup_state,
        'postalCode',f.pickup_postal_code,'countryCode',f.pickup_country) END,
    'status',f.state,
    'workflow',f.workflow,'fulfillmentType',f.fulfillment_type,'requestTiming',f.request_timing,
    'paymentTiming',f.payment_timing,'commerceId',f.owned_commerce_id,
    'redemptionId',f.owned_redemption_id,'redemptionState',f.redemption_status,'receiptId',f.transaction_receipt_id,
    'acceptedAt',f.accepted_at AT TIME ZONE 'UTC','fulfilledAt',f.fulfilled_at AT TIME ZONE 'UTC',
    'expectedCollectionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN f.expected_collection_at AT TIME ZONE 'UTC' END,
    'collectionWindowEndsAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCollection' IS DISTINCT FROM 'false'
      THEN (f.expected_collection_at + make_interval(mins=>(f.effective_policy_snapshot->>'collectionWindowMinutes')::integer)) AT TIME ZONE 'UTC' END,
    'expectedCompletionAt',CASE WHEN f.effective_policy_snapshot->>'showExpectedCompletion' IS DISTINCT FROM 'false'
      THEN f.expected_completion_at AT TIME ZONE 'UTC' END,
    'timezone',coalesce(f.effective_policy_snapshot->>'collectionTimeZone',(SELECT timezone FROM stores WHERE store_id=f.store_id)),'currencyCode',f.currency_code,'totalMinor',f.total_minor,
    'subtotalMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.subtotal_minor END,
    'discountMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.adjustment_total_minor END,
    'taxMinor',CASE WHEN p_fulfillment IS NOT NULL THEN f.tax_total_minor END,
    'verifiedSavingsMinor',verified.net_savings_minor,
    'paymentState',CASE WHEN f.total_minor=0 THEN 'NO_PAYMENT_REQUIRED'
        WHEN f.transaction_receipt_id IS NOT NULL AND f.commerce_status='COMPLETED' THEN 'PAID'
        WHEN EXISTS (
            SELECT 1 FROM payment_intents i JOIN poynt_collect_verified_captures v USING(payment_intent_id)
            WHERE i.commerce_transaction_id=f.owned_commerce_id AND i.organization_id=f.organization_id
              AND i.customer_user_id=f.customer_user_id AND i.status='SUCCEEDED' AND i.fulfillment_checkout IS NOT NULL
              AND v.organization_id=i.organization_id AND v.provider_transaction_id=f.provider_transaction_id
              AND v.amount_minor=f.total_minor AND v.currency_code=f.currency_code
        ) THEN 'PAID'
        WHEN f.commerce_status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING') AND EXISTS (
            SELECT 1 FROM commerce_provider_payment_attempts a
            WHERE a.commerce_transaction_id=f.owned_commerce_id AND a.provider_status='SUCCEEDED'
            HAVING count(*)=1 AND count(*) FILTER (WHERE a.amount_minor=f.total_minor AND a.currency_code=f.currency_code
              AND a.provider_transaction_id=f.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),'') IS NOT NULL)=1
        ) THEN 'PAYMENT_RECEIVED'
        WHEN f.commerce_status='PROVIDER_IN_PROGRESS' THEN 'PAYMENT_PENDING'
        WHEN f.commerce_status='PROVIDER_FAILED' THEN 'PAYMENT_FAILED'
        WHEN f.commerce_status='CANCELLED' THEN 'PAYMENT_CANCELLED'
        WHEN f.payment_timing='PAY_AT_COUNTER' AND f.commerce_status='ORDER_CREATED' THEN 'UNPAID'
        ELSE 'PAYMENT_UNCONFIRMED' END,
    'refundStates',coalesce((SELECT jsonb_agg(DISTINCT pr.execution_status) FROM payment_refunds pr
        WHERE pr.organization_id=p_org AND f.commerce_status IS NOT NULL AND (
          pr.commerce_transaction_id=f.owned_commerce_id OR EXISTS (
            SELECT 1 FROM payment_intents i WHERE i.payment_intent_id=pr.payment_intent_id
              AND i.commerce_transaction_id=f.owned_commerce_id AND i.customer_user_id=f.customer_user_id
          )
        )),'[]'),
    'lines',CASE WHEN p_fulfillment IS NOT NULL OR p_active_only THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.commerce_transaction_line_id,'name',l.description,'quantity',l.quantity,
        'imageUrl',image.image_url,
        'fulfilledQuantity',(SELECT sum(res.consumed_quantity)::integer FROM redemption_entitlement_reservations res
          JOIN redemption_transaction_item item USING (redemption_transaction_item_id)
          WHERE res.fulfillment_id=f.fulfillment_id AND item.redemption_transaction_id=f.redemption_transaction_id
            AND item.item_type=l.source_entity_type AND coalesce(item.benefit_id,item.offer_id)=l.source_entity_id),
        'unitPriceMinor',l.unit_price_minor_authoritative,'subtotalMinor',l.line_subtotal_minor,
        'discountMinor',coalesce((SELECT sum(a.applied_amount_minor)
            FROM commerce_transaction_adjustments a WHERE a.commerce_transaction_id=l.commerce_transaction_id
              AND a.target_line_id=l.commerce_transaction_line_id AND a.status='APPLIED' AND NOT a.is_deleted),0)
     ) ORDER BY l.created_at,l.commerce_transaction_line_id)
        FROM commerce_transaction_lines l
        LEFT JOIN product image ON image.product_id=(l.metadata_json->>'canonicalProductId')
            AND image.organization_id=f.organization_id AND NOT image.is_deleted
        WHERE l.commerce_transaction_id=f.commerce_transaction_id AND NOT l.is_deleted
        AND f.commerce_status IS NOT NULL),'[]') END,
    'timeline',CASE WHEN p_fulfillment IS NOT NULL THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',a.fulfillment_action_id,'type',action.status_code,'at',a.action_at AT TIME ZONE 'UTC',
        'previousAt',a.previous_expected_collection_at AT TIME ZONE 'UTC',
        'proposedAt',a.proposed_expected_collection_at AT TIME ZONE 'UTC','reason',CASE WHEN action.status_code IN
          ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED','STAFF_COLLECTION_EXTENDED') THEN a.reason END
    ) ORDER BY a.action_at,a.fulfillment_action_id) FROM fulfillment_actions a JOIN statuses action ON action.status_id=a.action_type_status_id
      WHERE a.fulfillment_id=f.fulfillment_id),'[]') END,
    'version',f.version_no,
    'canRequestCancellation',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerCancellationRequestsEnabled":true}'
        AND (f.expected_collection_at IS NULL OR (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')<=f.expected_collection_at
          - make_interval(mins=>coalesce((f.effective_policy_snapshot->>'cancellationCutoffMinutes')::integer,0))),
    'canRequestCollectionChange',f.state IN ('PLACED','PREPARING','READY')
        AND f.effective_policy_snapshot @> '{"customerExtensionRequestsEnabled":true}'
        AND (SELECT ast.status_code FROM fulfillment_actions a JOIN statuses ast ON ast.status_id=a.action_type_status_id
            WHERE a.fulfillment_id=f.fulfillment_id AND ast.status_code IN
              ('COLLECTION_CHANGE_REQUESTED','COLLECTION_CHANGE_APPROVED','COLLECTION_CHANGE_REJECTED')
            ORDER BY a.action_at DESC,a.fulfillment_action_id DESC LIMIT 1) IS DISTINCT FROM 'COLLECTION_CHANGE_REQUESTED'
) ORDER BY f.accepted_at DESC,f.fulfillment_id DESC),'[]')::text
FROM page f
LEFT JOIN LATERAL get_customer_transaction_actual_savings(p_actor,ARRAY[f.commerce_transaction_id]) verified
    ON p_fulfillment IS NOT NULL AND f.state='FULFILLED' AND verified.verification_state='VERIFIED'
    AND verified.currency_code=f.currency_code;
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_counter_fulfillment_orders(
    p_org varchar, p_store varchar, p_staff varchar, p_actor varchar, p_order varchar,
    p_status varchar, p_search varchar, p_pickup date, p_limit integer, p_offset integer
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH store_context AS MATERIALIZED (
        SELECT s.store_id,s.store_name,coalesce(z.name,'UTC') AS timezone
        FROM stores s LEFT JOIN pg_timezone_names z ON z.name=s.timezone
        WHERE s.organization_id=p_org AND s.store_id=p_store
          AND get_counter_order_stores(p_org,p_actor,p_staff,p_store)::jsonb <> '[]'::jsonb
          AND p_staff IS NOT NULL
    ), matching AS MATERIALIZED (
        SELECT f.fulfillment_id,f.fulfillment_number,f.accepted_at,f.expected_collection_at,
               f.commerce_transaction_id,f.customer_user_id,s.store_id,s.store_name,s.timezone,
               state.status_code AS state,payment.status_code AS payment_timing
        FROM store_context s JOIN fulfillments f ON f.store_id=s.store_id AND f.organization_id=p_org
        JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
        JOIN statuses state ON state.status_id=f.fulfillment_status_id
        JOIN statuses payment ON payment.status_id=f.payment_timing_status_id
        WHERE (p_order IS NULL OR f.fulfillment_id=p_order)
          AND (p_search IS NULL OR strpos(lower(f.fulfillment_number),lower(p_search))>0)
          AND (p_pickup IS NULL OR (f.expected_collection_at >= ((p_pickup::timestamp AT TIME ZONE s.timezone) AT TIME ZONE 'UTC')
            AND f.expected_collection_at < (((p_pickup+1)::timestamp AT TIME ZONE s.timezone) AT TIME ZONE 'UTC')))
    ), filtered AS MATERIALIZED (
        SELECT * FROM matching WHERE p_order IS NOT NULL OR p_status IS NULL OR state=p_status
          OR (p_status='ACTIVE' AND state IN ('PLACED','PREPARING','READY','CANCEL_REQUESTED'))
    ), page AS MATERIALIZED (
        SELECT * FROM filtered ORDER BY accepted_at DESC,fulfillment_id DESC
        LIMIT CASE WHEN p_order IS NOT NULL THEN 1 ELSE greatest(1,least(coalesce(p_limit,25),50)) END
        OFFSET CASE WHEN p_order IS NOT NULL THEN 0 ELSE greatest(0,least(coalesce(p_offset,0),5000)) END
    ), projected AS (
        SELECT f.accepted_at,f.fulfillment_id,jsonb_build_object(
          'id',f.fulfillment_id,'reference',f.fulfillment_number,'status',f.state,'storeId',f.store_id,
          'storeName',f.store_name,'timezone',f.timezone,'placedAt',f.accepted_at AT TIME ZONE 'UTC',
          'pickupAt',f.expected_collection_at AT TIME ZONE 'UTC','currencyCode',c.currency_code,'totalMinor',c.total_minor,
          'paymentState',CASE
            WHEN c.total_minor=0 THEN 'NO_PAYMENT_REQUIRED'
            WHEN collect.verified OR receipt.payment_method IS NOT NULL OR (terminal.verified AND c.status='COMPLETED') THEN 'PAID'
            WHEN terminal.verified THEN 'PAYMENT_RECEIVED'
            WHEN c.status='PROVIDER_IN_PROGRESS' THEN 'PAYMENT_PENDING'
            WHEN c.status='PROVIDER_FAILED' THEN 'PAYMENT_FAILED'
            WHEN c.status='CANCELLED' THEN 'PAYMENT_CANCELLED'
            WHEN f.payment_timing='PAY_AT_COUNTER' AND c.status='ORDER_CREATED' THEN 'UNPAID'
            ELSE 'PAYMENT_UNCONFIRMED' END,
          'items',coalesce(lines.items,snapshot.items,'[]'::jsonb),
          'customerName',coalesce(nullif(btrim(customer.display_name),''),
               nullif(btrim(concat_ws(' ',customer.first_name,customer.last_name)),'')),
          'subtotalMinor',CASE WHEN p_order IS NOT NULL THEN c.subtotal_minor END,
          'discountMinor',CASE WHEN p_order IS NOT NULL THEN c.adjustment_total_minor END,
          'taxMinor',CASE WHEN p_order IS NOT NULL THEN c.tax_total_minor END,
          'paymentMethod',CASE WHEN p_order IS NOT NULL THEN coalesce(collect.method,receipt.payment_method,terminal.method) END,
          'timeline',coalesce(history.events,'[]'::jsonb)
        ) AS item
        FROM page f
        LEFT JOIN commerce_transactions c ON c.commerce_transaction_id=f.commerce_transaction_id
          AND c.organization_id=p_org AND c.store_id=p_store AND c.customer_user_id=f.customer_user_id AND NOT c.is_deleted
        LEFT JOIN "user" customer ON p_order IS NOT NULL AND customer.user_id=f.customer_user_id
        LEFT JOIN LATERAL (
          SELECT true AS verified,coalesce(max(i.checkout_payment_method),'POYNT_COLLECT') AS method
          FROM payment_intents i JOIN poynt_collect_verified_captures v USING (payment_intent_id)
          WHERE i.commerce_transaction_id=c.commerce_transaction_id AND i.organization_id=p_org AND i.store_id=p_store
            AND i.customer_user_id=f.customer_user_id AND i.fulfillment_checkout IS NOT NULL AND i.status='SUCCEEDED'
            AND v.organization_id=p_org AND v.provider_transaction_id=c.provider_transaction_id
            AND v.provider_transaction_id=i.provider_reference_id AND v.amount_minor=c.total_minor AND v.currency_code=c.currency_code
          HAVING count(*)=1
        ) collect ON true
        LEFT JOIN LATERAL (
          SELECT coalesce(nullif(r.payment_method,''),'PAYMENT_METHOD_NOT_RECORDED') AS payment_method
          FROM transaction_receipts r
          WHERE c.status='COMPLETED' AND r.source_commerce_transaction_id=c.commerce_transaction_id
            AND r.organization_id=p_org AND r.store_id=p_store AND r.customer_user_id=f.customer_user_id
            AND r.total_minor=c.total_minor AND r.currency_code=c.currency_code
            AND r.receipt_snapshot#>>'{payment,completed}'='true'
          LIMIT 1
        ) receipt ON true
        LEFT JOIN LATERAL (
          SELECT true AS verified,max(CASE WHEN a.payment_channel='REMOTE_TERMINAL' THEN 'CARD' ELSE a.payment_channel END) AS method
          FROM commerce_provider_payment_attempts a
          WHERE c.status IN ('PROVIDER_SUCCEEDED','FULFILLMENT_PENDING','COMPLETED')
            AND a.commerce_transaction_id=c.commerce_transaction_id AND a.provider_status='SUCCEEDED'
          HAVING count(*)=1 AND count(*) FILTER (WHERE a.amount_minor=c.total_minor AND a.currency_code=c.currency_code
            AND a.provider_transaction_id=c.provider_transaction_id AND nullif(btrim(a.provider_transaction_id),'') IS NOT NULL)=1
        ) terminal ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',i.fulfillment_item_id,'name',i.product_name_snapshot,'quantity',i.quantity,
            'imageUrl',image.image_url) ORDER BY i.fulfillment_item_id) AS items
          FROM fulfillment_items i
          LEFT JOIN product image ON image.product_id=i.product_id AND image.organization_id=p_org AND NOT image.is_deleted
          WHERE i.fulfillment_id=f.fulfillment_id
        ) snapshot ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',l.commerce_transaction_line_id,'name',l.description,'quantity',l.quantity,
              'imageUrl',image.image_url,
              'unitPriceMinor',l.unit_price_minor_authoritative,'subtotalMinor',l.line_subtotal_minor,'discountMinor',discount.amount)
              ORDER BY l.created_at,l.commerce_transaction_line_id) AS items
          FROM commerce_transaction_lines l
          LEFT JOIN product image ON image.product_id=(l.metadata_json->>'canonicalProductId')
            AND image.organization_id=p_org AND NOT image.is_deleted
          LEFT JOIN LATERAL (
            SELECT sum(a.applied_amount_minor) AS amount FROM commerce_transaction_adjustments a
            WHERE a.commerce_transaction_id=c.commerce_transaction_id AND a.target_line_id=l.commerce_transaction_line_id
              AND a.status='APPLIED' AND NOT a.is_deleted
          ) discount ON true
          WHERE p_order IS NOT NULL AND l.commerce_transaction_id=c.commerce_transaction_id AND NOT l.is_deleted
        ) lines ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',a.fulfillment_action_id,'type',state.status_code,'at',a.action_at AT TIME ZONE 'UTC')
              ORDER BY a.action_at,a.fulfillment_action_id) AS events
          FROM fulfillment_actions a JOIN statuses state ON state.status_id=a.action_type_status_id
          WHERE p_order IS NOT NULL AND a.fulfillment_id=f.fulfillment_id
        ) history ON true
    )
    SELECT jsonb_build_object(
        'orders',coalesce((SELECT jsonb_agg(item ORDER BY accepted_at DESC,fulfillment_id DESC) FROM projected),'[]'::jsonb),
        'total',(SELECT count(*) FROM filtered),
        'statusCounts',coalesce((SELECT jsonb_object_agg(state,count) FROM
            (SELECT state,count(*) AS count FROM matching WHERE p_order IS NULL GROUP BY state) totals),'{}'::jsonb)
    )::text WHERE EXISTS (SELECT 1 FROM store_context);
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_counter_qr_summary(
    p_org varchar,p_actor varchar,p_sub varchar,p_id varchar,p_benefits varchar[],p_offers varchar[],p_intent varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH pending_checkout AS MATERIALIZED (
        SELECT i.fulfillment_checkout FROM payment_intents i JOIN commerce_transactions c USING(commerce_transaction_id)
        WHERE i.payment_intent_id=p_intent AND i.organization_id=p_org AND i.customer_user_id=p_actor
          AND i.fulfillment_checkout IS NOT NULL AND i.status='PENDING' AND c.organization_id=p_org
          AND c.subscription_id=p_sub AND payment_actor_is_authorized(p_intent,p_actor)
    ), candidate AS MATERIALIZED (
        SELECT t.*, current_status.status AS effective_status
        FROM redemption_transaction t
        CROSS JOIN LATERAL get_customer_redemption_transaction_status(p_org,t.redemption_transaction_id,p_actor) current_status
        WHERE t.organization_id=p_org AND t.subscription_id=p_sub AND t.redemption_method='CUSTOMER_QR'
          AND ((p_id IS NOT NULL AND t.redemption_transaction_id=p_id) OR
               (p_id IS NULL AND t.status='PENDING' AND t.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
                AND EXISTS (SELECT 1 FROM redemption_transaction_item i
                    WHERE i.redemption_transaction_id=t.redemption_transaction_id
                      AND (CASE WHEN p_intent IS NULL THEN i.benefit_id=ANY(p_benefits) OR i.offer_id=ANY(p_offers)
                           ELSE EXISTS (SELECT 1 FROM pending_checkout q
                             WHERE (q.fulfillment_checkout->'benefits') ? i.benefit_id
                                OR (q.fulfillment_checkout->'offers') ? i.offer_id) END))))
        ORDER BY t.created_at DESC,t.redemption_transaction_id DESC LIMIT 1
    )
    SELECT jsonb_build_object('transactionId',t.redemption_transaction_id,'transactionNumber',t.redemption_transaction_number,
        'status',t.effective_status,'storeName',s.store_name,'timezone',s.timezone,'expiresAt',t.expires_at AT TIME ZONE 'UTC',
        'items',coalesce(items.data,'[]'::jsonb))::text
    FROM candidate t LEFT JOIN stores s ON s.store_id=t.store_id AND s.organization_id=p_org
    CROSS JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id',i.redemption_transaction_item_id,'type',i.item_type,
            'name',coalesce(nullif(b.display_name,''),b.benefit_name,o.offer_name),'productName',p.product_name,'quantity',i.quantity,
            'imageUrl',CASE WHEN NOT p.is_deleted THEN p.image_url END)
            ORDER BY i.created_at,i.redemption_transaction_item_id) AS data
        FROM redemption_transaction_item i
        LEFT JOIN benefits b ON b.benefit_id=i.benefit_id AND b.organization_id=p_org
        LEFT JOIN offer o ON o.offer_id=i.offer_id AND o.organization_id=p_org
        LEFT JOIN product p ON p.product_id=i.selected_product_id AND p.organization_id=p_org
        WHERE i.redemption_transaction_id=t.redemption_transaction_id
    ) items;
$body$;

-- Read-only dashboard scope. Staff identity must belong to the actor even for organization admins.
CREATE FUNCTION "${schemaName}".get_counter_order_stores(
    p_org varchar, p_actor varchar, p_staff varchar, p_store varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.store_id,'name',s.store_name,'staffId',op.staff_id)
        ORDER BY s.store_name,s.store_id,op.staff_id),'[]'::jsonb)::text
    FROM stores s JOIN staff op ON op.organization_id=s.organization_id AND NOT op.is_deleted
    JOIN organization_user u ON u.organization_user_id=op.organization_user_id AND u.organization_id=p_org
      AND u.user_id=p_actor AND NOT u.is_deleted
    JOIN entity_status es ON es.entity_status_id=u.organization_user_status_id
    JOIN statuses us ON us.status_id=es.status_id AND us.status_code='ACTIVE'
    WHERE s.organization_id=p_org AND (p_store IS NULL OR s.store_id=p_store)
      AND (p_staff IS NULL OR op.staff_id=p_staff) AND counter_can_operate(p_org,s.store_id,op.staff_id,p_actor);
$body$;

CREATE FUNCTION "${schemaName}".get_counter_fulfillment_orders(
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
          SELECT jsonb_agg(jsonb_build_object('id',i.fulfillment_item_id,'name',i.product_name_snapshot,'quantity',i.quantity)
            ORDER BY i.fulfillment_item_id) AS items
          FROM fulfillment_items i WHERE i.fulfillment_id=f.fulfillment_id
        ) snapshot ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object('id',l.commerce_transaction_line_id,'name',l.description,'quantity',l.quantity,
              'unitPriceMinor',l.unit_price_minor_authoritative,'subtotalMinor',l.line_subtotal_minor,'discountMinor',discount.amount)
              ORDER BY l.created_at,l.commerce_transaction_line_id) AS items
          FROM commerce_transaction_lines l LEFT JOIN LATERAL (
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

REVOKE ALL ON FUNCTION "${schemaName}".get_counter_order_stores(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_counter_fulfillment_orders(varchar,varchar,varchar,varchar,varchar,varchar,varchar,date,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_order_stores(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_counter_fulfillment_orders(varchar,varchar,varchar,varchar,varchar,varchar,varchar,date,integer,integer) TO "${appRole}";

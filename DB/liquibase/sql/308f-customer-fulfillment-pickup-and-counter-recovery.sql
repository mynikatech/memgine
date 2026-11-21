-- Allow early display of the existing short-lived credential. Issuance does not change order state.
CREATE OR REPLACE FUNCTION "${schemaName}".issue_customer_fulfillment_pickup(
    p_org varchar,p_actor varchar,p_order varchar,p_hash varchar
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; qr_type varchar; now_utc timestamp; expires timestamp;
BEGIN
    SELECT f0.* INTO f FROM fulfillments f0
    JOIN statuses st ON st.status_id=f0.fulfillment_status_id
    JOIN statuses timing ON timing.status_id=f0.request_timing_status_id
    JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.customer_user_id=p_actor
      AND timing.status_code='ADVANCE' AND kind.status_code='ORDER'
      AND st.status_code IN ('PLACED','PREPARING','READY')
      AND f0.fulfilled_at IS NULL AND f0.cancelled_at IS NULL FOR UPDATE OF f0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pickup credential is unavailable' USING ERRCODE='P0002'; END IF;
    IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid pickup credential' USING ERRCODE='22023';
    END IF;
    SELECT status_id INTO STRICT qr_type FROM statuses WHERE status_code='PICKUP_QR';
    now_utc := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    expires := now_utc+interval '5 minutes';
    UPDATE fulfillment_credentials SET revoked_at=now_utc,updated_at=now_utc,updated_by=p_actor,version_no=version_no+1
    WHERE fulfillment_id=p_order AND credential_type_status_id=qr_type AND revoked_at IS NULL AND used_at IS NULL;
    INSERT INTO fulfillment_credentials (
        fulfillment_credential_id,fulfillment_id,credential_type_status_id,token_hash,expires_at,created_by,updated_by
    ) VALUES (generate_runtime_id('FQR'),p_order,qr_type,p_hash,expires,p_actor,p_actor);
    RETURN to_char(expires,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
END;
$body$;

-- Return the exact Counter basket, or a still-issuable customer QR overlapping the selected items.
-- The existing conflict predicate also covers unresolved Counter checkouts whose QR can no longer be opened.
CREATE FUNCTION "${schemaName}".get_customer_counter_qr_summary(
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
            'name',coalesce(nullif(b.display_name,''),b.benefit_name,o.offer_name),'productName',p.product_name,'quantity',i.quantity)
            ORDER BY i.created_at,i.redemption_transaction_item_id) AS data
        FROM redemption_transaction_item i
        LEFT JOIN benefits b ON b.benefit_id=i.benefit_id AND b.organization_id=p_org
        LEFT JOIN offer o ON o.offer_id=i.offer_id AND o.organization_id=p_org
        LEFT JOIN product p ON p.product_id=i.selected_product_id AND p.organization_id=p_org
        WHERE i.redemption_transaction_id=t.redemption_transaction_id
    ) items;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_counter_qr_summary(varchar,varchar,varchar,varchar,varchar[],varchar[],varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_counter_qr_summary(varchar,varchar,varchar,varchar,varchar[],varchar[],varchar) TO "${appRole}";

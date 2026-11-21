-- Verify the existing credential without consuming it or advancing collection.
CREATE FUNCTION "${schemaName}".verify_counter_pickup_qr(
    p_org varchar, p_store varchar, p_staff varchar, p_actor varchar, p_hash varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH scope AS MATERIALIZED (
        SELECT get_counter_order_stores(p_org,p_actor,p_staff,p_store)::jsonb <> '[]'::jsonb
            AND p_store IS NOT NULL AND p_staff IS NOT NULL AS authorized
    ), credential AS MATERIALIZED (
        SELECT f.fulfillment_id,f.store_id,f.fulfilled_at,f.cancelled_at,state.status_code AS state,
            qr.expires_at,qr.revoked_at,qr.used_at
        FROM scope s JOIN fulfillment_credentials qr ON s.authorized AND qr.token_hash=p_hash::char(64)
        JOIN fulfillments f ON f.fulfillment_id=qr.fulfillment_id AND f.organization_id=p_org
        JOIN statuses kind ON kind.status_id=qr.credential_type_status_id AND kind.status_code='PICKUP_QR'
        JOIN statuses order_kind ON order_kind.status_id=f.fulfillment_type_status_id AND order_kind.status_code='ORDER'
        JOIN statuses timing ON timing.status_id=f.request_timing_status_id AND timing.status_code='ADVANCE'
        JOIN statuses state ON state.status_id=f.fulfillment_status_id
        WHERE p_hash ~ '^[0-9a-f]{64}$'
    ), outcome AS (
        SELECT CASE
            WHEN NOT s.authorized THEN 'FORBIDDEN'
            WHEN c.fulfillment_id IS NULL THEN 'INVALID'
            WHEN c.store_id<>p_store THEN 'WRONG_STORE'
            WHEN c.used_at IS NOT NULL THEN 'USED'
            WHEN c.revoked_at IS NOT NULL THEN 'REVOKED'
            WHEN c.expires_at IS NULL OR c.expires_at<=CURRENT_TIMESTAMP AT TIME ZONE 'UTC' THEN 'EXPIRED'
            WHEN c.state NOT IN ('PLACED','PREPARING','READY') OR c.fulfilled_at IS NOT NULL OR c.cancelled_at IS NOT NULL THEN 'ORDER_UNAVAILABLE'
            ELSE 'VERIFIED' END AS code,c.fulfillment_id
        FROM scope s LEFT JOIN credential c ON true
    )
    SELECT CASE WHEN code='VERIFIED' THEN jsonb_build_object('code',code,'orderId',fulfillment_id)
        ELSE jsonb_build_object('code',code) END::text FROM outcome;
$body$;

-- Exact Store-scoped reference lookup gives identification only.
CREATE FUNCTION "${schemaName}".lookup_counter_pickup_order_reference(
    p_org varchar, p_store varchar, p_staff varchar, p_actor varchar, p_reference varchar
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
    WITH scope AS MATERIALIZED (
        SELECT get_counter_order_stores(p_org,p_actor,p_staff,p_store)::jsonb <> '[]'::jsonb
            AND p_store IS NOT NULL AND p_staff IS NOT NULL AS authorized
    ), matches AS (
        SELECT f.fulfillment_id FROM scope s
        JOIN fulfillments f ON s.authorized AND f.organization_id=p_org AND f.store_id=p_store
        JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
        WHERE lower(f.fulfillment_number)=lower(p_reference)
        LIMIT 2
    )
    SELECT CASE WHEN NOT s.authorized THEN jsonb_build_object('code','FORBIDDEN')
        WHEN m.count=1 THEN jsonb_build_object('code','LOCATED','orderId',m.id)
        ELSE jsonb_build_object('code','NOT_FOUND') END::text
    FROM scope s CROSS JOIN (SELECT count(*) AS count,min(fulfillment_id) AS id FROM matches) m;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".verify_counter_pickup_qr(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".lookup_counter_pickup_order_reference(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".verify_counter_pickup_qr(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".lookup_counter_pickup_order_reference(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

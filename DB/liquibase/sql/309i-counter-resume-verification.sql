-- 309I P0: resume an existing advance order using a fresh valid six-digit code.
-- Preserves one-time credentials, Store authorization and 15-minute verification.
-- No new payment, fulfillment, entitlement consumption, or collection authorization.
-- Forward-only replacement of the 309F function; never edit executed 309F/309G.

CREATE OR REPLACE FUNCTION "${schemaName}".counter_authorize_pickup_code(
  p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,p_hash varchar,p_previous_hash varchar,p_expected_order varchar
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE v_now timestamp := clock_timestamp() AT TIME ZONE 'UTC';
  f fulfillments%ROWTYPE; cred fulfillment_credentials%ROWTYPE;
  v_status varchar; v_operator varchar; v_action_type varchar;
  v_code varchar := 'INVALID';
BEGIN
  IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN
    RETURN '{"code":"FORBIDDEN"}';
  END IF;
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_previous_hash IS NULL OR p_previous_hash !~ '^[0-9a-f]{64}$' THEN RETURN '{"code":"INVALID"}'; END IF;
  -- Serialize attempts per Store so concurrent clients cannot evade store-level limits.
  PERFORM pg_advisory_xact_lock(hashtextextended('FPC:'||p_org||':'||p_store,0));
  IF (SELECT count(*) FROM fulfillment_pickup_code_attempts a
      WHERE a.organization_id=p_org AND a.store_id=p_store
        AND a.attempted_at>v_now-interval '10 minutes' AND a.outcome='INVALID')>=100
   OR (SELECT count(*) FROM fulfillment_pickup_code_attempts a
      WHERE a.organization_id=p_org AND a.store_id=p_store AND a.actor_user_id=p_actor
        AND a.attempted_at>v_now-interval '10 minutes' AND a.outcome='INVALID')>=8 THEN
    RETURN '{"code":"RATE_LIMITED"}';
  END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  SELECT f0.* INTO f FROM fulfillment_credentials q
    JOIN statuses type ON type.status_id=q.credential_type_status_id AND type.status_code='PICKUP_CODE'
    JOIN fulfillments f0 ON f0.fulfillment_id=q.fulfillment_id
    JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id AND kind.status_code='ORDER'
    JOIN statuses timing ON timing.status_id=f0.request_timing_status_id AND timing.status_code='ADVANCE'
    WHERE q.token_hash IN (p_hash::char(64),p_previous_hash::char(64)) AND f0.organization_id=p_org AND f0.store_id=p_store
    ORDER BY q.created_at DESC,q.fulfillment_credential_id DESC LIMIT 1 FOR UPDATE OF f0;
  IF FOUND THEN
    SELECT q.* INTO cred FROM fulfillment_credentials q
      JOIN statuses type ON type.status_id=q.credential_type_status_id AND type.status_code='PICKUP_CODE'
      WHERE q.fulfillment_id=f.fulfillment_id AND q.token_hash IN (p_hash::char(64),p_previous_hash::char(64))
      ORDER BY q.created_at DESC,q.fulfillment_credential_id DESC LIMIT 1 FOR UPDATE OF q;
    SELECT s.status_code INTO v_status FROM statuses s WHERE s.status_id=f.fulfillment_status_id;
    IF (p_expected_order IS NULL OR f.fulfillment_id=p_expected_order)
      AND cred.used_at IS NULL AND cred.revoked_at IS NULL AND cred.expires_at>v_now
      AND v_status IN ('PLACED','PREPARING','READY') AND f.fulfilled_at IS NULL
      AND f.cancelled_at IS NULL AND f.cancellation_requested_at IS NULL THEN
      -- A code must not replace a previously valid verification. It is the first active authorization.
      IF NOT EXISTS (SELECT 1 FROM fulfillment_actions a JOIN statuses st ON st.status_id=a.action_type_status_id
          WHERE a.fulfillment_id=f.fulfillment_id AND st.status_code='COLLECTION_AUTHORIZED'
            AND a.action_at+interval '15 minutes'>v_now) THEN
        SELECT status_id INTO STRICT v_action_type FROM statuses WHERE status_code='COLLECTION_AUTHORIZED';
        INSERT INTO fulfillment_actions (fulfillment_action_id,fulfillment_id,action_type_status_id,actor_user_id,
          prior_fulfillment_status_id,new_fulfillment_status_id,action_details,action_at,created_by)
        VALUES(generate_runtime_id('FAC'),f.fulfillment_id,v_action_type,p_actor,f.fulfillment_status_id,
          f.fulfillment_status_id,jsonb_build_object('method','PICKUP_CODE','sourceId',cred.fulfillment_credential_id,
          'staffId',p_staff,'storeId',p_store,'customerId',f.customer_user_id),v_now,p_actor);
        UPDATE fulfillment_credentials SET used_at=v_now,verified_by=p_actor,updated_at=v_now,updated_by=p_actor,
          version_no=version_no+1 WHERE fulfillment_credential_id=cred.fulfillment_credential_id;
        UPDATE fulfillments SET updated_at=v_now,updated_by=p_actor,version_no=version_no+1
          WHERE fulfillment_id=f.fulfillment_id;
        v_code := 'VERIFIED';
      ELSE
        -- A fresh, authenticated Pickup Code may resume an existing active
        -- collection authorization. Consume this new code exactly once; do
        -- not insert another authorization or change the payment/order state.
        UPDATE fulfillment_credentials SET used_at=v_now,verified_by=p_actor,
          updated_at=v_now,updated_by=p_actor,version_no=version_no+1
          WHERE fulfillment_credential_id=cred.fulfillment_credential_id
            AND used_at IS NULL AND revoked_at IS NULL AND expires_at>v_now;
        IF FOUND THEN
          v_code := 'ALREADY_VERIFIED';
        END IF;
      END IF;
    END IF;
  END IF;
  INSERT INTO fulfillment_pickup_code_attempts(organization_id,store_id,actor_user_id,outcome)
  VALUES(p_org,p_store,p_actor,
    CASE WHEN v_code IN ('VERIFIED','ALREADY_VERIFIED') THEN 'VERIFIED' ELSE 'INVALID' END);
  IF v_code IN ('VERIFIED','ALREADY_VERIFIED') THEN
    RETURN jsonb_build_object('code',v_code,'orderId',f.fulfillment_id)::text;
  END IF;
  -- Invalid, expired, revoked, consumed, unrelated or wrong-Store codes
  -- never expose an order identifier.
  RETURN '{"code":"INVALID"}';
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".counter_authorize_pickup_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_authorize_pickup_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

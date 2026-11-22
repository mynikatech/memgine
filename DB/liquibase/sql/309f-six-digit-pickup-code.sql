-- 309F: alternative customer pickup credential. Requires 309C and 309E.
-- IMPORTANT: application computes HMAC-SHA256 with env secret. No plaintext code is stored.
-- PICKUP_CODE credential type and status already seeded by migration 306.
-- Also prevents overlapping pickup authorizations across QR/OTP/Staff-Assisted/Code.
-- ONLY use this version if 309F has not yet been applied.

-- Active Store uniqueness independent of the hourly historical credential hash.
ALTER TABLE "${schemaName}".fulfillment_credentials
  ADD COLUMN IF NOT EXISTS pickup_code_scope_hash char(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fulfillment_pickup_code_active_scope
  ON "${schemaName}".fulfillment_credentials(pickup_code_scope_hash)
  WHERE pickup_code_scope_hash IS NOT NULL AND revoked_at IS NULL AND used_at IS NULL;

-- No raw codes or HMAC values are recorded in attempt history.
CREATE TABLE IF NOT EXISTS "${schemaName}".fulfillment_pickup_code_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id varchar(64) NOT NULL,
  store_id varchar(64) NOT NULL,
  actor_user_id varchar(64) NOT NULL,
  outcome varchar(16) NOT NULL CHECK(outcome IN ('INVALID','VERIFIED')),
  attempted_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX IF NOT EXISTS idx_fulfillment_pickup_code_attempts_scope
ON "${schemaName}".fulfillment_pickup_code_attempts (organization_id,store_id,actor_user_id,attempted_at DESC);
REVOKE ALL ON "${schemaName}".fulfillment_pickup_code_attempts FROM PUBLIC;
REVOKE ALL ON "${schemaName}".fulfillment_pickup_code_attempts FROM "${appRole}";

-- Returns ISO expiry or COLLISION. Caller generates random 000000..999999 and HMAC;
-- store's scope is enforced through existing order ownership. Single active code per order.
CREATE FUNCTION "${schemaName}".issue_customer_fulfillment_pickup_code(
  p_org varchar,p_actor varchar,p_order varchar,p_hash varchar,p_scope_hash varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE f fulfillments%ROWTYPE; v_type varchar; v_now timestamp; v_expires timestamp; v_store varchar;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR p_scope_hash IS NULL OR p_scope_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;
  SELECT f0.store_id INTO v_store FROM fulfillments f0
    WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.customer_user_id=p_actor;
  IF v_store IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
  -- Lock order is Store advisory -> fulfillment row -> credential (same as Counter code verification).
  PERFORM pg_advisory_xact_lock(hashtextextended('FPC:'||p_org||':'||v_store,0));
  SELECT f0.* INTO f FROM fulfillments f0
    JOIN statuses state ON state.status_id=f0.fulfillment_status_id AND state.status_code='READY'
    JOIN statuses kind ON kind.status_id=f0.fulfillment_type_status_id AND kind.status_code='ORDER'
    JOIN statuses timing ON timing.status_id=f0.request_timing_status_id AND timing.status_code='ADVANCE'
  WHERE f0.fulfillment_id=p_order AND f0.organization_id=p_org AND f0.customer_user_id=p_actor
    AND f0.fulfilled_at IS NULL AND f0.cancelled_at IS NULL AND f0.cancellation_requested_at IS NULL
    FOR UPDATE OF f0;
  IF NOT FOUND THEN RETURN 'UNAVAILABLE'; END IF;
  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  v_expires := v_now + interval '5 minutes';
  SELECT status_id INTO STRICT v_type FROM statuses WHERE status_code='PICKUP_CODE';
  -- Under the Store advisory lock, expire old codes to free active-scope index keys.
  UPDATE fulfillment_credentials q SET revoked_at=v_now,updated_at=v_now,updated_by=p_actor,version_no=q.version_no+1
  FROM fulfillments owner WHERE owner.fulfillment_id=q.fulfillment_id
    AND owner.organization_id=p_org AND owner.store_id=f.store_id
    AND q.credential_type_status_id=v_type AND q.revoked_at IS NULL AND q.used_at IS NULL
    AND q.expires_at<=v_now;
  UPDATE fulfillment_credentials SET revoked_at=v_now,updated_at=v_now,updated_by=p_actor,version_no=version_no+1
    WHERE fulfillment_id=p_order AND credential_type_status_id=v_type AND revoked_at IS NULL AND used_at IS NULL;
  INSERT INTO fulfillment_credentials(fulfillment_credential_id,fulfillment_id,credential_type_status_id,
    token_hash,pickup_code_scope_hash,expires_at,created_by,updated_by)
  VALUES(generate_runtime_id('FPC'),p_order,v_type,p_hash,p_scope_hash,v_expires,p_actor,p_actor);
  RETURN to_char(v_expires,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
EXCEPTION WHEN unique_violation THEN RETURN 'COLLISION';
END;
$body$;

-- Resolve the authorized customer's Store without granting direct table access.
CREATE FUNCTION "${schemaName}".customer_fulfillment_pickup_code_store(
  p_org varchar,p_actor varchar,p_order varchar
) RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
  SELECT f.store_id FROM fulfillments f
  JOIN statuses state ON state.status_id=f.fulfillment_status_id AND state.status_code='READY'
  JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
  JOIN statuses timing ON timing.status_id=f.request_timing_status_id AND timing.status_code='ADVANCE'
  WHERE f.organization_id=p_org AND f.customer_user_id=p_actor AND f.fulfillment_id=p_order
    AND f.fulfilled_at IS NULL AND f.cancelled_at IS NULL AND f.cancellation_requested_at IS NULL;
$body$;

-- Single DB operation: staff verification, per-store rate limiting, code consumption,
-- authorization evidence, and order version bump. No redemption or payment changes here.
CREATE FUNCTION "${schemaName}".counter_authorize_pickup_code(
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
        v_code := 'ALREADY_VERIFIED';
      END IF;
    END IF;
  END IF;
  INSERT INTO fulfillment_pickup_code_attempts(organization_id,store_id,actor_user_id,outcome)
  VALUES(p_org,p_store,p_actor,CASE WHEN v_code='VERIFIED' THEN 'VERIFIED' ELSE 'INVALID' END);
  IF v_code='VERIFIED' THEN RETURN jsonb_build_object('code',v_code,'orderId',f.fulfillment_id)::text; END IF;
  -- Never leak whether a code exists in a different Store or is expired/revoked.
  RETURN jsonb_build_object('code',CASE WHEN v_code='ALREADY_VERIFIED' THEN v_code ELSE 'INVALID' END)::text;
END;
$body$;

-- -------------------------------------------------------------------------
-- 309F: shared one-active-authorization guard for ALL verification methods.
-- 309C already locks the fulfillment row for QR/OTP/Staff-Assisted; 309F
-- locks the same row for Pickup Code. This trigger uses the fulfillment lock
-- to serialize authorization inserts without modifying the 309C migration.
-- It is intentionally limited to ADVANCE orders: IMMEDIATE Counter redemption
-- has its own authorization and recovery lifecycle.
-- -------------------------------------------------------------------------
CREATE FUNCTION "${schemaName}".guard_advance_collection_authorization()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE
  v_order varchar(64);
  v_now timestamp;
BEGIN
  IF NOT EXISTS (
      SELECT 1 FROM statuses s
      WHERE s.status_id=NEW.action_type_status_id
        AND s.status_code='COLLECTION_AUTHORIZED'
  ) THEN
    RETURN NEW;
  END IF;

  -- Serialize competing verification methods on the same order, including
  -- writers not using the 309F Store advisory lock.
  SELECT f.fulfillment_id INTO v_order
  FROM fulfillments f
  JOIN statuses timing ON timing.status_id=f.request_timing_status_id
    AND timing.status_code='ADVANCE'
  WHERE f.fulfillment_id=NEW.fulfillment_id
  FOR UPDATE OF f;

  IF v_order IS NULL THEN
    RETURN NEW;
  END IF;

  v_now := clock_timestamp() AT TIME ZONE 'UTC';
  IF EXISTS (
      SELECT 1 FROM fulfillment_actions a
      JOIN statuses st ON st.status_id=a.action_type_status_id
      WHERE a.fulfillment_id=v_order AND st.status_code='COLLECTION_AUTHORIZED'
        AND a.action_at + interval '15 minutes' > v_now
  ) THEN
    RAISE EXCEPTION 'Collection was already authorized for this order'
      USING ERRCODE='23505', CONSTRAINT='uq_fulfillment_active_collection_authorization';
  END IF;

  RETURN NEW;
END;
$body$;

CREATE TRIGGER trg_fulfillment_single_active_collection_authorization
BEFORE INSERT ON "${schemaName}".fulfillment_actions
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".guard_advance_collection_authorization();

REVOKE ALL ON FUNCTION "${schemaName}".guard_advance_collection_authorization() FROM PUBLIC;

REVOKE ALL ON FUNCTION "${schemaName}".issue_customer_fulfillment_pickup_code(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".counter_authorize_pickup_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".issue_customer_fulfillment_pickup_code(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_authorize_pickup_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

REVOKE ALL ON FUNCTION "${schemaName}".customer_fulfillment_pickup_code_store(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".customer_fulfillment_pickup_code_store(varchar,varchar,varchar) TO "${appRole}";

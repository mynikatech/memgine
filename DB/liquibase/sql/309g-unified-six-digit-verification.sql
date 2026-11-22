-- 309G: one six-digit verification input for immediate redemption and advance pickup.
-- Follow-on to APPLIED 309F; never edit its changeset.
-- Codes are HMAC digests scoped to organization/store and UTC hour, never plaintext.
-- No payment or entitlement mutation occurs in code verification.

CREATE TABLE "${schemaName}".redemption_six_digit_credentials (
    redemption_six_digit_credential_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL,
    redemption_transaction_id varchar(64) NOT NULL REFERENCES "${schemaName}".redemption_transaction(redemption_transaction_id),
    token_hash char(64) NOT NULL UNIQUE,
    scope_hash char(64) NOT NULL,
    qr_token_hash char(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    revoked_at timestamp without time zone,
    used_at timestamp without time zone,
    verified_by varchar(64),
    created_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_by varchar(64) NOT NULL,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_redemption_six_digit_expiry CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX uq_redemption_six_digit_active_scope
    ON "${schemaName}".redemption_six_digit_credentials(scope_hash)
    WHERE revoked_at IS NULL AND used_at IS NULL;
CREATE UNIQUE INDEX uq_redemption_six_digit_active_transaction
    ON "${schemaName}".redemption_six_digit_credentials(redemption_transaction_id)
    WHERE revoked_at IS NULL AND used_at IS NULL;
CREATE INDEX idx_redemption_six_digit_lookup
    ON "${schemaName}".redemption_six_digit_credentials(organization_id,store_id,token_hash);
REVOKE ALL ON "${schemaName}".redemption_six_digit_credentials FROM PUBLIC;
REVOKE ALL ON "${schemaName}".redemption_six_digit_credentials FROM "${appRole}";

-- Customer must own an active CUSTOMER subscription for the pending redemption.
CREATE FUNCTION "${schemaName}".customer_redemption_six_digit_store(
    p_org varchar,p_actor varchar,p_redemption varchar
) RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
  SELECT t.store_id FROM redemption_transaction t
  JOIN subscriptions s ON s.subscription_id=t.subscription_id AND NOT s.is_deleted
  JOIN organization_user ou ON ou.organization_user_id=s.organization_user_id AND NOT ou.is_deleted
  JOIN organization_user_types typ ON typ.organization_user_type_id=ou.organization_user_type_id
      AND typ.organization_user_type_code='CUSTOMER'
  JOIN entity_status es ON es.entity_status_id=ou.organization_user_status_id
  JOIN statuses st ON st.status_id=es.status_id AND st.status_code='ACTIVE'
  WHERE t.redemption_transaction_id=p_redemption AND t.organization_id=p_org
    AND t.redemption_method='CUSTOMER_QR' AND t.status='PENDING'
    AND t.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    AND ou.organization_id=p_org AND ou.user_id=p_actor
    AND EXISTS (SELECT 1 FROM redemption_transaction_qr q
        WHERE q.redemption_transaction_id=t.redemption_transaction_id
          AND q.organization_id=p_org AND q.revoked_at IS NULL
          AND q.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
$body$;

CREATE FUNCTION "${schemaName}".issue_customer_redemption_six_digit_code(
    p_org varchar,p_actor varchar,p_redemption varchar,p_hash varchar,p_scope_hash varchar
) RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE v_store varchar; v_now timestamp; v_expiry timestamp;
        v_tx redemption_transaction%ROWTYPE; v_qr redemption_transaction_qr%ROWTYPE;
BEGIN
    IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR
       p_scope_hash IS NULL OR p_scope_hash !~ '^[0-9a-f]{64}$' THEN RETURN 'INVALID'; END IF;
    v_store := customer_redemption_six_digit_store(p_org,p_actor,p_redemption);
    IF v_store IS NULL THEN RETURN 'UNAVAILABLE'; END IF;
    -- Same Store advisory mutex as 309F; prevents cross-flow code races.
    PERFORM pg_advisory_xact_lock(hashtextextended('FPC:'||p_org||':'||v_store,0));
    SELECT t.* INTO v_tx FROM redemption_transaction t
    WHERE t.redemption_transaction_id=p_redemption AND t.organization_id=p_org
      AND t.store_id=v_store AND t.status='PENDING' AND t.redemption_method='CUSTOMER_QR'
      AND t.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    FOR UPDATE OF t;
    IF NOT FOUND OR customer_redemption_six_digit_store(p_org,p_actor,p_redemption) IS NULL
      THEN RETURN 'UNAVAILABLE'; END IF;
    SELECT q.* INTO v_qr FROM redemption_transaction_qr q
    WHERE q.redemption_transaction_id=p_redemption AND q.organization_id=p_org
      AND q.revoked_at IS NULL AND q.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    ORDER BY q.created_at DESC LIMIT 1 FOR UPDATE OF q;
    IF NOT FOUND THEN RETURN 'UNAVAILABLE'; END IF;
    v_now := clock_timestamp() AT TIME ZONE 'UTC';
    v_expiry := LEAST(v_now+interval '5 minutes',v_tx.expires_at,v_qr.expires_at);
    IF v_expiry<=v_now THEN RETURN 'UNAVAILABLE'; END IF;
    -- Retire expired entries before uniqueness check. Revocation is limited to this Store.
    UPDATE redemption_six_digit_credentials SET revoked_at=v_now,updated_at=v_now,
       updated_by=p_actor,version_no=version_no+1
      WHERE organization_id=p_org AND store_id=v_store AND revoked_at IS NULL
        AND used_at IS NULL AND expires_at<=v_now;
    -- Make current redemption's previous code unusable when customer refreshes.
    UPDATE redemption_six_digit_credentials SET revoked_at=v_now,updated_at=v_now,
       updated_by=p_actor,version_no=version_no+1
      WHERE redemption_transaction_id=p_redemption AND revoked_at IS NULL AND used_at IS NULL;
    -- Do not collide with live 309F pickup codes.
    IF EXISTS (SELECT 1 FROM fulfillment_credentials c JOIN fulfillments f ON f.fulfillment_id=c.fulfillment_id
       WHERE f.organization_id=p_org AND f.store_id=v_store
         AND c.pickup_code_scope_hash=p_scope_hash::char(64)
         AND c.revoked_at IS NULL AND c.used_at IS NULL AND c.expires_at>v_now) THEN
      RETURN 'COLLISION';
    END IF;
    INSERT INTO redemption_six_digit_credentials (
      redemption_six_digit_credential_id,organization_id,store_id,redemption_transaction_id,
      token_hash,scope_hash,qr_token_hash,expires_at,created_at,updated_at,created_by,updated_by
    ) VALUES (generate_runtime_id('RSC'),p_org,v_store,p_redemption,p_hash,p_scope_hash,
              v_qr.token_hash,v_expiry,v_now,v_now,p_actor,p_actor);
    RETURN to_char(v_expiry,'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
EXCEPTION WHEN unique_violation THEN
    RETURN 'COLLISION';
END;
$body$;

-- A 309F pickup-code insertion also checks active immediate-redemption codes.
-- Called while the 309F issuer holds the SAME advisory Store lock.
CREATE FUNCTION "${schemaName}".guard_pickup_code_redemption_collision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE v_org varchar; v_store varchar;
BEGIN
    IF NEW.pickup_code_scope_hash IS NULL THEN RETURN NEW; END IF;
    SELECT f.organization_id,f.store_id INTO v_org,v_store
      FROM fulfillments f WHERE f.fulfillment_id=NEW.fulfillment_id;
    IF EXISTS (SELECT 1 FROM redemption_six_digit_credentials c
       WHERE c.organization_id=v_org AND c.store_id=v_store
       AND c.scope_hash=NEW.pickup_code_scope_hash AND c.revoked_at IS NULL
       AND c.used_at IS NULL AND c.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN
      RAISE EXCEPTION 'A six-digit code is already active in this Store' USING ERRCODE='23505';
    END IF;
    RETURN NEW;
END;
$body$;
CREATE TRIGGER trg_guard_pickup_redemption_code_collision
BEFORE INSERT ON "${schemaName}".fulfillment_credentials
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".guard_pickup_code_redemption_collision();

-- 309G: allow issuance whenever the Pickup QR is available, without relaxing
-- Store matching or final collection readiness. Replacements of existing 309F functions.
CREATE OR REPLACE FUNCTION "${schemaName}".issue_customer_fulfillment_pickup_code(
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
    JOIN statuses state ON state.status_id=f0.fulfillment_status_id AND state.status_code IN ('PLACED','PREPARING','READY')
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

CREATE OR REPLACE FUNCTION "${schemaName}".customer_fulfillment_pickup_code_store(
  p_org varchar,p_actor varchar,p_order varchar
) RETURNS varchar LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
  SELECT f.store_id FROM fulfillments f
  JOIN statuses state ON state.status_id=f.fulfillment_status_id AND state.status_code IN ('PLACED','PREPARING','READY')
  JOIN statuses kind ON kind.status_id=f.fulfillment_type_status_id AND kind.status_code='ORDER'
  JOIN statuses timing ON timing.status_id=f.request_timing_status_id AND timing.status_code='ADVANCE'
  WHERE f.organization_id=p_org AND f.customer_user_id=p_actor AND f.fulfillment_id=p_order
    AND f.fulfilled_at IS NULL AND f.cancelled_at IS NULL AND f.cancellation_requested_at IS NULL;
$body$;

-- Single Counter entry point. Successful immediate code returns the same
-- canonical redemption-transaction attributes as scanning its existing QR.
-- Pickup codes continue through the fully validated 309F authorization function.
CREATE FUNCTION "${schemaName}".counter_verify_six_digit_code(
  p_org varchar,p_store varchar,p_staff varchar,p_actor varchar,
  p_hash varchar,p_previous varchar,p_expected_order varchar
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,"${schemaName}",pg_temp AS $body$
DECLARE v_now timestamp; v_code redemption_six_digit_credentials%ROWTYPE;
        v_tx redemption_transaction%ROWTYPE; v_tx_id varchar; v_number varchar;
        v_status varchar; v_expiry text;
BEGIN
    IF counter_order_operator(p_org,p_store,p_staff,p_actor) IS NULL THEN
        RETURN '{"code":"FORBIDDEN"}';
    END IF;
    IF p_hash IS NULL OR p_hash !~ '^[0-9a-f]{64}$' OR
       p_previous IS NULL OR p_previous !~ '^[0-9a-f]{64}$' THEN
      RETURN '{"code":"INVALID"}';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('FPC:'||p_org||':'||p_store,0));
    v_now := clock_timestamp() AT TIME ZONE 'UTC';
    IF (SELECT count(*) FROM fulfillment_pickup_code_attempts a
         WHERE a.organization_id=p_org AND a.store_id=p_store
           AND a.outcome='INVALID' AND a.attempted_at>v_now-interval '10 minutes')>=100
       OR (SELECT count(*) FROM fulfillment_pickup_code_attempts a
         WHERE a.organization_id=p_org AND a.store_id=p_store
           AND a.actor_user_id=p_actor AND a.outcome='INVALID'
           AND a.attempted_at>v_now-interval '10 minutes')>=8 THEN
       RETURN '{"code":"RATE_LIMITED"}';
    END IF;
    -- If called from an order-specific popup, do not authorize a different
    -- immediate redemption. The main Counter calls with expectedOrderId=NULL.
    IF p_expected_order IS NULL THEN
      SELECT c.* INTO v_code FROM redemption_six_digit_credentials c
        WHERE c.organization_id=p_org AND c.store_id=p_store
          AND c.token_hash IN (p_hash::char(64),p_previous::char(64))
          AND c.revoked_at IS NULL AND c.used_at IS NULL AND c.expires_at>v_now
        ORDER BY c.created_at DESC LIMIT 1;
      IF FOUND THEN
        SELECT t.* INTO v_tx FROM redemption_transaction t
         WHERE t.redemption_transaction_id=v_code.redemption_transaction_id
           AND t.organization_id=p_org AND t.store_id=p_store
           AND t.redemption_method='CUSTOMER_QR' AND t.status='PENDING'
           AND t.expires_at>v_now FOR UPDATE OF t;
        IF FOUND AND EXISTS (
          SELECT 1 FROM redemption_transaction_qr live_qr
          WHERE live_qr.organization_id=p_org
            AND live_qr.redemption_transaction_id=v_code.redemption_transaction_id
            AND live_qr.token_hash=v_code.qr_token_hash
            AND live_qr.revoked_at IS NULL AND live_qr.expires_at>v_now
        ) THEN
          -- Enforce the SAME QR scope, expiry, and Counter permissions.
          -- QR lookup does not execute redemption; it validates the transaction.
          SELECT q."transactionId",q."transactionNumber",q.status,q."expiresAt"
             INTO v_tx_id,v_number,v_status,v_expiry
          FROM resolve_counter_redemption_transaction_qr(
               p_org,p_store,p_staff,v_code.qr_token_hash::varchar,p_actor) q;
          -- A rotated/revoked QR is rejected by the precheck above.
          UPDATE redemption_six_digit_credentials SET used_at=v_now,
             verified_by=p_actor,updated_at=v_now,updated_by=p_actor,version_no=version_no+1
           WHERE redemption_six_digit_credential_id=v_code.redemption_six_digit_credential_id
             AND used_at IS NULL AND revoked_at IS NULL AND expires_at>v_now;
          IF FOUND THEN
            INSERT INTO fulfillment_pickup_code_attempts (organization_id,store_id,actor_user_id,outcome)
              VALUES(p_org,p_store,p_actor,'VERIFIED');
            RETURN jsonb_build_object('code','VERIFIED','kind','REDEMPTION',
              'transactionId',v_tx_id,'transactionNumber',v_number,'status',v_status,
              'expiresAt',v_expiry)::text;
          END IF;
        END IF;
      END IF;
    END IF;
    -- Existing 309F handles pickup authorization and a single invalid-attempt
    -- record; it also enforces collection authorization concurrency.
    RETURN counter_authorize_pickup_code(p_org,p_store,p_staff,p_actor,p_hash,p_previous,p_expected_order);
END;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".customer_redemption_six_digit_store(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".issue_customer_redemption_six_digit_code(varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".counter_verify_six_digit_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".guard_pickup_code_redemption_collision() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".customer_redemption_six_digit_store(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".issue_customer_redemption_six_digit_code(varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".counter_verify_six_digit_code(varchar,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

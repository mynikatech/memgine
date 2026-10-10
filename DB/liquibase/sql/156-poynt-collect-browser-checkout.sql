-- Short-lived browser establishment sessions for native Poynt Collect checkout.
-- Opaque bearer values are SHA-256 hashes here; the raw values never persist.
CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_collect_checkout_sessions (
    poynt_collect_checkout_session_id varchar(64) PRIMARY KEY,
    payment_intent_id varchar(64) NOT NULL REFERENCES "${schemaName}".payment_intents(payment_intent_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    customer_user_id varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    establishment_token_hash varchar(64) NOT NULL UNIQUE,
    browser_session_hash varchar(64) UNIQUE,
    csrf_token_hash varchar(64),
    expires_at timestamp with time zone NOT NULL,
    established_at timestamp with time zone,
    browser_expires_at timestamp with time zone,
    invalidated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    CONSTRAINT ck_poynt_collect_checkout_establishment CHECK (
        (established_at IS NULL AND browser_session_hash IS NULL AND csrf_token_hash IS NULL AND browser_expires_at IS NULL)
        OR (established_at IS NOT NULL AND browser_session_hash IS NOT NULL AND csrf_token_hash IS NOT NULL AND browser_expires_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_poynt_collect_checkout_sessions_browser
    ON "${schemaName}".poynt_collect_checkout_sessions (browser_session_hash)
    WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_poynt_collect_checkout_sessions_intent
    ON "${schemaName}".poynt_collect_checkout_sessions (payment_intent_id, created_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".payment_create_poynt_collect_checkout_session(
    p_session_id varchar, p_token_hash varchar, p_organization_id varchar,
    p_intent_id varchar, p_actor_user_id varchar, p_expires_at timestamp with time zone
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
BEGIN
    IF p_session_id IS NULL OR length(p_session_id) = 0 OR p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Checkout session is invalid' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM payment_intents pi
        JOIN payment_provider_configs pc ON pc.payment_provider_config_id = pi.payment_provider_config_id
        WHERE pi.payment_intent_id = p_intent_id
          AND pi.organization_id = p_organization_id
          AND pi.customer_user_id = p_actor_user_id
          AND pi.authorization_mode = 'CUSTOMER_SESSION'
          AND pc.provider_code = 'POYNT_COLLECT'
          AND pi.status IN ('PENDING', 'PROCESSING')
          AND payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)
    ) THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;
    INSERT INTO poynt_collect_checkout_sessions (
        poynt_collect_checkout_session_id, payment_intent_id, organization_id, customer_user_id,
        establishment_token_hash, expires_at, created_by
    ) VALUES (p_session_id, p_intent_id, p_organization_id, p_actor_user_id,
        p_token_hash, p_expires_at, p_actor_user_id);
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_redeem_poynt_collect_checkout_session(
    p_token_hash varchar, p_browser_hash varchar, p_csrf_hash varchar, p_browser_expires_at timestamp with time zone
) RETURNS TABLE ("organizationId" varchar, "paymentIntentId" varchar, "customerUserId" varchar)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_session poynt_collect_checkout_sessions%ROWTYPE;
BEGIN
    IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
       OR p_browser_hash IS NULL OR p_browser_hash !~ '^[0-9a-f]{64}$'
       OR p_csrf_hash IS NULL OR p_csrf_hash !~ '^[0-9a-f]{64}$'
       OR p_browser_expires_at IS NULL
       OR p_browser_expires_at <= CURRENT_TIMESTAMP
       OR p_browser_expires_at > CURRENT_TIMESTAMP + INTERVAL '10 minutes' THEN
        RAISE EXCEPTION 'Checkout session is invalid' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_session FROM poynt_collect_checkout_sessions
     WHERE establishment_token_hash = p_token_hash FOR UPDATE;
    IF NOT FOUND OR v_session.established_at IS NOT NULL OR v_session.invalidated_at IS NOT NULL
       OR v_session.expires_at <= CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Checkout session is expired or already used' USING ERRCODE = '42501';
    END IF;

    -- Revalidate the linked payment at redemption time. A checkout URL issued
    -- before cancellation or completion must not establish a new browser session.
    IF NOT EXISTS (
        SELECT 1 FROM payment_intents pi
        JOIN payment_provider_configs pc ON pc.payment_provider_config_id = pi.payment_provider_config_id
        WHERE pi.payment_intent_id = v_session.payment_intent_id
          AND pi.organization_id = v_session.organization_id
          AND pi.customer_user_id = v_session.customer_user_id
          AND pi.authorization_mode = 'CUSTOMER_SESSION'
          AND pc.provider_code = 'POYNT_COLLECT'
          AND pi.status IN ('PENDING', 'PROCESSING')
          AND payment_actor_is_authorized(pi.payment_intent_id, v_session.customer_user_id)
    ) THEN
        RAISE EXCEPTION 'Collect payment is unavailable' USING ERRCODE = '42501';
    END IF;

    UPDATE poynt_collect_checkout_sessions
       SET established_at = CURRENT_TIMESTAMP, browser_session_hash = p_browser_hash,
           csrf_token_hash = p_csrf_hash, browser_expires_at = p_browser_expires_at
     WHERE poynt_collect_checkout_session_id = v_session.poynt_collect_checkout_session_id;
    RETURN QUERY SELECT v_session.organization_id, v_session.payment_intent_id, v_session.customer_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".payment_get_poynt_collect_browser_session(
    p_browser_hash varchar
) RETURNS TABLE ("organizationId" varchar, "paymentIntentId" varchar, "customerUserId" varchar, "csrfTokenHash" varchar)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT s.organization_id, s.payment_intent_id, s.customer_user_id, s.csrf_token_hash
      FROM poynt_collect_checkout_sessions s
      JOIN payment_intents pi ON pi.payment_intent_id = s.payment_intent_id
     WHERE s.browser_session_hash = p_browser_hash
       AND s.established_at IS NOT NULL
       AND s.invalidated_at IS NULL
       AND s.browser_expires_at > CURRENT_TIMESTAMP
       AND pi.organization_id = s.organization_id
       AND pi.customer_user_id = s.customer_user_id;
$function$;

REVOKE ALL ON TABLE "${schemaName}".poynt_collect_checkout_sessions FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".payment_create_poynt_collect_checkout_session(varchar,varchar,varchar,varchar,varchar,timestamp with time zone),
    "${schemaName}".payment_redeem_poynt_collect_checkout_session(varchar,varchar,varchar,timestamp with time zone),
    "${schemaName}".payment_get_poynt_collect_browser_session(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".payment_create_poynt_collect_checkout_session(varchar,varchar,varchar,varchar,varchar,timestamp with time zone),
    "${schemaName}".payment_redeem_poynt_collect_checkout_session(varchar,varchar,varchar,timestamp with time zone),
    "${schemaName}".payment_get_poynt_collect_browser_session(varchar) TO "${appRole}";

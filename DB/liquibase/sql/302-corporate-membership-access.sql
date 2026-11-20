-- 302 Corporate membership access, no extensions and no triggers.
-- The Kotlin server generates codes, encrypts display copies and computes HMAC-SHA256.
-- p_verifier and p_candidate_verifier are HMACs, never plaintext six-digit codes.
-- IMPORTANT: payment-start SQL functions must explicitly call
-- corporate_membership_require_access(org, plan, customer) before creating NEW
-- corporate payment intents; recovery of existing intents must precede the check.

CREATE TABLE "${schemaName}".corporate_membership_access (
    organization_id varchar(40) NOT NULL,
    membership_product_id varchar(40) PRIMARY KEY
        REFERENCES "${schemaName}".membership_products(membership_product_id),
    code_hash text NOT NULL,
    encrypted_code text NOT NULL,
    code_version bigint NOT NULL DEFAULT 1,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by varchar(40) NOT NULL
);

CREATE TABLE "${schemaName}".corporate_membership_grants (
    organization_id varchar(40) NOT NULL,
    membership_product_id varchar(40) NOT NULL,
    customer_user_id varchar(40) NOT NULL,
    code_version bigint NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (organization_id, membership_product_id, customer_user_id)
);
CREATE INDEX ix_corporate_membership_grant_expiry
    ON "${schemaName}".corporate_membership_grants(expires_at);

CREATE TABLE "${schemaName}".corporate_membership_attempts (
    organization_id varchar(40) NOT NULL,
    membership_product_id varchar(40) NOT NULL,
    customer_user_id varchar(40) NOT NULL,
    window_started_at timestamptz NOT NULL DEFAULT now(),
    failure_count integer NOT NULL DEFAULT 0
        CHECK (failure_count >= 0),
    PRIMARY KEY (organization_id, membership_product_id, customer_user_id)
);

-- Keeps org/product membership and grant in sync. App-side security checks are not enough.
CREATE OR REPLACE FUNCTION "${schemaName}".corporate_membership_set_code(
    p_org varchar, p_product varchar, p_actor varchar,
    p_verifier varchar, p_encrypted_code text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $body$
BEGIN
    IF NOT can_administer_organization(p_org, p_actor) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
    END IF;
    IF p_verifier IS NULL OR p_verifier !~ '^[0-9a-f]{64}$'
       OR nullif(p_encrypted_code,'') IS NULL THEN
        RAISE EXCEPTION 'Invalid Corporate code material' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM membership_products mp
        JOIN product_types pt ON pt.product_type_id = mp.product_type_id
        WHERE mp.organization_id = p_org
          AND mp.membership_product_id = p_product
          AND NOT mp.is_deleted
          AND pt.product_type_code = 'CORPORATE'
    ) THEN
        RAISE EXCEPTION 'Corporate membership not found' USING ERRCODE='22023';
    END IF;

    INSERT INTO corporate_membership_access
        (organization_id, membership_product_id,
         code_hash, encrypted_code, code_version, updated_by)
    VALUES (p_org, p_product, p_verifier, p_encrypted_code, 1, p_actor)
    ON CONFLICT (membership_product_id) DO UPDATE SET
        code_hash = excluded.code_hash,
        encrypted_code = excluded.encrypted_code,
        code_version = corporate_membership_access.code_version + 1,
        updated_at = now(),
        updated_by = p_actor;

    -- Code rotation revokes only future purchase authorizations, never purchased subscriptions.
    DELETE FROM corporate_membership_grants
    WHERE organization_id = p_org AND membership_product_id = p_product;
    RETURN true;
END;
$body$;

-- Returns encrypted bytes only to an authorized Organization Admin; Kotlin decrypts.
CREATE OR REPLACE FUNCTION "${schemaName}".corporate_membership_admin_code(
    p_org varchar, p_product varchar, p_actor varchar
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $body$
DECLARE v_encrypted text;
BEGIN
    IF NOT can_administer_organization(p_org, p_actor) THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
    END IF;
    SELECT ca.encrypted_code INTO v_encrypted
      FROM corporate_membership_access ca
     WHERE ca.organization_id = p_org
       AND ca.membership_product_id = p_product;
    RETURN v_encrypted;
END;
$body$;

CREATE OR REPLACE FUNCTION "${schemaName}".corporate_membership_has_code(
    p_org varchar, p_product varchar
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $body$
    SELECT EXISTS (
        SELECT 1 FROM corporate_membership_access
         WHERE organization_id = p_org
           AND membership_product_id = p_product
    );
$body$;

-- Only Kotlin computes p_candidate_verifier using the server secret.
-- Kotlin MUST obtain p_customer from an authenticated or staff-authorized purchase.
CREATE OR REPLACE FUNCTION "${schemaName}".corporate_membership_verify_code(
    p_org varchar, p_product varchar, p_customer varchar,
    p_candidate_verifier varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $body$
DECLARE
    v_version bigint;
    v_count integer;
    v_window timestamptz;
BEGIN
    IF nullif(p_org,'') IS NULL OR nullif(p_product,'') IS NULL
       OR nullif(p_customer,'') IS NULL
       OR p_candidate_verifier IS NULL
       OR p_candidate_verifier !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid Corporate verification' USING ERRCODE='22023';
    END IF;

    -- Serialize guesses per organization/product/customer to enforce attempt limits.
    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_org || ':' || p_product || ':' || p_customer, 0)
    );
    INSERT INTO corporate_membership_attempts
        (organization_id, membership_product_id, customer_user_id)
    VALUES (p_org,p_product,p_customer)
    ON CONFLICT DO NOTHING;

    SELECT failure_count, window_started_at INTO v_count, v_window
      FROM corporate_membership_attempts
     WHERE organization_id = p_org
       AND membership_product_id = p_product
       AND customer_user_id = p_customer
     FOR UPDATE;

    IF v_window < now() - interval '15 minutes' THEN
        v_count := 0;
        UPDATE corporate_membership_attempts
           SET failure_count=0, window_started_at=now()
         WHERE organization_id=p_org
           AND membership_product_id=p_product AND customer_user_id=p_customer;
    END IF;

    IF v_count >= 5 THEN
        RAISE EXCEPTION 'Too many Corporate code attempts' USING ERRCODE='42501';
    END IF;

    -- Lock the code row against concurrent rotation while recording a new grant.
    SELECT ca.code_version INTO v_version
      FROM corporate_membership_access ca
      JOIN membership_products mp ON mp.membership_product_id=ca.membership_product_id
      JOIN product_types pt ON pt.product_type_id=mp.product_type_id
     WHERE ca.organization_id=p_org AND ca.membership_product_id=p_product
       AND ca.code_hash=p_candidate_verifier
       AND mp.organization_id=p_org AND NOT mp.is_deleted
       AND pt.product_type_code='CORPORATE'
     FOR SHARE OF ca;

    IF v_version IS NULL THEN
        UPDATE corporate_membership_attempts
           SET failure_count=failure_count+1
         WHERE organization_id=p_org
           AND membership_product_id=p_product AND customer_user_id=p_customer;
        RETURN false;
    END IF;

    INSERT INTO corporate_membership_grants
        (organization_id,membership_product_id,customer_user_id,code_version,expires_at)
    VALUES (p_org,p_product,p_customer,v_version,now()+interval '20 minutes')
    ON CONFLICT (organization_id,membership_product_id,customer_user_id)
    DO UPDATE SET code_version=excluded.code_version, expires_at=excluded.expires_at;

    UPDATE corporate_membership_attempts
       SET failure_count=0,window_started_at=now()
     WHERE organization_id=p_org
       AND membership_product_id=p_product AND customer_user_id=p_customer;
    RETURN true;
END;
$body$;

-- NO TRIGGER: Invoke explicitly within each authoritative SQL payment-start function
-- after resolving the authentic customer and plan, and after existing-intent recovery.
CREATE OR REPLACE FUNCTION "${schemaName}".corporate_membership_require_access(
    p_org varchar, p_plan varchar, p_customer varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}" AS $body$
DECLARE
    v_product varchar;
    v_type varchar;
BEGIN
    SELECT mp.membership_product_id, pt.product_type_code
      INTO v_product, v_type
      FROM subscription_plans sp
      JOIN membership_products mp ON mp.membership_product_id=sp.membership_product_id
      JOIN product_types pt ON pt.product_type_id=mp.product_type_id
     WHERE sp.subscription_plan_id=p_plan AND mp.organization_id=p_org
       AND NOT mp.is_deleted AND NOT sp.is_deleted;
    IF v_product IS NULL THEN
        RAISE EXCEPTION 'Membership plan unavailable' USING ERRCODE='22023';
    END IF;
    IF v_type = 'CORPORATE' AND (
        nullif(p_customer,'') IS NULL OR NOT EXISTS (
            SELECT 1
            FROM corporate_membership_grants g
            JOIN corporate_membership_access c
              ON c.organization_id=g.organization_id
             AND c.membership_product_id=g.membership_product_id
             AND c.code_version=g.code_version
            WHERE g.organization_id=p_org
              AND g.membership_product_id=v_product
              AND g.customer_user_id=p_customer AND g.expires_at>now()
        )
    ) THEN
        RAISE EXCEPTION 'Corporate membership access code required'
            USING ERRCODE='42501';
    END IF;
    RETURN true;
END;
$body$;

REVOKE ALL ON "${schemaName}".corporate_membership_access FROM PUBLIC;
REVOKE ALL ON "${schemaName}".corporate_membership_grants FROM PUBLIC;
REVOKE ALL ON "${schemaName}".corporate_membership_attempts FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".corporate_membership_set_code(varchar,varchar,varchar,varchar,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".corporate_membership_admin_code(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".corporate_membership_has_code(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".corporate_membership_verify_code(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".corporate_membership_require_access(varchar,varchar,varchar) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".corporate_membership_set_code(varchar,varchar,varchar,varchar,text) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".corporate_membership_admin_code(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".corporate_membership_has_code(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".corporate_membership_verify_code(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".corporate_membership_require_access(varchar,varchar,varchar) TO "${appRole}";

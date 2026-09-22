CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_terminal_pairings (
    poynt_terminal_pairing_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    pairing_code_hash varchar(64) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_at timestamp without time zone,
    updated_by varchar(64),
    is_deleted boolean NOT NULL DEFAULT FALSE,
    version_no integer NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_poynt_terminal_pairings_active_code
    ON "${schemaName}".poynt_terminal_pairings(pairing_code_hash)
    WHERE consumed_at IS NULL AND NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_poynt_terminal_pairings_org_store
    ON "${schemaName}".poynt_terminal_pairings(organization_id, store_id, expires_at);

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_terminal_bindings (
    poynt_terminal_binding_id varchar(64) PRIMARY KEY,
    pos_device_id varchar(64) NOT NULL REFERENCES "${schemaName}".pos_devices(pos_device_id),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    poynt_business_id varchar(128) NOT NULL,
    poynt_store_id varchar(128) NOT NULL,
    poynt_terminal_id varchar(128) NOT NULL,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    is_deleted boolean NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_poynt_terminal_bindings_device
    ON "${schemaName}".poynt_terminal_bindings(pos_device_id)
    WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_poynt_terminal_bindings_terminal
    ON "${schemaName}".poynt_terminal_bindings(poynt_terminal_id)
    WHERE NOT is_deleted;

CREATE OR REPLACE FUNCTION "${schemaName}".poynt_create_terminal_pairing(
    p_pairing_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_pairing_code_hash varchar,
    p_expires_at timestamp without time zone,
    p_actor_user_id varchar
)
RETURNS TABLE("pairingId" varchar, "organizationId" varchar, "storeId" varchar, "expiresAt" text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT "${schemaName}".rbac_has_capability(
        p_actor_user_id, p_organization_id, 'ORG_ADMIN_ACCESS'
    ) THEN
        RAISE EXCEPTION 'Poynt terminal pairing is not permitted' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".stores s
        JOIN "${schemaName}".entity_status es ON es.entity_status_id = s.store_status_id
        JOIN "${schemaName}".statuses st ON st.status_id = es.status_id
        WHERE s.store_id = p_store_id
          AND s.organization_id = p_organization_id
          AND NOT s.is_deleted
          AND st.status_code = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Store is unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO "${schemaName}".poynt_terminal_pairings (
        poynt_terminal_pairing_id, organization_id, store_id,
        pairing_code_hash, expires_at, created_by
    ) VALUES (
        p_pairing_id, p_organization_id, p_store_id,
        p_pairing_code_hash, p_expires_at, p_actor_user_id
    );

    RETURN QUERY
    SELECT p_pairing_id, p_organization_id, p_store_id, p_expires_at::text;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".poynt_complete_terminal_pairing(
    p_pairing_code_hash varchar,
    p_poynt_business_id varchar,
    p_poynt_store_id varchar,
    p_poynt_terminal_id varchar,
    p_pos_device_id varchar,
    p_device_name varchar,
    p_device_token_hash varchar,
    p_binding_id varchar
)
RETURNS TABLE("deviceId" varchar, "organizationId" varchar, "organizationName" varchar, "storeId" varchar, "storeName" varchar, "deviceName" varchar)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_pairing "${schemaName}".poynt_terminal_pairings%ROWTYPE;
BEGIN
    SELECT * INTO v_pairing
    FROM "${schemaName}".poynt_terminal_pairings
    WHERE pairing_code_hash = p_pairing_code_hash
      AND consumed_at IS NULL
      AND NOT is_deleted
      AND expires_at > CURRENT_TIMESTAMP
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pairing code is invalid or expired' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "${schemaName}".poynt_terminal_bindings b
        JOIN "${schemaName}".pos_devices d ON d.pos_device_id = b.pos_device_id
        WHERE b.poynt_terminal_id = p_poynt_terminal_id
          AND NOT b.is_deleted
          AND NOT d.is_deleted
          AND d.revoked_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Poynt terminal is already paired' USING ERRCODE = '23505';
    END IF;

    INSERT INTO "${schemaName}".pos_devices (
        pos_device_id, organization_id, store_id, device_name,
        device_token_hash, created_by, updated_by
    ) VALUES (
        p_pos_device_id, v_pairing.organization_id, v_pairing.store_id,
        p_device_name, p_device_token_hash, v_pairing.created_by, v_pairing.created_by
    );

    INSERT INTO "${schemaName}".poynt_terminal_bindings (
        poynt_terminal_binding_id, pos_device_id, organization_id, store_id,
        poynt_business_id, poynt_store_id, poynt_terminal_id, created_by
    ) VALUES (
        p_binding_id, p_pos_device_id, v_pairing.organization_id, v_pairing.store_id,
        p_poynt_business_id, p_poynt_store_id, p_poynt_terminal_id, v_pairing.created_by
    );

    UPDATE "${schemaName}".poynt_terminal_pairings
       SET consumed_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_pairing.created_by,
           version_no = version_no + 1
     WHERE poynt_terminal_pairing_id = v_pairing.poynt_terminal_pairing_id;

    RETURN QUERY
    SELECT d.pos_device_id, d.organization_id, o.organization_name,
           d.store_id, s.store_name, d.device_name
      FROM "${schemaName}".pos_devices d
      JOIN "${schemaName}".organization o ON o.organization_id = d.organization_id
      JOIN "${schemaName}".stores s ON s.store_id = d.store_id
     WHERE d.pos_device_id = p_pos_device_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".counter_lookup_customer(
    p_organization_id varchar,
    p_phone varchar,
    p_actor_user_id varchar
)
RETURNS TABLE("userId" varchar, "displayName" varchar, "primaryPhone" varchar)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        u.user_id,
        COALESCE(
            NULLIF(trim(u.display_name), ''),
            NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), ''),
            u.user_code
        ) AS "displayName",
        u.primary_phone
    FROM "${schemaName}".organization_user ou
    JOIN "${schemaName}"."user" u ON u.user_id = ou.user_id
    JOIN "${schemaName}".entity_status ou_es ON ou_es.entity_status_id = ou.organization_user_status_id
    JOIN "${schemaName}".statuses ou_status ON ou_status.status_id = ou_es.status_id
    JOIN "${schemaName}".entity_status user_es ON user_es.entity_status_id = u.user_status_id
    JOIN "${schemaName}".statuses user_status ON user_status.status_id = user_es.status_id
    WHERE ou.organization_id = p_organization_id
      AND u.primary_phone = p_phone
      AND NOT ou.is_deleted
      AND NOT u.is_deleted
      AND ou_status.status_code = 'ACTIVE'
      AND user_status.status_code = 'ACTIVE'
      AND "${schemaName}".rbac_has_capability(
          p_actor_user_id, p_organization_id, 'COUNTER_ACCESS'
      )
    LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".poynt_create_terminal_pairing(varchar, varchar, varchar, varchar, timestamp without time zone, varchar),
    "${schemaName}".poynt_complete_terminal_pairing(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".counter_lookup_customer(varchar, varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".poynt_create_terminal_pairing(varchar, varchar, varchar, varchar, timestamp without time zone, varchar),
    "${schemaName}".poynt_complete_terminal_pairing(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".counter_lookup_customer(varchar, varchar, varchar)
TO "${appRole}";

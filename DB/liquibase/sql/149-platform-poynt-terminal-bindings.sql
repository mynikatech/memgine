--liquibase formatted sql

--changeset mynikatech:149-platform-poynt-terminal-bindings runOnChange:true splitStatements:false

ALTER TABLE "${schemaName}".poynt_terminal_bindings
    ADD COLUMN IF NOT EXISTS integration_configuration_id varchar(40);

DO $block$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_poynt_terminal_binding_integration'
          AND conrelid = '"${schemaName}".poynt_terminal_bindings'::regclass
    ) THEN
        ALTER TABLE "${schemaName}".poynt_terminal_bindings
            ADD CONSTRAINT fk_poynt_terminal_binding_integration
            FOREIGN KEY (integration_configuration_id)
            REFERENCES "${schemaName}".integration_configurations(integration_configuration_id);
    END IF;
END;
$block$;

CREATE INDEX IF NOT EXISTS ix_poynt_terminal_bindings_integration
    ON "${schemaName}".poynt_terminal_bindings(integration_configuration_id, is_deleted);

/* Backfill only when the existing provider identity resolves to one exact Poynt integration. */
WITH candidates AS (
    SELECT
        b.poynt_terminal_binding_id,
        min(c.integration_configuration_id) AS integration_configuration_id,
        count(*) AS candidate_count
    FROM "${schemaName}".poynt_terminal_bindings b
    JOIN "${schemaName}".commerce_provider_catalog_configurations c
      ON c.organization_id = b.organization_id
     AND c.provider_business_id = b.poynt_business_id
     AND c.provider_store_id = b.poynt_store_id
     AND NOT c.is_deleted
    JOIN "${schemaName}".integration_configurations i
      ON i.integration_configuration_id = c.integration_configuration_id
     AND i.organization_id = b.organization_id
     AND upper(i.provider) = 'POYNT'
     AND NOT i.is_deleted
    WHERE b.integration_configuration_id IS NULL
    GROUP BY b.poynt_terminal_binding_id
)
UPDATE "${schemaName}".poynt_terminal_bindings b
SET integration_configuration_id = c.integration_configuration_id
FROM candidates c
WHERE b.poynt_terminal_binding_id = c.poynt_terminal_binding_id
  AND c.candidate_count = 1;

CREATE UNIQUE INDEX IF NOT EXISTS ux_poynt_terminal_bindings_integration_terminal
    ON "${schemaName}".poynt_terminal_bindings(integration_configuration_id, poynt_terminal_id)
    WHERE integration_configuration_id IS NOT NULL AND NOT is_deleted;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_list_poynt_terminal_bindings(
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "bindingId" varchar,
    "posDeviceId" varchar,
    "organizationId" varchar,
    "storeId" varchar,
    "storeName" varchar,
    "deviceName" varchar,
    "poyntBusinessId" varchar,
    "poyntStoreId" varchar,
    "poyntTerminalId" varchar,
    active boolean,
    "createdAt" text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM integration_configurations i
        WHERE i.integration_configuration_id = p_integration_id
          AND upper(i.provider) = 'POYNT'
          AND NOT i.is_deleted
    ) THEN
        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';
    END IF;

    RETURN QUERY
    SELECT
        b.poynt_terminal_binding_id,
        b.pos_device_id,
        b.organization_id,
        b.store_id,
        s.store_name,
        d.device_name,
        b.poynt_business_id,
        b.poynt_store_id,
        b.poynt_terminal_id,
        NOT b.is_deleted AND NOT d.is_deleted AND d.revoked_at IS NULL,
        b.created_at::text
    FROM poynt_terminal_bindings b
    JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
    JOIN stores s
      ON s.store_id = b.store_id
     AND s.organization_id = b.organization_id
    WHERE b.integration_configuration_id = p_integration_id
    ORDER BY b.is_deleted, d.device_name, b.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_poynt_terminal_binding(
    p_integration_id varchar,
    p_binding_id varchar,
    p_store_id varchar,
    p_device_name varchar,
    p_poynt_business_id varchar,
    p_poynt_store_id varchar,
    p_poynt_terminal_id varchar,
    p_active boolean,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_organization_id varchar(64);
    v_config_business_id varchar(128);
    v_config_store_id varchar(128);
    v_binding_id varchar(64);
    v_pos_device_id varchar(64);
    v_token_hash char(64);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT i.organization_id, c.provider_business_id, c.provider_store_id
    INTO v_organization_id, v_config_business_id, v_config_store_id
    FROM integration_configurations i
    JOIN commerce_provider_catalog_configurations c
      ON c.integration_configuration_id = i.integration_configuration_id
     AND c.organization_id = i.organization_id
     AND NOT c.is_deleted
    WHERE i.integration_configuration_id = p_integration_id
      AND upper(i.provider) = 'POYNT'
      AND NOT i.is_deleted
    FOR UPDATE OF i;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Configured Poynt integration not found' USING ERRCODE = '23503';
    END IF;

    IF NULLIF(btrim(p_device_name), '') IS NULL
       OR length(p_device_name) > 150
       OR NULLIF(btrim(p_poynt_business_id), '') IS NULL
       OR NULLIF(btrim(p_poynt_store_id), '') IS NULL
       OR NULLIF(btrim(p_poynt_terminal_id), '') IS NULL
       OR p_active IS NULL THEN
        RAISE EXCEPTION 'Invalid Poynt terminal binding' USING ERRCODE = '22023';
    END IF;

    IF btrim(p_poynt_business_id) IS DISTINCT FROM btrim(v_config_business_id)
       OR (
           NULLIF(btrim(v_config_store_id), '') IS NOT NULL
           AND btrim(p_poynt_store_id) IS DISTINCT FROM btrim(v_config_store_id)
       ) THEN
        RAISE EXCEPTION 'Terminal provider identity does not match Poynt integration' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM stores s
        WHERE s.store_id = p_store_id
          AND s.organization_id = v_organization_id
          AND NOT s.is_deleted
    ) THEN
        RAISE EXCEPTION 'Memgine store does not belong to the integration organization' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM poynt_terminal_bindings b
        WHERE b.integration_configuration_id = p_integration_id
          AND b.poynt_terminal_id = btrim(p_poynt_terminal_id)
          AND NOT b.is_deleted
          AND (p_create OR b.poynt_terminal_binding_id <> p_binding_id)
    ) THEN
        RAISE EXCEPTION 'Poynt terminal is already bound to this integration' USING ERRCODE = '23505';
    END IF;

    IF p_create THEN
        v_binding_id := generate_runtime_id('PTB');
        v_pos_device_id := generate_runtime_id('POS');
        v_token_hash := (
            md5(gen_random_uuid()::text || random()::text) ||
            md5(clock_timestamp()::text || gen_random_uuid()::text)
        )::char(64);

        INSERT INTO pos_devices(
            pos_device_id,
            organization_id,
            store_id,
            device_name,
            device_token_hash,
            revoked_at,
            created_by,
            updated_by
        ) VALUES (
            v_pos_device_id,
            v_organization_id,
            p_store_id,
            btrim(p_device_name),
            v_token_hash,
            CASE WHEN p_active THEN NULL ELSE CURRENT_TIMESTAMP END,
            p_actor_user_id,
            p_actor_user_id
        );

        INSERT INTO poynt_terminal_bindings(
            poynt_terminal_binding_id,
            pos_device_id,
            organization_id,
            store_id,
            poynt_business_id,
            poynt_store_id,
            poynt_terminal_id,
            integration_configuration_id,
            created_by,
            is_deleted
        ) VALUES (
            v_binding_id,
            v_pos_device_id,
            v_organization_id,
            p_store_id,
            btrim(p_poynt_business_id),
            btrim(p_poynt_store_id),
            btrim(p_poynt_terminal_id),
            p_integration_id,
            p_actor_user_id,
            NOT p_active
        );
    ELSE
        SELECT b.pos_device_id
        INTO v_pos_device_id
        FROM poynt_terminal_bindings b
        JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
        WHERE b.poynt_terminal_binding_id = p_binding_id
          AND b.integration_configuration_id = p_integration_id
          AND b.organization_id = v_organization_id
          AND d.organization_id = v_organization_id
        FOR UPDATE OF b, d;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Poynt terminal binding not found' USING ERRCODE = 'P0002';
        END IF;

        UPDATE pos_devices
        SET store_id = p_store_id,
            device_name = btrim(p_device_name),
            revoked_at = CASE WHEN p_active THEN NULL ELSE COALESCE(revoked_at, CURRENT_TIMESTAMP) END,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE pos_device_id = v_pos_device_id
          AND organization_id = v_organization_id;

        UPDATE poynt_terminal_bindings
        SET store_id = p_store_id,
            poynt_business_id = btrim(p_poynt_business_id),
            poynt_store_id = btrim(p_poynt_store_id),
            poynt_terminal_id = btrim(p_poynt_terminal_id),
            is_deleted = NOT p_active
        WHERE poynt_terminal_binding_id = p_binding_id
          AND integration_configuration_id = p_integration_id
          AND organization_id = v_organization_id;

        v_binding_id := p_binding_id;
    END IF;

    RETURN v_binding_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_list_poynt_terminal_bindings(
    p_organization_id varchar,
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "bindingId" varchar, "posDeviceId" varchar, "organizationId" varchar,
    "storeId" varchar, "storeName" varchar, "deviceName" varchar,
    "poyntBusinessId" varchar, "poyntStoreId" varchar, "poyntTerminalId" varchar,
    active boolean, "createdAt" text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM integration_configurations i
        WHERE i.integration_configuration_id = p_integration_id
          AND i.organization_id = p_organization_id
          AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted
    ) THEN
        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';
    END IF;
    RETURN QUERY
    SELECT b.poynt_terminal_binding_id, b.pos_device_id, b.organization_id, b.store_id,
           s.store_name, d.device_name, b.poynt_business_id, b.poynt_store_id,
           b.poynt_terminal_id, NOT b.is_deleted AND NOT d.is_deleted AND d.revoked_at IS NULL,
           b.created_at::text
    FROM poynt_terminal_bindings b
    JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
    JOIN stores s ON s.store_id = b.store_id AND s.organization_id = b.organization_id
    WHERE b.organization_id = p_organization_id
      AND b.integration_configuration_id = p_integration_id
    ORDER BY b.is_deleted, d.device_name, b.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_save_poynt_terminal_binding(
    p_organization_id varchar, p_integration_id varchar, p_binding_id varchar,
    p_store_id varchar, p_device_name varchar, p_poynt_store_id varchar,
    p_poynt_terminal_id varchar, p_active boolean, p_actor_user_id varchar, p_create boolean
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_business_id varchar(128); v_config_store_id varchar(128); v_binding_id varchar(64);
    v_pos_device_id varchar(64); v_token_hash char(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT c.provider_business_id, c.provider_store_id INTO v_business_id, v_config_store_id
    FROM integration_configurations i
    JOIN commerce_provider_catalog_configurations c
      ON c.integration_configuration_id = i.integration_configuration_id
     AND c.organization_id = i.organization_id AND NOT c.is_deleted
    WHERE i.integration_configuration_id = p_integration_id AND i.organization_id = p_organization_id
      AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted
      AND c.connection_status = 'VERIFIED'
    FOR UPDATE OF i;
    IF NOT FOUND OR NULLIF(btrim(v_business_id), '') IS NULL THEN
        RAISE EXCEPTION 'Verified Poynt integration is required' USING ERRCODE = '23503';
    END IF;
    IF NULLIF(btrim(p_device_name), '') IS NULL OR length(p_device_name) > 150
       OR NULLIF(btrim(p_poynt_terminal_id), '') IS NULL OR length(p_poynt_terminal_id) > 128
       OR p_active IS NULL THEN
        RAISE EXCEPTION 'Invalid Poynt terminal binding' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(v_config_store_id), '') IS NOT NULL
       AND NULLIF(btrim(p_poynt_store_id), '') IS DISTINCT FROM btrim(v_config_store_id) THEN
        RAISE EXCEPTION 'Terminal Poynt store does not match configured integration' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stores s WHERE s.store_id = p_store_id
                   AND s.organization_id = p_organization_id AND NOT s.is_deleted) THEN
        RAISE EXCEPTION 'Memgine store does not belong to the organization' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM poynt_terminal_bindings b
               WHERE b.integration_configuration_id = p_integration_id
                 AND b.poynt_terminal_id = btrim(p_poynt_terminal_id) AND NOT b.is_deleted
                 AND (p_create OR b.poynt_terminal_binding_id <> p_binding_id)) THEN
        RAISE EXCEPTION 'Poynt terminal is already bound to this integration' USING ERRCODE = '23505';
    END IF;
    IF p_create THEN
        v_binding_id := generate_runtime_id('PTB'); v_pos_device_id := generate_runtime_id('POS');
        v_token_hash := (md5(gen_random_uuid()::text || random()::text) || md5(clock_timestamp()::text || gen_random_uuid()::text))::char(64);
        INSERT INTO pos_devices(pos_device_id, organization_id, store_id, device_name, device_token_hash, revoked_at, created_by, updated_by)
        VALUES (v_pos_device_id, p_organization_id, p_store_id, btrim(p_device_name), v_token_hash,
                CASE WHEN p_active THEN NULL ELSE CURRENT_TIMESTAMP END, p_actor_user_id, p_actor_user_id);
        INSERT INTO poynt_terminal_bindings(poynt_terminal_binding_id, pos_device_id, organization_id, store_id,
            poynt_business_id, poynt_store_id, poynt_terminal_id, integration_configuration_id, created_by, is_deleted)
        VALUES (v_binding_id, v_pos_device_id, p_organization_id, p_store_id, btrim(v_business_id),
            NULLIF(btrim(p_poynt_store_id), ''), btrim(p_poynt_terminal_id), p_integration_id, p_actor_user_id, NOT p_active);
    ELSE
        SELECT b.pos_device_id INTO v_pos_device_id FROM poynt_terminal_bindings b
        JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
        WHERE b.poynt_terminal_binding_id = p_binding_id AND b.organization_id = p_organization_id
          AND b.integration_configuration_id = p_integration_id AND d.organization_id = p_organization_id
        FOR UPDATE OF b, d;
        IF NOT FOUND THEN RAISE EXCEPTION 'Poynt terminal binding not found' USING ERRCODE = 'P0002'; END IF;
        UPDATE pos_devices SET store_id = p_store_id, device_name = btrim(p_device_name),
            revoked_at = CASE WHEN p_active THEN NULL ELSE COALESCE(revoked_at, CURRENT_TIMESTAMP) END,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE pos_device_id = v_pos_device_id AND organization_id = p_organization_id;
        UPDATE poynt_terminal_bindings SET store_id = p_store_id, poynt_business_id = btrim(v_business_id),
            poynt_store_id = NULLIF(btrim(p_poynt_store_id), ''), poynt_terminal_id = btrim(p_poynt_terminal_id), is_deleted = NOT p_active
        WHERE poynt_terminal_binding_id = p_binding_id AND organization_id = p_organization_id
          AND integration_configuration_id = p_integration_id;
        v_binding_id := p_binding_id;
    END IF;
    RETURN v_binding_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_deactivate_poynt_terminal_binding(
    p_organization_id varchar, p_integration_id varchar, p_binding_id varchar, p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_pos_device_id varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT b.pos_device_id INTO v_pos_device_id FROM poynt_terminal_bindings b
    JOIN integration_configurations i ON i.integration_configuration_id = b.integration_configuration_id
      AND i.organization_id = b.organization_id AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted
    WHERE b.poynt_terminal_binding_id = p_binding_id AND b.organization_id = p_organization_id
      AND b.integration_configuration_id = p_integration_id FOR UPDATE OF b;
    IF NOT FOUND THEN RAISE EXCEPTION 'Poynt terminal binding not found' USING ERRCODE = 'P0002'; END IF;
    UPDATE poynt_terminal_bindings SET is_deleted = true WHERE poynt_terminal_binding_id = p_binding_id
      AND organization_id = p_organization_id AND integration_configuration_id = p_integration_id;
    UPDATE pos_devices SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id, version_no = version_no + 1 WHERE pos_device_id = v_pos_device_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_deactivate_poynt_terminal_binding(
    p_integration_id varchar,
    p_binding_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_pos_device_id varchar(64);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT b.pos_device_id
    INTO v_pos_device_id
    FROM poynt_terminal_bindings b
    JOIN integration_configurations i
      ON i.integration_configuration_id = b.integration_configuration_id
     AND i.organization_id = b.organization_id
     AND upper(i.provider) = 'POYNT'
     AND NOT i.is_deleted
    WHERE b.poynt_terminal_binding_id = p_binding_id
      AND b.integration_configuration_id = p_integration_id
    FOR UPDATE OF b;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Poynt terminal binding not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE poynt_terminal_bindings
    SET is_deleted = true
    WHERE poynt_terminal_binding_id = p_binding_id
      AND integration_configuration_id = p_integration_id;

    UPDATE pos_devices
    SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE pos_device_id = v_pos_device_id;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".platform_list_poynt_terminal_bindings(varchar, varchar),
    "${schemaName}".platform_save_poynt_terminal_binding(varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar, boolean),
    "${schemaName}".platform_deactivate_poynt_terminal_binding(varchar, varchar, varchar)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".organization_list_poynt_terminal_bindings(varchar, varchar, varchar),
    "${schemaName}".organization_save_poynt_terminal_binding(varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar, boolean),
    "${schemaName}".organization_deactivate_poynt_terminal_binding(varchar, varchar, varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".platform_list_poynt_terminal_bindings(varchar, varchar),
    "${schemaName}".platform_save_poynt_terminal_binding(varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar, boolean),
    "${schemaName}".platform_deactivate_poynt_terminal_binding(varchar, varchar, varchar)
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
    "${schemaName}".organization_list_poynt_terminal_bindings(varchar, varchar, varchar),
    "${schemaName}".organization_save_poynt_terminal_binding(varchar, varchar, varchar, varchar, varchar, varchar, varchar, boolean, varchar, boolean),
    "${schemaName}".organization_deactivate_poynt_terminal_binding(varchar, varchar, varchar, varchar)
TO "${appRole}";

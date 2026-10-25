--liquibase formatted sql

--changeset mynikatech:207-poynt-store-catalog-configuration splitStatements:false

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_store_catalog_configurations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64) NOT NULL REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    store_id varchar(64) NOT NULL REFERENCES "${schemaName}".stores(store_id),
    poynt_store_id varchar(128) NOT NULL,
    effective_catalog_id varchar(128) NOT NULL,
    effective_catalog_name varchar(256),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ux_poynt_store_catalog_configuration
        UNIQUE (organization_id, integration_configuration_id, store_id)
);

CREATE INDEX IF NOT EXISTS ix_poynt_store_catalog_configurations_integration
    ON "${schemaName}".poynt_store_catalog_configurations(integration_configuration_id, store_id);

CREATE OR REPLACE FUNCTION "${schemaName}".organization_get_poynt_operational_configuration(
    p_organization_id varchar,
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "organizationId" varchar,
    "integrationConfigurationId" varchar,
    "applicationId" varchar,
    "providerBusinessId" varchar,
    "credentialSecretReference" varchar,
    "merchantCurrencyCode" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization Poynt configuration is not permitted' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT i.organization_id, i.integration_configuration_id, c.application_id,
           c.provider_business_id, cp.secret_reference, c.merchant_currency_code
      FROM integration_configurations i
      JOIN commerce_provider_catalog_configurations c
        ON c.integration_configuration_id = i.integration_configuration_id
       AND c.organization_id = i.organization_id AND NOT c.is_deleted
       JOIN poynt_credential_profiles cp
         ON cp.credential_profile_id = c.credential_profile_id
        AND NOT cp.is_deleted AND cp.is_active
     WHERE i.organization_id = p_organization_id
       AND i.integration_configuration_id = p_integration_id
       AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted
       AND c.connection_status = 'VERIFIED'
       AND NULLIF(btrim(c.provider_business_id), '') IS NOT NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Verified Poynt integration is not available' USING ERRCODE = '23503';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_list_poynt_store_catalog_configurations(
    p_organization_id varchar,
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "storeId" varchar,
    "storeName" varchar,
    "poyntStoreId" varchar,
    "effectiveCatalogId" varchar,
    "effectiveCatalogName" varchar,
    "configurationStatus" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization Poynt configuration is not permitted' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM integration_configurations i WHERE i.integration_configuration_id = p_integration_id AND i.organization_id = p_organization_id AND upper(i.provider) = 'POYNT' AND NOT i.is_deleted) THEN
        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';
    END IF;
    RETURN QUERY
    SELECT s.store_id, s.store_name, c.poynt_store_id, c.effective_catalog_id,
           c.effective_catalog_name,
           CASE WHEN c.id IS NULL THEN 'NOT_CONFIGURED' ELSE 'CONFIGURED' END
      FROM stores s
      LEFT JOIN poynt_store_catalog_configurations c
        ON c.organization_id = s.organization_id
       AND c.integration_configuration_id = p_integration_id
       AND c.store_id = s.store_id
     WHERE s.organization_id = p_organization_id AND NOT s.is_deleted
     ORDER BY s.store_name, s.store_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_save_poynt_store_terminal_assignment(
    p_organization_id varchar,
    p_integration_id varchar,
    p_store_id varchar,
    p_poynt_store_id varchar,
    p_catalog_id varchar,
    p_catalog_name varchar,
    p_terminal_id varchar,
    p_device_name varchar,
    p_actor_user_id varchar,
    p_verified_bindings jsonb
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_business_id varchar(128);
    v_actor varchar(64);
    v_binding_id varchar(64);
    v_pos_device_id varchar(64);
    v_token_hash char(64);
    v_device_revoked_at timestamptz;
    v_existing_binding_found boolean := false;
    v_existing_config poynt_store_catalog_configurations%ROWTYPE;
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization terminal binding management is not permitted' USING ERRCODE = '42501';
    END IF;
    IF p_verified_bindings IS NULL OR jsonb_typeof(p_verified_bindings) <> 'array' THEN
        RAISE EXCEPTION 'Verified terminal binding snapshot is required' USING ERRCODE = '22023';
    END IF;
    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'poynt-store-catalog:' || p_organization_id || ':' || p_integration_id || ':' || p_store_id,
            0
        )
    );
    PERFORM 1 FROM integration_configurations i
      JOIN commerce_provider_catalog_configurations c ON c.integration_configuration_id=i.integration_configuration_id AND c.organization_id=i.organization_id AND NOT c.is_deleted
     WHERE i.organization_id=p_organization_id AND i.integration_configuration_id=p_integration_id
       AND upper(i.provider)='POYNT' AND NOT i.is_deleted AND c.connection_status='VERIFIED'
       AND NULLIF(btrim(c.provider_business_id),'') IS NOT NULL
     FOR UPDATE OF i;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified Poynt integration is required' USING ERRCODE='23503'; END IF;
    SELECT provider_business_id INTO v_business_id FROM commerce_provider_catalog_configurations WHERE integration_configuration_id=p_integration_id AND organization_id=p_organization_id AND NOT is_deleted FOR UPDATE;
    IF NULLIF(btrim(p_store_id),'') IS NULL OR NULLIF(btrim(p_poynt_store_id),'') IS NULL OR NULLIF(btrim(p_catalog_id),'') IS NULL OR NULLIF(btrim(p_terminal_id),'') IS NULL OR NULLIF(btrim(p_device_name),'') IS NULL THEN
        RAISE EXCEPTION 'Validated Poynt store, catalog and terminal are required' USING ERRCODE='22023';
    END IF;
    PERFORM 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Memgine store does not belong to the organization' USING ERRCODE='22023'; END IF;
    PERFORM 1
      FROM poynt_terminal_bindings b
      JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
     WHERE b.organization_id = p_organization_id
       AND b.integration_configuration_id = p_integration_id
       AND b.store_id = p_store_id
       AND NOT b.is_deleted
     ORDER BY b.poynt_terminal_binding_id
     FOR UPDATE OF b, d;
    -- The provider verification occurs before this transaction. Treat its binding
    -- list as an exact set: duplicates, omissions, and additions are all stale.
    IF EXISTS (
        WITH verified AS (
            SELECT *
            FROM jsonb_to_recordset(p_verified_bindings) AS snapshot(
                "bindingId" varchar,
                "posDeviceId" varchar,
                "terminalId" varchar,
                "poyntBusinessId" varchar,
                "poyntStoreId" varchar,
                "catalogId" varchar,
                active boolean
            )
        )
        SELECT 1
        FROM verified
        WHERE NULLIF(btrim("bindingId"), '') IS NULL
        UNION ALL
        SELECT 1
        FROM verified
        GROUP BY "bindingId"
        HAVING count(*) <> 1
    ) THEN
        RAISE EXCEPTION 'Terminal bindings changed during provider verification' USING ERRCODE = '40001';
    END IF;

    -- Every current nondeleted binding must have exactly one verified snapshot row.
    IF EXISTS (
        WITH verified AS (
            SELECT *
            FROM jsonb_to_recordset(p_verified_bindings) AS snapshot(
                "bindingId" varchar,
                "posDeviceId" varchar,
                "terminalId" varchar,
                "poyntBusinessId" varchar,
                "poyntStoreId" varchar,
                "catalogId" varchar,
                active boolean
            )
        ), current_bindings AS (
            SELECT b.poynt_terminal_binding_id
            FROM poynt_terminal_bindings b
            WHERE b.organization_id = p_organization_id
              AND b.integration_configuration_id = p_integration_id
              AND b.store_id = p_store_id
              AND NOT b.is_deleted
        )
        SELECT 1
        FROM current_bindings current_binding
        LEFT JOIN verified
          ON verified."bindingId" = current_binding.poynt_terminal_binding_id
        GROUP BY current_binding.poynt_terminal_binding_id
        HAVING count(verified."bindingId") <> 1
    ) THEN
        RAISE EXCEPTION 'Terminal bindings changed during provider verification' USING ERRCODE = '40001';
    END IF;

    -- Every snapshot row must identify one current binding in this exact scope.
    IF EXISTS (
        WITH verified AS (
            SELECT *
            FROM jsonb_to_recordset(p_verified_bindings) AS snapshot(
                "bindingId" varchar,
                "posDeviceId" varchar,
                "terminalId" varchar,
                "poyntBusinessId" varchar,
                "poyntStoreId" varchar,
                "catalogId" varchar,
                active boolean
            )
        )
        SELECT 1
        FROM verified
        LEFT JOIN poynt_terminal_bindings b
          ON b.poynt_terminal_binding_id = verified."bindingId"
         AND b.organization_id = p_organization_id
         AND b.integration_configuration_id = p_integration_id
         AND b.store_id = p_store_id
         AND NOT b.is_deleted
        WHERE b.poynt_terminal_binding_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Terminal bindings changed during provider verification' USING ERRCODE = '40001';
    END IF;

    IF EXISTS (
        WITH verified AS (
            SELECT *
            FROM jsonb_to_recordset(p_verified_bindings) AS snapshot(
                "bindingId" varchar,
                "posDeviceId" varchar,
                "terminalId" varchar,
                "poyntBusinessId" varchar,
                "poyntStoreId" varchar,
                "catalogId" varchar,
                active boolean
            )
        )
        SELECT 1
        FROM verified
        JOIN poynt_terminal_bindings b
          ON b.poynt_terminal_binding_id = verified."bindingId"
         AND b.organization_id = p_organization_id
         AND b.integration_configuration_id = p_integration_id
         AND b.store_id = p_store_id
         AND NOT b.is_deleted
        JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
        WHERE verified.active IS DISTINCT FROM (
                  NOT b.is_deleted
              AND NOT d.is_deleted
              AND d.revoked_at IS NULL
              )
           OR verified."catalogId" IS DISTINCT FROM btrim(p_catalog_id)
           OR b.pos_device_id IS DISTINCT FROM verified."posDeviceId"
           OR b.poynt_terminal_id IS DISTINCT FROM verified."terminalId"
           OR b.poynt_business_id IS DISTINCT FROM verified."poyntBusinessId"
           OR b.poynt_store_id IS DISTINCT FROM verified."poyntStoreId"
           OR b.is_deleted
           OR d.is_deleted
           OR d.revoked_at IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Terminal bindings changed during provider verification' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_existing_config FROM poynt_store_catalog_configurations
     WHERE organization_id=p_organization_id AND integration_configuration_id=p_integration_id AND store_id=p_store_id FOR UPDATE;
    IF v_existing_config.id IS NOT NULL
       AND (v_existing_config.poynt_store_id IS DISTINCT FROM btrim(p_poynt_store_id)
            OR v_existing_config.effective_catalog_id IS DISTINCT FROM btrim(p_catalog_id)) THEN
        RAISE EXCEPTION 'Memgine store already has a different verified Poynt store or catalog' USING ERRCODE='23505';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM poynt_terminal_bindings b
        WHERE b.organization_id = p_organization_id
          AND b.integration_configuration_id = p_integration_id
          AND b.store_id = p_store_id
          AND NOT b.is_deleted
          AND (
              btrim(b.poynt_business_id) IS DISTINCT FROM btrim(v_business_id)
              OR btrim(b.poynt_store_id) IS DISTINCT FROM btrim(p_poynt_store_id)
          )
    ) THEN
        RAISE EXCEPTION 'Existing terminal bindings are inconsistent with the verified Poynt Store configuration' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM poynt_terminal_bindings b WHERE b.integration_configuration_id=p_integration_id AND b.poynt_terminal_id=btrim(p_terminal_id) AND NOT b.is_deleted AND b.store_id<>p_store_id) THEN
        RAISE EXCEPTION 'Poynt terminal is already bound to another Memgine store' USING ERRCODE='23505';
    END IF;
    SELECT b.poynt_terminal_binding_id, b.pos_device_id, d.revoked_at
      INTO v_binding_id, v_pos_device_id, v_device_revoked_at
      FROM poynt_terminal_bindings b
      JOIN pos_devices d ON d.pos_device_id = b.pos_device_id
     WHERE b.integration_configuration_id = p_integration_id
       AND b.poynt_terminal_id = btrim(p_terminal_id)
       AND NOT b.is_deleted
     FOR UPDATE OF b, d;
    v_existing_binding_found := FOUND;

    IF v_existing_binding_found AND (
        v_device_revoked_at IS NOT NULL
        OR EXISTS (
            SELECT 1
            FROM poynt_terminal_bindings b
            WHERE b.poynt_terminal_binding_id = v_binding_id
              AND (b.organization_id <> p_organization_id OR b.store_id <> p_store_id)
        )
    ) THEN
        RAISE EXCEPTION 'Existing Poynt terminal binding requires explicit reconciliation or activation' USING ERRCODE='22023';
    END IF;
    IF NOT v_existing_binding_found AND EXISTS (
        SELECT 1
        FROM poynt_terminal_bindings b
        WHERE b.integration_configuration_id = p_integration_id
          AND b.poynt_terminal_id = btrim(p_terminal_id)
    ) THEN
        RAISE EXCEPTION 'Existing Poynt terminal binding requires explicit reconciliation or activation' USING ERRCODE='22023';
    END IF;

    INSERT INTO poynt_store_catalog_configurations(
        organization_id, integration_configuration_id, store_id, poynt_store_id,
        effective_catalog_id, effective_catalog_name, created_by, updated_by
    ) VALUES(
        p_organization_id, p_integration_id, p_store_id, btrim(p_poynt_store_id),
        btrim(p_catalog_id), NULLIF(btrim(p_catalog_name), ''), v_actor, v_actor
    ) ON CONFLICT (organization_id, integration_configuration_id, store_id) DO UPDATE
        SET effective_catalog_name = EXCLUDED.effective_catalog_name,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_actor,
            version_no = poynt_store_catalog_configurations.version_no + 1
      WHERE EXCLUDED.effective_catalog_name IS NOT NULL
        AND poynt_store_catalog_configurations.effective_catalog_name
            IS DISTINCT FROM EXCLUDED.effective_catalog_name;
    IF v_binding_id IS NOT NULL THEN
        RETURN v_binding_id;
    END IF;
    v_binding_id:=generate_runtime_id('PTB'); v_pos_device_id:=generate_runtime_id('POS');
    v_token_hash:=(md5(gen_random_uuid()::text || random()::text)||md5(clock_timestamp()::text || gen_random_uuid()::text))::char(64);
    INSERT INTO pos_devices(pos_device_id,organization_id,store_id,device_name,device_token_hash,created_by,updated_by) VALUES(v_pos_device_id,p_organization_id,p_store_id,btrim(p_device_name),v_token_hash,v_actor,v_actor);
    INSERT INTO poynt_terminal_bindings(poynt_terminal_binding_id,pos_device_id,organization_id,store_id,poynt_business_id,poynt_store_id,poynt_terminal_id,integration_configuration_id,created_by)
    VALUES(v_binding_id,v_pos_device_id,p_organization_id,p_store_id,btrim(v_business_id),btrim(p_poynt_store_id),btrim(p_terminal_id),p_integration_id,v_actor);
    RETURN v_binding_id;
END;
$function$;

-- The prior write endpoint cannot establish a verified terminal/catalog association.
CREATE OR REPLACE FUNCTION "${schemaName}".organization_save_poynt_terminal_binding(
    p_organization_id varchar, p_integration_id varchar, p_binding_id varchar,
    p_store_id varchar, p_device_name varchar, p_poynt_store_id varchar,
    p_poynt_terminal_id varchar, p_active boolean, p_actor_user_id varchar, p_create boolean
)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT p_create AND NOT p_active AND p_binding_id IS NOT NULL THEN
        PERFORM organization_deactivate_poynt_terminal_binding(
            p_organization_id, p_integration_id, p_binding_id, p_actor_user_id
        );
        RETURN p_binding_id;
    END IF;
    RAISE EXCEPTION 'Use validated Poynt terminal discovery before saving a terminal assignment' USING ERRCODE='22023';
END;
$function$;

-- Platform diagnostics may read bindings, but direct writes cannot establish a
-- verified store/catalog association either.
CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_poynt_terminal_binding(
    p_integration_id varchar, p_binding_id varchar, p_store_id varchar,
    p_device_name varchar, p_poynt_business_id varchar, p_poynt_store_id varchar,
    p_poynt_terminal_id varchar, p_active boolean, p_actor_user_id varchar, p_create boolean
)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT p_create AND NOT p_active AND p_binding_id IS NOT NULL THEN
        PERFORM platform_deactivate_poynt_terminal_binding(
            p_integration_id, p_binding_id, p_actor_user_id
        );
        RETURN p_binding_id;
    END IF;
    RAISE EXCEPTION 'Use validated Poynt terminal discovery before saving a terminal assignment' USING ERRCODE='22023';
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".poynt_store_catalog_configurations FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".organization_get_poynt_operational_configuration(varchar,varchar,varchar),"${schemaName}".organization_list_poynt_store_catalog_configurations(varchar,varchar,varchar),"${schemaName}".organization_save_poynt_store_terminal_assignment(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb),"${schemaName}".organization_save_poynt_terminal_binding(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar,boolean),"${schemaName}".platform_save_poynt_terminal_binding(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".organization_get_poynt_operational_configuration(varchar,varchar,varchar),"${schemaName}".organization_list_poynt_store_catalog_configurations(varchar,varchar,varchar),"${schemaName}".organization_save_poynt_store_terminal_assignment(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,jsonb),"${schemaName}".organization_save_poynt_terminal_binding(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar,boolean),"${schemaName}".platform_save_poynt_terminal_binding(varchar,varchar,varchar,varchar,varchar,varchar,varchar,boolean,varchar,boolean) TO "${appRole}";

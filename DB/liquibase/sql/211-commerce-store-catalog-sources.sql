--liquibase formatted sql

--changeset mynikatech:211-commerce-store-catalog-sources splitStatements:false

-- An explicit administrative choice of catalog source. The verified Store/catalog
-- configuration remains owned by the Poynt terminal configuration tables.
CREATE TABLE "${schemaName}".commerce_store_catalog_sources (
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".stores(store_id),
    integration_configuration_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (organization_id, store_id)
);

CREATE INDEX ix_commerce_store_catalog_sources_integration
    ON "${schemaName}".commerce_store_catalog_sources(
        organization_id,
        integration_configuration_id
    );

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_store_catalog_source(
    p_organization_id varchar,
    p_store_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "organizationId" varchar,
    "storeId" varchar,
    "integrationConfigurationId" varchar,
    "integrationName" varchar,
    "providerCode" varchar,
    "catalogId" varchar,
    "catalogName" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization catalog-source management is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM stores s
        WHERE s.organization_id = p_organization_id
          AND s.store_id = p_store_id
          AND NOT s.is_deleted
    ) THEN
        RAISE EXCEPTION 'Memgine store does not belong to the organization'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT source.organization_id,
           source.store_id,
           source.integration_configuration_id,
           integration.integration_name,
           upper(integration.provider)::varchar,
           configuration.effective_catalog_id,
           configuration.effective_catalog_name,
           source.version_no
    FROM commerce_store_catalog_sources source
    JOIN integration_configurations integration
      ON integration.integration_configuration_id = source.integration_configuration_id
     AND integration.organization_id = source.organization_id
     AND NOT integration.is_deleted
    LEFT JOIN poynt_store_catalog_configurations configuration
      ON configuration.organization_id = source.organization_id
     AND configuration.store_id = source.store_id
     AND configuration.integration_configuration_id = source.integration_configuration_id
    WHERE source.organization_id = p_organization_id
      AND source.store_id = p_store_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_list_store_catalog_source_candidates(
    p_organization_id varchar,
    p_store_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "integrationName" varchar,
    "providerCode" varchar,
    "catalogId" varchar,
    "catalogName" varchar,
    eligible boolean,
    "ineligibilityReason" varchar
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization catalog-source management is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM stores s
        WHERE s.organization_id = p_organization_id
          AND s.store_id = p_store_id
          AND NOT s.is_deleted
    ) THEN
        RAISE EXCEPTION 'Memgine store does not belong to the organization'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT integration.integration_configuration_id,
           integration.integration_name,
           upper(integration.provider)::varchar,
           configuration.effective_catalog_id,
           configuration.effective_catalog_name,
           COALESCE((
               integration_status.is_active
               AND integration_state.status_code = 'ACTIVE'
               AND provider_configuration.connection_status = 'VERIFIED'
               AND NULLIF(btrim(configuration.effective_catalog_id), '') IS NOT NULL
               AND EXISTS (
                   SELECT 1
                   FROM poynt_terminal_bindings binding
                   JOIN pos_devices device
                     ON device.pos_device_id = binding.pos_device_id
                   WHERE binding.organization_id = p_organization_id
                     AND binding.integration_configuration_id = integration.integration_configuration_id
                     AND binding.store_id = p_store_id
                     AND NOT binding.is_deleted
                     AND NOT device.is_deleted
                     AND device.revoked_at IS NULL
               )
           ), false),
           (CASE
               WHEN NOT integration_status.is_active
                    OR integration_state.status_code IS DISTINCT FROM 'ACTIVE'
                   THEN 'This integration is inactive.'
               WHEN provider_configuration.integration_configuration_id IS NULL
                    OR provider_configuration.connection_status IS DISTINCT FROM 'VERIFIED'
                   THEN 'Poynt authentication must be verified by Platform Admin.'
               WHEN configuration.organization_id IS NULL
                    OR NULLIF(btrim(configuration.effective_catalog_id), '') IS NULL
                   THEN 'Configure this integration for the selected Store in the Integrations section above.'
               WHEN NOT EXISTS (
                   SELECT 1
                   FROM poynt_terminal_bindings binding
                   JOIN pos_devices device
                     ON device.pos_device_id = binding.pos_device_id
                   WHERE binding.organization_id = p_organization_id
                     AND binding.integration_configuration_id = integration.integration_configuration_id
                     AND binding.store_id = p_store_id
                     AND NOT binding.is_deleted
                     AND NOT device.is_deleted
                     AND device.revoked_at IS NULL
               ) THEN 'An active verified terminal is required for this Store.'
               ELSE NULL
           END)::varchar
    FROM integration_configurations integration
    JOIN entity_status integration_status
      ON integration_status.entity_status_id = integration.integration_status_id
    JOIN statuses integration_state
      ON integration_state.status_id = integration_status.status_id
    LEFT JOIN commerce_provider_catalog_configurations provider_configuration
      ON provider_configuration.integration_configuration_id = integration.integration_configuration_id
     AND provider_configuration.organization_id = integration.organization_id
     AND NOT provider_configuration.is_deleted
    LEFT JOIN poynt_store_catalog_configurations configuration
      ON configuration.organization_id = integration.organization_id
     AND configuration.integration_configuration_id = integration.integration_configuration_id
     AND configuration.store_id = p_store_id
    WHERE integration.organization_id = p_organization_id
      AND upper(integration.provider) = 'POYNT'
      AND NOT integration.is_deleted
    ORDER BY integration.integration_name, integration.integration_configuration_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_save_store_catalog_source(
    p_organization_id varchar,
    p_store_id varchar,
    p_integration_configuration_id varchar,
    p_version_no integer,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_source commerce_store_catalog_sources%ROWTYPE;
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_store_id), '') IS NULL
       OR NULLIF(btrim(p_integration_configuration_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR p_version_no IS NULL
       OR p_version_no < 0 THEN
        RAISE EXCEPTION 'Invalid Store catalog source' USING ERRCODE = '22023';
    END IF;

    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization catalog-source management is not permitted'
            USING ERRCODE = '42501';
    END IF;

    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    PERFORM pg_advisory_xact_lock(
        hashtextextended(
            'commerce-store-catalog-source:' || p_organization_id || ':' || p_store_id,
            0
        )
    );

    PERFORM 1
    FROM stores s
    WHERE s.organization_id = p_organization_id
      AND s.store_id = p_store_id
      AND NOT s.is_deleted
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Memgine store does not belong to the organization'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM integration_configurations integration
    JOIN entity_status integration_status
      ON integration_status.entity_status_id = integration.integration_status_id
    JOIN statuses integration_state
      ON integration_state.status_id = integration_status.status_id
    JOIN commerce_provider_catalog_configurations provider_configuration
      ON provider_configuration.integration_configuration_id = integration.integration_configuration_id
     AND provider_configuration.organization_id = integration.organization_id
     AND NOT provider_configuration.is_deleted
    JOIN poynt_store_catalog_configurations configuration
      ON configuration.organization_id = integration.organization_id
     AND configuration.integration_configuration_id = integration.integration_configuration_id
     AND configuration.store_id = p_store_id
    WHERE integration.organization_id = p_organization_id
      AND integration.integration_configuration_id = p_integration_configuration_id
      AND upper(integration.provider) = 'POYNT'
      AND NOT integration.is_deleted
      AND integration_status.is_active
      AND integration_state.status_code = 'ACTIVE'
      AND provider_configuration.connection_status = 'VERIFIED'
      AND NULLIF(btrim(configuration.effective_catalog_id), '') IS NOT NULL
    FOR UPDATE OF integration, provider_configuration, configuration;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected integration does not have a verified Store catalog configuration'
            USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM poynt_terminal_bindings binding
    JOIN pos_devices device
      ON device.pos_device_id = binding.pos_device_id
    WHERE binding.organization_id = p_organization_id
      AND binding.integration_configuration_id = p_integration_configuration_id
      AND binding.store_id = p_store_id
      AND NOT binding.is_deleted
      AND NOT device.is_deleted
      AND device.revoked_at IS NULL
    FOR UPDATE OF binding, device;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected integration has no active verified terminal for this Store'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_source
      FROM commerce_store_catalog_sources
     WHERE organization_id = p_organization_id
       AND store_id = p_store_id
     FOR UPDATE;

    IF FOUND THEN
        IF v_source.version_no <> p_version_no THEN
            RAISE EXCEPTION 'Store catalog source was changed' USING ERRCODE = '40001';
        END IF;

        UPDATE commerce_store_catalog_sources
           SET integration_configuration_id = p_integration_configuration_id,
               updated_at = CURRENT_TIMESTAMP,
               updated_by = v_actor,
               version_no = version_no + 1
         WHERE organization_id = p_organization_id
           AND store_id = p_store_id;
    ELSIF p_version_no <> 0 THEN
        RAISE EXCEPTION 'Store catalog source was changed' USING ERRCODE = '40001';
    ELSE
        INSERT INTO commerce_store_catalog_sources (
            organization_id,
            store_id,
            integration_configuration_id,
            created_by,
            updated_by
        ) VALUES (
            p_organization_id,
            p_store_id,
            p_integration_configuration_id,
            v_actor,
            v_actor
        );
    END IF;

    RETURN p_integration_configuration_id;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".commerce_store_catalog_sources FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_store_catalog_source(varchar, varchar, varchar),
    "${schemaName}".commerce_list_store_catalog_source_candidates(varchar, varchar, varchar),
    "${schemaName}".commerce_save_store_catalog_source(varchar, varchar, varchar, integer, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_store_catalog_source(varchar, varchar, varchar),
    "${schemaName}".commerce_list_store_catalog_source_candidates(varchar, varchar, varchar),
    "${schemaName}".commerce_save_store_catalog_source(varchar, varchar, varchar, integer, varchar)
TO "${appRole}";

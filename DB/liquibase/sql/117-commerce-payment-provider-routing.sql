-- Reusable payment-provider routing for future Commerce channels.
-- This establishes configuration resolution only; it does not migrate any flow.

CREATE TABLE "${schemaName}".commerce_payment_provider_routes (
    commerce_payment_provider_route_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    store_id varchar(64)
        REFERENCES "${schemaName}".stores(store_id),
    source_channel varchar(32) NOT NULL,
    provider_code varchar(64) NOT NULL,
    integration_configuration_id varchar(64)
        REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    is_enabled boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_commerce_payment_provider_route_channel
        CHECK (source_channel IN ('COUNTER', 'CUSTOMER')),
    CONSTRAINT ck_commerce_payment_provider_route_code
        CHECK (provider_code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
    CONSTRAINT ck_commerce_payment_provider_route_integration
        CHECK (
            (provider_code = 'TEST' AND integration_configuration_id IS NULL)
            OR (provider_code <> 'TEST' AND integration_configuration_id IS NOT NULL)
        )
);

CREATE UNIQUE INDEX ux_commerce_payment_provider_routes_scope
    ON "${schemaName}".commerce_payment_provider_routes (
        organization_id,
        COALESCE(store_id, ''),
        source_channel
    )
    WHERE NOT is_deleted;

CREATE INDEX ix_commerce_payment_provider_routes_resolution
    ON "${schemaName}".commerce_payment_provider_routes (
        organization_id,
        source_channel,
        store_id
    )
    WHERE is_enabled AND NOT is_deleted;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_resolve_payment_provider_route(
    p_organization_id varchar,
    p_store_id varchar,
    p_source_channel varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "routeId" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_channel varchar(32);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_source_channel), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Commerce payment-provider route request'
            USING ERRCODE = '22023';
    END IF;

    v_channel := upper(btrim(p_source_channel));
    IF v_channel NOT IN ('COUNTER', 'CUSTOMER') THEN
        RAISE EXCEPTION 'Invalid Commerce payment source channel'
            USING ERRCODE = '22023';
    END IF;

    -- Resolving a route is relationship protected. Individual flow services
    -- retain their existing, stronger Counter/customer authorization checks.
    PERFORM commerce_actor_organization_user(
        p_organization_id,
        p_actor_user_id
    );

    IF p_store_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM stores s
             WHERE s.store_id = p_store_id
               AND s.organization_id = p_organization_id
               AND NOT s.is_deleted
       ) THEN
        RAISE EXCEPTION 'Commerce payment store is not in organization'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT route.commerce_payment_provider_route_id,
           route.provider_code,
           route.integration_configuration_id
      FROM commerce_payment_provider_routes route
      LEFT JOIN integration_configurations integration
        ON integration.integration_configuration_id = route.integration_configuration_id
       AND integration.organization_id = route.organization_id
       AND NOT integration.is_deleted
      LEFT JOIN entity_status integration_status
        ON integration_status.entity_status_id = integration.integration_status_id
      LEFT JOIN statuses integration_state
        ON integration_state.status_id = integration_status.status_id
     WHERE route.organization_id = p_organization_id
       AND route.source_channel = v_channel
       AND route.is_enabled
       AND NOT route.is_deleted
       AND (route.store_id = p_store_id OR route.store_id IS NULL)
       AND (
            route.provider_code = 'TEST'
            OR (
                integration.integration_configuration_id IS NOT NULL
                AND upper(integration.provider) = route.provider_code
                AND integration_status.is_active
                AND integration_state.status_code = 'ACTIVE'
            )
       )
     ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END,
              route.commerce_payment_provider_route_id
     LIMIT 1;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".commerce_payment_provider_routes FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_resolve_payment_provider_route(
    varchar, varchar, varchar, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_resolve_payment_provider_route(
    varchar, varchar, varchar, varchar
) TO "${appRole}";

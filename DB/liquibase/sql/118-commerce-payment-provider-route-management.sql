-- Administrative lifecycle for the provider routes introduced in migration 117.
-- Resolution remains a separate relationship-protected operation.

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_list_payment_provider_routes(
    p_organization_id varchar,
    p_store_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "routeId" varchar,
    "organizationId" varchar,
    "storeId" varchar,
    "sourceChannel" varchar,
    "providerCode" varchar,
    "integrationConfigurationId" varchar,
    enabled boolean,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Commerce payment-provider route list request'
            USING ERRCODE = '22023';
    END IF;

    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    IF p_store_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM stores s
             WHERE s.store_id = p_store_id
               AND s.organization_id = p_organization_id
               AND NOT s.is_deleted
       ) THEN
        RAISE EXCEPTION 'Commerce payment store is not in organization'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT route.commerce_payment_provider_route_id,
           route.organization_id,
           route.store_id,
           route.source_channel,
           route.provider_code,
           route.integration_configuration_id,
           route.is_enabled,
           route.created_at::text,
           route.created_by,
           route.updated_at::text,
           route.updated_by,
           route.is_deleted,
           route.version_no
      FROM commerce_payment_provider_routes route
     WHERE route.organization_id = p_organization_id
       AND NOT route.is_deleted
       AND (p_store_id IS NULL OR route.store_id = p_store_id)
     ORDER BY route.source_channel,
              CASE WHEN route.store_id IS NULL THEN 0 ELSE 1 END,
              route.commerce_payment_provider_route_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_save_payment_provider_route(
    p_route_id varchar,
    p_organization_id varchar,
    p_store_id varchar,
    p_source_channel varchar,
    p_provider_code varchar,
    p_integration_configuration_id varchar,
    p_enabled boolean,
    p_version_no integer,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_route commerce_payment_provider_routes%ROWTYPE;
    v_actor varchar(64);
    v_route_id varchar(64);
    v_channel varchar(32);
    v_provider varchar(64);
    v_integration_id varchar(64);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_source_channel), '') IS NULL
       OR NULLIF(btrim(p_provider_code), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR p_enabled IS NULL
       OR p_version_no IS NULL
       OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Invalid Commerce payment-provider route'
            USING ERRCODE = '22023';
    END IF;

    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);
    v_channel := upper(btrim(p_source_channel));
    v_provider := upper(btrim(p_provider_code));
    v_integration_id := NULLIF(btrim(p_integration_configuration_id), '');

    IF v_channel NOT IN ('COUNTER', 'CUSTOMER')
       OR v_provider !~ '^[A-Z][A-Z0-9_]{1,63}$' THEN
        RAISE EXCEPTION 'Invalid Commerce payment-provider route'
            USING ERRCODE = '22023';
    END IF;

    IF p_store_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM stores s
             WHERE s.store_id = p_store_id
               AND s.organization_id = p_organization_id
               AND NOT s.is_deleted
       ) THEN
        RAISE EXCEPTION 'Commerce payment store is not in organization'
            USING ERRCODE = '22023';
    END IF;

    IF v_provider = 'TEST' THEN
        IF v_integration_id IS NOT NULL THEN
            RAISE EXCEPTION 'TEST payment provider cannot have an integration configuration'
                USING ERRCODE = '22023';
        END IF;
    ELSIF v_integration_id IS NULL
       OR NOT EXISTS (
            SELECT 1
              FROM integration_configurations integration
              JOIN entity_status integration_status
                ON integration_status.entity_status_id = integration.integration_status_id
              JOIN statuses integration_state
                ON integration_state.status_id = integration_status.status_id
             WHERE integration.integration_configuration_id = v_integration_id
               AND integration.organization_id = p_organization_id
               AND upper(integration.provider) = v_provider
               AND NOT integration.is_deleted
               AND integration_status.is_active
               AND integration_state.status_code = 'ACTIVE'
       ) THEN
        RAISE EXCEPTION 'Commerce payment provider integration is unavailable'
            USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        IF NULLIF(btrim(p_route_id), '') IS NOT NULL THEN
            RAISE EXCEPTION 'New Commerce payment-provider route must not have an id'
                USING ERRCODE = '22023';
        END IF;

        v_route_id := generate_runtime_id('CPR');
        INSERT INTO commerce_payment_provider_routes (
            commerce_payment_provider_route_id,
            organization_id,
            store_id,
            source_channel,
            provider_code,
            integration_configuration_id,
            is_enabled,
            created_by,
            updated_by
        ) VALUES (
            v_route_id,
            p_organization_id,
            p_store_id,
            v_channel,
            v_provider,
            v_integration_id,
            p_enabled,
            v_actor,
            v_actor
        );
        RETURN v_route_id;
    END IF;

    IF NULLIF(btrim(p_route_id), '') IS NULL THEN
        RAISE EXCEPTION 'Commerce payment-provider route id is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT *
      INTO v_route
      FROM commerce_payment_provider_routes
     WHERE commerce_payment_provider_route_id = p_route_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce payment-provider route was not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_route.version_no <> p_version_no THEN
        RAISE EXCEPTION 'Commerce payment-provider route was changed'
            USING ERRCODE = '40001';
    END IF;

    UPDATE commerce_payment_provider_routes
       SET store_id = p_store_id,
           source_channel = v_channel,
           provider_code = v_provider,
           integration_configuration_id = v_integration_id,
           is_enabled = p_enabled,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_payment_provider_route_id = v_route.commerce_payment_provider_route_id;

    RETURN v_route.commerce_payment_provider_route_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_delete_payment_provider_route(
    p_organization_id varchar,
    p_route_id varchar,
    p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_route commerce_payment_provider_routes%ROWTYPE;
    v_actor varchar(64);
BEGIN
    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_route_id), '') IS NULL
       OR NULLIF(btrim(p_actor_user_id), '') IS NULL
       OR p_version_no IS NULL
       OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Invalid Commerce payment-provider route delete request'
            USING ERRCODE = '22023';
    END IF;

    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted'
            USING ERRCODE = '42501';
    END IF;

    v_actor := commerce_actor_organization_user(p_organization_id, p_actor_user_id);

    SELECT *
      INTO v_route
      FROM commerce_payment_provider_routes
     WHERE commerce_payment_provider_route_id = p_route_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce payment-provider route was not found'
            USING ERRCODE = 'P0002';
    END IF;

    IF v_route.version_no <> p_version_no THEN
        RAISE EXCEPTION 'Commerce payment-provider route was changed'
            USING ERRCODE = '40001';
    END IF;

    UPDATE commerce_payment_provider_routes
       SET is_deleted = true,
           is_enabled = false,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor,
           version_no = version_no + 1
     WHERE commerce_payment_provider_route_id = v_route.commerce_payment_provider_route_id;

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".commerce_list_payment_provider_routes(
    varchar, varchar, varchar
), "${schemaName}".commerce_save_payment_provider_route(
    varchar, varchar, varchar, varchar, varchar, varchar, boolean, integer,
    varchar, boolean
), "${schemaName}".commerce_delete_payment_provider_route(
    varchar, varchar, integer, varchar
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_list_payment_provider_routes(
    varchar, varchar, varchar
), "${schemaName}".commerce_save_payment_provider_route(
    varchar, varchar, varchar, varchar, varchar, varchar, boolean, integer,
    varchar, boolean
), "${schemaName}".commerce_delete_payment_provider_route(
    varchar, varchar, integer, varchar
) TO "${appRole}";

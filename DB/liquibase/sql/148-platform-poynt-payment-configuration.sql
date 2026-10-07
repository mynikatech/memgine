--liquibase formatted sql

--changeset mynikatech:148-platform-poynt-payment-configuration runOnChange:true splitStatements:false

ALTER TABLE "${schemaName}".commerce_provider_catalog_configurations
    ADD COLUMN IF NOT EXISTS credential_status varchar(32) NOT NULL DEFAULT 'NOT_CONFIGURED',
    ADD COLUMN IF NOT EXISTS connection_status varchar(32) NOT NULL DEFAULT 'NOT_TESTED',
    ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS verification_message varchar(500);

ALTER TABLE "${schemaName}".commerce_provider_catalog_configurations
    DROP CONSTRAINT IF EXISTS ck_commerce_provider_catalog_credential_status,
    ADD CONSTRAINT ck_commerce_provider_catalog_credential_status
        CHECK (credential_status IN ('CONFIGURED', 'NOT_CONFIGURED', 'VERIFICATION_UNAVAILABLE')),
    DROP CONSTRAINT IF EXISTS ck_commerce_provider_catalog_connection_status,
    ADD CONSTRAINT ck_commerce_provider_catalog_connection_status
        CHECK (connection_status IN ('NOT_TESTED', 'VERIFIED', 'FAILED'));

CREATE OR REPLACE FUNCTION "${schemaName}".platform_list_payment_integrations(
    p_actor_user_id varchar
)
RETURNS TABLE(
    "organizationId" varchar,
    "organizationName" varchar,
    "integrationConfigurationId" varchar,
    "integrationName" varchar,
    "provider" varchar,
    "integrationTypeId" varchar,
    "integrationStatusId" varchar,
    "integrationStatus" varchar,
    "integrationVersionNo" integer,
    "applicationId" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "merchantCurrencyCode" varchar,
    "credentialStatus" varchar,
    "connectionStatus" varchar,
    "lastVerifiedAt" text,
    "verificationMessage" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        i.organization_id,
        o.organization_name,
        i.integration_configuration_id,
        i.integration_name,
        upper(i.provider) ::varchar,
        i.integration_type_id,
        i.integration_status_id,
        COALESCE(s.status_code, 'PENDING') ::varchar,
        i.version_no,
        c.application_id,
        c.provider_business_id,
        c.provider_store_id,
        c.merchant_currency_code,
        COALESCE(c.credential_status, 'NOT_CONFIGURED')::varchar,
        COALESCE(c.connection_status, 'NOT_TESTED')::varchar,
        c.last_verified_at::text,
        c.verification_message,
        COALESCE(c.version_no, 1)
    FROM integration_configurations i
    JOIN organization o
        ON o.organization_id = i.organization_id
    LEFT JOIN entity_status es
        ON es.entity_status_id = i.integration_status_id
    LEFT JOIN statuses s
        ON s.status_id = es.status_id
    LEFT JOIN commerce_provider_catalog_configurations c
        ON c.integration_configuration_id = i.integration_configuration_id
       AND NOT c.is_deleted
    WHERE upper(i.provider)::varchar = 'POYNT'
      AND NOT i.is_deleted
      AND NOT o.is_deleted
    ORDER BY o.organization_name, i.integration_name;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_payment_integration_shell(
    p_organization_id varchar,
    p_integration_id varchar,
    p_integration_name varchar,
    p_integration_type_id varchar,
    p_provider varchar,
    p_integration_status_id varchar,
    p_version_no integer,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_audit varchar(64);
    v_existing_provider varchar(100);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment integration management is not permitted' USING ERRCODE = '42501';
    END IF;

    IF NULLIF(btrim(p_organization_id), '') IS NULL
       OR NULLIF(btrim(p_integration_id), '') IS NULL
       OR length(p_integration_id) > 40
       OR NULLIF(btrim(p_integration_name), '') IS NULL
       OR length(p_integration_name) > 100
       OR p_integration_type_id <> 'integration-type-pos'
       OR upper(btrim(p_provider)) <> 'POYNT'
       OR p_version_no IS NULL
       OR p_version_no < 1 THEN
        RAISE EXCEPTION 'Invalid payment integration shell' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM organization o
        WHERE o.organization_id = p_organization_id
          AND NOT o.is_deleted
    ) OR NOT EXISTS (
        SELECT 1
        FROM entity_status es
        JOIN entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_integration_status_id
          AND et.entity_type_code = 'INTEGRATION_CONFIGURATION'
          AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid organization or integration status' USING ERRCODE = '22023';
    END IF;

    SELECT ou.organization_user_id
    INTO v_audit
    FROM organization_user ou
    WHERE ou.organization_id = p_organization_id
      AND NOT ou.is_deleted
      AND ou.organization_user_status_id = 'entity-status-org-user-active'
    ORDER BY ou.created_at
    LIMIT 1;

    IF v_audit IS NULL THEN
        RAISE EXCEPTION 'Organization audit identity is unavailable' USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        INSERT INTO integration_configurations(
            integration_configuration_id,
            organization_id,
            integration_name,
            integration_type_id,
            provider,
            integration_status_id,
            created_by,
            updated_by
        ) VALUES (
            p_integration_id,
            p_organization_id,
            btrim(p_integration_name),
            p_integration_type_id,
            upper(btrim(p_provider)),
            p_integration_status_id,
            v_audit,
            v_audit
        );
    ELSE
        SELECT upper(i.provider)
        INTO v_existing_provider
        FROM integration_configurations i
        WHERE i.integration_configuration_id = p_integration_id
          AND i.organization_id = p_organization_id
          AND NOT i.is_deleted
        FOR UPDATE;

        IF v_existing_provider IS NULL THEN
            RAISE EXCEPTION 'Payment integration was not found' USING ERRCODE = '40001';
        END IF;

        IF v_existing_provider <> upper(btrim(p_provider))
           AND (
               EXISTS (
                   SELECT 1
                   FROM commerce_provider_catalog_configurations c
                   WHERE c.integration_configuration_id = p_integration_id
                     AND NOT c.is_deleted
               )
               OR EXISTS (
                   SELECT 1
                   FROM commerce_payment_provider_routes r
                   WHERE r.integration_configuration_id = p_integration_id
                     AND NOT r.is_deleted
               )
               OR EXISTS (
                   SELECT 1
                   FROM poynt_terminal_bindings b
                   WHERE b.integration_configuration_id = p_integration_id
                     AND NOT b.is_deleted
               )
           ) THEN
            RAISE EXCEPTION 'Payment provider cannot change after provider configuration or routing exists'
                USING ERRCODE = '22023';
        END IF;

        UPDATE integration_configurations
        SET integration_name = btrim(p_integration_name),
            integration_type_id = p_integration_type_id,
            provider = upper(btrim(p_provider)),
            integration_status_id = p_integration_status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = v_audit,
            version_no = version_no + 1
        WHERE integration_configuration_id = p_integration_id
          AND organization_id = p_organization_id
          AND NOT is_deleted
          AND version_no = p_version_no;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Payment integration changed; refresh and retry' USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_get_poynt_payment_configuration(
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "organizationId" varchar,
    "applicationId" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "merchantCurrencyCode" varchar,
    "credentialStatus" varchar,
    "connectionStatus" varchar,
    "lastVerifiedAt" text,
    "verificationMessage" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT
        c.integration_configuration_id,
        c.organization_id,
        c.application_id,
        c.provider_business_id,
        c.provider_store_id,
        c.merchant_currency_code,
        c.credential_status,
        c.connection_status,
        c.last_verified_at::text,
        c.verification_message,
        c.version_no
    FROM commerce_provider_catalog_configurations c
    JOIN integration_configurations i
        ON i.integration_configuration_id = c.integration_configuration_id
    WHERE c.integration_configuration_id = p_integration_id
      AND upper(i.provider) = 'POYNT'
      AND NOT c.is_deleted
      AND NOT i.is_deleted;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_get_poynt_backend_credential_reference(
    p_integration_id varchar,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_reference varchar(256);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT c.credential_secret_reference
    INTO v_reference
    FROM commerce_provider_catalog_configurations c
    JOIN integration_configurations i
        ON i.integration_configuration_id = c.integration_configuration_id
    WHERE c.integration_configuration_id = p_integration_id
      AND upper(i.provider) = 'POYNT'
      AND NOT c.is_deleted
      AND NOT i.is_deleted;

    IF NULLIF(btrim(v_reference), '') IS NULL THEN
        RAISE EXCEPTION 'Poynt backend credential assignment is unavailable' USING ERRCODE = '23503';
    END IF;

    RETURN v_reference;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_poynt_payment_configuration(
    p_integration_id varchar,
    p_application_id varchar,
    p_business_id varchar,
    p_provider_store_id varchar,
    p_backend_credential_secret_reference varchar,
    p_currency_code varchar,
    p_version_no integer,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_org varchar(64);
    v_audit varchar(64);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    SELECT organization_id
    INTO v_org
    FROM integration_configurations
    WHERE integration_configuration_id = p_integration_id
      AND upper(provider) = 'POYNT'
      AND NOT is_deleted
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';
    END IF;

    SELECT organization_user_id
    INTO v_audit
    FROM organization_user
    WHERE organization_id = v_org
      AND NOT is_deleted
      AND organization_user_status_id = 'entity-status-org-user-active'
    ORDER BY created_at
    LIMIT 1;

    IF v_audit IS NULL THEN
        RAISE EXCEPTION 'Organization audit identity is unavailable' USING ERRCODE = '23503';
    END IF;

    IF NULLIF(btrim(p_application_id), '') IS NULL
       OR NULLIF(btrim(p_business_id), '') IS NULL
       OR NULLIF(btrim(p_backend_credential_secret_reference), '') IS NULL
       OR upper(btrim(p_currency_code)) !~ '^[A-Z]{3}$' THEN
        RAISE EXCEPTION 'Invalid Poynt payment configuration' USING ERRCODE = '22023';
    END IF;

    INSERT INTO commerce_provider_catalog_configurations(
        integration_configuration_id,
        organization_id,
        application_id,
        provider_business_id,
        provider_store_id,
        credential_secret_reference,
        merchant_currency_code,
        credential_status,
        connection_status,
        created_by,
        updated_by
    )
    VALUES(
        p_integration_id,
        v_org,
        btrim(p_application_id),
        btrim(p_business_id),
        NULLIF(btrim(p_provider_store_id), ''),
        btrim(p_backend_credential_secret_reference),
        upper(btrim(p_currency_code)),
        'NOT_CONFIGURED',
        'NOT_TESTED',
        v_audit,
        v_audit
    )
    ON CONFLICT (integration_configuration_id) DO UPDATE
    SET application_id = EXCLUDED.application_id,
        provider_business_id = EXCLUDED.provider_business_id,
        provider_store_id = EXCLUDED.provider_store_id,
        credential_secret_reference = EXCLUDED.credential_secret_reference,
        merchant_currency_code = EXCLUDED.merchant_currency_code,
        credential_status = CASE
            WHEN commerce_provider_catalog_configurations.credential_secret_reference
                 IS DISTINCT FROM EXCLUDED.credential_secret_reference
                THEN 'NOT_CONFIGURED'
            ELSE commerce_provider_catalog_configurations.credential_status
        END,
        connection_status = 'NOT_TESTED',
        last_verified_at = NULL,
        verification_message = NULL,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_audit,
        version_no = commerce_provider_catalog_configurations.version_no + 1,
        is_deleted = false
    WHERE commerce_provider_catalog_configurations.version_no = p_version_no;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Poynt payment configuration changed; refresh and retry' USING ERRCODE = '40001';
    END IF;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_record_poynt_payment_verification(
    p_integration_id varchar,
    p_credential_status varchar,
    p_connection_status varchar,
    p_message varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_audit varchar(64);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    IF p_credential_status NOT IN ('CONFIGURED', 'NOT_CONFIGURED', 'VERIFICATION_UNAVAILABLE')
       OR p_connection_status NOT IN ('NOT_TESTED', 'VERIFIED', 'FAILED') THEN
        RAISE EXCEPTION 'Invalid Poynt verification status' USING ERRCODE = '22023';
    END IF;

    SELECT ou.organization_user_id
    INTO v_audit
    FROM commerce_provider_catalog_configurations c
    JOIN organization_user ou
        ON ou.organization_id = c.organization_id
       AND NOT ou.is_deleted
       AND ou.organization_user_status_id = 'entity-status-org-user-active'
    WHERE c.integration_configuration_id = p_integration_id
      AND NOT c.is_deleted
    ORDER BY ou.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_audit IS NULL THEN
        RAISE EXCEPTION 'Poynt payment configuration not found' USING ERRCODE = '23503';
    END IF;

    UPDATE commerce_provider_catalog_configurations
    SET credential_status = p_credential_status,
        connection_status = p_connection_status,
        last_verified_at = CURRENT_TIMESTAMP,
        verification_message = LEFT(NULLIF(btrim(p_message), ''), 500),
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_audit,
        version_no = version_no + 1
    WHERE integration_configuration_id = p_integration_id
      AND NOT is_deleted;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_record_poynt_credential_status(
    p_integration_id varchar,
    p_credential_status varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_audit varchar(64);
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';
    END IF;

    IF p_credential_status NOT IN ('CONFIGURED', 'NOT_CONFIGURED', 'VERIFICATION_UNAVAILABLE') THEN
        RAISE EXCEPTION 'Invalid Poynt credential status' USING ERRCODE = '22023';
    END IF;

    SELECT ou.organization_user_id
    INTO v_audit
    FROM commerce_provider_catalog_configurations c
    JOIN organization_user ou
        ON ou.organization_id = c.organization_id
       AND NOT ou.is_deleted
       AND ou.organization_user_status_id = 'entity-status-org-user-active'
    WHERE c.integration_configuration_id = p_integration_id
      AND NOT c.is_deleted
    ORDER BY ou.created_at
    LIMIT 1
    FOR UPDATE;

    IF v_audit IS NULL THEN
        RAISE EXCEPTION 'Poynt payment configuration not found' USING ERRCODE = '23503';
    END IF;

    UPDATE commerce_provider_catalog_configurations
    SET credential_status = p_credential_status,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = v_audit,
        version_no = version_no + 1
    WHERE integration_configuration_id = p_integration_id
      AND NOT is_deleted;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".organization_get_poynt_payment_summaries(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "integrationConfigurationId" varchar,
    "integrationName" varchar,
    "integrationStatus" varchar,
    "providerBusinessId" varchar,
    "providerStoreId" varchar,
    "merchantCurrencyCode" varchar,
    "credentialStatus" varchar,
    "connectionStatus" varchar,
    "lastVerifiedAt" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        i.integration_configuration_id,
        i.integration_name,
        COALESCE(s.status_code, 'PENDING') ::varchar,
        c.provider_business_id,
        c.provider_store_id,
        c.merchant_currency_code,
        COALESCE(c.credential_status, 'NOT_CONFIGURED')::varchar,
        COALESCE(c.connection_status, 'NOT_TESTED')::varchar,
        c.last_verified_at::text
    FROM integration_configurations i
    LEFT JOIN entity_status es
        ON es.entity_status_id = i.integration_status_id
    LEFT JOIN statuses s
        ON s.status_id = es.status_id
    LEFT JOIN commerce_provider_catalog_configurations c
        ON c.integration_configuration_id = i.integration_configuration_id
       AND NOT c.is_deleted
    WHERE i.organization_id = p_organization_id
      AND upper(i.provider) = 'POYNT'
      AND NOT i.is_deleted
      AND can_administer_organization(p_organization_id, p_actor_user_id);
$function$;

REVOKE ALL ON FUNCTION
    "${schemaName}".platform_list_payment_integrations(varchar),
    "${schemaName}".platform_get_poynt_payment_configuration(varchar, varchar),
    "${schemaName}".platform_get_poynt_backend_credential_reference(varchar, varchar),
    "${schemaName}".platform_save_payment_integration_shell(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, boolean),
    "${schemaName}".platform_save_poynt_payment_configuration(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar),
    "${schemaName}".platform_record_poynt_payment_verification(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".platform_record_poynt_credential_status(varchar, varchar, varchar),
    "${schemaName}".organization_get_poynt_payment_summaries(varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".platform_list_payment_integrations(varchar),
    "${schemaName}".platform_get_poynt_payment_configuration(varchar, varchar),
    "${schemaName}".platform_get_poynt_backend_credential_reference(varchar, varchar),
    "${schemaName}".platform_save_payment_integration_shell(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, boolean),
    "${schemaName}".platform_save_poynt_payment_configuration(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar),
    "${schemaName}".platform_record_poynt_payment_verification(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".platform_record_poynt_credential_status(varchar, varchar, varchar),
    "${schemaName}".organization_get_poynt_payment_summaries(varchar, varchar)
TO "${appRole}";

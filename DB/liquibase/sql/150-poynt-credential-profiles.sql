--liquibase formatted sql



--changeset mynikatech:150-poynt-credential-profiles runOnChange:true splitStatements:false



CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_credential_profiles (

    credential_profile_id varchar(40) PRIMARY KEY,

    display_name varchar(100) NOT NULL,

    secret_reference varchar(256) NOT NULL,

    is_active boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    created_by varchar(64),

    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    updated_by varchar(64),

    is_deleted boolean NOT NULL DEFAULT false,

    version_no integer NOT NULL DEFAULT 1

);



ALTER TABLE "${schemaName}".commerce_provider_catalog_configurations

    ADD COLUMN IF NOT EXISTS credential_profile_id varchar(40);



ALTER TABLE "${schemaName}".commerce_provider_catalog_configurations

    DROP CONSTRAINT IF EXISTS fk_commerce_provider_catalog_credential_profile,

    ADD CONSTRAINT fk_commerce_provider_catalog_credential_profile

        FOREIGN KEY (credential_profile_id)

        REFERENCES "${schemaName}".poynt_credential_profiles(credential_profile_id);



CREATE INDEX IF NOT EXISTS ix_commerce_provider_catalog_credential_profile

    ON "${schemaName}".commerce_provider_catalog_configurations(credential_profile_id);



INSERT INTO "${schemaName}".poynt_credential_profiles(

    credential_profile_id,

    display_name,

    secret_reference

)

SELECT

    '${poyntCredentialProfileSeedId}',

    '${poyntCredentialProfileSeedDisplayName}',

    '${poyntCredentialProfileSeedSecretReference}'

WHERE lower('${poyntCredentialProfileSeedEnabled}') = 'true'

ON CONFLICT (credential_profile_id) DO UPDATE

SET display_name = EXCLUDED.display_name,

    secret_reference = EXCLUDED.secret_reference,

    is_active = true,

    is_deleted = false,

    updated_at = CURRENT_TIMESTAMP,

    version_no = poynt_credential_profiles.version_no + 1

WHERE poynt_credential_profiles.display_name IS DISTINCT FROM EXCLUDED.display_name

   OR poynt_credential_profiles.secret_reference IS DISTINCT FROM EXCLUDED.secret_reference

   OR NOT poynt_credential_profiles.is_active

   OR poynt_credential_profiles.is_deleted;



UPDATE "${schemaName}".commerce_provider_catalog_configurations c

SET credential_profile_id = p.credential_profile_id,

    updated_at = CURRENT_TIMESTAMP,

    version_no = c.version_no + 1

FROM "${schemaName}".poynt_credential_profiles p

WHERE c.credential_profile_id IS NULL

  AND c.credential_secret_reference = p.secret_reference

  AND p.credential_profile_id = '${poyntCredentialProfileSeedId}'

  AND lower('${poyntCredentialProfileSeedEnabled}') = 'true';



CREATE OR REPLACE FUNCTION "${schemaName}".platform_list_poynt_credential_profiles(

    p_actor_user_id varchar

)

RETURNS TABLE(

    "credentialProfileId" varchar,

    "displayName" varchar

)

LANGUAGE plpgsql

STABLE

SECURITY DEFINER

SET search_path = pg_catalog, "${schemaName}"

AS $function$

BEGIN

    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN

        RAISE EXCEPTION 'Platform credential profile access is not permitted' USING ERRCODE = '42501';

    END IF;



    RETURN QUERY

    SELECT p.credential_profile_id, p.display_name

    FROM poynt_credential_profiles p

    WHERE p.is_active

      AND NOT p.is_deleted

    ORDER BY p.display_name;

END;

$function$;



DROP FUNCTION IF EXISTS "${schemaName}".platform_list_payment_integrations(varchar);



CREATE FUNCTION "${schemaName}".platform_list_payment_integrations(

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

    "credentialProfileId" varchar,

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

    SELECT i.organization_id, o.organization_name, i.integration_configuration_id,

           i.integration_name, upper(i.provider)::varchar, i.integration_type_id,

           i.integration_status_id, COALESCE(s.status_code, 'PENDING')::varchar,

           i.version_no, c.application_id, c.provider_business_id, c.provider_store_id,

           c.merchant_currency_code, c.credential_profile_id,

           COALESCE(c.credential_status, 'NOT_CONFIGURED')::varchar,

           COALESCE(c.connection_status, 'NOT_TESTED')::varchar,

           c.last_verified_at::text, c.verification_message, COALESCE(c.version_no, 1)

    FROM integration_configurations i

    JOIN organization o ON o.organization_id = i.organization_id

    LEFT JOIN entity_status es ON es.entity_status_id = i.integration_status_id

    LEFT JOIN statuses s ON s.status_id = es.status_id

    LEFT JOIN commerce_provider_catalog_configurations c

      ON c.integration_configuration_id = i.integration_configuration_id AND NOT c.is_deleted

    WHERE upper(i.provider) = 'POYNT'

      AND NOT i.is_deleted

      AND NOT o.is_deleted

    ORDER BY o.organization_name, i.integration_name;

END;

$function$;



DROP FUNCTION IF EXISTS "${schemaName}".platform_get_poynt_payment_configuration(varchar, varchar);



CREATE FUNCTION "${schemaName}".platform_get_poynt_payment_configuration(

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

    "credentialProfileId" varchar,

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

    SELECT c.integration_configuration_id, c.organization_id, c.application_id,

           c.provider_business_id, c.provider_store_id, c.merchant_currency_code,

           c.credential_profile_id, c.credential_status, c.connection_status,

           c.last_verified_at::text, c.verification_message, c.version_no

    FROM commerce_provider_catalog_configurations c

    JOIN integration_configurations i ON i.integration_configuration_id = c.integration_configuration_id

    WHERE c.integration_configuration_id = p_integration_id

      AND upper(i.provider) = 'POYNT'

      AND NOT c.is_deleted

      AND NOT i.is_deleted;

END;

$function$;



DROP FUNCTION IF EXISTS "${schemaName}".platform_save_poynt_payment_configuration(
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    varchar,
    integer,
    varchar
);

CREATE FUNCTION "${schemaName}".platform_save_poynt_payment_configuration(

    p_integration_id varchar,

    p_application_id varchar,

    p_business_id varchar,

    p_provider_store_id varchar,

    p_credential_profile_id varchar,

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

    v_secret_reference varchar(256);

BEGIN

    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN

        RAISE EXCEPTION 'Platform payment configuration is not permitted' USING ERRCODE = '42501';

    END IF;



    SELECT organization_id INTO v_org

    FROM integration_configurations

    WHERE integration_configuration_id = p_integration_id

      AND upper(provider) = 'POYNT'

      AND NOT is_deleted

    FOR UPDATE;



    IF NOT FOUND THEN

        RAISE EXCEPTION 'Poynt integration not found' USING ERRCODE = '23503';

    END IF;



    SELECT p.secret_reference INTO v_secret_reference

    FROM poynt_credential_profiles p

    WHERE p.credential_profile_id = p_credential_profile_id

      AND p.is_active

      AND NOT p.is_deleted;



    IF NULLIF(btrim(v_secret_reference), '') IS NULL THEN

        RAISE EXCEPTION 'Poynt credential profile is unavailable' USING ERRCODE = '22023';

    END IF;



    SELECT organization_user_id INTO v_audit

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

       OR NULLIF(btrim(p_credential_profile_id), '') IS NULL

       OR upper(btrim(p_currency_code)) !~ '^[A-Z]{3}$' THEN

        RAISE EXCEPTION 'Invalid Poynt payment configuration' USING ERRCODE = '22023';

    END IF;



    INSERT INTO commerce_provider_catalog_configurations(

        integration_configuration_id, organization_id, application_id,

        provider_business_id, provider_store_id, credential_profile_id,

        credential_secret_reference, merchant_currency_code, credential_status,

        connection_status, created_by, updated_by

    ) VALUES (

        p_integration_id, v_org, btrim(p_application_id), btrim(p_business_id),

        NULLIF(btrim(p_provider_store_id), ''), p_credential_profile_id,

        v_secret_reference, upper(btrim(p_currency_code)), 'NOT_CONFIGURED',

        'NOT_TESTED', v_audit, v_audit

    )

    ON CONFLICT (integration_configuration_id) DO UPDATE

    SET application_id = EXCLUDED.application_id,

        provider_business_id = EXCLUDED.provider_business_id,

        provider_store_id = EXCLUDED.provider_store_id,

        credential_profile_id = EXCLUDED.credential_profile_id,

        credential_secret_reference = EXCLUDED.credential_secret_reference,

        merchant_currency_code = EXCLUDED.merchant_currency_code,

        credential_status = CASE

            WHEN commerce_provider_catalog_configurations.credential_profile_id

                 IS DISTINCT FROM EXCLUDED.credential_profile_id THEN 'NOT_CONFIGURED'

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



REVOKE ALL ON TABLE "${schemaName}".poynt_credential_profiles FROM PUBLIC;

REVOKE ALL ON FUNCTION

    "${schemaName}".platform_list_poynt_credential_profiles(varchar),

    "${schemaName}".platform_list_payment_integrations(varchar),

    "${schemaName}".platform_get_poynt_payment_configuration(varchar, varchar),

    "${schemaName}".platform_save_poynt_payment_configuration(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar)

FROM PUBLIC;



GRANT EXECUTE ON FUNCTION

    "${schemaName}".platform_list_poynt_credential_profiles(varchar),

    "${schemaName}".platform_list_payment_integrations(varchar),

    "${schemaName}".platform_get_poynt_payment_configuration(varchar, varchar),

    "${schemaName}".platform_save_poynt_payment_configuration(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar)

TO "${appRole}";

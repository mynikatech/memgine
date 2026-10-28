-- Durable, private metadata for Poynt Apple Pay association-file onboarding.
-- Provider bytes live only in configured private S3 storage.

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_apple_pay_association_artifacts (
    artifact_id varchar(64) PRIMARY KEY,
    provider_environment varchar(300) NOT NULL,
    provider_business_id varchar(200) NOT NULL,
    artifact_sha256 varchar(64) NOT NULL,
    s3_key varchar(1000) NOT NULL,
    artifact_status varchar(32) NOT NULL DEFAULT 'CANDIDATE',
    retrieved_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_checked_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL,
    updated_by varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_poynt_apple_pay_artifact_status CHECK (artifact_status IN ('CANDIDATE', 'APPROVED', 'RETIRED')),
    CONSTRAINT uq_poynt_apple_pay_artifact_hash UNIQUE (provider_environment, provider_business_id, artifact_sha256)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_apple_pay_domain_hosting (
    checkout_hostname varchar(255) PRIMARY KEY,
    approved_artifact_id varchar(64) REFERENCES "${schemaName}".poynt_apple_pay_association_artifacts(artifact_id),
    public_verification_status varchar(80) NOT NULL DEFAULT 'NOT_VERIFIED',
    last_verified_at timestamptz,
    updated_by varchar(64) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version_no integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_apple_pay_merchant_registrations (
    provider_environment varchar(300) NOT NULL,
    provider_business_id varchar(200) NOT NULL,
    checkout_hostname varchar(255) NOT NULL,
    registration_status varchar(80) NOT NULL,
    last_provider_http_status integer,
    last_verified_at timestamptz,
    updated_by varchar(64) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (provider_environment, provider_business_id, checkout_hostname)
);

CREATE TABLE IF NOT EXISTS "${schemaName}".poynt_apple_pay_integration_capabilities (
    integration_configuration_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    enabled boolean NOT NULL DEFAULT false,
    updated_by varchar(64) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    version_no integer NOT NULL DEFAULT 1
);

CREATE OR REPLACE FUNCTION "${schemaName}".platform_require_poynt_apple_pay_admin(p_actor_user_id varchar)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT rbac_has_capability(p_actor_user_id, NULL, 'PLATFORM_ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Platform Apple Pay configuration is not permitted' USING ERRCODE = '42501';
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_find_poynt_apple_pay_artifact(
    p_provider_environment varchar, p_provider_business_id varchar, p_actor_user_id varchar
)
RETURNS TABLE("artifactId" varchar, "sha256" varchar, "s3Key" varchar, "status" varchar, "retrievedAt" text, "lastCheckedAt" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    RETURN QUERY SELECT a.artifact_id, a.artifact_sha256, a.s3_key, a.artifact_status,
        a.retrieved_at::text, a.last_checked_at::text
    FROM poynt_apple_pay_association_artifacts a
    WHERE a.provider_environment = btrim(p_provider_environment)
      AND a.provider_business_id = btrim(p_provider_business_id)
    ORDER BY a.updated_at DESC, a.artifact_id DESC LIMIT 1;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_save_poynt_apple_pay_artifact(
    p_artifact_id varchar, p_provider_environment varchar, p_provider_business_id varchar,
    p_sha256 varchar, p_s3_key varchar, p_actor_user_id varchar
)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_existing varchar;
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    IF NULLIF(btrim(p_artifact_id), '') IS NULL OR NULLIF(btrim(p_provider_environment), '') IS NULL
       OR NULLIF(btrim(p_provider_business_id), '') IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
       OR NULLIF(btrim(p_s3_key), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Apple Pay association artifact metadata' USING ERRCODE = '22023';
    END IF;
    SELECT artifact_id INTO v_existing FROM poynt_apple_pay_association_artifacts
    WHERE provider_environment=btrim(p_provider_environment) AND provider_business_id=btrim(p_provider_business_id)
      AND artifact_sha256=lower(p_sha256) FOR UPDATE;
    IF v_existing IS NOT NULL THEN
        UPDATE poynt_apple_pay_association_artifacts SET last_checked_at=CURRENT_TIMESTAMP,
            updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id
        WHERE artifact_id=v_existing;
        RETURN v_existing;
    END IF;
    INSERT INTO poynt_apple_pay_association_artifacts(
        artifact_id, provider_environment, provider_business_id, artifact_sha256, s3_key,
        created_by, updated_by
    ) VALUES (
        btrim(p_artifact_id), btrim(p_provider_environment), btrim(p_provider_business_id),
        lower(p_sha256), btrim(p_s3_key), p_actor_user_id, p_actor_user_id
    );
    RETURN btrim(p_artifact_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_get_poynt_apple_pay_artifact(
    p_artifact_id varchar, p_provider_environment varchar, p_provider_business_id varchar, p_actor_user_id varchar
)
RETURNS TABLE("artifactId" varchar, "sha256" varchar, "s3Key" varchar, "status" varchar, "retrievedAt" text, "lastCheckedAt" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    RETURN QUERY SELECT a.artifact_id, a.artifact_sha256, a.s3_key, a.artifact_status,
        a.retrieved_at::text, a.last_checked_at::text
    FROM poynt_apple_pay_association_artifacts a
    WHERE a.artifact_id = p_artifact_id
      AND a.provider_environment = btrim(p_provider_environment)
      AND a.provider_business_id = btrim(p_provider_business_id);
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_approve_poynt_apple_pay_artifact(
    p_artifact_id varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    UPDATE poynt_apple_pay_association_artifacts
       SET artifact_status='APPROVED', updated_at=CURRENT_TIMESTAMP, updated_by=p_actor_user_id,
           version_no=version_no+1
     WHERE artifact_id=p_artifact_id AND artifact_status IN ('CANDIDATE', 'APPROVED');
    IF NOT FOUND THEN RAISE EXCEPTION 'Apple Pay association artifact was not found' USING ERRCODE='22023'; END IF;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_record_poynt_apple_pay_hosting(
    p_checkout_hostname varchar, p_artifact_id varchar, p_verification_status varchar, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    IF NULLIF(btrim(p_checkout_hostname), '') IS NULL OR NULLIF(btrim(p_artifact_id), '') IS NULL THEN
        RAISE EXCEPTION 'Invalid Apple Pay hosting state' USING ERRCODE='22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM poynt_apple_pay_association_artifacts WHERE artifact_id=p_artifact_id AND artifact_status='APPROVED') THEN
        RAISE EXCEPTION 'Apple Pay artifact is not approved' USING ERRCODE='22023';
    END IF;
    INSERT INTO poynt_apple_pay_domain_hosting(checkout_hostname, approved_artifact_id, public_verification_status, last_verified_at, updated_by)
    VALUES (lower(btrim(p_checkout_hostname)), p_artifact_id, btrim(p_verification_status), CURRENT_TIMESTAMP, p_actor_user_id)
    ON CONFLICT (checkout_hostname) DO UPDATE SET approved_artifact_id=EXCLUDED.approved_artifact_id,
        public_verification_status=EXCLUDED.public_verification_status, last_verified_at=EXCLUDED.last_verified_at,
        updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP, version_no=poynt_apple_pay_domain_hosting.version_no+1;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_record_poynt_apple_pay_registration(
    p_provider_environment varchar, p_provider_business_id varchar, p_checkout_hostname varchar,
    p_status varchar, p_http_status integer, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    INSERT INTO poynt_apple_pay_merchant_registrations(provider_environment, provider_business_id, checkout_hostname, registration_status, last_provider_http_status, last_verified_at, updated_by)
    VALUES (btrim(p_provider_environment), btrim(p_provider_business_id), lower(btrim(p_checkout_hostname)), btrim(p_status), p_http_status, CURRENT_TIMESTAMP, p_actor_user_id)
    ON CONFLICT (provider_environment, provider_business_id, checkout_hostname) DO UPDATE SET registration_status=EXCLUDED.registration_status,
        last_provider_http_status=EXCLUDED.last_provider_http_status, last_verified_at=EXCLUDED.last_verified_at,
        updated_by=EXCLUDED.updated_by, updated_at=CURRENT_TIMESTAMP, version_no=poynt_apple_pay_merchant_registrations.version_no+1;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_get_poynt_apple_pay_registration(
    p_provider_environment varchar, p_provider_business_id varchar, p_checkout_hostname varchar, p_actor_user_id varchar
)
RETURNS TABLE("status" varchar, "lastVerifiedAt" text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    RETURN QUERY SELECT r.registration_status, r.last_verified_at::text
    FROM poynt_apple_pay_merchant_registrations r
    WHERE r.provider_environment=btrim(p_provider_environment)
      AND r.provider_business_id=btrim(p_provider_business_id)
      AND r.checkout_hostname=lower(btrim(p_checkout_hostname));
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_set_poynt_apple_pay_capability(
    p_integration_id varchar, p_enabled boolean, p_actor_user_id varchar
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    IF NOT EXISTS (SELECT 1 FROM integration_configurations WHERE integration_configuration_id=p_integration_id AND upper(provider)='POYNT' AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Poynt integration was not found' USING ERRCODE='22023';
    END IF;
    INSERT INTO poynt_apple_pay_integration_capabilities(integration_configuration_id, enabled, updated_by)
    VALUES(p_integration_id, p_enabled, p_actor_user_id)
    ON CONFLICT(integration_configuration_id) DO UPDATE SET enabled=EXCLUDED.enabled, updated_by=EXCLUDED.updated_by,
        updated_at=CURRENT_TIMESTAMP, version_no=poynt_apple_pay_integration_capabilities.version_no+1;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".poynt_apple_pay_capability_enabled(p_integration_id varchar)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT COALESCE((
        SELECT enabled FROM poynt_apple_pay_integration_capabilities
        WHERE integration_configuration_id = p_integration_id
    ), false);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".platform_poynt_apple_pay_capability_enabled(p_integration_id varchar, p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    PERFORM platform_require_poynt_apple_pay_admin(p_actor_user_id);
    RETURN poynt_apple_pay_capability_enabled(p_integration_id);
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".poynt_apple_pay_association_artifacts, "${schemaName}".poynt_apple_pay_domain_hosting,
    "${schemaName}".poynt_apple_pay_merchant_registrations, "${schemaName}".poynt_apple_pay_integration_capabilities FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_require_poynt_apple_pay_admin(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_find_poynt_apple_pay_artifact(varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_save_poynt_apple_pay_artifact(varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_get_poynt_apple_pay_artifact(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_approve_poynt_apple_pay_artifact(varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_record_poynt_apple_pay_hosting(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_record_poynt_apple_pay_registration(varchar,varchar,varchar,varchar,integer,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_get_poynt_apple_pay_registration(varchar,varchar,varchar,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_set_poynt_apple_pay_capability(varchar,boolean,varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".poynt_apple_pay_capability_enabled(varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".platform_poynt_apple_pay_capability_enabled(varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_find_poynt_apple_pay_artifact(varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_save_poynt_apple_pay_artifact(varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_get_poynt_apple_pay_artifact(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_approve_poynt_apple_pay_artifact(varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_record_poynt_apple_pay_hosting(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_record_poynt_apple_pay_registration(varchar,varchar,varchar,varchar,integer,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_get_poynt_apple_pay_registration(varchar,varchar,varchar,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_set_poynt_apple_pay_capability(varchar,boolean,varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".poynt_apple_pay_capability_enabled(varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".platform_poynt_apple_pay_capability_enabled(varchar,varchar) TO "${appRole}";

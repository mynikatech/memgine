-- Poynt-specific connection metadata only. Credentials stay in the referenced secret.
CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_provider_catalog_configurations (
  integration_configuration_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
  organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
  application_id varchar(128) NOT NULL,
  provider_business_id varchar(128) NOT NULL,
  provider_store_id varchar(128),
  credential_secret_reference varchar(256) NOT NULL,
  merchant_currency_code varchar(3) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
  is_deleted boolean NOT NULL DEFAULT false,
  version_no integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_commerce_provider_catalog_currency CHECK (merchant_currency_code ~ '^[A-Z]{3}$')
);
CREATE TABLE IF NOT EXISTS "${schemaName}".commerce_catalog_sync_states (
  integration_configuration_id varchar(64) PRIMARY KEY REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
  organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
  store_id varchar(64) REFERENCES "${schemaName}".stores(store_id),
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  provider_cursor varchar(512),
  last_status varchar(16) NOT NULL DEFAULT 'NEVER',
  last_error_code varchar(80),
  last_error_message varchar(500),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
  version_no integer NOT NULL DEFAULT 1,
  CONSTRAINT ck_commerce_catalog_sync_status CHECK (last_status IN ('NEVER','SUCCESS','FAILED','PARTIAL'))
);

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_catalog_configuration(p_organization_id varchar,p_integration_id varchar,p_actor_user_id varchar)
RETURNS TABLE("integrationConfigurationId" varchar,"organizationId" varchar,"providerCode" varchar,"applicationId" varchar,"businessId" varchar,"providerStoreId" varchar,"secretReference" varchar,"merchantCurrencyCode" varchar,"storeId" varchar,"lastFullSyncAt" text,"lastIncrementalSyncAt" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT c.integration_configuration_id,c.organization_id,i.provider,c.application_id,c.provider_business_id,c.provider_store_id,c.credential_secret_reference,c.merchant_currency_code,NULL::varchar,s.last_full_sync_at::text,s.last_incremental_sync_at::text
 FROM commerce_provider_catalog_configurations c JOIN integration_configurations i ON i.integration_configuration_id=c.integration_configuration_id
 LEFT JOIN commerce_catalog_sync_states s ON s.integration_configuration_id=c.integration_configuration_id
 WHERE c.organization_id=p_organization_id AND c.integration_configuration_id=p_integration_id AND upper(i.provider)='POYNT' AND NOT c.is_deleted AND NOT i.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_get_mapping_for_refresh(p_organization_id varchar,p_mapping_id varchar,p_actor_user_id varchar)
RETURNS TABLE("mappingId" varchar,"integrationConfigurationId" varchar,"storeId" varchar,"externalProductId" varchar,"externalVariantId" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
 SELECT m.commerce_product_mapping_id,m.integration_configuration_id,m.store_id,m.external_product_id,m.external_variant_id
 FROM commerce_product_mappings m WHERE m.organization_id=p_organization_id AND m.commerce_product_mapping_id=p_mapping_id AND m.is_active AND NOT m.is_deleted AND can_administer_organization(p_organization_id,p_actor_user_id);
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_record_catalog_sync(p_organization_id varchar,p_integration_id varchar,p_store_id varchar,p_incremental boolean,p_status varchar,p_error_code varchar,p_error_message varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE v_actor varchar(64);
BEGIN
 v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
 IF NOT EXISTS(SELECT 1 FROM commerce_provider_catalog_configurations c JOIN integration_configurations i ON i.integration_configuration_id=c.integration_configuration_id WHERE c.integration_configuration_id=p_integration_id AND c.organization_id=p_organization_id AND upper(i.provider)='POYNT' AND NOT c.is_deleted AND NOT i.is_deleted) THEN RAISE EXCEPTION 'Poynt commerce integration is unavailable' USING ERRCODE='23503'; END IF;
 IF p_store_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM stores WHERE store_id=p_store_id AND organization_id=p_organization_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Store is not in organization' USING ERRCODE='23503'; END IF;
 INSERT INTO commerce_catalog_sync_states(integration_configuration_id,organization_id,store_id,last_full_sync_at,last_incremental_sync_at,last_status,last_error_code,last_error_message,created_by,updated_by)
 VALUES(p_integration_id,p_organization_id,p_store_id,CASE WHEN NOT p_incremental AND p_status='SUCCESS' THEN CURRENT_TIMESTAMP END,CASE WHEN p_incremental AND p_status='SUCCESS' THEN CURRENT_TIMESTAMP END,p_status,p_error_code,p_error_message,v_actor,v_actor)
 ON CONFLICT(integration_configuration_id) DO UPDATE SET store_id=EXCLUDED.store_id,last_full_sync_at=CASE WHEN NOT p_incremental AND p_status='SUCCESS' THEN CURRENT_TIMESTAMP ELSE commerce_catalog_sync_states.last_full_sync_at END,last_incremental_sync_at=CASE WHEN p_incremental AND p_status='SUCCESS' THEN CURRENT_TIMESTAMP ELSE commerce_catalog_sync_states.last_incremental_sync_at END,last_status=p_status,last_error_code=p_error_code,last_error_message=p_error_message,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=commerce_catalog_sync_states.version_no+1;
 RETURN true;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".commerce_provider_catalog_configurations,"${schemaName}".commerce_catalog_sync_states FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_get_catalog_configuration(varchar,varchar,varchar),"${schemaName}".commerce_get_mapping_for_refresh(varchar,varchar,varchar),"${schemaName}".commerce_record_catalog_sync(varchar,varchar,varchar,boolean,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_catalog_configuration(varchar,varchar,varchar),"${schemaName}".commerce_get_mapping_for_refresh(varchar,varchar,varchar),"${schemaName}".commerce_record_catalog_sync(varchar,varchar,varchar,boolean,varchar,varchar,varchar,varchar) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_save_catalog_configuration(p_organization_id varchar,p_integration_id varchar,p_application_id varchar,p_business_id varchar,p_provider_store_id varchar,p_secret_reference varchar,p_currency_code varchar,p_actor_user_id varchar)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE v_actor varchar(64);
BEGIN
 v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
 IF NULLIF(btrim(p_application_id),'') IS NULL OR length(p_application_id)>128 OR NULLIF(btrim(p_business_id),'') IS NULL OR length(p_business_id)>128 OR NULLIF(btrim(p_secret_reference),'') IS NULL OR length(p_secret_reference)>256 OR p_currency_code !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid Poynt catalog configuration' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM integration_configurations i JOIN integration_types it ON it.integration_type_id=i.integration_type_id WHERE i.integration_configuration_id=p_integration_id AND i.organization_id=p_organization_id AND upper(i.provider)='POYNT' AND NOT i.is_deleted AND NOT it.is_deleted AND it.integration_type_code IN ('POS','ECOMMERCE')) THEN RAISE EXCEPTION 'Poynt commerce integration is unavailable' USING ERRCODE='23503'; END IF;
 INSERT INTO commerce_provider_catalog_configurations(integration_configuration_id,organization_id,application_id,provider_business_id,provider_store_id,credential_secret_reference,merchant_currency_code,created_by,updated_by) VALUES(p_integration_id,p_organization_id,p_application_id,p_business_id,p_provider_store_id,p_secret_reference,p_currency_code,v_actor,v_actor)
 ON CONFLICT(integration_configuration_id) DO UPDATE SET application_id=EXCLUDED.application_id,provider_business_id=EXCLUDED.provider_business_id,provider_store_id=EXCLUDED.provider_store_id,credential_secret_reference=EXCLUDED.credential_secret_reference,merchant_currency_code=EXCLUDED.merchant_currency_code,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,is_deleted=false,version_no=commerce_provider_catalog_configurations.version_no+1;
 RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_save_catalog_configuration(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_save_catalog_configuration(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";

CREATE TABLE "${schemaName}".commerce_catalog_category_correspondences (
    correspondence_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64) NOT NULL REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    product_catalog_id varchar(64) NOT NULL REFERENCES "${schemaName}".product_catalog(product_catalog_id),
    external_category_id varchar(160) NOT NULL,
    external_category_name varchar(200),
    external_parent_category_id varchar(160),
    product_catalog_category_id varchar(64) NOT NULL REFERENCES "${schemaName}".product_catalog_category(product_catalog_category_id),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    version_no integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ux_catalog_category_correspondence_external_active ON "${schemaName}".commerce_catalog_category_correspondences(organization_id,integration_configuration_id,product_catalog_id,external_category_id) WHERE active;
CREATE UNIQUE INDEX ux_catalog_category_correspondence_canonical_active ON "${schemaName}".commerce_catalog_category_correspondences(organization_id,integration_configuration_id,product_catalog_id,product_catalog_category_id) WHERE active;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_list_catalog_category_correspondences(p_organization_id varchar,p_integration_id varchar,p_catalog_id varchar,p_actor_user_id varchar)
RETURNS TABLE(correspondence_id varchar,external_category_id varchar,product_catalog_category_id varchar,version_no integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
BEGIN
  PERFORM commerce_actor_organization_user(p_organization_id,p_actor_user_id);
  RETURN QUERY SELECT c.correspondence_id,c.external_category_id,c.product_catalog_category_id,c.version_no FROM commerce_catalog_category_correspondences c WHERE c.organization_id=p_organization_id AND c.integration_configuration_id=p_integration_id AND c.product_catalog_id=p_catalog_id AND c.active;
END;$function$;
CREATE OR REPLACE FUNCTION "${schemaName}".commerce_deactivate_catalog_category_correspondence(p_organization_id varchar,p_correspondence_id varchar,p_version_no integer,p_actor_user_id varchar) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE v_actor varchar(64); BEGIN v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id); UPDATE commerce_catalog_category_correspondences SET active=false,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE correspondence_id=p_correspondence_id AND organization_id=p_organization_id AND active AND version_no=p_version_no; IF NOT FOUND THEN RAISE EXCEPTION 'Category correspondence changed or unavailable' USING ERRCODE='40001'; END IF; RETURN true; END;$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commerce_save_catalog_category_correspondence(p_organization_id varchar,p_integration_id varchar,p_catalog_id varchar,p_external_category_id varchar,p_external_category_name varchar,p_external_parent_category_id varchar,p_canonical_category_id varchar,p_version_no integer,p_actor_user_id varchar)
RETURNS varchar LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,"${schemaName}" AS $function$
DECLARE v_actor varchar(64); v_id varchar(64); BEGIN
  v_actor:=commerce_actor_organization_user(p_organization_id,p_actor_user_id);
  IF NOT EXISTS(SELECT 1 FROM integration_configurations WHERE integration_configuration_id=p_integration_id AND organization_id=p_organization_id AND NOT is_deleted) OR NOT EXISTS(SELECT 1 FROM product_catalog WHERE product_catalog_id=p_catalog_id AND organization_id=p_organization_id AND NOT is_deleted) OR NOT EXISTS(SELECT 1 FROM product_catalog_category WHERE product_catalog_category_id=p_canonical_category_id AND organization_id=p_organization_id AND product_catalog_id=p_catalog_id AND NOT is_deleted) THEN RAISE EXCEPTION 'Category correspondence scope is invalid' USING ERRCODE='23503'; END IF;
  SELECT correspondence_id INTO v_id FROM commerce_catalog_category_correspondences WHERE organization_id=p_organization_id AND integration_configuration_id=p_integration_id AND product_catalog_id=p_catalog_id AND external_category_id=btrim(p_external_category_id) AND active FOR UPDATE;
  IF v_id IS NULL THEN v_id:=generate_runtime_id('CCC'); INSERT INTO commerce_catalog_category_correspondences(correspondence_id,organization_id,integration_configuration_id,product_catalog_id,external_category_id,external_category_name,external_parent_category_id,product_catalog_category_id,created_by,updated_by) VALUES(v_id,p_organization_id,p_integration_id,p_catalog_id,btrim(p_external_category_id),NULLIF(btrim(p_external_category_name),''),NULLIF(btrim(p_external_parent_category_id),''),p_canonical_category_id,v_actor,v_actor); ELSE UPDATE commerce_catalog_category_correspondences SET external_category_name=NULLIF(btrim(p_external_category_name),''),external_parent_category_id=NULLIF(btrim(p_external_parent_category_id),''),product_catalog_category_id=p_canonical_category_id,updated_at=CURRENT_TIMESTAMP,updated_by=v_actor,version_no=version_no+1 WHERE correspondence_id=v_id AND (p_version_no IS NULL OR version_no=p_version_no); IF NOT FOUND THEN RAISE EXCEPTION 'Category correspondence changed' USING ERRCODE='40001'; END IF; END IF; RETURN v_id;
END;$function$;
REVOKE ALL ON TABLE "${schemaName}".commerce_catalog_category_correspondences FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".commerce_list_catalog_category_correspondences(varchar,varchar,varchar,varchar),"${schemaName}".commerce_save_catalog_category_correspondence(varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,varchar),"${schemaName}".commerce_deactivate_catalog_category_correspondence(varchar,varchar,integer,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_list_catalog_category_correspondences(varchar,varchar,varchar,varchar),"${schemaName}".commerce_save_catalog_category_correspondence(varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,varchar),"${schemaName}".commerce_deactivate_catalog_category_correspondence(varchar,varchar,integer,varchar) TO "${appRole}";

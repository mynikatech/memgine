--liquibase formatted sql
-- ============================================================================
-- 145 - Organization Product Catalog onboarding
-- Canonical Product -> Product Catalog -> Commerce Mapping administration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "${schemaName}".product_import_batch (
    product_import_batch_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL REFERENCES "${schemaName}".organization(organization_id),
    product_catalog_id varchar(64) NOT NULL REFERENCES "${schemaName}".product_catalog(product_catalog_id),
    file_name varchar(255) NOT NULL,
    row_count integer NOT NULL,
    new_count integer NOT NULL DEFAULT 0,
    update_count integer NOT NULL DEFAULT 0,
    unchanged_count integer NOT NULL DEFAULT 0,
    status varchar(32) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL REFERENCES "${schemaName}".organization_user(organization_user_id),
    CONSTRAINT ck_product_import_batch_counts CHECK (row_count >= 0 AND new_count >= 0 AND update_count >= 0 AND unchanged_count >= 0),
    CONSTRAINT ck_product_import_batch_status CHECK (status IN ('COMPLETED'))
);
CREATE INDEX IF NOT EXISTS ix_product_import_batch_catalog
    ON "${schemaName}".product_import_batch (organization_id, product_catalog_id, created_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".organization_product_actor(
    p_organization_id varchar,
    p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_actor varchar(64);
BEGIN
    IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
    END IF;
    SELECT organization_user_id INTO v_actor
      FROM organization_user
     WHERE organization_id = p_organization_id AND user_id = p_actor_user_id AND NOT is_deleted
     LIMIT 1;
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Organization membership not found' USING ERRCODE = '42501';
    END IF;
    RETURN v_actor;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_product_catalogs_admin(
    p_organization_id varchar, p_actor_user_id varchar
) RETURNS TABLE(
    "productCatalogId" varchar, "organizationId" varchar, "integrationConfigurationId" varchar,
    "integrationName" varchar, provider varchar, "catalogName" varchar, description varchar,
    "externalCatalogId" varchar, active boolean, "sourceUpdatedAt" text, "lastSyncedAt" text, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT c.product_catalog_id, c.organization_id, c.integration_configuration_id,
           i.integration_name, i.provider, c.catalog_name, c.description, c.external_catalog_id,
           c.is_active, c.source_updated_at::text, c.last_synced_at::text, c.version_no
      FROM product_catalog c
      LEFT JOIN integration_configurations i ON i.integration_configuration_id = c.integration_configuration_id AND NOT i.is_deleted
     WHERE c.organization_id = p_organization_id AND NOT c.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY c.catalog_name, c.product_catalog_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_product_catalog(
    p_organization_id varchar,
    p_product_catalog_id varchar,
    p_integration_configuration_id varchar,
    p_catalog_name varchar,
    p_description varchar,
    p_external_catalog_id varchar,
    p_active boolean,
    p_expected_version_no integer,
    p_actor_user_id varchar
)
RETURNS varchar
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor varchar(64);
    v_id varchar(64);
    v_version integer;
BEGIN
    v_actor := organization_product_actor(
        p_organization_id,
        p_actor_user_id
    );

    IF NULLIF(btrim(p_catalog_name), '') IS NULL
       OR length(p_catalog_name) > 200 THEN
        RAISE EXCEPTION 'Catalog name is required'
            USING ERRCODE = '22023';
    END IF;

    IF p_integration_configuration_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM integration_configurations i
            WHERE i.integration_configuration_id =
                  p_integration_configuration_id
              AND i.organization_id = p_organization_id
              AND NOT i.is_deleted
       ) THEN
        RAISE EXCEPTION 'Integration is not in organization'
            USING ERRCODE = '23503';
    END IF;

    v_id := NULLIF(
        btrim(p_product_catalog_id),
        ''
    );

    IF v_id IS NULL THEN

        v_id := generate_runtime_id('PCT');

        INSERT INTO product_catalog(
            product_catalog_id,
            organization_id,
            integration_configuration_id,
            catalog_name,
            description,
            external_catalog_id,
            is_active,
            created_by,
            updated_by
        )
        VALUES(
            v_id,
            p_organization_id,
            p_integration_configuration_id,
            btrim(p_catalog_name),
            NULLIF(btrim(p_description), ''),
            NULLIF(btrim(p_external_catalog_id), ''),
            COALESCE(p_active, true),
            v_actor,
            v_actor
        );

    ELSE

        SELECT version_no
        INTO v_version
        FROM product_catalog
        WHERE product_catalog_id = v_id
          AND organization_id = p_organization_id
          AND NOT is_deleted
        FOR UPDATE;

        IF v_version IS NULL THEN
            RAISE EXCEPTION 'Catalog not found'
                USING ERRCODE = '23503';
        END IF;

        IF p_expected_version_no IS NULL
           OR v_version <> p_expected_version_no THEN
            RAISE EXCEPTION 'Catalog has changed since load'
                USING ERRCODE = '40001';
        END IF;

        UPDATE product_catalog
        SET
            integration_configuration_id =
                p_integration_configuration_id,
            catalog_name =
                btrim(p_catalog_name),
            description =
                NULLIF(btrim(p_description), ''),
            external_catalog_id =
                NULLIF(btrim(p_external_catalog_id), ''),
            is_active =
                COALESCE(p_active, true),
            updated_at =
                CURRENT_TIMESTAMP,
            updated_by =
                v_actor,
            version_no =
                version_no + 1
        WHERE product_catalog_id = v_id;

    END IF;

    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_products_admin(
    p_organization_id varchar, p_search varchar, p_actor_user_id varchar
) RETURNS TABLE(
    "productId" varchar, "organizationId" varchar, "productCatalogId" varchar, "catalogName" varchar,
    "integrationConfigurationId" varchar, "integrationName" varchar, "productCatalogCategoryId" varchar,
    "categoryName" varchar, "productCode" varchar, "productName" varchar, description varchar,
    "shortCode" varchar, sku varchar, upc varchar, "basePriceMinor" bigint, "currencyCode" varchar,
    active boolean, "externalProductIds" varchar, "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT p.product_id, p.organization_id, p.product_catalog_id, c.catalog_name, c.integration_configuration_id,
           i.integration_name, p.product_catalog_category_id, cat.category_name, p.product_code, p.product_name,
           p.description, p.short_code, p.sku, p.upc, p.base_price_minor, p.currency_code,
           p.status_id = 'entity-status-product-active',
           string_agg(DISTINCT m.external_product_id, ', ' ORDER BY m.external_product_id), p.version_no
      FROM product p
      LEFT JOIN product_catalog c ON c.product_catalog_id = p.product_catalog_id AND NOT c.is_deleted
      LEFT JOIN integration_configurations i ON i.integration_configuration_id = c.integration_configuration_id AND NOT i.is_deleted
      LEFT JOIN product_catalog_category cat ON cat.product_catalog_category_id = p.product_catalog_category_id AND NOT cat.is_deleted
      LEFT JOIN commerce_product_mappings m ON m.product_id = p.product_id AND NOT m.is_deleted
     WHERE p.organization_id = p_organization_id AND NOT p.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
       AND (NULLIF(btrim(p_search), '') IS NULL OR p.product_name ILIKE '%' || btrim(p_search) || '%'
            OR p.product_code ILIKE '%' || btrim(p_search) || '%' OR COALESCE(p.sku, '') ILIKE '%' || btrim(p_search) || '%')
     GROUP BY p.product_id, c.catalog_name, c.integration_configuration_id, i.integration_name, cat.category_name
     ORDER BY p.product_name, p.product_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_product(
    p_organization_id varchar, p_product_id varchar, p_product_catalog_id varchar, p_product_catalog_category_id varchar,
    p_product_code varchar, p_product_name varchar, p_description varchar, p_short_code varchar, p_sku varchar, p_upc varchar,
    p_base_price_minor bigint, p_currency_code varchar, p_active boolean, p_external_product_id varchar,
    p_expected_version_no integer, p_actor_user_id varchar
) RETURNS varchar
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_organization_user_id varchar(64);
    v_id varchar(64);
    v_version integer;
    v_integration varchar(64);
    v_mapping varchar(64);
    v_effective_external_product_id varchar(160);
    v_existing_mapping_product_id varchar(64);
    v_existing_mapping_external_id varchar(160);
    v_sku_mapping_count integer;
BEGIN
    -- Product audit columns reference global user.user_id. Catalog, category and
    -- import audit columns reference organization_user.organization_user_id.
    v_organization_user_id := organization_product_actor(p_organization_id, p_actor_user_id);
    IF NULLIF(btrim(p_product_code), '') IS NULL OR NULLIF(btrim(p_product_name), '') IS NULL
       OR p_base_price_minor IS NULL OR p_base_price_minor < 0 OR COALESCE(length(NULLIF(btrim(p_currency_code), '')), 0) <> 3 THEN
        RAISE EXCEPTION 'Invalid product fields' USING ERRCODE = '22023';
    END IF;
    SELECT integration_configuration_id INTO v_integration FROM product_catalog
     WHERE product_catalog_id = p_product_catalog_id AND organization_id = p_organization_id AND NOT is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Catalog not found' USING ERRCODE = '23503'; END IF;
    IF p_product_catalog_category_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM product_catalog_category WHERE product_catalog_category_id = p_product_catalog_category_id
          AND product_catalog_id = p_product_catalog_id AND organization_id = p_organization_id AND NOT is_deleted
    ) THEN RAISE EXCEPTION 'Category is not in catalog' USING ERRCODE = '23503'; END IF;
    v_id := NULLIF(btrim(p_product_id), '');
    IF EXISTS(SELECT 1 FROM product WHERE organization_id = p_organization_id AND product_code = btrim(p_product_code)
                AND product_id IS DISTINCT FROM v_id AND NOT is_deleted) THEN
        RAISE EXCEPTION 'Product code already exists' USING ERRCODE = '23505';
    END IF;
    IF v_id IS NULL THEN
        v_id := generate_runtime_id('PRD');
        INSERT INTO product(product_id, organization_id, product_code, product_name, description, status_id, product_catalog_id,
          product_catalog_category_id, short_code, sku, upc, base_price_minor, currency_code, created_by, updated_by)
        VALUES(v_id, p_organization_id, btrim(p_product_code), btrim(p_product_name), NULLIF(btrim(p_description), ''),
          CASE WHEN COALESCE(p_active,true) THEN 'entity-status-product-active' ELSE 'entity-status-product-inactive' END, p_product_catalog_id,
          p_product_catalog_category_id, NULLIF(btrim(p_short_code), ''), NULLIF(btrim(p_sku), ''), NULLIF(btrim(p_upc), ''),
          p_base_price_minor, upper(btrim(p_currency_code)), p_actor_user_id, p_actor_user_id);
    ELSE
        SELECT version_no INTO v_version FROM product WHERE product_id = v_id AND organization_id = p_organization_id AND NOT is_deleted FOR UPDATE;
        IF v_version IS NULL THEN RAISE EXCEPTION 'Product not found' USING ERRCODE = '23503'; END IF;
        IF p_expected_version_no IS NULL OR v_version <> p_expected_version_no THEN RAISE EXCEPTION 'Product has changed since load' USING ERRCODE = '40001'; END IF;
        UPDATE product SET product_catalog_id=p_product_catalog_id, product_catalog_category_id=p_product_catalog_category_id,
          product_code=btrim(p_product_code), product_name=btrim(p_product_name), description=NULLIF(btrim(p_description), ''),
          status_id=CASE WHEN COALESCE(p_active,true) THEN 'entity-status-product-active' ELSE 'entity-status-product-inactive' END,
          short_code=NULLIF(btrim(p_short_code), ''), sku=NULLIF(btrim(p_sku), ''), upc=NULLIF(btrim(p_upc), ''),
          base_price_minor=p_base_price_minor, currency_code=upper(btrim(p_currency_code)), updated_at=CURRENT_TIMESTAMP,
          updated_by=p_actor_user_id, version_no=version_no+1 WHERE product_id=v_id;
    END IF;
    v_effective_external_product_id := COALESCE(
        NULLIF(btrim(p_external_product_id), ''),
        NULLIF(btrim(p_sku), '')
    );
    IF v_integration IS NOT NULL AND v_effective_external_product_id IS NOT NULL THEN
       IF NULLIF(btrim(p_external_product_id), '') IS NULL
          AND NULLIF(btrim(p_sku), '') IS NOT NULL THEN
           SELECT count(*), min(product_id), min(external_product_id)
             INTO v_sku_mapping_count, v_existing_mapping_product_id, v_existing_mapping_external_id
             FROM commerce_product_mappings
            WHERE organization_id = p_organization_id
              AND integration_configuration_id = v_integration
              AND store_id IS NULL
              AND external_sku = btrim(p_sku)
              AND NOT is_deleted;
           IF v_sku_mapping_count > 1 THEN
               RAISE EXCEPTION 'POS SKU is ambiguous' USING ERRCODE = '23505';
           END IF;
           IF v_sku_mapping_count = 1 THEN
               IF v_existing_mapping_product_id IS DISTINCT FROM v_id THEN
                   RAISE EXCEPTION 'POS SKU is already mapped to another product'
                     USING ERRCODE = '23505';
               END IF;
               -- Preserve the existing mapping identity when the caller only
               -- supplies SKU; this makes repeated manual saves idempotent.
               v_effective_external_product_id := v_existing_mapping_external_id;
           END IF;
       END IF;
       SELECT product_id INTO v_existing_mapping_product_id
         FROM commerce_product_mappings
        WHERE organization_id = p_organization_id
          AND integration_configuration_id = v_integration
          AND store_id IS NULL
          AND external_product_id = v_effective_external_product_id
          AND NOT is_deleted
        FOR UPDATE;
       IF v_existing_mapping_product_id IS NOT NULL
          AND v_existing_mapping_product_id IS DISTINCT FROM v_id THEN
           RAISE EXCEPTION 'External Product ID is already mapped to another product'
             USING ERRCODE = '23505';
       END IF;
       IF NULLIF(btrim(p_sku), '') IS NOT NULL AND EXISTS (
           SELECT 1 FROM commerce_product_mappings
            WHERE organization_id = p_organization_id
              AND integration_configuration_id = v_integration
              AND store_id IS NULL
              AND external_sku = btrim(p_sku)
              AND product_id IS DISTINCT FROM v_id
              AND NOT is_deleted
       ) THEN
           RAISE EXCEPTION 'POS SKU is already mapped to another product'
             USING ERRCODE = '23505';
       END IF;
       v_mapping := save_commerce_product_mapping(p_organization_id, v_id, v_integration, NULL, v_effective_external_product_id, NULL,
          NULLIF(btrim(p_sku), ''), COALESCE(p_active,true), p_actor_user_id);
    END IF;
    RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".preview_organization_product_import(
    p_organization_id varchar, p_product_catalog_id varchar, p_rows jsonb, p_actor_user_id varchar
) RETURNS TABLE("rowNumber" integer, classification varchar, "productId" varchar, reason varchar)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    r record;
    v_product varchar(64);
    v_integration varchar(64);
    v_count integer;
    v_category varchar(64);
    v_external_mapping_product varchar(64);
    v_external_mapping_count integer;
    v_sku_mapping_product varchar(64);
    v_sku_mapping_count integer;
    v_existing_product_sku varchar(160);
BEGIN
    PERFORM organization_product_actor(p_organization_id, p_actor_user_id);
    SELECT integration_configuration_id INTO v_integration FROM product_catalog WHERE product_catalog_id=p_product_catalog_id AND organization_id=p_organization_id AND NOT is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Catalog not found' USING ERRCODE='23503'; END IF;
    FOR r IN SELECT * FROM jsonb_to_recordset(COALESCE(p_rows,'[]'::jsonb)) AS x(
        "rowNumber" integer, "productId" varchar, "externalProductId" varchar,
        "productCode" varchar, "productName" varchar, sku varchar, upc varchar,
        description varchar, "categoryExternalId" varchar, "categoryName" varchar,
        "basePriceMinor" bigint, "currencyCode" varchar, active boolean
    )
    LOOP
      v_product := NULL;
      v_category := NULL;
      v_external_mapping_product := NULL;
      v_external_mapping_count := 0;
      v_sku_mapping_product := NULL;
      v_sku_mapping_count := 0;
      v_existing_product_sku := NULL;
      IF NULLIF(btrim(r."productName"),'') IS NULL OR NULLIF(btrim(r."productCode"),'') IS NULL OR r."basePriceMinor" IS NULL OR r."basePriceMinor" < 0 OR COALESCE(length(NULLIF(btrim(r."currencyCode"),'')),0) <> 3 THEN
        "rowNumber" := r."rowNumber"; classification := 'ERROR'; "productId" := NULL; reason := 'Required product fields are invalid'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_integration IS NOT NULL AND NULLIF(btrim(r."externalProductId"),'') IS NOT NULL AND (
          SELECT count(*) FROM jsonb_to_recordset(COALESCE(p_rows,'[]'::jsonb)) AS d("externalProductId" varchar)
           WHERE NULLIF(btrim(d."externalProductId"),'') = btrim(r."externalProductId")
      ) > 1 THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Duplicate External Product ID in import'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_integration IS NOT NULL AND NULLIF(btrim(r.sku),'') IS NOT NULL AND (
          SELECT count(*) FROM jsonb_to_recordset(COALESCE(p_rows,'[]'::jsonb)) AS d(sku varchar)
           WHERE NULLIF(btrim(d.sku),'') = btrim(r.sku)
      ) > 1 THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Duplicate POS SKU in import'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_integration IS NOT NULL AND (
          SELECT count(*) FROM jsonb_to_recordset(COALESCE(p_rows,'[]'::jsonb)) AS d("productCode" varchar)
           WHERE NULLIF(btrim(d."productCode"),'') = btrim(r."productCode")
      ) > 1 THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Duplicate Product Code in import; use unique Product Codes'; RETURN NEXT; CONTINUE;
      END IF;
      -- Explicit canonical identity is authoritative. Each following matching
      -- strategy is attempted only if the previous strategy did not find a row.
      IF NULLIF(btrim(r."productId"),'') IS NOT NULL THEN
        SELECT product_id INTO v_product FROM product WHERE product_id=r."productId" AND organization_id=p_organization_id AND NOT is_deleted;
        IF v_product IS NULL THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Product ID is not in this organization'; RETURN NEXT; CONTINUE; END IF;
      END IF;
      IF v_integration IS NOT NULL AND NULLIF(btrim(r."externalProductId"),'') IS NOT NULL THEN
        SELECT count(DISTINCT product_id), min(product_id)
          INTO v_external_mapping_count,v_external_mapping_product
          FROM commerce_product_mappings
         WHERE organization_id=p_organization_id AND integration_configuration_id=v_integration AND store_id IS NULL
           AND external_product_id=btrim(r."externalProductId") AND is_active AND NOT is_deleted;
        IF v_external_mapping_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='External Product ID is ambiguous'; RETURN NEXT; CONTINUE; END IF;
      END IF;
      IF v_integration IS NOT NULL AND NULLIF(btrim(r.sku),'') IS NOT NULL THEN
        SELECT count(DISTINCT product_id), min(product_id)
          INTO v_sku_mapping_count,v_sku_mapping_product
          FROM commerce_product_mappings
         WHERE organization_id=p_organization_id AND integration_configuration_id=v_integration AND store_id IS NULL
           AND (external_sku=btrim(r.sku) OR external_product_id=btrim(r.sku))
           AND is_active AND NOT is_deleted;
        IF v_sku_mapping_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='POS SKU is ambiguous'; RETURN NEXT; CONTINUE; END IF;
      END IF;
      IF v_external_mapping_product IS NOT NULL AND v_sku_mapping_product IS NOT NULL
         AND v_external_mapping_product IS DISTINCT FROM v_sku_mapping_product THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='External Product ID conflicts with POS SKU mapping'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_product IS NULL THEN
        v_product := COALESCE(v_external_mapping_product, v_sku_mapping_product);
      ELSIF (v_external_mapping_product IS NOT NULL AND v_external_mapping_product IS DISTINCT FROM v_product)
         OR (v_sku_mapping_product IS NOT NULL AND v_sku_mapping_product IS DISTINCT FROM v_product) THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Supplied Product ID conflicts with existing POS mapping'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_product IS NULL AND NULLIF(btrim(r.sku),'') IS NOT NULL THEN
        SELECT count(*), min(product_id) INTO v_count,v_product
          FROM product
         WHERE organization_id=p_organization_id AND product_catalog_id=p_product_catalog_id
           AND sku=btrim(r.sku) AND NOT is_deleted;
        IF v_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='SKU is ambiguous'; RETURN NEXT; CONTINUE; END IF;
      END IF;
      IF v_product IS NULL AND NULLIF(btrim(r."productCode"),'') IS NOT NULL THEN
        SELECT count(*), min(product_id), min(sku) INTO v_count,v_product,v_existing_product_sku
          FROM product
         WHERE organization_id=p_organization_id AND product_code=btrim(r."productCode") AND NOT is_deleted;
        IF v_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Product Code is ambiguous'; RETURN NEXT; CONTINUE; END IF;
        IF v_count = 1 AND NULLIF(btrim(r.sku),'') IS NOT NULL
           AND NULLIF(btrim(v_existing_product_sku),'') IS NOT NULL
           AND btrim(v_existing_product_sku) IS DISTINCT FROM btrim(r.sku) THEN
          "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL;
          reason:=format('Product Code %s is already used by another Product with SKU %s. Incoming SKU %s represents a different Product. Use a unique Product Code.', btrim(r."productCode"), btrim(v_existing_product_sku), btrim(r.sku));
          RETURN NEXT; CONTINUE;
        END IF;
      END IF;
      IF NULLIF(btrim(r."categoryExternalId"),'') IS NOT NULL THEN
        SELECT count(*), min(product_catalog_category_id) INTO v_count,v_category
          FROM product_catalog_category
         WHERE organization_id=p_organization_id AND product_catalog_id=p_product_catalog_id
           AND external_category_id=btrim(r."categoryExternalId") AND NOT is_deleted;
        IF v_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='External Category ID is ambiguous'; RETURN NEXT; CONTINUE; END IF;
      ELSIF NULLIF(btrim(r."categoryName"),'') IS NOT NULL THEN
        SELECT count(*), min(product_catalog_category_id) INTO v_count,v_category
          FROM product_catalog_category
         WHERE organization_id=p_organization_id AND product_catalog_id=p_product_catalog_id
           AND category_name=btrim(r."categoryName") AND NOT is_deleted;
        IF v_count > 1 THEN "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='Category name is ambiguous'; RETURN NEXT; CONTINUE; END IF;
      END IF;
      -- A pre-existing provider identity may never be silently rebound to a
      -- different canonical Product. Missing mappings are handled at commit.
      IF v_product IS NOT NULL AND v_external_mapping_product IS NOT NULL
         AND v_external_mapping_product IS DISTINCT FROM v_product THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='External Product ID belongs to a different product'; RETURN NEXT; CONTINUE;
      END IF;
      IF v_product IS NOT NULL AND v_sku_mapping_product IS NOT NULL
         AND v_sku_mapping_product IS DISTINCT FROM v_product THEN
        "rowNumber":=r."rowNumber"; classification:='ERROR'; "productId":=NULL; reason:='POS SKU is already mapped to another product'; RETURN NEXT; CONTINUE;
      END IF;
      "rowNumber":=r."rowNumber"; "productId":=v_product;
      IF v_product IS NULL THEN classification:='NEW'; reason:=NULL;
      ELSIF EXISTS(SELECT 1 FROM product p WHERE p.product_id=v_product AND (
          p.product_catalog_id IS DISTINCT FROM p_product_catalog_id OR
          ((NULLIF(btrim(r."categoryExternalId"),'') IS NOT NULL OR NULLIF(btrim(r."categoryName"),'') IS NOT NULL) AND v_category IS NULL) OR
          p.product_catalog_category_id IS DISTINCT FROM v_category OR
          p.product_code IS DISTINCT FROM btrim(r."productCode") OR
          p.product_name IS DISTINCT FROM btrim(r."productName") OR
          p.description IS DISTINCT FROM NULLIF(btrim(r.description),'') OR
          p.sku IS DISTINCT FROM NULLIF(btrim(r.sku),'') OR
          p.upc IS DISTINCT FROM NULLIF(btrim(r.upc),'') OR
          p.base_price_minor IS DISTINCT FROM r."basePriceMinor" OR
          p.currency_code IS DISTINCT FROM upper(btrim(r."currencyCode")) OR
          p.status_id IS DISTINCT FROM CASE WHEN COALESCE(r.active,true) THEN 'entity-status-product-active' ELSE 'entity-status-product-inactive' END
      )) THEN classification:='UPDATE'; reason:=NULL;
      ELSE classification:='UNCHANGED'; reason:=NULL; END IF;
      RETURN NEXT;
    END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".commit_organization_product_import(
    p_organization_id varchar, p_product_catalog_id varchar, p_file_name varchar, p_rows jsonb, p_actor_user_id varchar
) RETURNS TABLE("batchId" varchar, "newCount" integer, "updateCount" integer, "unchangedCount" integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE r record; p record; v_actor varchar(64); v_new integer:=0; v_update integer:=0; v_unchanged integer:=0;
        v_batch varchar(64); v_category varchar(64); v_product varchar(64); v_integration varchar(64);
BEGIN
    v_actor := organization_product_actor(p_organization_id, p_actor_user_id);
    IF NULLIF(btrim(p_file_name),'') IS NULL OR jsonb_typeof(COALESCE(p_rows,'[]'::jsonb)) <> 'array' THEN
       RAISE EXCEPTION 'Invalid product import' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM preview_organization_product_import(p_organization_id,p_product_catalog_id,p_rows,p_actor_user_id) WHERE classification='ERROR') THEN
       RAISE EXCEPTION 'Product import contains invalid rows' USING ERRCODE='22023';
    END IF;
    SELECT integration_configuration_id INTO v_integration
      FROM product_catalog
     WHERE product_catalog_id=p_product_catalog_id AND organization_id=p_organization_id AND NOT is_deleted;
    IF NOT FOUND THEN RAISE EXCEPTION 'Catalog not found' USING ERRCODE='23503'; END IF;
    FOR r IN SELECT * FROM jsonb_to_recordset(p_rows) AS x("rowNumber" integer, "productId" varchar, "externalProductId" varchar, "productCode" varchar, "productName" varchar, sku varchar, upc varchar, description varchar, "categoryExternalId" varchar, "categoryName" varchar, "basePriceMinor" bigint, "currencyCode" varchar, active boolean)
    LOOP
      SELECT * INTO p FROM preview_organization_product_import(p_organization_id,p_product_catalog_id,jsonb_build_array(jsonb_build_object(
        'rowNumber',r."rowNumber",'productId',r."productId",'externalProductId',r."externalProductId",'productCode',r."productCode",'productName',r."productName",'sku',r.sku,'upc',r.upc,'description',r.description,'categoryExternalId',r."categoryExternalId",'categoryName',r."categoryName",'basePriceMinor',r."basePriceMinor",'currencyCode',r."currencyCode",'active',r.active
      )),p_actor_user_id);
      v_category := NULL;
      IF NULLIF(btrim(r."categoryExternalId"),'') IS NOT NULL OR NULLIF(btrim(r."categoryName"),'') IS NOT NULL THEN
        SELECT product_catalog_category_id INTO v_category FROM product_catalog_category
         WHERE product_catalog_id=p_product_catalog_id AND organization_id=p_organization_id AND NOT is_deleted
           AND ((NULLIF(btrim(r."categoryExternalId"),'') IS NOT NULL AND external_category_id=btrim(r."categoryExternalId"))
                OR (NULLIF(btrim(r."categoryExternalId"),'') IS NULL AND category_name=btrim(r."categoryName"))) LIMIT 1 FOR UPDATE;
        IF v_category IS NULL THEN
          v_category:=generate_runtime_id('PCC');
          INSERT INTO product_catalog_category(product_catalog_category_id,organization_id,product_catalog_id,external_category_id,category_name,created_by,updated_by)
          VALUES(v_category,p_organization_id,p_product_catalog_id,NULLIF(btrim(r."categoryExternalId"),''),COALESCE(NULLIF(btrim(r."categoryName"),''),'Uncategorized'),v_actor,v_actor);
        END IF;
      END IF;
      IF p.classification IN ('NEW','UPDATE') THEN
        v_product := save_organization_product(p_organization_id,p."productId",p_product_catalog_id,v_category,r."productCode",r."productName",r.description,NULL,r.sku,r.upc,r."basePriceMinor",r."currencyCode",COALESCE(r.active,true),r."externalProductId",
          CASE WHEN p."productId" IS NULL THEN NULL ELSE (SELECT version_no FROM product WHERE product_id=p."productId") END,p_actor_user_id);
        IF p.classification='NEW' THEN v_new:=v_new+1; ELSE v_update:=v_update+1; END IF;
      ELSE
        -- Do not touch the Product or increment its version when all Product
        -- attributes match. An imported external identity may still need its
        -- first canonical Commerce mapping.
        v_product := p."productId";
        IF v_integration IS NOT NULL
           AND COALESCE(NULLIF(btrim(r."externalProductId"),''), NULLIF(btrim(r.sku),'')) IS NOT NULL
           AND NOT EXISTS (
          SELECT 1 FROM commerce_product_mappings m
           WHERE m.organization_id=p_organization_id AND m.integration_configuration_id=v_integration
             AND m.store_id IS NULL
             AND (
                 m.external_product_id=COALESCE(NULLIF(btrim(r."externalProductId"),''), NULLIF(btrim(r.sku),''))
                 OR (NULLIF(btrim(r."externalProductId"),'') IS NULL AND m.external_sku=btrim(r.sku))
             )
             AND NOT m.is_deleted
        ) THEN
          PERFORM save_commerce_product_mapping(p_organization_id,v_product,v_integration,NULL,
            COALESCE(NULLIF(btrim(r."externalProductId"),''), NULLIF(btrim(r.sku),'')),NULL,
            NULLIF(btrim(r.sku),''),COALESCE(r.active,true),p_actor_user_id);
        END IF;
        v_unchanged:=v_unchanged+1;
      END IF;
    END LOOP;
    v_batch:=generate_runtime_id('PIB');
    INSERT INTO product_import_batch(product_import_batch_id,organization_id,product_catalog_id,file_name,row_count,new_count,update_count,unchanged_count,status,created_by)
    VALUES(v_batch,p_organization_id,p_product_catalog_id,btrim(p_file_name),jsonb_array_length(p_rows),v_new,v_update,v_unchanged,'COMPLETED',v_actor);
    "batchId":=v_batch; "newCount":=v_new; "updateCount":=v_update; "unchangedCount":=v_unchanged; RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".deactivate_commerce_product_mapping(
    p_organization_id varchar,
    p_commerce_product_mapping_id varchar,
    p_actor_user_id varchar
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_actor_organization_user_id varchar(64);
BEGIN
    v_actor_organization_user_id := organization_product_actor(
        p_organization_id,
        p_actor_user_id
    );

    PERFORM 1
      FROM commerce_product_mappings
     WHERE commerce_product_mapping_id = p_commerce_product_mapping_id
       AND organization_id = p_organization_id
       AND NOT is_deleted
     FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Commerce product mapping not found'
            USING ERRCODE = '23503';
    END IF;

    UPDATE commerce_product_mappings
       SET is_active = false,
           is_deleted = true,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = v_actor_organization_user_id,
           version_no = version_no + 1
     WHERE commerce_product_mapping_id = p_commerce_product_mapping_id
       AND organization_id = p_organization_id
       AND NOT is_deleted;

    RETURN true;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".product_import_batch FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".organization_product_actor(varchar,varchar), "${schemaName}".get_organization_product_catalogs_admin(varchar,varchar), "${schemaName}".save_organization_product_catalog(varchar,varchar,varchar,varchar,varchar,varchar,boolean,integer,varchar), "${schemaName}".get_organization_products_admin(varchar,varchar,varchar), "${schemaName}".save_organization_product(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,bigint,varchar,boolean,varchar,integer,varchar), "${schemaName}".preview_organization_product_import(varchar,varchar,jsonb,varchar), "${schemaName}".commit_organization_product_import(varchar,varchar,varchar,jsonb,varchar), "${schemaName}".deactivate_commerce_product_mapping(varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_product_catalogs_admin(varchar,varchar), "${schemaName}".save_organization_product_catalog(varchar,varchar,varchar,varchar,varchar,varchar,boolean,integer,varchar), "${schemaName}".get_organization_products_admin(varchar,varchar,varchar), "${schemaName}".save_organization_product(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,bigint,varchar,boolean,varchar,integer,varchar), "${schemaName}".preview_organization_product_import(varchar,varchar,jsonb,varchar), "${schemaName}".commit_organization_product_import(varchar,varchar,varchar,jsonb,varchar), "${schemaName}".deactivate_commerce_product_mapping(varchar,varchar,varchar) TO "${appRole}";

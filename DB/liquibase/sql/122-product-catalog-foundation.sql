-- ============================================================================
-- 122 - Product catalog foundation
--
-- Purpose
--   * Promote the existing product table to the durable Memgine product master.
--   * Add organization-owned catalogs, categories and product modifiers.
--   * Keep commerce_product_snapshots as the provider/POS snapshot layer.
--   * Link commerce_product_mappings to the durable Memgine product identity.
--   * Expose read functions required by Org Admin benefit/offer configuration.
--
-- Notes
--   * This change intentionally does NOT add stock/inventory quantities.
--   * Provider-specific product identity continues to live in
--     commerce_product_mappings. product remains provider-neutral.
--   * Existing product rows remain valid; new catalog-related columns are nullable
--     so this change can be applied without a legacy data backfill.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Organization product catalog
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "${schemaName}".product_catalog (
    product_catalog_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    integration_configuration_id varchar(64)
        REFERENCES "${schemaName}".integration_configurations(integration_configuration_id),
    catalog_name varchar(200) NOT NULL,
    description varchar(1000),
    external_catalog_id varchar(160),
    is_active boolean NOT NULL DEFAULT true,
    source_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_product_catalog_name_not_blank
        CHECK (btrim(catalog_name) <> '')
);

CREATE INDEX IF NOT EXISTS ix_product_catalog_organization
    ON "${schemaName}".product_catalog (organization_id)
    WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_product_catalog_integration
    ON "${schemaName}".product_catalog (integration_configuration_id)
    WHERE NOT is_deleted AND integration_configuration_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_catalog_external_identity
    ON "${schemaName}".product_catalog (
        organization_id,
        integration_configuration_id,
        external_catalog_id
    )
    WHERE NOT is_deleted
      AND integration_configuration_id IS NOT NULL
      AND external_catalog_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 2. Organization-specific catalog categories
--
-- Do not reuse product_categories here. product_categories is existing Memgine
-- reference data used by Membership Products; POS/menu categories are owned by
-- an organization/catalog and therefore need their own entity.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "${schemaName}".product_catalog_category (
    product_catalog_category_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    product_catalog_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".product_catalog(product_catalog_id),
    parent_category_id varchar(64)
        REFERENCES "${schemaName}".product_catalog_category(product_catalog_category_id),
    external_category_id varchar(160),
    category_name varchar(200) NOT NULL,
    description varchar(1000),
    display_order integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    source_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_product_catalog_category_name_not_blank
        CHECK (btrim(category_name) <> ''),
    CONSTRAINT ck_product_catalog_category_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_product_catalog_category_catalog
    ON "${schemaName}".product_catalog_category (product_catalog_id, display_order, category_name)
    WHERE NOT is_deleted;

CREATE INDEX IF NOT EXISTS ix_product_catalog_category_organization
    ON "${schemaName}".product_catalog_category (organization_id)
    WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_catalog_category_external_identity
    ON "${schemaName}".product_catalog_category (
        product_catalog_id,
        external_category_id
    )
    WHERE NOT is_deleted AND external_category_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 3. Extend existing Memgine product master
-- --------------------------------------------------------------------------
ALTER TABLE "${schemaName}".product
    ADD COLUMN IF NOT EXISTS product_catalog_id varchar(64),
    ADD COLUMN IF NOT EXISTS product_catalog_category_id varchar(64),
    ADD COLUMN IF NOT EXISTS short_code varchar(160),
    ADD COLUMN IF NOT EXISTS sku varchar(160),
    ADD COLUMN IF NOT EXISTS upc varchar(160),
    ADD COLUMN IF NOT EXISTS base_price_minor bigint,
    ADD COLUMN IF NOT EXISTS currency_code varchar(3),
    ADD COLUMN IF NOT EXISTS source_updated_at timestamp with time zone,
    ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'fk_product_product_catalog'
           AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".product
            ADD CONSTRAINT fk_product_product_catalog
            FOREIGN KEY (product_catalog_id)
            REFERENCES "${schemaName}".product_catalog(product_catalog_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'fk_product_product_catalog_category'
           AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".product
            ADD CONSTRAINT fk_product_product_catalog_category
            FOREIGN KEY (product_catalog_category_id)
            REFERENCES "${schemaName}".product_catalog_category(product_catalog_category_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'ck_product_base_price_minor'
           AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".product
            ADD CONSTRAINT ck_product_base_price_minor
            CHECK (base_price_minor IS NULL OR base_price_minor >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'ck_product_currency_code'
           AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".product
            ADD CONSTRAINT ck_product_currency_code
            CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$');
    END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS ix_product_catalog
    ON "${schemaName}".product (product_catalog_id)
    WHERE NOT is_deleted AND product_catalog_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_product_catalog_category
    ON "${schemaName}".product (product_catalog_category_id)
    WHERE NOT is_deleted AND product_catalog_category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_product_organization_sku
    ON "${schemaName}".product (organization_id, sku)
    WHERE NOT is_deleted AND sku IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_product_organization_upc
    ON "${schemaName}".product (organization_id, upc)
    WHERE NOT is_deleted AND upc IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_product_organization_short_code
    ON "${schemaName}".product (organization_id, short_code)
    WHERE NOT is_deleted AND short_code IS NOT NULL;

-- Deliberately no UNIQUE constraint on sku, upc, short_code or product name.
-- The OSC source file already demonstrates that those fields are optional and
-- can be duplicated. Memgine product_id remains the durable identity.

-- --------------------------------------------------------------------------
-- 4. Product modifier groups and options
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "${schemaName}".product_modifier_group (
    product_modifier_group_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    product_id varchar(40) NOT NULL
        REFERENCES "${schemaName}".product(product_id),
    external_modifier_group_id varchar(160),
    modifier_group_name varchar(200) NOT NULL,
    selection_type varchar(16) NOT NULL,
    min_selections integer NOT NULL DEFAULT 0,
    max_selections integer,
    is_required boolean NOT NULL DEFAULT false,
    display_order integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    source_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_product_modifier_group_name_not_blank
        CHECK (btrim(modifier_group_name) <> ''),
    CONSTRAINT ck_product_modifier_group_selection_type
        CHECK (selection_type IN ('SINGLE', 'MULTIPLE')),
    CONSTRAINT ck_product_modifier_group_min
        CHECK (min_selections >= 0),
    CONSTRAINT ck_product_modifier_group_max
        CHECK (max_selections IS NULL OR max_selections >= min_selections),
    CONSTRAINT ck_product_modifier_group_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_product_modifier_group_product
    ON "${schemaName}".product_modifier_group (product_id, display_order)
    WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_modifier_group_external_identity
    ON "${schemaName}".product_modifier_group (product_id, external_modifier_group_id)
    WHERE NOT is_deleted AND external_modifier_group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS "${schemaName}".product_modifier_option (
    product_modifier_option_id varchar(64) PRIMARY KEY,
    organization_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization(organization_id),
    product_modifier_group_id varchar(64) NOT NULL
        REFERENCES "${schemaName}".product_modifier_group(product_modifier_group_id),
    external_modifier_option_id varchar(160),
    option_name varchar(200) NOT NULL,
    price_delta_minor bigint NOT NULL DEFAULT 0,
    sku varchar(160),
    upc varchar(160),
    display_order integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    source_updated_at timestamp with time zone,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(64) NOT NULL
        REFERENCES "${schemaName}".organization_user(organization_user_id),
    is_deleted boolean NOT NULL DEFAULT false,
    version_no integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_product_modifier_option_name_not_blank
        CHECK (btrim(option_name) <> ''),
    CONSTRAINT ck_product_modifier_option_display_order
        CHECK (display_order >= 0)
);

CREATE INDEX IF NOT EXISTS ix_product_modifier_option_group
    ON "${schemaName}".product_modifier_option (product_modifier_group_id, display_order)
    WHERE NOT is_deleted;

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_modifier_option_external_identity
    ON "${schemaName}".product_modifier_option (
        product_modifier_group_id,
        external_modifier_option_id
    )
    WHERE NOT is_deleted AND external_modifier_option_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- 5. Bridge provider/POS identity to the durable Memgine product
--
-- Existing commerce_product_mappings remains the provider identity mapping.
-- It now optionally resolves to product.product_id. Nullable is intentional so
-- existing mappings can be reconciled/backfilled without blocking deployment.
-- --------------------------------------------------------------------------
ALTER TABLE "${schemaName}".commerce_product_mappings
    ADD COLUMN IF NOT EXISTS product_id varchar(40);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE c.conname = 'fk_commerce_product_mapping_product'
           AND n.nspname = '${schemaName}'
    ) THEN
        ALTER TABLE "${schemaName}".commerce_product_mappings
            ADD CONSTRAINT fk_commerce_product_mapping_product
            FOREIGN KEY (product_id)
            REFERENCES "${schemaName}".product(product_id);
    END IF;
END
$migration$;

CREATE INDEX IF NOT EXISTS ix_commerce_product_mappings_product
    ON "${schemaName}".commerce_product_mappings (product_id)
    WHERE NOT is_deleted AND product_id IS NOT NULL;

-- One provider mapping should resolve to one product. A single Memgine product
-- may legitimately have multiple mappings across stores/integrations.

-- --------------------------------------------------------------------------
-- 6. Cross-organization / catalog integrity guards
--
-- These triggers intentionally validate ownership relationships in addition to
-- the ordinary foreign keys. They prevent a sync or application bug from
-- linking an entity owned by one organization/catalog to another.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "${schemaName}".validate_product_catalog_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NEW.integration_configuration_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM integration_configurations i
             WHERE i.integration_configuration_id = NEW.integration_configuration_id
               AND i.organization_id = NEW.organization_id
               AND NOT i.is_deleted
       ) THEN
        RAISE EXCEPTION
            'Product catalog integration configuration does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_catalog_scope
    ON "${schemaName}".product_catalog;

CREATE TRIGGER trg_validate_product_catalog_scope
BEFORE INSERT OR UPDATE OF organization_id, integration_configuration_id
ON "${schemaName}".product_catalog
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_product_catalog_scope();


CREATE OR REPLACE FUNCTION "${schemaName}".validate_product_catalog_category_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_parent_catalog_id varchar(64);
    v_parent_organization_id varchar(64);
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM product_catalog c
         WHERE c.product_catalog_id = NEW.product_catalog_id
           AND c.organization_id = NEW.organization_id
           AND NOT c.is_deleted
    ) THEN
        RAISE EXCEPTION
            'Product catalog category catalog does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.parent_category_id IS NOT NULL THEN
        SELECT p.product_catalog_id, p.organization_id
          INTO v_parent_catalog_id, v_parent_organization_id
          FROM product_catalog_category p
         WHERE p.product_catalog_category_id = NEW.parent_category_id
           AND NOT p.is_deleted;

        IF NOT FOUND
           OR v_parent_organization_id <> NEW.organization_id
           OR v_parent_catalog_id <> NEW.product_catalog_id THEN
            RAISE EXCEPTION
                'Parent product category must belong to the same organization and catalog'
                USING ERRCODE = '23503';
        END IF;

        IF TG_OP = 'UPDATE'
           AND NEW.parent_category_id = NEW.product_catalog_category_id THEN
            RAISE EXCEPTION
                'Product catalog category cannot be its own parent'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_catalog_category_scope
    ON "${schemaName}".product_catalog_category;

CREATE TRIGGER trg_validate_product_catalog_category_scope
BEFORE INSERT OR UPDATE OF organization_id, product_catalog_id, parent_category_id
ON "${schemaName}".product_catalog_category
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_product_catalog_category_scope();


CREATE OR REPLACE FUNCTION "${schemaName}".validate_product_catalog_product_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_category_catalog_id varchar(64);
    v_category_organization_id varchar(64);
BEGIN
    IF NEW.product_catalog_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM product_catalog c
             WHERE c.product_catalog_id = NEW.product_catalog_id
               AND c.organization_id = NEW.organization_id
               AND NOT c.is_deleted
       ) THEN
        RAISE EXCEPTION
            'Product catalog does not belong to product organization'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.product_catalog_category_id IS NOT NULL THEN
        IF NEW.product_catalog_id IS NULL THEN
            RAISE EXCEPTION
                'Product catalog is required when a product catalog category is supplied'
                USING ERRCODE = '23514';
        END IF;

        SELECT c.product_catalog_id, c.organization_id
          INTO v_category_catalog_id, v_category_organization_id
          FROM product_catalog_category c
         WHERE c.product_catalog_category_id = NEW.product_catalog_category_id
           AND NOT c.is_deleted;

        IF NOT FOUND
           OR v_category_organization_id <> NEW.organization_id
           OR v_category_catalog_id <> NEW.product_catalog_id THEN
            RAISE EXCEPTION
                'Product category must belong to the same organization and catalog as the product'
                USING ERRCODE = '23503';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_catalog_product_scope
    ON "${schemaName}".product;

CREATE TRIGGER trg_validate_product_catalog_product_scope
BEFORE INSERT OR UPDATE OF organization_id, product_catalog_id, product_catalog_category_id
ON "${schemaName}".product
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_product_catalog_product_scope();


CREATE OR REPLACE FUNCTION "${schemaName}".validate_product_modifier_group_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM product p
         WHERE p.product_id = NEW.product_id
           AND p.organization_id = NEW.organization_id
           AND NOT p.is_deleted
    ) THEN
        RAISE EXCEPTION
            'Modifier group product does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_modifier_group_scope
    ON "${schemaName}".product_modifier_group;

CREATE TRIGGER trg_validate_product_modifier_group_scope
BEFORE INSERT OR UPDATE OF organization_id, product_id
ON "${schemaName}".product_modifier_group
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_product_modifier_group_scope();


CREATE OR REPLACE FUNCTION "${schemaName}".validate_product_modifier_option_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM product_modifier_group g
         WHERE g.product_modifier_group_id = NEW.product_modifier_group_id
           AND g.organization_id = NEW.organization_id
           AND NOT g.is_deleted
    ) THEN
        RAISE EXCEPTION
            'Modifier option group does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_product_modifier_option_scope
    ON "${schemaName}".product_modifier_option;

CREATE TRIGGER trg_validate_product_modifier_option_scope
BEFORE INSERT OR UPDATE OF organization_id, product_modifier_group_id
ON "${schemaName}".product_modifier_option
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_product_modifier_option_scope();


CREATE OR REPLACE FUNCTION "${schemaName}".validate_commerce_product_mapping_product_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
    IF NEW.product_id IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
              FROM product p
             WHERE p.product_id = NEW.product_id
               AND p.organization_id = NEW.organization_id
               AND NOT p.is_deleted
       ) THEN
        RAISE EXCEPTION
            'Commerce product mapping product does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_commerce_product_mapping_product_scope
    ON "${schemaName}".commerce_product_mappings;

CREATE TRIGGER trg_validate_commerce_product_mapping_product_scope
BEFORE INSERT OR UPDATE OF organization_id, product_id
ON "${schemaName}".commerce_product_mappings
FOR EACH ROW
EXECUTE FUNCTION "${schemaName}".validate_commerce_product_mapping_product_scope();


-- --------------------------------------------------------------------------
-- 7. Org Admin catalog read APIs
--
-- These provide the local product information needed while configuring Benefits
-- and Offers. No real-time Poynt call is required by the Admin UI.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_product_catalogs(
    p_organization_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "productCatalogId" varchar,
    "organizationId" varchar,
    "integrationConfigurationId" varchar,
    "catalogName" varchar,
    description varchar,
    "externalCatalogId" varchar,
    active boolean,
    "sourceUpdatedAt" text,
    "lastSyncedAt" text,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT c.product_catalog_id,
           c.organization_id,
           c.integration_configuration_id,
           c.catalog_name,
           c.description,
           c.external_catalog_id,
           c.is_active,
           c.source_updated_at::text,
           c.last_synced_at::text,
           c.version_no
      FROM product_catalog c
     WHERE c.organization_id = p_organization_id
       AND NOT c.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY c.catalog_name, c.product_catalog_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_product_catalog_categories(
    p_organization_id varchar,
    p_product_catalog_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "productCatalogCategoryId" varchar,
    "organizationId" varchar,
    "productCatalogId" varchar,
    "parentCategoryId" varchar,
    "externalCategoryId" varchar,
    "categoryName" varchar,
    description varchar,
    "displayOrder" integer,
    active boolean,
    "sourceUpdatedAt" text,
    "lastSyncedAt" text,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT c.product_catalog_category_id,
           c.organization_id,
           c.product_catalog_id,
           c.parent_category_id,
           c.external_category_id,
           c.category_name,
           c.description,
           c.display_order,
           c.is_active,
           c.source_updated_at::text,
           c.last_synced_at::text,
           c.version_no
      FROM product_catalog_category c
     WHERE c.organization_id = p_organization_id
       AND (p_product_catalog_id IS NULL OR c.product_catalog_id = p_product_catalog_id)
       AND NOT c.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY c.display_order, c.category_name, c.product_catalog_category_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_catalog_products(
    p_organization_id varchar,
    p_product_catalog_id varchar,
    p_product_catalog_category_id varchar,
    p_search varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "productId" varchar,
    "organizationId" varchar,
    "productCode" varchar,
    "productName" varchar,
    description varchar,
    "statusId" varchar,
    "productCatalogId" varchar,
    "productCatalogCategoryId" varchar,
    "shortCode" varchar,
    sku varchar,
    upc varchar,
    "basePriceMinor" bigint,
    "currencyCode" varchar,
    "sourceUpdatedAt" text,
    "lastSyncedAt" text,
    "versionNo" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT p.product_id,
           p.organization_id,
           p.product_code,
           p.product_name,
           p.description,
           p.status_id,
           p.product_catalog_id,
           p.product_catalog_category_id,
           p.short_code,
           p.sku,
           p.upc,
           p.base_price_minor,
           p.currency_code,
           p.source_updated_at::text,
           p.last_synced_at::text,
           p.version_no
      FROM product p
     WHERE p.organization_id = p_organization_id
       AND (p_product_catalog_id IS NULL OR p.product_catalog_id = p_product_catalog_id)
       AND (p_product_catalog_category_id IS NULL OR p.product_catalog_category_id = p_product_catalog_category_id)
       AND (
            NULLIF(btrim(p_search), '') IS NULL
            OR p.product_name ILIKE '%' || btrim(p_search) || '%'
            OR p.product_code ILIKE '%' || btrim(p_search) || '%'
            OR COALESCE(p.short_code, '') ILIKE '%' || btrim(p_search) || '%'
            OR COALESCE(p.sku, '') ILIKE '%' || btrim(p_search) || '%'
            OR COALESCE(p.upc, '') ILIKE '%' || btrim(p_search) || '%'
       )
       AND NOT p.is_deleted
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY p.product_name, p.product_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_product_modifiers(
    p_organization_id varchar,
    p_product_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE(
    "modifierGroupId" varchar,
    "modifierGroupName" varchar,
    "selectionType" varchar,
    "minSelections" integer,
    "maxSelections" integer,
    required boolean,
    "groupDisplayOrder" integer,
    "modifierOptionId" varchar,
    "optionName" varchar,
    "priceDeltaMinor" bigint,
    "optionSku" varchar,
    "optionUpc" varchar,
    "optionDisplayOrder" integer
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT g.product_modifier_group_id,
           g.modifier_group_name,
           g.selection_type,
           g.min_selections,
           g.max_selections,
           g.is_required,
           g.display_order,
           o.product_modifier_option_id,
           o.option_name,
           o.price_delta_minor,
           o.sku,
           o.upc,
           o.display_order
      FROM product_modifier_group g
      LEFT JOIN product_modifier_option o
        ON o.product_modifier_group_id = g.product_modifier_group_id
       AND o.is_active
       AND NOT o.is_deleted
     WHERE g.organization_id = p_organization_id
       AND g.product_id = p_product_id
       AND g.is_active
       AND NOT g.is_deleted
       AND EXISTS (
           SELECT 1
             FROM product p
            WHERE p.product_id = p_product_id
              AND p.organization_id = p_organization_id
              AND NOT p.is_deleted
       )
       AND can_administer_organization(p_organization_id, p_actor_user_id)
     ORDER BY g.display_order, g.modifier_group_name,
              o.display_order, o.option_name;
$function$;

-- --------------------------------------------------------------------------
-- 8. Permissions
-- --------------------------------------------------------------------------
REVOKE ALL ON TABLE
    "${schemaName}".product_catalog,
    "${schemaName}".product_catalog_category,
    "${schemaName}".product_modifier_group,
    "${schemaName}".product_modifier_option
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".validate_product_catalog_scope(),
    "${schemaName}".validate_product_catalog_category_scope(),
    "${schemaName}".validate_product_catalog_product_scope(),
    "${schemaName}".validate_product_modifier_group_scope(),
    "${schemaName}".validate_product_modifier_option_scope(),
    "${schemaName}".validate_commerce_product_mapping_product_scope(),
    "${schemaName}".get_organization_product_catalogs(varchar, varchar),
    "${schemaName}".get_organization_product_catalog_categories(varchar, varchar, varchar),
    "${schemaName}".get_organization_catalog_products(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".get_product_modifiers(varchar, varchar, varchar)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_organization_product_catalogs(varchar, varchar),
    "${schemaName}".get_organization_product_catalog_categories(varchar, varchar, varchar),
    "${schemaName}".get_organization_catalog_products(varchar, varchar, varchar, varchar, varchar),
    "${schemaName}".get_product_modifiers(varchar, varchar, varchar)
TO "${appRole}";


-- ============================================================
-- Phase 319: Product image persistence
-- ============================================================

ALTER TABLE "${schemaName}".product
    ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE "${schemaName}".commerce_product_mappings
    ADD COLUMN IF NOT EXISTS external_image_url TEXT;

COMMENT ON COLUMN "${schemaName}".product.image_url
IS 'Memgine-managed product image shared across all product mappings';

COMMENT ON COLUMN "${schemaName}".commerce_product_mappings.external_image_url
IS 'Product image reference supplied by the external product system';


-- ============================================================
-- Retrieve multiple product images
--
-- NULL array  : All organization products
-- Empty array : No products
-- Non-empty   : Only requested product IDs
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_product_images(
    p_organization_id varchar,
    p_product_ids varchar[],
    p_actor_user_id varchar
)
RETURNS TABLE (
    "productId" varchar,
    "imageUrl" text,
    "versionNo" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        p.product_id,
        p.image_url,
        p.version_no
    FROM product p
    WHERE p.organization_id = p_organization_id
      AND NOT p.is_deleted
      AND can_administer_organization(
          p_organization_id,
          p_actor_user_id
      )
      AND (
          p_product_ids IS NULL
          OR p.product_id = ANY(p_product_ids)
      )
    ORDER BY p.product_id;
$function$;


-- ============================================================
-- Retrieve a single product image
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_product_image(
    p_organization_id varchar,
    p_product_id varchar,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "productId" varchar,
    "imageUrl" text,
    "versionNo" integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
    SELECT
        p.product_id,
        p.image_url,
        p.version_no
    FROM product p
    WHERE p.organization_id = p_organization_id
      AND p.product_id = p_product_id
      AND NOT p.is_deleted
      AND can_administer_organization(
          p_organization_id,
          p_actor_user_id
      );
$function$;


-- ============================================================
-- Save, replace or remove Memgine product image
--
-- Updates only image and audit/version fields.
-- NULL image URL removes the image reference.
-- ============================================================

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_product_image(
    p_organization_id varchar,
    p_product_id varchar,
    p_image_url text,
    p_expected_version_no integer,
    p_actor_user_id varchar
)
RETURNS TABLE (
    "productId" varchar,
    "imageUrl" text,
    "versionNo" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE
    v_version integer;
    v_image_url text;
    v_prefix text;
    v_filename text;
BEGIN
    PERFORM organization_product_actor(
        p_organization_id,
        p_actor_user_id
    );

    v_image_url := NULLIF(btrim(p_image_url), '');

    IF p_image_url IS NOT NULL
       AND v_image_url IS NULL THEN
        RAISE EXCEPTION 'Invalid product image path'
            USING ERRCODE = '22023';
    END IF;

    IF v_image_url IS NOT NULL THEN

        v_prefix :=
            '/api/v1/assets/organizations/'
            || p_organization_id
            || '/branding/productImage/';

        IF left(v_image_url, length(v_prefix))
            <> v_prefix THEN
            RAISE EXCEPTION 'Invalid product image path'
                USING ERRCODE = '22023';
        END IF;

        v_filename := substring(
            v_image_url FROM length(v_prefix) + 1
        );

        IF v_filename !~
            '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\.[a-zA-Z0-9]{1,10})?$'
        THEN
            RAISE EXCEPTION 'Invalid product image filename'
                USING ERRCODE = '22023';
        END IF;

    END IF;

    SELECT p.version_no
      INTO v_version
      FROM product p
     WHERE p.product_id = p_product_id
       AND p.organization_id = p_organization_id
       AND NOT p.is_deleted
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found'
            USING ERRCODE = '23503';
    END IF;

    IF p_expected_version_no IS NULL
       OR v_version <> p_expected_version_no THEN
        RAISE EXCEPTION 'Product has changed since load'
            USING ERRCODE = '40001';
    END IF;

    RETURN QUERY
    UPDATE product p
       SET image_url = v_image_url,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id,
           version_no = p.version_no + 1
     WHERE p.product_id = p_product_id
       AND p.organization_id = p_organization_id
       AND NOT p.is_deleted
    RETURNING
        p.product_id,
        p.image_url,
        p.version_no;

END;
$function$;


-- ============================================================
-- Function permissions
-- ============================================================

REVOKE ALL ON FUNCTION
    "${schemaName}".get_organization_product_images(
        varchar, varchar[], varchar
    )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".get_organization_product_image(
        varchar, varchar, varchar
    )
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".save_organization_product_image(
        varchar, varchar, text, integer, varchar
    )
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_organization_product_images(
        varchar, varchar[], varchar
    )
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_organization_product_image(
        varchar, varchar, varchar
    )
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
    "${schemaName}".save_organization_product_image(
        varchar, varchar, text, integer, varchar
    )
TO "${appRole}";

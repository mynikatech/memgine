-- ============================================================
-- Phase 320: Product images in Benefit and Offer projections
--
-- Reuse existing canonical product image references.
-- No changes to product eligibility, mappings or authorization.
-- ============================================================


-- ============================================================
-- Benefit product projection
-- ============================================================

DROP FUNCTION IF EXISTS
    "${schemaName}".get_benefit_products(varchar);

CREATE OR REPLACE FUNCTION
    "${schemaName}".get_benefit_products(
        p_organization_id varchar
    )
RETURNS TABLE (
    "parentId" varchar,
    "productId" varchar,
    "productName" varchar,
    "productCode" varchar,
    "imageUrl" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$

    SELECT
        bp.benefit_id,
        p.product_id,
        p.product_name,
        p.product_code,
        p.image_url

    FROM "${schemaName}".benefit_product bp

    JOIN "${schemaName}".product p
      ON p.product_id = bp.product_id
     AND p.organization_id = bp.organization_id

    WHERE bp.organization_id = p_organization_id
      AND bp.is_active
      AND NOT bp.is_deleted
      AND NOT p.is_deleted

    ORDER BY
        bp.benefit_id,
        p.product_name,
        p.product_id;

$function$;


-- ============================================================
-- Offer product projection
-- ============================================================

DROP FUNCTION IF EXISTS
    "${schemaName}".get_offer_products(varchar);

CREATE OR REPLACE FUNCTION
    "${schemaName}".get_offer_products(
        p_organization_id varchar
    )
RETURNS TABLE (
    "parentId" varchar,
    "productId" varchar,
    "productName" varchar,
    "productCode" varchar,
    "imageUrl" text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$

    SELECT
        op.offer_id,
        p.product_id,
        p.product_name,
        p.product_code,
        p.image_url

    FROM "${schemaName}".offer_product op

    JOIN "${schemaName}".product p
      ON p.product_id = op.product_id
     AND p.organization_id = op.organization_id

    WHERE op.organization_id = p_organization_id
      AND op.is_active
      AND NOT op.is_deleted
      AND NOT p.is_deleted

    ORDER BY
        op.offer_id,
        p.product_name,
        p.product_id;

$function$;


-- ============================================================
-- Restore existing function permissions
-- ============================================================

REVOKE ALL ON FUNCTION
    "${schemaName}".get_benefit_products(varchar)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
    "${schemaName}".get_offer_products(varchar)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_benefit_products(varchar)
TO "${appRole}";

GRANT EXECUTE ON FUNCTION
    "${schemaName}".get_offer_products(varchar)
TO "${appRole}";
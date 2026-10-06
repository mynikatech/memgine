-- Canonical Product choices are independent of provider Commerce mappings.
CREATE UNIQUE INDEX IF NOT EXISTS ux_benefits_id_organization
    ON "${schemaName}".benefits(benefit_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_id_organization
    ON "${schemaName}".offer(offer_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_id_organization
    ON "${schemaName}".product(product_id, organization_id);

CREATE TABLE IF NOT EXISTS "${schemaName}".benefit_product (
    benefit_id varchar(40) NOT NULL,
    product_id varchar(40) NOT NULL,
    organization_id varchar(40) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    is_deleted boolean NOT NULL DEFAULT false,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(40) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(40) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (benefit_id, product_id),
    FOREIGN KEY (benefit_id, organization_id) REFERENCES "${schemaName}".benefits(benefit_id, organization_id),
    FOREIGN KEY (product_id, organization_id) REFERENCES "${schemaName}".product(product_id, organization_id)
);
CREATE INDEX IF NOT EXISTS ix_benefit_product_organization
    ON "${schemaName}".benefit_product(organization_id, benefit_id) WHERE NOT is_deleted;

CREATE TABLE IF NOT EXISTS "${schemaName}".offer_product (
    offer_id varchar(40) NOT NULL,
    product_id varchar(40) NOT NULL,
    organization_id varchar(40) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    is_deleted boolean NOT NULL DEFAULT false,
    created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by varchar(40) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by varchar(40) NOT NULL REFERENCES "${schemaName}"."user"(user_id),
    version_no integer NOT NULL DEFAULT 1,
    PRIMARY KEY (offer_id, product_id),
    FOREIGN KEY (offer_id, organization_id) REFERENCES "${schemaName}".offer(offer_id, organization_id),
    FOREIGN KEY (product_id, organization_id) REFERENCES "${schemaName}".product(product_id, organization_id)
);
CREATE INDEX IF NOT EXISTS ix_offer_product_organization
    ON "${schemaName}".offer_product(organization_id, offer_id) WHERE NOT is_deleted;

-- The existing single Benefit Product is the only legacy canonical relationship
-- seeded into the new canonical association table.
INSERT INTO "${schemaName}".benefit_product
    (benefit_id, product_id, organization_id, created_by, updated_by)
SELECT b.benefit_id, b.product_id, b.organization_id, b.updated_by, b.updated_by
  FROM "${schemaName}".benefits b
  JOIN "${schemaName}".product p ON p.product_id = b.product_id
   AND p.organization_id = b.organization_id AND NOT p.is_deleted
 WHERE NOT b.is_deleted AND b.product_id IS NOT NULL
ON CONFLICT (benefit_id, product_id) DO NOTHING;

CREATE OR REPLACE FUNCTION "${schemaName}".get_benefit_products(p_organization_id varchar)
RETURNS TABLE("parentId" varchar, "productId" varchar, "productName" varchar, "productCode" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT bp.benefit_id, p.product_id, p.product_name, p.product_code
      FROM "${schemaName}".benefit_product bp
      JOIN "${schemaName}".product p ON p.product_id = bp.product_id AND p.organization_id = bp.organization_id
     WHERE bp.organization_id = p_organization_id AND bp.is_active AND NOT bp.is_deleted
       AND NOT p.is_deleted
     ORDER BY bp.benefit_id, p.product_name, p.product_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_offer_products(p_organization_id varchar)
RETURNS TABLE("parentId" varchar, "productId" varchar, "productName" varchar, "productCode" varchar)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
    SELECT op.offer_id, p.product_id, p.product_name, p.product_code
      FROM "${schemaName}".offer_product op
      JOIN "${schemaName}".product p ON p.product_id = op.product_id AND p.organization_id = op.organization_id
     WHERE op.organization_id = p_organization_id AND op.is_active AND NOT op.is_deleted
       AND NOT p.is_deleted
     ORDER BY op.offer_id, p.product_name, p.product_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_benefit_products(
    p_organization_id varchar, p_benefit_id varchar, p_product_ids varchar[], p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_product_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization access denied' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM "${schemaName}".benefits
     WHERE benefit_id = p_benefit_id AND organization_id = p_organization_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Benefit not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(coalesce(p_product_ids, ARRAY[]::varchar[])) x
                WHERE x IS NULL OR NOT EXISTS (
                    SELECT 1 FROM "${schemaName}".product p
                     WHERE p.product_id = x AND p.organization_id = p_organization_id AND NOT p.is_deleted)) THEN
        RAISE EXCEPTION 'Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    UPDATE "${schemaName}".benefit_product bp
       SET is_active = false, is_deleted = true, updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE bp.benefit_id = p_benefit_id AND bp.organization_id = p_organization_id
       AND NOT bp.is_deleted AND NOT (bp.product_id = ANY(coalesce(p_product_ids, ARRAY[]::varchar[])));
    FOR v_product_id IN SELECT DISTINCT x FROM unnest(coalesce(p_product_ids, ARRAY[]::varchar[])) x ORDER BY x LOOP
        INSERT INTO "${schemaName}".benefit_product
            (benefit_id, product_id, organization_id, created_by, updated_by)
        VALUES (p_benefit_id, v_product_id, p_organization_id, p_actor_user_id, p_actor_user_id)
        ON CONFLICT (benefit_id, product_id) DO UPDATE
          SET is_active = true, is_deleted = false, updated_at = CURRENT_TIMESTAMP,
              updated_by = p_actor_user_id, version_no = benefit_product.version_no + 1
          WHERE benefit_product.is_deleted OR NOT benefit_product.is_active;
    END LOOP;
    UPDATE "${schemaName}".benefits
       SET product_id = (SELECT min(x) FROM unnest(coalesce(p_product_ids, ARRAY[]::varchar[])) x)
     WHERE benefit_id = p_benefit_id AND organization_id = p_organization_id;
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_offer_products(
    p_organization_id varchar, p_offer_id varchar, p_product_ids varchar[], p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, "${schemaName}" AS $function$
DECLARE v_product_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Organization access denied' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM "${schemaName}".offer
     WHERE offer_id = p_offer_id AND organization_id = p_organization_id AND NOT is_deleted FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found' USING ERRCODE = 'P0002'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(coalesce(p_product_ids, ARRAY[]::varchar[])) x
                WHERE x IS NULL OR NOT EXISTS (
                    SELECT 1 FROM "${schemaName}".product p
                     WHERE p.product_id = x AND p.organization_id = p_organization_id AND NOT p.is_deleted)) THEN
        RAISE EXCEPTION 'Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    UPDATE "${schemaName}".offer_product op
       SET is_active = false, is_deleted = true, updated_at = CURRENT_TIMESTAMP,
           updated_by = p_actor_user_id, version_no = version_no + 1
     WHERE op.offer_id = p_offer_id AND op.organization_id = p_organization_id
       AND NOT op.is_deleted AND NOT (op.product_id = ANY(coalesce(p_product_ids, ARRAY[]::varchar[])));
    FOR v_product_id IN SELECT DISTINCT x FROM unnest(coalesce(p_product_ids, ARRAY[]::varchar[])) x ORDER BY x LOOP
        INSERT INTO "${schemaName}".offer_product
            (offer_id, product_id, organization_id, created_by, updated_by)
        VALUES (p_offer_id, v_product_id, p_organization_id, p_actor_user_id, p_actor_user_id)
        ON CONFLICT (offer_id, product_id) DO UPDATE
          SET is_active = true, is_deleted = false, updated_at = CURRENT_TIMESTAMP,
              updated_by = p_actor_user_id, version_no = offer_product.version_no + 1
          WHERE offer_product.is_deleted OR NOT offer_product.is_active;
    END LOOP;
    RETURN true;
END;
$function$;

REVOKE ALL ON TABLE "${schemaName}".benefit_product, "${schemaName}".offer_product FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_benefit_products(varchar),
    "${schemaName}".get_offer_products(varchar),
    "${schemaName}".save_benefit_products(varchar, varchar, varchar[], varchar),
    "${schemaName}".save_offer_products(varchar, varchar, varchar[], varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_benefit_products(varchar),
    "${schemaName}".get_offer_products(varchar),
    "${schemaName}".save_benefit_products(varchar, varchar, varchar[], varchar),
    "${schemaName}".save_offer_products(varchar, varchar, varchar[], varchar) TO "${appRole}";

-- Phase 321: Dedicated Benefit image, integrated into canonical Benefit functions.
-- Based on migrations 097 (read contracts) and 297 (save contract).
-- Restricted drops only: unexpected dependencies fail the transaction.
ALTER TABLE "${schemaName}".benefits ADD COLUMN IF NOT EXISTS image_url TEXT;
COMMENT ON COLUMN "${schemaName}".benefits.image_url IS 'Optional customer-facing image representing the Benefit';

-- Verify ownership and grants before replacing the existing functions.
DO $owner$
DECLARE
    prior_function regprocedure;
    app_role oid := to_regrole('${appRole}');
BEGIN
    IF app_role IS NULL THEN RAISE EXCEPTION 'Benefit application role is missing'; END IF;
    FOREACH prior_function IN ARRAY ARRAY[
        to_regprocedure('"${schemaName}".get_organization_benefits(varchar)'),
        to_regprocedure('"${schemaName}".get_membership_product_benefits(varchar)'),
        coalesce(to_regprocedure('"${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar,text,boolean)'),
                 to_regprocedure('"${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar)'))
    ] LOOP
        IF prior_function IS NULL OR NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
            WHERE p.oid = prior_function AND r.rolname = current_user
        ) THEN RAISE EXCEPTION 'Run Benefit migration as canonical function owner: %', prior_function; END IF;
        IF EXISTS (
            SELECT 1 FROM pg_catalog.pg_proc p
            CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
            WHERE p.oid = prior_function AND g.grantee <> p.proowner
              AND (g.grantee <> app_role OR g.is_grantable OR g.grantor <> p.proowner)
        ) THEN RAISE EXCEPTION 'Unexpected grant on canonical Benefit function: %', prior_function; END IF;
    END LOOP;
END;
$owner$;

DROP FUNCTION IF EXISTS "${schemaName}".get_membership_product_benefits(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".get_organization_benefits(varchar);
DROP FUNCTION IF EXISTS "${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar);
DROP FUNCTION IF EXISTS "${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar,text,boolean);

CREATE FUNCTION "${schemaName}".get_organization_benefits(p_organization_id varchar)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
    "disclaimerText" varchar,
    "benefitStatusId" varchar,
    "productId" varchar,
    "retailPrice" numeric,
    cost numeric,
    "effectiveDate" text,
    "expiryDate" text,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer,
    "imageUrl" text
)
LANGUAGE sql STABLE AS $function$
    SELECT
        b.benefit_id, b.organization_id, b.benefit_code, b.benefit_name,
        b.display_name, b.benefit_category_id, b.benefit_type_id,
        b.description, b.disclaimer_text, b.benefit_status_id, b.product_id,
        b.retail_price, b.cost, b.effective_date::text, b.expiry_date::text,
        b.created_at::text, b.created_by, b.updated_at::text, b.updated_by,
        b.is_deleted, b.version_no, b.image_url
    FROM "${schemaName}".benefits b
    WHERE b.organization_id = p_organization_id AND b.is_deleted = false
    ORDER BY b.benefit_name, b.benefit_code;
$function$;

CREATE FUNCTION "${schemaName}".get_membership_product_benefits(p_membership_product_id varchar)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
    "disclaimerText" varchar,
    "benefitStatusId" varchar,
    "productId" varchar,
    "retailPrice" numeric,
    cost numeric,
    "effectiveDate" text,
    "expiryDate" text,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer,
    "imageUrl" text
)
LANGUAGE sql STABLE AS $function$
    SELECT b.*
    FROM "${schemaName}".membership_products mp
    JOIN "${schemaName}".membership_product_benefits link
      ON link.membership_product_id = mp.membership_product_id
    JOIN LATERAL "${schemaName}".get_organization_benefits(mp.organization_id) b
      ON b.id = link.benefit_id
    WHERE mp.membership_product_id = p_membership_product_id
      AND mp.is_deleted = false AND link.is_deleted = false;
$function$;

CREATE FUNCTION "${schemaName}".save_organization_benefit(
    p_organization_id varchar, p_benefit_id varchar, p_code varchar,
    p_name varchar, p_display_name varchar, p_category_id varchar,
    p_type_id varchar, p_description varchar, p_disclaimer_text varchar, p_status_id varchar,
    p_product_id varchar, p_retail_price numeric, p_cost numeric,
    p_effective_date date, p_expiry_date date, p_actor_user_id varchar,
    p_create boolean, p_savings_minor bigint, p_savings_currency varchar,
    p_image_url text DEFAULT NULL, p_update_image boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
    v_image_url text;
    v_prefix text;
    v_filename text;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF length(p_benefit_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 100
       OR length(coalesce(p_disclaimer_text, '')) > 500
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Benefit fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'BENEFIT'
    ) THEN
        RAISE EXCEPTION 'Benefit status does not belong to BENEFIT' USING ERRCODE = '22023';
    END IF;
    IF p_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".product p
        WHERE p.product_id = p_product_id AND p.organization_id = p_organization_id
          AND p.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    IF (p_savings_minor IS NULL) <> (p_savings_currency IS NULL)
       OR (p_savings_minor IS NOT NULL AND (
          p_savings_minor NOT BETWEEN 0 AND 9007199254740991 OR NOT EXISTS (
              SELECT 1 FROM "${schemaName}".currencies c
              WHERE c.currency_code = p_savings_currency AND c.is_active
          ))) THEN
        RAISE EXCEPTION 'Invalid advertised savings override' USING ERRCODE = '22023';
    END IF;

    -- Omitted/false flag preserves existing artwork. True + NULL removes it.
    IF p_update_image IS TRUE AND p_image_url IS NOT NULL THEN
        v_image_url := NULLIF(btrim(p_image_url), '');
        v_prefix := '/api/v1/assets/organizations/' || p_organization_id || '/branding/benefitImage/';
        IF v_image_url IS NULL OR length(v_image_url) > 2048
           OR left(v_image_url, length(v_prefix)) <> v_prefix THEN
            RAISE EXCEPTION 'Invalid Benefit image path' USING ERRCODE = '22023';
        END IF;
        v_filename := substring(v_image_url FROM length(v_prefix) + 1);
        IF v_filename !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(\.[a-zA-Z0-9]{1,10})?$' THEN
            RAISE EXCEPTION 'Invalid Benefit image filename' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('BENEFIT', p_organization_id);
        v_code := (v_org_code || '_BEN_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".benefits (
            benefit_id, organization_id, benefit_code, benefit_name, display_name,
            benefit_category_id, benefit_type_id, description, disclaimer_text, benefit_status_id,
            product_id, retail_price, cost, effective_date, expiry_date,
            advertised_savings_override_minor, advertised_savings_override_currency,
            image_url, created_at, created_by, updated_at, updated_by, is_deleted, version_no
        ) VALUES (
            p_benefit_id, p_organization_id, v_code, p_name, p_display_name,
            p_category_id, p_type_id, p_description, NULLIF(trim(p_disclaimer_text), ''), p_status_id, p_product_id,
            p_retail_price, p_cost, p_effective_date, p_expiry_date,
            p_savings_minor, p_savings_currency,
            v_image_url, CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
            false, 1
        );
    ELSE
        UPDATE "${schemaName}".benefits SET
            benefit_name = p_name, display_name = p_display_name,
            benefit_category_id = p_category_id, benefit_type_id = p_type_id,
            description = p_description, disclaimer_text = NULLIF(trim(p_disclaimer_text), ''), benefit_status_id = p_status_id,
            product_id = p_product_id, retail_price = p_retail_price, cost = p_cost,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            advertised_savings_override_minor = p_savings_minor,
            advertised_savings_override_currency = p_savings_currency,
            image_url = CASE WHEN p_update_image IS TRUE THEN v_image_url ELSE image_url END,
            updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE benefit_id = p_benefit_id AND organization_id = p_organization_id
          AND is_deleted = false;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Benefit not found in organization' USING ERRCODE = 'P0002';
        END IF;
    END IF;
    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_organization_benefits(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_organization_benefits(varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_membership_product_benefits(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_product_benefits(varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_benefit(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,numeric,numeric,date,date,varchar,boolean,bigint,varchar,text,boolean) TO "${appRole}";

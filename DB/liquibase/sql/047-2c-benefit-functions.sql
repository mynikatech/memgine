-- Batch 2C: organization-owned Benefits and their usage rules.
-- Existing rows are assigned only when their catalog Product proves ownership.

-- Benefit Usage Rule is a distinct status-bearing entity.
-- It reuses the same generic statuses as Benefit, but has its own EntityStatus mappings.
INSERT INTO "${schemaName}".entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
VALUES (
    'entity-type-benefit-usage-rule',
    'BENEFIT_USAGE_RULE',
    'Benefit Usage Rule',
    'Represents a usage or frequency rule associated with a benefit.',
    26,
    TRUE
)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES
    (
        'entity-status-benefit-rule-draft',
        'entity-type-benefit-usage-rule',
        'status-draft',
        1,
        TRUE,
        FALSE
    ),
    (
        'entity-status-benefit-rule-active',
        'entity-type-benefit-usage-rule',
        'status-active',
        2,
        TRUE,
        FALSE
    ),
    (
        'entity-status-benefit-rule-inactive',
        'entity-type-benefit-usage-rule',
        'status-inactive',
        3,
        TRUE,
        FALSE
    ),
    (
        'entity-status-benefit-rule-expired',
        'entity-type-benefit-usage-rule',
        'status-expired',
        4,
        TRUE,
        TRUE
    ),
    (
        'entity-status-benefit-rule-retired',
        'entity-type-benefit-usage-rule',
        'status-retired',
        5,
        TRUE,
        FALSE
    )
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

-- Product is a distinct status-bearing catalog entity.
INSERT INTO "${schemaName}".entity_type (
    entity_type_id,
    entity_type_code,
    entity_type_name,
    description,
    display_order,
    is_active
)
VALUES (
    'entity-type-product',
    'PRODUCT',
    'Product',
    'Represents an organization-owned catalog product.',
    27,
    TRUE
)
ON CONFLICT (entity_type_id) DO UPDATE SET
    entity_type_code = EXCLUDED.entity_type_code,
    entity_type_name = EXCLUDED.entity_type_name,
    description = EXCLUDED.description,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active;

INSERT INTO "${schemaName}".entity_status (
    entity_status_id,
    entity_type_id,
    status_id,
    display_order,
    is_active,
    system_managed
)
VALUES
    (
        'entity-status-product-draft',
        'entity-type-product',
        'status-draft',
        1,
        TRUE,
        FALSE
    ),
    (
        'entity-status-product-active',
        'entity-type-product',
        'status-active',
        2,
        TRUE,
        FALSE
    ),
    (
        'entity-status-product-inactive',
        'entity-type-product',
        'status-inactive',
        3,
        TRUE,
        FALSE
    ),
    (
        'entity-status-product-retired',
        'entity-type-product',
        'status-retired',
        4,
        TRUE,
        FALSE
    )
ON CONFLICT (entity_status_id) DO UPDATE SET
    entity_type_id = EXCLUDED.entity_type_id,
    status_id = EXCLUDED.status_id,
    display_order = EXCLUDED.display_order,
    is_active = EXCLUDED.is_active,
    system_managed = EXCLUDED.system_managed;

ALTER TABLE "${schemaName}".benefits
    ADD COLUMN IF NOT EXISTS organization_id varchar(64);

UPDATE "${schemaName}".benefits b
SET organization_id = p.organization_id
FROM "${schemaName}".product p
WHERE b.organization_id IS NULL
  AND b.product_id = p.product_id
  AND NOT EXISTS (
      SELECT 1 FROM "${schemaName}".membership_product_benefits link
      JOIN "${schemaName}".membership_products mp
        ON mp.membership_product_id = link.membership_product_id
      WHERE link.benefit_id = b.benefit_id
        AND link.is_deleted = false
        AND mp.is_deleted = false
        AND mp.organization_id <> p.organization_id
  );

-- A membership association is a separate concept from product_id. It can
-- establish legacy ownership only when every active association agrees.
UPDATE "${schemaName}".benefits b
SET organization_id = owner.organization_id
FROM (
    SELECT link.benefit_id, min(mp.organization_id) AS organization_id
    FROM "${schemaName}".membership_product_benefits link
    JOIN "${schemaName}".membership_products mp
      ON mp.membership_product_id = link.membership_product_id
    WHERE link.is_deleted = false
      AND mp.is_deleted = false
    GROUP BY link.benefit_id
    HAVING count(DISTINCT mp.organization_id) = 1
) owner
WHERE b.benefit_id = owner.benefit_id
  AND b.organization_id IS NULL
  AND (
      b.product_id IS NULL
      OR EXISTS (
          SELECT 1
          FROM "${schemaName}".product p
          WHERE p.product_id = b.product_id
            AND p.organization_id = owner.organization_id
      )
  );

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = '${schemaName}'
          AND c.conname = 'fk_benefits_organization_id'
    ) THEN
        ALTER TABLE "${schemaName}".benefits
            ADD CONSTRAINT fk_benefits_organization_id
            FOREIGN KEY (organization_id)
            REFERENCES "${schemaName}".organization(organization_id);
    END IF;

    -- NOT VALID preserves unassignable legacy rows while requiring ownership on new writes.
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        WHERE n.nspname = '${schemaName}'
          AND c.conname = 'ck_benefits_organization_required'
    ) THEN
        ALTER TABLE "${schemaName}".benefits
            ADD CONSTRAINT ck_benefits_organization_required
            CHECK (organization_id IS NOT NULL) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_benefits_organization_id
    ON "${schemaName}".benefits(organization_id);

-- The Product selector needs only a catalog read; Product writes remain in a later batch.
CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_products(
    p_organization_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "productCode" varchar,
    "productName" varchar,
    description varchar,
    "statusId" varchar,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT
        p.product_id,
        p.organization_id,
        p.product_code,
        p.product_name,
        p.description,
        p.status_id,
        p.created_at::text,
        p.created_by,
        p.updated_at::text,
        p.updated_by,
        p.is_deleted,
        p.version_no
    FROM "${schemaName}".product p
    WHERE p.organization_id = p_organization_id
      AND p.is_deleted = false
    ORDER BY p.product_name, p.product_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_benefits(
    p_organization_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
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
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT
        b.benefit_id,
        b.organization_id,
        b.benefit_code,
        b.benefit_name,
        b.display_name,
        b.benefit_category_id,
        b.benefit_type_id,
        b.description,
        b.benefit_status_id,
        b.product_id,
        b.retail_price,
        b.cost,
        b.effective_date::text,
        b.expiry_date::text,
        b.created_at::text,
        b.created_by,
        b.updated_at::text,
        b.updated_by,
        b.is_deleted,
        b.version_no
    FROM "${schemaName}".benefits b
    WHERE b.organization_id = p_organization_id
      AND b.is_deleted = false
    ORDER BY b.benefit_name, b.benefit_code;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_benefit(
    p_organization_id varchar,
    p_benefit_id varchar
)
RETURNS SETOF "${schemaName}".benefits
LANGUAGE sql STABLE AS $function$
    SELECT b.*
    FROM "${schemaName}".benefits b
    WHERE b.organization_id = p_organization_id
      AND b.benefit_id = p_benefit_id
      AND b.is_deleted = false;
$function$;

-- Read-only bridge for existing discovery callers. Membership writes remain in 2D.
CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_product_benefits(
    p_membership_product_id varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "benefitCode" varchar,
    "benefitName" varchar,
    "displayName" varchar,
    "benefitCategoryId" varchar,
    "benefitTypeId" varchar,
    description varchar,
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
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT b.*
    FROM "${schemaName}".membership_products mp
    JOIN "${schemaName}".membership_product_benefits link
      ON link.membership_product_id = mp.membership_product_id
    JOIN LATERAL "${schemaName}".get_organization_benefits(mp.organization_id) b
      ON b.id = link.benefit_id
    WHERE mp.membership_product_id = p_membership_product_id
      AND mp.is_deleted = false
      AND link.is_deleted = false;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_organization_benefit_rules(
    p_organization_id varchar,
    p_benefit_id varchar
)
RETURNS TABLE (
    id varchar,
    "benefitId" varchar,
    "ruleName" varchar,
    "frequencyType" varchar,
    "frequencyInterval" integer,
    "usageLimit" integer,
    "windowStartTime" text,
    "windowEndTime" text,
    "applicableDays" varchar,
    "timeZone" varchar,
    "effectiveDate" text,
    "expiryDate" text,
    "benefitUsageRuleStatusId" varchar,
    "createdAt" text,
    "createdBy" varchar,
    "updatedAt" text,
    "updatedBy" varchar,
    "isDeleted" boolean,
    "versionNo" integer
)
LANGUAGE sql STABLE AS $function$
    SELECT
        r.benefit_usage_rule_id,
        r.benefit_id,
        r.rule_name,
        r.frequency_type,
        r.frequency_interval,
        r.usage_limit,
        to_char(r.window_start_time, 'HH24:MI'),
        to_char(r.window_end_time, 'HH24:MI'),
        r.applicable_days,
        r.time_zone,
        r.effective_date::text,
        r.expiry_date::text,
        r.benefit_usage_rule_status_id,
        r.created_at::text,
        r.created_by,
        r.updated_at::text,
        r.updated_by,
        r.is_deleted,
        r.version_no
    FROM "${schemaName}".benefit_usage_rule r
    JOIN "${schemaName}".benefits b
      ON b.benefit_id = r.benefit_id
    WHERE b.organization_id = p_organization_id
      AND b.benefit_id = p_benefit_id
      AND b.is_deleted = false
      AND r.is_deleted = false
    ORDER BY r.rule_name, r.benefit_usage_rule_id;
$function$;

-- Write functions validate tenant ownership, catalog Product ownership and
-- that each EntityStatus belongs to the appropriate entity type.
CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_benefit(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_code varchar,
    p_name varchar,
    p_display_name varchar,
    p_category_id varchar,
    p_type_id varchar,
    p_description varchar,
    p_status_id varchar,
    p_product_id varchar,
    p_retail_price numeric,
    p_cost numeric,
    p_effective_date date,
    p_expiry_date date,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    IF length(p_benefit_id) > 40
       OR length(p_code) > 30
       OR nullif(trim(p_code), '') IS NULL
       OR nullif(trim(p_name), '') IS NULL
       OR length(p_name) > 100
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Benefit fields'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et
          ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'BENEFIT'
    ) THEN
        RAISE EXCEPTION 'Benefit status does not belong to BENEFIT'
            USING ERRCODE = '22023';
    END IF;

    IF p_product_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
           FROM "${schemaName}".product p
           WHERE p.product_id = p_product_id
             AND p.organization_id = p_organization_id
             AND p.is_deleted = false
       ) THEN
        RAISE EXCEPTION 'Product does not belong to organization'
            USING ERRCODE = '23503';
    END IF;

    IF p_create THEN
        INSERT INTO "${schemaName}".benefits (
            benefit_id,
            organization_id,
            benefit_code,
            benefit_name,
            display_name,
            benefit_category_id,
            benefit_type_id,
            description,
            benefit_status_id,
            product_id,
            retail_price,
            cost,
            effective_date,
            expiry_date,
            created_at,
            created_by,
            updated_at,
            updated_by,
            is_deleted,
            version_no
        )
        VALUES (
            p_benefit_id,
            p_organization_id,
            p_code,
            p_name,
            p_display_name,
            p_category_id,
            p_type_id,
            p_description,
            p_status_id,
            p_product_id,
            p_retail_price,
            p_cost,
            p_effective_date,
            p_expiry_date,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            false,
            1
        );
    ELSE
        UPDATE "${schemaName}".benefits
        SET
            benefit_code = p_code,
            benefit_name = p_name,
            display_name = p_display_name,
            benefit_category_id = p_category_id,
            benefit_type_id = p_type_id,
            description = p_description,
            benefit_status_id = p_status_id,
            product_id = p_product_id,
            retail_price = p_retail_price,
            cost = p_cost,
            effective_date = p_effective_date,
            expiry_date = p_expiry_date,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE benefit_id = p_benefit_id
          AND organization_id = p_organization_id
          AND is_deleted = false;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Benefit not found in organization'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_benefit(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    UPDATE "${schemaName}".benefits
    SET
        is_deleted = true,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE benefit_id = p_benefit_id
      AND organization_id = p_organization_id
      AND is_deleted = false;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Benefit not found in organization'
            USING ERRCODE = 'P0002';
    END IF;

    UPDATE "${schemaName}".benefit_usage_rule
    SET
        is_deleted = true,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = version_no + 1
    WHERE benefit_id = p_benefit_id
      AND is_deleted = false;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_organization_benefit_rule(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_rule_id varchar,
    p_name varchar,
    p_frequency_type varchar,
    p_frequency_interval integer,
    p_usage_limit integer,
    p_window_start time,
    p_window_end time,
    p_applicable_days varchar,
    p_time_zone varchar,
    p_effective_date date,
    p_expiry_date date,
    p_status_id varchar,
    p_actor_user_id varchar,
    p_create boolean
)
RETURNS boolean
LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".benefits b
        WHERE b.benefit_id = p_benefit_id
          AND b.organization_id = p_organization_id
          AND b.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Benefit not found in organization'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et
          ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'BENEFIT_USAGE_RULE'
    ) THEN
        RAISE EXCEPTION 'Rule status does not belong to BENEFIT_USAGE_RULE'
            USING ERRCODE = '22023';
    END IF;

    IF length(p_rule_id) > 40
       OR nullif(trim(p_name), '') IS NULL
       OR length(p_name) > 100
       OR p_frequency_interval < 1
       OR p_usage_limit < 1
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid Benefit Usage Rule fields'
            USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        INSERT INTO "${schemaName}".benefit_usage_rule (
            benefit_usage_rule_id,
            benefit_id,
            rule_name,
            frequency_type,
            frequency_interval,
            usage_limit,
            window_start_time,
            window_end_time,
            applicable_days,
            time_zone,
            effective_date,
            expiry_date,
            benefit_usage_rule_status_id,
            created_at,
            created_by,
            updated_at,
            updated_by,
            is_deleted,
            version_no
        )
        VALUES (
            p_rule_id,
            p_benefit_id,
            p_name,
            p_frequency_type,
            p_frequency_interval,
            p_usage_limit,
            p_effective_date + p_window_start,
            p_effective_date + p_window_end,
            p_applicable_days,
            p_time_zone,
            p_effective_date,
            p_expiry_date,
            p_status_id,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            CURRENT_TIMESTAMP,
            p_actor_user_id,
            false,
            1
        );
    ELSE
        UPDATE "${schemaName}".benefit_usage_rule
        SET
            rule_name = p_name,
            frequency_type = p_frequency_type,
            frequency_interval = p_frequency_interval,
            usage_limit = p_usage_limit,
            window_start_time = p_effective_date + p_window_start,
            window_end_time = p_effective_date + p_window_end,
            applicable_days = p_applicable_days,
            time_zone = p_time_zone,
            effective_date = p_effective_date,
            expiry_date = p_expiry_date,
            benefit_usage_rule_status_id = p_status_id,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE benefit_usage_rule_id = p_rule_id
          AND benefit_id = p_benefit_id
          AND is_deleted = false;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Benefit Usage Rule not found'
                USING ERRCODE = 'P0002';
        END IF;
    END IF;

    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".delete_organization_benefit_rule(
    p_organization_id varchar,
    p_benefit_id varchar,
    p_rule_id varchar,
    p_actor_user_id varchar
)
RETURNS boolean
LANGUAGE plpgsql AS $function$
BEGIN
    IF NOT "${schemaName}".can_administer_organization(
        p_organization_id,
        p_actor_user_id
    ) THEN
        RAISE EXCEPTION 'Actor cannot administer organization'
            USING ERRCODE = '42501';
    END IF;

    UPDATE "${schemaName}".benefit_usage_rule r
    SET
        is_deleted = true,
        updated_at = CURRENT_TIMESTAMP,
        updated_by = p_actor_user_id,
        version_no = r.version_no + 1
    WHERE r.benefit_usage_rule_id = p_rule_id
      AND r.benefit_id = p_benefit_id
      AND r.is_deleted = false
      AND EXISTS (
          SELECT 1
          FROM "${schemaName}".benefits b
          WHERE b.benefit_id = r.benefit_id
            AND b.organization_id = p_organization_id
            AND b.is_deleted = false
      );

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Benefit Usage Rule not found'
            USING ERRCODE = 'P0002';
    END IF;

    RETURN true;
END;
$function$;

-- Match the explicit function privilege pattern used by earlier migrations.
DO $$
DECLARE
    f record;
BEGIN
    FOR f IN
        SELECT
            p.proname,
            pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n
          ON n.oid = p.pronamespace
        WHERE n.nspname = '${schemaName}'
          AND p.proname IN (
              'get_organization_products',
              'get_organization_benefits',
              'get_organization_benefit',
              'get_membership_product_benefits',
              'get_organization_benefit_rules',
              'save_organization_benefit',
              'delete_organization_benefit',
              'save_organization_benefit_rule',
              'delete_organization_benefit_rule'
          )
    LOOP
        EXECUTE format(
            'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',
            '${schemaName}',
            f.proname,
            f.args
        );

        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',
            '${schemaName}',
            f.proname,
            f.args,
            '${appRole}'
        );
    END LOOP;
END $$;
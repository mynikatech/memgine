-- A signature change requires a restricted drop. Check ownership first so
-- the recreated functions retain the existing migration owner.
DO $savings_owner$
DECLARE
    prior_function regprocedure;
    app_role oid := to_regrole('${appRole}');
BEGIN
    IF app_role IS NULL THEN
        RAISE EXCEPTION 'Advertised savings application role is missing';
    END IF;
    FOREACH prior_function IN ARRAY ARRAY[
        '"${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean)'::regprocedure,
        '"${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean)'::regprocedure
    ] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                        JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
                       WHERE p.oid = prior_function AND r.rolname = current_user) THEN
            RAISE EXCEPTION 'Run advertised savings migration as the canonical function owner: %', prior_function;
        END IF;
        IF EXISTS (
            SELECT 1
              FROM pg_catalog.pg_proc p
              CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
             WHERE p.oid = prior_function
               AND g.grantee <> p.proowner
               AND (g.grantee <> app_role OR g.is_grantable OR g.grantor <> p.proowner)
        ) THEN
            RAISE EXCEPTION 'Unexpected grant on canonical save function: %', prior_function;
        END IF;
    END LOOP;
END;
$savings_owner$;

ALTER TABLE "${schemaName}".benefits
    ADD COLUMN advertised_savings_override_minor bigint,
    ADD COLUMN advertised_savings_override_currency varchar(3),
    ADD CONSTRAINT benefit_advertised_savings_override CHECK (
        (advertised_savings_override_minor IS NULL AND advertised_savings_override_currency IS NULL)
        OR (advertised_savings_override_minor IS NOT NULL AND advertised_savings_override_currency IS NOT NULL
            AND advertised_savings_override_minor BETWEEN 0 AND 9007199254740991)
    );
DROP FUNCTION "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean);
CREATE FUNCTION "${schemaName}".save_organization_benefit(
    p_organization_id varchar, p_benefit_id varchar, p_code varchar,
    p_name varchar, p_display_name varchar, p_category_id varchar,
    p_type_id varchar, p_description varchar, p_disclaimer_text varchar, p_status_id varchar,
    p_product_id varchar, p_retail_price numeric, p_cost numeric,
    p_effective_date date, p_expiry_date date, p_actor_user_id varchar,
    p_create boolean, p_savings_minor bigint, p_savings_currency varchar
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
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
            created_at, created_by, updated_at, updated_by, is_deleted, version_no
        ) VALUES (
            p_benefit_id, p_organization_id, v_code, p_name, p_display_name,
            p_category_id, p_type_id, p_description, NULLIF(trim(p_disclaimer_text), ''), p_status_id, p_product_id,
            p_retail_price, p_cost, p_effective_date, p_expiry_date,
            p_savings_minor, p_savings_currency,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id,
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
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean, bigint, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_benefit(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, numeric, date, date, varchar, boolean, bigint, varchar) TO "${appRole}";

ALTER TABLE "${schemaName}".offer
    ADD COLUMN advertised_savings_override_minor bigint,
    ADD COLUMN advertised_savings_override_currency varchar(3),
    ADD CONSTRAINT offer_advertised_savings_override CHECK (
        (advertised_savings_override_minor IS NULL AND advertised_savings_override_currency IS NULL)
        OR (advertised_savings_override_minor IS NOT NULL AND advertised_savings_override_currency IS NOT NULL
            AND advertised_savings_override_minor BETWEEN 0 AND 9007199254740991)
    );
DROP FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean);
CREATE FUNCTION "${schemaName}".save_organization_offer(
    p_organization_id varchar, p_id varchar, p_code varchar, p_name varchar,
    p_description varchar, p_membership_product_id varchar, p_store_id varchar,
    p_promotion_image_url varchar, p_badge_text varchar, p_availability_text varchar, p_disclaimer_text varchar,
    p_cta_label varchar, p_cta_type varchar, p_cta_target varchar,
    p_discount_percentage numeric, p_effective_date date, p_expiry_date date,
    p_status_id varchar, p_version_no integer, p_actor_user_id varchar, p_create boolean, p_savings_minor bigint, p_savings_currency varchar
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
DECLARE
    v_org_code varchar(64);
    v_code varchar(64);
    v_seq bigint;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_actor_user_id) THEN
        RAISE EXCEPTION 'Actor cannot administer organization' USING ERRCODE = '42501';
    END IF;
    IF nullif(trim(p_id), '') IS NULL OR length(p_id) > 64
       OR nullif(trim(p_name), '') IS NULL OR length(p_name) > 150
       OR length(coalesce(p_description, '')) > 1000
       OR nullif(trim(p_promotion_image_url), '') IS NULL OR length(p_promotion_image_url) > 500
       OR length(coalesce(p_badge_text, '')) > 50
       OR length(coalesce(p_availability_text, '')) > 100
       OR length(coalesce(p_disclaimer_text, '')) > 500
       OR nullif(trim(p_cta_label), '') IS NULL OR length(p_cta_label) > 50
       OR p_cta_type NOT IN ('REDEEM_OFFER', 'SHOP') OR length(coalesce(p_cta_target, '')) > 500
       OR p_effective_date IS NULL OR p_expiry_date < p_effective_date
       OR (p_discount_percentage IS NOT NULL AND (p_discount_percentage <= 0 OR p_discount_percentage > 100)) THEN
        RAISE EXCEPTION 'Invalid Offer fields' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id AND et.entity_type_code = 'OFFER' AND es.is_active
    ) THEN
        RAISE EXCEPTION 'Invalid Offer status' USING ERRCODE = '22023';
    END IF;
    IF p_membership_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".membership_products mp
        WHERE mp.membership_product_id = p_membership_product_id
          AND mp.organization_id = p_organization_id AND mp.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Membership Product does not belong to organization' USING ERRCODE = '23503';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM "${schemaName}".stores s
        WHERE s.store_id = p_store_id AND s.organization_id = p_organization_id AND s.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Store does not belong to organization' USING ERRCODE = '23503';
    END IF;

    IF (p_savings_minor IS NULL) <> (p_savings_currency IS NULL)
       OR (p_savings_minor IS NOT NULL AND (
          p_savings_minor NOT BETWEEN 0 AND 9007199254740991 OR NOT EXISTS (
              SELECT 1 FROM "${schemaName}".currencies c
              WHERE c.currency_code = p_savings_currency AND c.is_active
          ))) THEN
        RAISE EXCEPTION 'Invalid advertised savings override' USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        SELECT organization_code INTO v_org_code FROM "${schemaName}".organization
        WHERE organization_id = p_organization_id AND NOT is_deleted;
        IF v_org_code IS NULL THEN RAISE EXCEPTION 'Organization not found' USING ERRCODE = 'P0002'; END IF;
        v_seq := "${schemaName}".next_business_sequence('OFFER', p_organization_id);
        v_code := (v_org_code || '_OFF_' || "${schemaName}".business_name_fragment(p_name)
                   || '_' || lpad(v_seq::text, 3, '0'))::varchar(64);
        INSERT INTO "${schemaName}".offer (
            offer_id, organization_id, offer_code, offer_name, description,
            membership_product_id, store_id, promotion_image_url, badge_text,
            availability_text, disclaimer_text, cta_label, cta_type, cta_target,
            discount_percentage, effective_date, expiry_date, status_id,
            advertised_savings_override_minor, advertised_savings_override_currency,
            created_at, created_by, updated_at, updated_by
        ) VALUES (
            p_id, p_organization_id, v_code, p_name, p_description,
            p_membership_product_id, p_store_id, p_promotion_image_url, p_badge_text,
            p_availability_text, NULLIF(trim(p_disclaimer_text), ''), p_cta_label, p_cta_type, p_cta_target,
            p_discount_percentage, p_effective_date, p_expiry_date, p_status_id,
            p_savings_minor, p_savings_currency,
            CURRENT_TIMESTAMP, p_actor_user_id, CURRENT_TIMESTAMP, p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".offer SET
            offer_name = p_name, description = p_description,
            membership_product_id = p_membership_product_id, store_id = p_store_id,
            promotion_image_url = p_promotion_image_url, badge_text = p_badge_text,
            availability_text = p_availability_text, disclaimer_text = NULLIF(trim(p_disclaimer_text), ''), cta_label = p_cta_label,
            cta_type = p_cta_type, cta_target = p_cta_target,
            discount_percentage = p_discount_percentage,
            effective_date = p_effective_date, expiry_date = p_expiry_date,
            advertised_savings_override_minor = p_savings_minor,
            advertised_savings_override_currency = p_savings_currency,
            status_id = p_status_id, updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id, version_no = version_no + 1
        WHERE offer_id = p_id AND organization_id = p_organization_id
          AND is_deleted = false AND version_no = p_version_no;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Offer not found or changed since load' USING ERRCODE = '40001';
        END IF;
    END IF;
    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean, bigint, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_offer(varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, varchar, numeric, date, date, varchar, integer, varchar, boolean, bigint, varchar) TO "${appRole}";

-- Advertising uses catalog snapshots only. Checkout continues to resolve its
-- authoritative live prices and eligibility independently.
CREATE FUNCTION "${schemaName}".get_advertised_savings(p_organization_id varchar, p_kind varchar)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH items AS (
    SELECT b.benefit_id AS id, b.advertised_savings_override_minor AS override_minor,
           b.advertised_savings_override_currency AS override_currency, a.availability_mode
      FROM benefits b LEFT JOIN benefit_store_availability a USING (benefit_id, organization_id)
     WHERE p_kind = 'BENEFIT' AND b.organization_id = p_organization_id AND NOT b.is_deleted
    UNION ALL
    SELECT o.offer_id, o.advertised_savings_override_minor, o.advertised_savings_override_currency, a.availability_mode
      FROM offer o LEFT JOIN offer_store_availability a USING (offer_id, organization_id)
     WHERE p_kind = 'OFFER' AND o.organization_id = p_organization_id AND NOT o.is_deleted
), products AS (
    SELECT benefit_id AS id, product_id FROM benefit_product
     WHERE p_kind = 'BENEFIT' AND organization_id = p_organization_id AND is_active AND NOT is_deleted
    UNION
    SELECT offer_id, product_id FROM offer_product
     WHERE p_kind = 'OFFER' AND organization_id = p_organization_id AND is_active AND NOT is_deleted
), adjustment_links AS (
    SELECT benefit_id AS id, commerce_adjustment_id FROM benefit_commerce_adjustments
     WHERE p_kind = 'BENEFIT' AND organization_id = p_organization_id AND NOT is_deleted
    UNION
    SELECT offer_id, commerce_adjustment_id FROM offer_commerce_adjustments
     WHERE p_kind = 'OFFER' AND organization_id = p_organization_id AND NOT is_deleted
), adjustments AS (
    SELECT l.id, min(a.adjustment_type) AS kind, min(a.percentage) AS percentage,
           min(a.amount_minor) AS amount_minor, min(a.currency_code) AS currency
      FROM adjustment_links l JOIN commerce_adjustments a USING (commerce_adjustment_id)
     WHERE a.organization_id = p_organization_id AND a.is_active AND NOT a.is_deleted
     GROUP BY l.id HAVING count(*) = 1
), prices AS (
    SELECT DISTINCT i.id, s.currency_code, s.unit_price_minor_snapshot AS price
      FROM items i JOIN products p USING (id)
      JOIN product cp ON cp.product_id = p.product_id AND cp.organization_id = p_organization_id AND NOT cp.is_deleted
      JOIN entity_status pe ON pe.entity_status_id = cp.status_id AND pe.is_active
      JOIN statuses ps ON ps.status_id = pe.status_id AND ps.status_code = 'ACTIVE'
      JOIN commerce_store_catalog_sources src ON src.organization_id = p_organization_id
      JOIN stores st ON st.store_id = src.store_id AND st.organization_id = src.organization_id AND NOT st.is_deleted
      JOIN entity_status se ON se.entity_status_id = st.store_status_id AND se.is_active
      JOIN statuses ss ON ss.status_id = se.status_id AND ss.status_code = 'ACTIVE'
      JOIN poynt_store_catalog_configurations cfg ON cfg.organization_id = src.organization_id
           AND cfg.store_id = src.store_id AND cfg.integration_configuration_id = src.integration_configuration_id
      JOIN product_catalog catalog
            ON catalog.organization_id = src.organization_id
            AND catalog.integration_configuration_id = src.integration_configuration_id
            AND catalog.external_catalog_id = cfg.effective_catalog_id
            AND catalog.is_active
            AND NOT catalog.is_deleted
      JOIN integration_configurations ic ON ic.integration_configuration_id = src.integration_configuration_id
           AND ic.organization_id = src.organization_id AND NOT ic.is_deleted AND upper(ic.provider) = 'POYNT'
      JOIN entity_status ie ON ie.entity_status_id = ic.integration_status_id AND ie.is_active
      JOIN statuses ist ON ist.status_id = ie.status_id AND ist.status_code = 'ACTIVE'
      JOIN commerce_product_mappings m ON m.organization_id = src.organization_id
           AND m.integration_configuration_id = src.integration_configuration_id
           AND m.external_catalog_id = cfg.effective_catalog_id AND m.product_id = cp.product_id
           AND m.is_active AND NOT m.is_deleted
           AND (m.store_id = src.store_id OR (m.store_id IS NULL AND NOT EXISTS (
               SELECT 1 FROM commerce_product_mappings exact
                WHERE exact.organization_id = m.organization_id AND exact.product_id = m.product_id
                  AND exact.integration_configuration_id = m.integration_configuration_id
                  AND exact.external_catalog_id = m.external_catalog_id AND exact.store_id = src.store_id
                  AND exact.is_active AND NOT exact.is_deleted
           )))
      JOIN LATERAL (
          SELECT snap.currency_code, snap.unit_price_minor_snapshot
            FROM commerce_product_snapshots snap
           WHERE snap.organization_id = m.organization_id AND snap.commerce_product_mapping_id = m.commerce_product_mapping_id
             AND snap.integration_configuration_id = m.integration_configuration_id
             AND snap.external_catalog_id = m.external_catalog_id
             AND snap.store_id IS NOT DISTINCT FROM m.store_id
             AND snap.external_product_id = m.external_product_id
             AND snap.external_variant_id IS NOT DISTINCT FROM m.external_variant_id
             AND snap.is_active AND NOT snap.is_deleted
           ORDER BY snap.last_synced_at DESC, snap.commerce_product_snapshot_id
           LIMIT 1
      ) s ON true
     WHERE i.availability_mode = 'ALL_STORES' OR (
         i.availability_mode = 'SELECTED_STORES' AND (
             (p_kind = 'BENEFIT' AND EXISTS (SELECT 1 FROM benefit_store_availability_store bs
                 WHERE bs.organization_id = src.organization_id AND bs.benefit_id = i.id AND bs.store_id = src.store_id))
             OR (p_kind = 'OFFER' AND EXISTS (SELECT 1 FROM offer_store_availability_store os
                 WHERE os.organization_id = src.organization_id AND os.offer_id = i.id AND os.store_id = src.store_id))
         )
     )
), computed AS (
    SELECT p.id, p.currency_code, CASE a.kind
        WHEN 'PRODUCT_FREE' THEN p.price
        WHEN 'PRODUCT_PERCENT_OFF' THEN
            CASE WHEN a.percentage BETWEEN 0 AND 100 THEN trunc(p.price::numeric * a.percentage / 100) END
        WHEN 'PRODUCT_FIXED_OFF' THEN
            CASE WHEN a.currency = p.currency_code AND a.amount_minor >= 0 THEN least(p.price, a.amount_minor) END
        WHEN 'PRODUCT_SPECIAL_PRICE' THEN
            CASE WHEN a.currency = p.currency_code AND a.amount_minor >= 0 THEN greatest(0, p.price - a.amount_minor) END
        END AS minor
      FROM prices p JOIN adjustments a USING (id)
), maxima AS (
    SELECT id, min(currency_code) AS currency, max(minor) AS minor
      FROM computed GROUP BY id HAVING count(DISTINCT currency_code) = 1
), values_by_item AS (
    SELECT i.id,
           CASE WHEN m.minor BETWEEN 0 AND 9007199254740991 AND mc.is_active THEN
               jsonb_build_object('amountMinor', m.minor::bigint, 'currency', m.currency, 'decimalPlaces', mc.decimal_places)
           END AS calculated,
           CASE WHEN i.override_minor IS NOT NULL AND oc.is_active THEN
               jsonb_build_object('amountMinor', i.override_minor, 'currency', i.override_currency, 'decimalPlaces', oc.decimal_places)
           END AS override_value
      FROM items i LEFT JOIN maxima m USING (id)
      LEFT JOIN currencies mc ON mc.currency_code = m.currency
      LEFT JOIN currencies oc ON oc.currency_code = i.override_currency
)
SELECT COALESCE(jsonb_object_agg(id, jsonb_strip_nulls(jsonb_build_object(
    'calculated', calculated, 'override', override_value,
    'effective', coalesce(override_value, calculated),
    'source', CASE WHEN override_value IS NOT NULL THEN 'OVERRIDE' WHEN calculated IS NOT NULL THEN 'CALCULATED' END,
    'basis', CASE WHEN calculated IS NOT NULL THEN 'Highest saving per use across applicable catalog snapshots' END
))), '{}'::jsonb)
FROM values_by_item;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_advertised_savings(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_advertised_savings(varchar, varchar) TO "${appRole}";
CREATE FUNCTION "${schemaName}".get_membership_potential_savings(
    p_organization_id varchar, p_benefit_savings jsonb
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH plans AS (
    SELECT sp.subscription_plan_id AS id, mp.membership_product_id, c.currency_code, c.decimal_places,
           sp.subscription_period, rtrim(upper(sp.subscription_period_unit), 'S') AS period_unit,
           greatest(sp.effective_date, mp.effective_date) AS effective_date,
           least(sp.expiry_date, mp.expiry_date) AS purchase_through
      FROM subscription_plans sp
      JOIN membership_products mp USING (membership_product_id)
      JOIN currencies c ON c.currency_id = sp.currency_id
     WHERE mp.organization_id = p_organization_id AND NOT mp.is_deleted AND NOT sp.is_deleted
       AND c.is_active AND sp.subscription_period BETWEEN 1 AND 1200
), windows AS (
    SELECT p.*, b.benefit_id,
           p_benefit_savings -> b.benefit_id -> 'effective' AS value,
           (CURRENT_TIMESTAMP AT TIME ZONE tz.name)::date AS assumed_start,
           r.frequency_type, r.frequency_interval, r.usage_limit, r.applicable_days,
           greatest(b.effective_date, r.effective_date) AS available_from,
           least(b.expiry_date, r.expiry_date) AS available_through,
           CASE r.frequency_type
             WHEN 'DAILY' THEN make_interval(days => r.frequency_interval)
             WHEN 'WEEKLY' THEN make_interval(days => 7 * r.frequency_interval)
             WHEN 'MONTHLY' THEN make_interval(months => r.frequency_interval)
             WHEN 'YEARLY' THEN make_interval(years => r.frequency_interval)
           END AS recurrence
      FROM plans p
      JOIN LATERAL get_organization_membership_benefit_ids(p_organization_id, p.membership_product_id) l ON true
      JOIN benefits b ON b.benefit_id = l."benefitId"
      JOIN entity_status be ON be.entity_status_id = b.benefit_status_id AND be.is_active
      JOIN statuses bs ON bs.status_id = be.status_id AND bs.status_code = 'ACTIVE'
      LEFT JOIN LATERAL (
         SELECT candidate.*
           FROM benefit_usage_rule candidate
           JOIN entity_status es ON es.entity_status_id = candidate.benefit_usage_rule_status_id AND es.is_active
           JOIN statuses s ON s.status_id = es.status_id AND s.status_code = 'ACTIVE'
          WHERE candidate.benefit_id = b.benefit_id AND NOT candidate.is_deleted
            AND candidate.frequency_interval BETWEEN 1 AND 1200
            AND (nullif(trim(candidate.applicable_days), '') IS NULL
                 OR candidate.frequency_type = 'ONE_TIME'
                 OR (candidate.frequency_type = 'DAILY' AND candidate.frequency_interval = 1))
            AND candidate.window_start_time IS NULL AND candidate.window_end_time IS NULL
            AND (SELECT count(*) FROM benefit_usage_rule other
                  JOIN entity_status oe ON oe.entity_status_id = other.benefit_usage_rule_status_id AND oe.is_active
                  JOIN statuses os ON os.status_id = oe.status_id AND os.status_code = 'ACTIVE'
                  WHERE other.benefit_id = b.benefit_id AND NOT other.is_deleted) = 1
      ) r ON true
      LEFT JOIN pg_timezone_names tz ON tz.name = coalesce(nullif(trim(r.time_zone), ''), 'UTC')
), bounds AS (
    SELECT w.*, greatest(assumed_start, effective_date, available_from) AS from_date,
           least(available_through + 1, (assumed_start + CASE period_unit
             WHEN 'DAY' THEN make_interval(days => subscription_period)
             WHEN 'WEEK' THEN make_interval(days => 7 * subscription_period)
             WHEN 'MONTH' THEN make_interval(months => subscription_period)
             WHEN 'YEAR' THEN make_interval(years => subscription_period)
           END)::date) AS to_date
      FROM windows w
), usage AS (
    SELECT b.*, CASE WHEN value->>'currency' = currency_code AND assumed_start IS NOT NULL
                           AND effective_date <= assumed_start
                           AND (purchase_through IS NULL OR purchase_through >= assumed_start)
                           AND period_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR')
                           AND frequency_type IS NOT NULL AND available_from IS NOT NULL AND from_date < to_date
                     THEN CASE WHEN frequency_type = 'ONE_TIME' THEN
                                  CASE WHEN EXISTS (
                                      SELECT 1 FROM generate_series(from_date::timestamp, to_date::timestamp - interval '1 second', interval '1 day') day
                                       WHERE nullif(trim(applicable_days), '') IS NULL
                                          OR EXISTS (SELECT 1 FROM unnest(string_to_array(applicable_days, ',')) name
                                              WHERE upper(trim(name)) IN (upper(trim(to_char(day, 'DAY'))), upper(to_char(day, 'DY'))))
                                  ) THEN usage_limit::bigint ELSE 0 END
                               WHEN recurrence IS NOT NULL THEN
                                  (SELECT count(*) FROM generate_series(
                                      from_date::timestamp, to_date::timestamp - interval '1 second', recurrence
                                  ) day WHERE nullif(trim(applicable_days), '') IS NULL
                                     OR EXISTS (SELECT 1 FROM unnest(string_to_array(applicable_days, ',')) name
                                         WHERE upper(trim(name)) IN (upper(trim(to_char(day, 'DAY'))), upper(to_char(day, 'DY'))))) * usage_limit
                          END
                END AS uses
      FROM bounds b
), totals AS (
    SELECT id, currency_code, decimal_places, subscription_period, period_unit,
           sum((value->>'amountMinor')::numeric * uses) AS total,
           bool_and(uses IS NOT NULL) AS complete,
           jsonb_agg(jsonb_build_object('benefitId', benefit_id, 'uses', uses,
                    'amountMinor', (value->>'amountMinor')::numeric * uses) ORDER BY benefit_id) AS breakdown
      FROM usage GROUP BY id, currency_code, decimal_places, subscription_period, period_unit
)
SELECT coalesce(jsonb_object_agg(id, jsonb_build_object(
    'amountMinor', total, 'currency', currency_code, 'decimalPlaces', decimal_places,
    'period', subscription_period, 'periodUnit', period_unit, 'complete', complete, 'breakdown', breakdown,
    'assumptions', 'Assumes the term starts on the estimate date in the benefit time zone, with full use at each eligible interval'
)) FILTER (WHERE total BETWEEN 0 AND 9007199254740991), '{}'::jsonb)
FROM totals;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".get_membership_potential_savings(varchar, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_potential_savings(varchar, jsonb) TO "${appRole}";

CREATE OR REPLACE FUNCTION "${schemaName}".publish_customer_experience_release(
    p_organization_id varchar,
    p_snapshot_data jsonb,
    p_published_by varchar
)
RETURNS TABLE (
    id varchar,
    "organizationId" varchar,
    "releaseNumber" integer,
    "releaseStatus" varchar,
    "snapshotJson" text,
    "publishedAt" text,
    "publishedBy" varchar,
    "createdAt" text,
    "createdBy" varchar,
    "versionNo" integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = "${schemaName}", pg_temp
AS $function$
DECLARE
    v_benefit_savings jsonb;
    v_offer_savings jsonb;
    v_plan_savings jsonb;
    v_release_id varchar;
    v_release_number integer;
    v_published_status_id varchar;
    v_archived_status_id varchar;
BEGIN
    IF NOT "${schemaName}".can_administer_organization(p_organization_id, p_published_by) THEN
        RAISE EXCEPTION 'Actor cannot publish this organization' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".organization o
        WHERE o.organization_id = p_organization_id
          AND o.is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Organization not found'
            USING ERRCODE = '22023';
    END IF;

    SELECT es.entity_status_id
      INTO v_published_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'CUSTOMER_EXPERIENCE_RELEASE'
       AND st.status_code = 'PUBLISHED'
       AND es.is_active = true;

    SELECT es.entity_status_id
      INTO v_archived_status_id
      FROM "${schemaName}".entity_status es
      JOIN "${schemaName}".entity_type et
        ON et.entity_type_id = es.entity_type_id
      JOIN "${schemaName}".statuses st
        ON st.status_id = es.status_id
     WHERE et.entity_type_code = 'CUSTOMER_EXPERIENCE_RELEASE'
       AND st.status_code = 'ARCHIVED'
       AND es.is_active = true;

    IF v_published_status_id IS NULL
       OR v_archived_status_id IS NULL THEN
        RAISE EXCEPTION
            'Customer Experience Release statuses are not configured'
            USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(p_organization_id, 0)
    );

    UPDATE "${schemaName}".customer_experience_release
       SET release_status_id = v_archived_status_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_published_by,
           version_no = version_no + 1
     WHERE organization_id = p_organization_id
       AND release_status_id = v_published_status_id
       AND is_deleted = false;

    SELECT COALESCE(MAX(release_number), 0) + 1
      INTO v_release_number
      FROM "${schemaName}".customer_experience_release
     WHERE organization_id = p_organization_id;

    v_benefit_savings := "${schemaName}".get_advertised_savings(p_organization_id, 'BENEFIT');
    v_offer_savings := "${schemaName}".get_advertised_savings(p_organization_id, 'OFFER');
    v_plan_savings := "${schemaName}".get_membership_potential_savings(p_organization_id, v_benefit_savings);
    p_snapshot_data := jsonb_set(p_snapshot_data, '{benefits}', COALESCE((
        SELECT jsonb_agg((item - 'advertisedSavings') || jsonb_build_object(
            'advertisedSavings', jsonb_build_object('effective', v_benefit_savings -> (item->>'id') -> 'effective')
        ) ORDER BY ord)
        FROM jsonb_array_elements(COALESCE(p_snapshot_data->'benefits','[]'::jsonb)) WITH ORDINALITY x(item,ord)
    ), '[]'::jsonb));
    p_snapshot_data := jsonb_set(p_snapshot_data, '{offers}', COALESCE((
        SELECT jsonb_agg((item - 'advertisedSavings') || jsonb_build_object(
            'advertisedSavings', jsonb_build_object('effective', v_offer_savings -> (item->>'id') -> 'effective')
        ) ORDER BY ord)
        FROM jsonb_array_elements(COALESCE(p_snapshot_data->'offers','[]'::jsonb)) WITH ORDINALITY x(item,ord)
    ), '[]'::jsonb));
    p_snapshot_data := jsonb_set(p_snapshot_data, '{membershipProducts}', COALESCE((
        SELECT jsonb_agg(jsonb_set(product, '{plans}', COALESCE((
            SELECT jsonb_agg((plan - 'potentialSavings') || jsonb_build_object(
                'potentialSavings', CASE WHEN EXISTS (
                    SELECT 1
                      FROM "${schemaName}".subscription_plans sp
                      JOIN "${schemaName}".membership_products mp USING (membership_product_id)
                     WHERE sp.subscription_plan_id = plan->>'id'
                       AND mp.membership_product_id = product->>'id'
                       AND mp.organization_id = p_organization_id
                       AND NOT sp.is_deleted AND NOT mp.is_deleted
                ) THEN v_plan_savings -> (plan->>'id') END
            ) ORDER BY plan_ord)
            FROM jsonb_array_elements(COALESCE(product->'plans','[]'::jsonb)) WITH ORDINALITY y(plan,plan_ord)
        ), '[]'::jsonb)) ORDER BY ord)
        FROM jsonb_array_elements(COALESCE(p_snapshot_data->'membershipProducts','[]'::jsonb)) WITH ORDINALITY x(product,ord)
    ), '[]'::jsonb));

    v_release_id := gen_random_uuid()::text;

   INSERT INTO "${schemaName}".customer_experience_release (
    customer_experience_release_id,
    organization_id,
    release_number,
    release_status_id,
    snapshot_data,
    published_at,
    published_by,
    created_at,
    created_by,
    updated_at,
    updated_by
)
VALUES (
    v_release_id,
    p_organization_id,
    v_release_number,
    v_published_status_id,
    p_snapshot_data,
    CURRENT_TIMESTAMP,
    p_published_by,
    CURRENT_TIMESTAMP,
    p_published_by,
    CURRENT_TIMESTAMP,
    p_published_by
);

    UPDATE "${schemaName}".organization
       SET published_customer_experience_release_id = v_release_id,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = p_published_by,
           version_no = version_no + 1
     WHERE organization_id = p_organization_id;

    RETURN QUERY
    SELECT
        cer.customer_experience_release_id,
        cer.organization_id,
        cer.release_number,
        st.status_code,
        cer.snapshot_data::text,
        cer.published_at::text,
        cer.published_by,
        cer.created_at::text,
        cer.created_by,
        cer.version_no
    FROM "${schemaName}".customer_experience_release cer
    JOIN "${schemaName}".entity_status es
      ON es.entity_status_id = cer.release_status_id
    JOIN "${schemaName}".statuses st
      ON st.status_id = es.status_id
    WHERE cer.customer_experience_release_id = v_release_id;
END;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_discoverable_organization(p_organization_id character varying)
 RETURNS TABLE("organizationId" character varying, "detailJson" text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', "${schemaName}"
AS $function$
WITH candidate AS (
    SELECT o.organization_id, cer.snapshot_data
      FROM "${schemaName}".organization o
      JOIN "${schemaName}".entity_status oes
        ON oes.entity_status_id = o.organization_status_id
      JOIN "${schemaName}".statuses os ON os.status_id = oes.status_id
      JOIN "${schemaName}".customer_experience_release cer
        ON cer.customer_experience_release_id = o.published_customer_experience_release_id
       AND cer.is_deleted = false
      JOIN "${schemaName}".entity_status ces
        ON ces.entity_status_id = cer.release_status_id
      JOIN "${schemaName}".statuses cs ON cs.status_id = ces.status_id
     WHERE o.organization_id = p_organization_id
       AND o.is_deleted = false
       AND os.status_code = 'ACTIVE'
       AND cs.status_code = 'PUBLISHED'
),
eligible_products AS (
    SELECT c.organization_id, c.snapshot_data, product
      FROM candidate c
      CROSS JOIN LATERAL jsonb_array_elements(
          COALESCE(c.snapshot_data -> 'membershipProducts', '[]'::jsonb)
      ) product
      JOIN "${schemaName}".statuses mps
        ON mps.status_id = product ->> 'productStatusId'
     WHERE mps.status_code = 'ACTIVE'
       AND COALESCE(NULLIF(product ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
       AND COALESCE(NULLIF(product ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
             JOIN "${schemaName}".statuses sps
               ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
            WHERE sps.status_code = 'ACTIVE'
              AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
              AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
       )
)
SELECT c.organization_id,
       jsonb_build_object(
           'organization', jsonb_build_object(
               'id', c.snapshot_data #> '{organization,id}',
               'name', c.snapshot_data #> '{organization,name}',
               'displayName', c.snapshot_data #> '{organization,displayName}',
               'website', c.snapshot_data #> '{organization,website}',
               'primaryEmail', c.snapshot_data #> '{organization,primaryEmail}',
               'primaryPhone', c.snapshot_data #> '{organization,primaryPhone}'
           ),
           'publishedExperience', jsonb_build_object(
               'configuration', jsonb_build_object(
                   'templateId', c.snapshot_data #> '{configuration,templateId}',
                   'identity', c.snapshot_data #> '{configuration,identity}',
                   'branding', c.snapshot_data #> '{configuration,branding}',
                   'customerExperience', c.snapshot_data #> '{configuration,customerExperience}',
                   'localization', c.snapshot_data #> '{configuration,localization}'
               ),
               'template', jsonb_build_object(
                   'id', c.snapshot_data #> '{template,id}',
                   'sections', c.snapshot_data #> '{template,sections}',
                   'supportedCardStyles', c.snapshot_data #> '{template,supportedCardStyles}'
               ),
               'definition', c.snapshot_data #> '{customerExperience,experienceDefinition}',
               'organizationBranding', jsonb_build_object(
                   'logoUrl', c.snapshot_data #> '{organizationBranding,logoUrl}',
                   'darkThemeLogoUrl', c.snapshot_data #> '{organizationBranding,darkThemeLogoUrl}',
                   'faviconUrl', c.snapshot_data #> '{organizationBranding,faviconUrl}',
                   'splashScreenImageUrl', c.snapshot_data #> '{organizationBranding,splashScreenImageUrl}',
                   'tagline', c.snapshot_data #> '{organizationBranding,tagline}',
                   'heroImageUrl', c.snapshot_data #> '{organizationBranding,heroImageUrl}',
                   'primaryColor', c.snapshot_data #> '{organizationBranding,primaryColor}',
                   'secondaryColor', c.snapshot_data #> '{organizationBranding,secondaryColor}',
                   'accentColor', c.snapshot_data #> '{organizationBranding,accentColor}',
                   'backgroundColor', c.snapshot_data #> '{organizationBranding,backgroundColor}',
                   'textColor', c.snapshot_data #> '{organizationBranding,textColor}',
                    'announcementEnabled', c.snapshot_data #> '{organizationBranding,announcementEnabled}',
                    'announcementMessage', c.snapshot_data #> '{organizationBranding,announcementMessage}',
                    'announcementStyle', c.snapshot_data #> '{organizationBranding,announcementStyle}',
                    'announcementBackgroundColor', c.snapshot_data #> '{organizationBranding,announcementBackgroundColor}',
                    'announcementTextColor', c.snapshot_data #> '{organizationBranding,announcementTextColor}',
                    'announcementLinkUrl', c.snapshot_data #> '{organizationBranding,announcementLinkUrl}',
                    'announcementStartsAt', c.snapshot_data #> '{organizationBranding,announcementStartsAt}',
                    'announcementEndsAt', c.snapshot_data #> '{organizationBranding,announcementEndsAt}',
                    'announcementConfiguration', c.snapshot_data #> '{organizationBranding,announcementConfiguration}',
                    'themeExperience', c.snapshot_data #> '{organizationBranding,themeExperience}'
               ),
               'organizationDetails', jsonb_build_object(
                   'aboutOrganization', c.snapshot_data #> '{organizationDetails,aboutOrganization}',
                   'supportEmail', c.snapshot_data #> '{organizationDetails,supportEmail}',
                   'supportPhone', c.snapshot_data #> '{organizationDetails,supportPhone}'
               )
           ),
           'membershipProducts', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', product -> 'id',
                   'membershipProductName', product -> 'membershipProductName',
                   'displayName', product -> 'displayName',
                   'tier', product -> 'tier',
                   'tierSequence', product -> 'tierSequence',
                   'description', product -> 'description',
                   'benefitIds', COALESCE(product -> 'benefitIds', '[]'::jsonb),
                   'plans', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object(
                           'id', plan -> 'id',
                           'subscriptionPlanName', plan -> 'subscriptionPlanName',
                           'subscriptionPlanCode', plan -> 'subscriptionPlanCode',
                           'description', plan -> 'description',
                           'subscriptionPeriod', plan -> 'subscriptionPeriod',
                           'subscriptionPeriodUnit', plan -> 'subscriptionPeriodUnit',
                           'price', plan -> 'price',
                           'potentialSavings', plan -> 'potentialSavings'
                       ) ORDER BY plan ->> 'subscriptionPlanName')
                       FROM jsonb_array_elements(COALESCE(product -> 'plans', '[]'::jsonb)) plan
                       JOIN "${schemaName}".statuses sps
                         ON sps.status_id = plan ->> 'subscriptionPlanStatusId'
                      WHERE sps.status_code = 'ACTIVE'
                        AND COALESCE(NULLIF(plan ->> 'effectiveDate', '')::date, CURRENT_DATE) <= CURRENT_DATE
                        AND COALESCE(NULLIF(plan ->> 'expiryDate', '')::date, CURRENT_DATE) >= CURRENT_DATE
                   ), '[]'::jsonb)
               ) ORDER BY NULLIF(product ->> 'tierSequence', '')::integer NULLS LAST,
                            product ->> 'membershipProductName')
                 FROM eligible_products ep
                WHERE ep.organization_id = c.organization_id
           ), '[]'::jsonb),
           'benefits', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', benefit -> 'id', 'benefitName', benefit -> 'benefitName',
                   'advertisedSavings', benefit -> 'advertisedSavings',
                   'displayName', benefit -> 'displayName', 'description', benefit -> 'description',
                   'disclaimerText', benefit -> 'disclaimerText', 'benefitTypeId', benefit -> 'benefitTypeId',
                   'products', COALESCE(benefit -> 'products', '[]'::jsonb)
               ) ORDER BY benefit ->> 'benefitName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefits', '[]'::jsonb)) benefit
           ), '[]'::jsonb),
           'benefitUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'benefitId', rule -> 'benefitId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'benefitUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'offers', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'advertisedSavings', offer -> 'advertisedSavings',
                   'id', offer -> 'id', 'offerName', offer -> 'offerName',
                   'description', offer -> 'description', 'promotionImageUrl', offer -> 'promotionImageUrl',
                   'badgeText', offer -> 'badgeText', 'availabilityText', offer -> 'availabilityText',
                   'disclaimerText', offer -> 'disclaimerText', 'membershipProductId', offer -> 'membershipProductId',
                   'products', COALESCE(offer -> 'products', '[]'::jsonb),
                   'discountPercentage', offer -> 'discountPercentage', 'ctaLabel', offer -> 'ctaLabel'
               ) ORDER BY offer ->> 'offerName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offers', '[]'::jsonb)) offer
           ), '[]'::jsonb),
           'offerUsageRules', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', rule -> 'id', 'offerId', rule -> 'offerId',
                   'ruleName', rule -> 'ruleName', 'frequencyType', rule -> 'frequencyType',
                   'frequencyInterval', rule -> 'frequencyInterval', 'usageLimit', rule -> 'usageLimit',
                   'windowStartTime', rule -> 'windowStartTime', 'windowEndTime', rule -> 'windowEndTime',
                   'applicableDays', COALESCE(rule -> 'applicableDays', '[]'::jsonb), 'timeZone', rule -> 'timeZone'
               ) ORDER BY rule ->> 'ruleName')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'offerUsageRules', '[]'::jsonb)) rule
           ), '[]'::jsonb),
           'stores', COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                   'id', store -> 'id', 'name', store -> 'name',
                   'address', jsonb_build_object(
                       'line1', store #> '{address,line1}',
                       'city', store #> '{address,city}'
                   )
               ) ORDER BY store ->> 'name')
                 FROM jsonb_array_elements(COALESCE(c.snapshot_data -> 'stores', '[]'::jsonb)) store
           ), '[]'::jsonb)
       )::text
  FROM candidate c;
$function$;

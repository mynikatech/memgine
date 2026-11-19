-- Keep the save function under its canonical name. Unknown dependencies
-- or privileges abort the transaction instead of being discarded.
DO $plan_savings_owner$
DECLARE
    prior_function regprocedure := '"${schemaName}".save_organization_subscription_plan(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, numeric, varchar, varchar, date, date, integer, varchar, boolean)'::regprocedure;
    app_role oid := to_regrole('${appRole}');
BEGIN
    IF app_role IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
        WHERE p.oid = prior_function AND r.rolname = current_user
    ) THEN
        RAISE EXCEPTION 'Subscription-plan save owner or app role does not match migration expectations';
    END IF;
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
        WHERE p.oid = prior_function AND g.grantee <> p.proowner
          AND (g.grantee <> app_role OR g.is_grantable OR g.grantor <> p.proowner)
    ) THEN
        RAISE EXCEPTION 'Unexpected grant on canonical subscription-plan save function';
    END IF;
END;
$plan_savings_owner$;

ALTER TABLE "${schemaName}".subscription_plans
    ADD COLUMN potential_savings_override_minor bigint
        CHECK (potential_savings_override_minor BETWEEN 0 AND 9007199254740991);

DROP FUNCTION "${schemaName}".save_organization_subscription_plan(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, numeric, varchar, varchar, date, date, integer, varchar, boolean);
CREATE FUNCTION "${schemaName}".save_organization_subscription_plan(
    p_organization_id varchar,
    p_membership_product_id varchar,
    p_id varchar,
    p_code varchar,
    p_name varchar,
    p_description varchar,
    p_period integer,
    p_period_unit varchar,
    p_price numeric,
    p_currency_id varchar,
    p_status_id varchar,
    p_effective_date date,
    p_expiry_date date,
    p_version_no integer,
    p_actor_user_id varchar,
    p_create boolean,
    p_override_minor bigint,
    p_override_currency varchar,
    p_override_decimal_places integer
)
RETURNS boolean
LANGUAGE plpgsql
AS $function$
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
        FROM "${schemaName}".membership_products
        WHERE membership_product_id = p_membership_product_id
          AND organization_id = p_organization_id
          AND is_deleted = false
    ) THEN
        RAISE EXCEPTION 'Membership product not found in organization'
            USING ERRCODE = 'P0002';
    END IF;

    IF nullif(trim(p_id), '') IS NULL
       OR length(p_id) > 64
       OR nullif(trim(p_code), '') IS NULL
       OR length(p_code) > 64
       OR nullif(trim(p_name), '') IS NULL
       OR length(p_name) > 100
       OR p_period IS NULL
       OR p_period < 1
       OR nullif(trim(p_period_unit), '') IS NULL
       OR p_price IS NULL
       OR p_price < 0
       OR p_effective_date IS NULL
       OR p_expiry_date < p_effective_date THEN
        RAISE EXCEPTION 'Invalid subscription plan fields'
            USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".currencies
        WHERE currency_id = p_currency_id
          AND is_active = true
    )
    OR NOT EXISTS (
        SELECT 1
        FROM "${schemaName}".entity_status es
        JOIN "${schemaName}".entity_type et
          ON et.entity_type_id = es.entity_type_id
        WHERE es.entity_status_id = p_status_id
          AND et.entity_type_code = 'SUBSCRIPTION_PLAN'
          AND es.is_active = true
    ) THEN
        RAISE EXCEPTION 'Invalid subscription plan currency or status'
            USING ERRCODE = '22023';
    END IF;

    IF p_override_minor IS NULL THEN
        IF p_override_currency IS NOT NULL OR p_override_decimal_places IS NOT NULL THEN
            RAISE EXCEPTION 'An override requires an amount' USING ERRCODE = '22023';
        END IF;
    ELSIF p_override_minor NOT BETWEEN 0 AND 9007199254740991 OR NOT EXISTS (
        SELECT 1 FROM "${schemaName}".currencies c
         WHERE c.currency_id = p_currency_id AND c.is_active
           AND c.currency_code = p_override_currency AND c.decimal_places = p_override_decimal_places
    ) THEN
        RAISE EXCEPTION 'Savings override must use the plan currency and precision' USING ERRCODE = '22023';
    END IF;

    IF p_create THEN
        INSERT INTO "${schemaName}".subscription_plans (
            subscription_plan_id,
            membership_product_id,
            subscription_plan_code,
            subscription_plan_name,
            description,
            subscription_period,
            subscription_period_unit,
            price,
            currency_id,
            subscription_plan_status_id,
            effective_date,
            expiry_date,
            potential_savings_override_minor,
            created_by,
            updated_by
        )
        VALUES (
            p_id,
            p_membership_product_id,
            p_code,
            p_name,
            p_description,
            p_period,
            p_period_unit,
            p_price,
            p_currency_id,
            p_status_id,
            p_effective_date,
            p_expiry_date,
            p_override_minor,
            p_actor_user_id,
            p_actor_user_id
        );
    ELSE
        UPDATE "${schemaName}".subscription_plans
        SET
            subscription_plan_code = p_code,
            subscription_plan_name = p_name,
            description = p_description,
            subscription_period = p_period,
            subscription_period_unit = p_period_unit,
            price = p_price,
            currency_id = p_currency_id,
            subscription_plan_status_id = p_status_id,
            effective_date = p_effective_date,
            expiry_date = p_expiry_date,
            potential_savings_override_minor = p_override_minor,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = p_actor_user_id,
            version_no = version_no + 1
        WHERE subscription_plan_id = p_id
          AND membership_product_id = p_membership_product_id
          AND is_deleted = false
          AND version_no = p_version_no;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Subscription plan not found or changed since load'
                USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION "${schemaName}".save_organization_subscription_plan(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, numeric, varchar, varchar, date, date, integer, varchar, boolean, bigint, varchar, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_organization_subscription_plan(varchar, varchar, varchar, varchar, varchar, varchar, integer, varchar, numeric, varchar, varchar, date, date, integer, varchar, boolean, bigint, varchar, integer) TO "${appRole}";

-- A valid redemption time window limits the time of day, not eligible uses.
-- The canonical redemption functions continue to enforce those windows.
CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_potential_savings(
    p_organization_id varchar, p_benefit_savings jsonb
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH plans AS (
    SELECT sp.subscription_plan_id AS id, sp.potential_savings_override_minor AS override_minor, mp.membership_product_id, c.currency_code, c.decimal_places,
           sp.subscription_period, rtrim(upper(sp.subscription_period_unit), 'S') AS period_unit,
           greatest(sp.effective_date, mp.effective_date) AS effective_date,
           least(sp.expiry_date, mp.expiry_date) AS purchase_through
      FROM subscription_plans sp
      JOIN membership_products mp USING (membership_product_id)
      JOIN currencies c ON c.currency_id = sp.currency_id
     WHERE mp.organization_id = p_organization_id AND NOT mp.is_deleted AND NOT sp.is_deleted
       AND c.is_active
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
            AND (SELECT count(*) FROM benefit_usage_rule other
                  JOIN entity_status oe ON oe.entity_status_id = other.benefit_usage_rule_status_id AND oe.is_active
                  JOIN statuses os ON os.status_id = oe.status_id AND os.status_code = 'ACTIVE'
                  WHERE other.benefit_id = b.benefit_id AND NOT other.is_deleted) = 1
      ) r ON true
      LEFT JOIN pg_timezone_names tz ON tz.name = coalesce(nullif(trim(r.time_zone), ''), 'UTC')
     WHERE p.subscription_period BETWEEN 1 AND 1200
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
           bool_and(
                uses IS NOT NULL
                AND value ->> 'amountMinor' IS NOT NULL
                AND value ->> 'currency' = currency_code
            ) AS complete,
           jsonb_agg(jsonb_build_object('benefitId', benefit_id, 'uses', uses,
                    'amountMinor', CASE WHEN (value->>'amountMinor')::numeric * uses BETWEEN 0 AND 9007199254740991
                        THEN (value->>'amountMinor')::numeric * uses END) ORDER BY benefit_id) AS breakdown
      FROM usage GROUP BY id, currency_code, decimal_places, subscription_period, period_unit
), results AS (
    SELECT p.*,
           CASE WHEN t.total BETWEEN 0 AND 9007199254740991 THEN t.total::bigint END AS calculated_minor,
           coalesce(t.complete AND t.total BETWEEN 0 AND 9007199254740991, false) AS calculated_complete,
           coalesce(t.breakdown, '[]'::jsonb) AS breakdown
      FROM plans p LEFT JOIN totals t USING (id)
)
SELECT coalesce(jsonb_object_agg(id, jsonb_build_object(
    'amountMinor', coalesce(override_minor, calculated_minor),
    'calculatedAmountMinor', calculated_minor,
    'overrideAmountMinor', override_minor,
    'source', CASE WHEN override_minor IS NOT NULL THEN 'OVERRIDE' ELSE 'CALCULATED' END,
    'currency', currency_code, 'decimalPlaces', decimal_places,
    'period', subscription_period, 'periodUnit', period_unit,
    'complete', calculated_complete, 'breakdown', breakdown,
    'assumptions', 'Assumes the term starts on the estimate date in the benefit time zone, with full use at each eligible interval'
)) FILTER (WHERE override_minor IS NOT NULL OR calculated_minor IS NOT NULL), '{}'::jsonb)
FROM results;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_potential_savings(p_organization_id character varying, p_benefit_savings jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO pg_catalog, "${schemaName}"
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
             WHEN 'MONTHLY' THEN make_interval(days => 30 * r.frequency_interval)
             WHEN 'YEARLY' THEN make_interval(days => 365 * r.frequency_interval)
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
             WHEN 'MONTH' THEN make_interval(days => 30 * subscription_period)
             WHEN 'YEAR' THEN make_interval(days => 365 * subscription_period)
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
                                  ) bucket_start
                                   WHERE nullif(trim(applicable_days), '') IS NULL
                                      OR EXISTS (
                                          SELECT 1 FROM generate_series(
                                              bucket_start,
                                              least(bucket_start + recurrence, to_date::timestamp,
                                                    bucket_start + interval '7 days') - interval '1 second',
                                              interval '1 day'
                                          ) eligible_day
                                          WHERE EXISTS (
                                              SELECT 1 FROM unnest(string_to_array(applicable_days, ',')) name
                                              WHERE upper(trim(name)) IN (upper(trim(to_char(eligible_day, 'DAY'))), upper(to_char(eligible_day, 'DY')))
                                          )
                                      )) * usage_limit
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
    'assumptions', 'Assumes the term starts on the estimate date in the benefit time zone, using 30-day months and 365-day years, with full use in each interval containing an eligible day'
)) FILTER (WHERE override_minor IS NOT NULL OR calculated_minor IS NOT NULL), '{}'::jsonb)
FROM results;
$function$;

-- Read-only regression check for prepared subscription-plan fixtures. Run only
-- after deliberately applying changeset 298 in a test database.
-- Set search_path to the application schema and supply customer organization
-- and plan IDs via psql variables org_id, gold_id and silver_id.
--
-- Both plans must share one active DAILY interval-1 benefit priced at 550
-- minor units, with a recurring redemption window, usage limit 1, no date or
-- weekday restriction within the fixture period, and the same currency.
-- GOLD has a 30-day term and an explicit override of zero; SILVER has a
-- 7-day term with its override cleared. No other benefits apply.
SELECT set_config('memgine_test.org_id', :'org_id', false),
       set_config('memgine_test.gold_id', :'gold_id', false),
       set_config('memgine_test.silver_id', :'silver_id', false);

DO $case$
DECLARE
    org varchar := current_setting('memgine_test.org_id');
    estimates jsonb := get_membership_potential_savings(org, get_advertised_savings(org, 'BENEFIT'));
    gold jsonb := estimates -> current_setting('memgine_test.gold_id');
    silver jsonb := estimates -> current_setting('memgine_test.silver_id');
BEGIN
    IF gold ->> 'calculatedAmountMinor' IS DISTINCT FROM '16500'
       OR gold ->> 'amountMinor' IS DISTINCT FROM '0'
       OR gold ->> 'source' IS DISTINCT FROM 'OVERRIDE'
       OR gold ->> 'complete' IS DISTINCT FROM 'true'
       OR gold #>> '{breakdown,0,uses}' IS DISTINCT FROM '30' THEN
        RAISE EXCEPTION 'GOLD window calculation or zero override failed: %', gold;
    END IF;
    IF silver ->> 'calculatedAmountMinor' IS DISTINCT FROM '3850'
       OR silver ->> 'amountMinor' IS DISTINCT FROM '3850'
       OR silver ->> 'source' IS DISTINCT FROM 'CALCULATED'
       OR silver ->> 'overrideAmountMinor' IS NOT NULL
       OR silver #>> '{breakdown,0,uses}' IS DISTINCT FROM '7' THEN
        RAISE EXCEPTION 'SILVER window calculation or override clear failed: %', silver;
    END IF;
END;
$case$;

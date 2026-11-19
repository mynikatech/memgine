-- DEV only. No fixture writes. Build an acceptance manifest from existing DEV test orders.
-- Use psql variables: fixture_provenance=S2_ACTUAL_SAVINGS_DEV, organization_id, customer_user_id,
-- gold_subscription_id, silver_subscription_id, historical_subscription_id.
-- Select known DEV test accounts, not an unrelated customer. Missing evidence is reported as
-- MISSING_FIXTURE. Generate missing cases through the approved DEV flow before rerunning.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path TO pg_catalog, memginedev;

SELECT (current_database() = 'memgine_dev' AND
        inet_server_addr() IS NOT NULL AND
        inet_server_addr() NOT IN ('127.0.0.1'::inet, '::1'::inet) AND
        :'fixture_provenance' = 'S2_ACTUAL_SAVINGS_DEV' AND
        (SELECT count(*) = 3 FROM (
            SELECT DISTINCT x.id FROM (VALUES (:'gold_subscription_id'),
              (:'silver_subscription_id'), (:'historical_subscription_id')) AS x(id)
            JOIN subscriptions s ON s.subscription_id = x.id AND NOT s.is_deleted
            JOIN organization_user ou USING (organization_user_id)
            WHERE ou.organization_id = :'organization_id' AND ou.user_id = :'customer_user_id' AND NOT ou.is_deleted
        ) owned)) AS fixture_scope_valid
\gset
\if :fixture_scope_valid
WITH targets(role, subscription_id) AS (
    VALUES ('GOLD', :'gold_subscription_id'), ('SILVER', :'silver_subscription_id'),
           ('HISTORICAL', :'historical_subscription_id')
), orders AS MATERIALIZED (
    SELECT c.*, t.role, st.status_code AS subscription_status, sp.subscription_plan_name,
           payments.cash_success, payments.terminal_success, payments.failed_attempts
      FROM targets t JOIN subscriptions s USING (subscription_id)
      JOIN subscription_plans sp ON sp.subscription_plan_id = s.subscription_plan_id
      JOIN commerce_transactions c USING (subscription_id)
      LEFT JOIN entity_status es ON es.entity_status_id = s.subscription_status_id
      LEFT JOIN statuses st ON st.status_id = es.status_id
      CROSS JOIN LATERAL (
          SELECT count(*) FILTER (WHERE a.payment_channel = 'CASH' AND a.provider_status = 'SUCCEEDED') AS cash_success,
                 count(*) FILTER (WHERE a.payment_channel = 'REMOTE_TERMINAL' AND a.provider_status = 'SUCCEEDED') AS terminal_success,
                 count(*) FILTER (WHERE a.provider_status IN ('FAILED', 'CANCELLED')) AS failed_attempts
            FROM commerce_provider_payment_attempts a
           WHERE a.commerce_transaction_id = c.commerce_transaction_id
      ) payments
     WHERE c.organization_id = :'organization_id' AND c.customer_user_id = :'customer_user_id'
       AND c.source_channel = 'COUNTER_REDEMPTION' AND NOT c.is_deleted
), assessed AS MATERIALIZED (
    SELECT o.role, o.subscription_status, o.subscription_plan_name, o.total_minor,
           o.cash_success, o.terminal_success, o.failed_attempts, r.item_count, r.restored_items, a.*
      FROM get_customer_transaction_actual_savings(:'customer_user_id',
            ARRAY(SELECT commerce_transaction_id FROM orders)) a
      JOIN orders o ON o.commerce_transaction_id = a.transaction_id
      CROSS JOIN LATERAL (
          SELECT count(*) AS item_count, count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM redemption_resolutions rr
               WHERE rr.redemption_transaction_item_id = i.redemption_transaction_item_id
                 AND rr.redemption_transaction_id = i.redemption_transaction_id
                 AND rr.action_status = 'COMPLETED' AND rr.action_code IN ('RESTORE_ONLY', 'REFUND_AND_RESTORE')
          )) AS restored_items
            FROM redemption_transaction_item i WHERE i.redemption_transaction_id = a.redemption_transaction_id
      ) r
), scenarios(scenario) AS (
    VALUES ('GOLD'), ('SILVER'), ('HISTORICAL'), ('ZERO_PAYABLE'), ('PAID_PARTIAL_DISCOUNT'),
           ('ZERO_DISCOUNT'), ('CASH'), ('POYNT_TERMINAL'), ('RETRIED_PAYMENT'), ('FULL_RESTORATION'),
           ('PARTIAL_BASKET_RESTORATION'), ('NONCOMPLETED')
)
SELECT :'fixture_provenance' AS provenance, f.scenario,
       CASE WHEN count(a.transaction_id) = 0 THEN 'MISSING_FIXTURE' ELSE 'MATCHED' END AS fixture_status,
       coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.transaction_id)
                  FILTER (WHERE a.transaction_id IS NOT NULL), '[]'::jsonb) AS evidence
  FROM scenarios f
  LEFT JOIN assessed a ON CASE f.scenario
    WHEN 'GOLD' THEN a.role = 'GOLD' AND a.verification_state = 'VERIFIED'
    WHEN 'SILVER' THEN a.role = 'SILVER' AND a.verification_state = 'VERIFIED'
    WHEN 'HISTORICAL' THEN a.role = 'HISTORICAL' AND a.subscription_status IN ('EXPIRED', 'CANCELLED', 'CANCELED')
       AND a.verification_state = 'VERIFIED'
    WHEN 'ZERO_PAYABLE' THEN a.total_minor = 0 AND a.original_discount_minor > 0 AND a.verification_state = 'VERIFIED'
    WHEN 'PAID_PARTIAL_DISCOUNT' THEN a.total_minor > 0 AND a.original_discount_minor > 0 AND a.verification_state = 'VERIFIED'
    WHEN 'ZERO_DISCOUNT' THEN a.original_discount_minor = 0 AND a.net_savings_minor = 0 AND a.verification_state = 'VERIFIED'
    WHEN 'CASH' THEN a.cash_success = 1 AND a.verification_state = 'VERIFIED'
    WHEN 'POYNT_TERMINAL' THEN a.terminal_success = 1 AND a.verification_state = 'VERIFIED'
    WHEN 'RETRIED_PAYMENT' THEN a.failed_attempts > 0 AND a.total_minor > 0 AND a.verification_state = 'VERIFIED'
    WHEN 'FULL_RESTORATION' THEN a.restored_items = a.item_count AND a.reversal_minor > 0 AND a.net_savings_minor = 0
    WHEN 'PARTIAL_BASKET_RESTORATION' THEN a.restored_items > 0 AND a.restored_items < a.item_count AND a.reversal_minor > 0
    WHEN 'NONCOMPLETED' THEN a.verification_state = 'NOT_FINALIZED' AND a.net_savings_minor IS NULL
  END
 GROUP BY f.scenario ORDER BY f.scenario;

SELECT :'fixture_provenance' AS provenance, a.*
  FROM (VALUES (:'gold_subscription_id'), (:'silver_subscription_id'), (:'historical_subscription_id')) t(id)
 CROSS JOIN LATERAL get_customer_subscription_actual_savings(:'customer_user_id', :'organization_id', t.id) a
 ORDER BY a.subscription_id, a.currency_code NULLS LAST;
\else
\echo Refusing fixture preparation because DEV provenance or the three owned subscription IDs did not validate.
\endif
ROLLBACK;

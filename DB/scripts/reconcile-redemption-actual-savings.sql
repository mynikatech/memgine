-- Owner-run historical attribution preview. Use psql with schema_name, organization_id,
-- after_transaction_id (empty for first page), and batch_size (1..500).
-- Repeat with the last commerce transaction ID until scanned_orders is zero.
-- The same verified historical attribution is available at read time; no copies are backfilled.
\set ON_ERROR_STOP on
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL search_path TO pg_catalog, :"schema_name";

WITH orders AS MATERIALIZED (
    SELECT c.commerce_transaction_id, c.customer_user_id, c.is_deleted, c.source_channel
      FROM commerce_transactions c
     WHERE c.organization_id = :'organization_id'
       AND c.commerce_transaction_id > :'after_transaction_id'
       AND c.status = 'COMPLETED'
       AND (c.source_channel = 'COUNTER_REDEMPTION' OR EXISTS (
           SELECT 1 FROM commerce_transaction_redemptions x
            WHERE x.commerce_transaction_id = c.commerce_transaction_id AND NOT x.is_deleted
       ))
     ORDER BY c.commerce_transaction_id
     LIMIT greatest(1, least(500, :'batch_size'::integer))
), by_customer AS (
    SELECT customer_user_id, array_agg(commerce_transaction_id) AS ids
      FROM orders WHERE source_channel = 'COUNTER_REDEMPTION'
        AND customer_user_id IS NOT NULL AND NOT is_deleted GROUP BY customer_user_id
), results AS (
    SELECT a.* FROM by_customer c
    CROSS JOIN LATERAL get_customer_transaction_actual_savings(c.customer_user_id, c.ids) a
), classified AS (
    SELECT o.commerce_transaction_id,
           CASE WHEN o.is_deleted THEN 'DELETED_COMPLETED_COMMERCE'
                WHEN o.source_channel <> 'COUNTER_REDEMPTION' THEN 'UNSUPPORTED_COMMERCE_REDEMPTION_SOURCE'
                ELSE coalesce(r.verification_state, 'MISSING_CUSTOMER_ATTRIBUTION') END AS reason,
           r.subscription_id, r.redemption_transaction_id, r.currency_code,
           r.original_discount_minor, r.reversal_minor, r.net_savings_minor
      FROM orders o LEFT JOIN results r ON r.transaction_id = o.commerce_transaction_id
)
SELECT (SELECT count(*) FROM orders) AS scanned_orders,
       (SELECT max(commerce_transaction_id) FROM orders) AS next_after_transaction_id,
       coalesce((SELECT jsonb_object_agg(reason, n)
                 FROM (SELECT reason, count(*) AS n FROM classified GROUP BY reason) counts), '{}'::jsonb) AS counts_by_reason,
       coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.commerce_transaction_id), '[]'::jsonb) AS attribution
  FROM classified c;

-- This separate report includes successful baskets with no completed matching commerce link,
-- as well as legacy benefit usage rows with no successful basket. Both are coverage gaps.
WITH baskets AS (
    SELECT rt.redemption_transaction_id, rt.subscription_id,
           'SUCCESSFUL_BASKET_WITHOUT_OWNED_COMPLETED_ORDER' AS reason
      FROM redemption_transaction rt
      LEFT JOIN subscriptions s ON s.subscription_id = rt.subscription_id AND NOT s.is_deleted
      LEFT JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
        AND ou.organization_id = rt.organization_id AND NOT ou.is_deleted
     WHERE rt.organization_id = :'organization_id' AND rt.status = 'SUCCESS'
       AND NOT EXISTS (
           SELECT 1 FROM commerce_transaction_redemptions x
           JOIN commerce_transactions c USING (commerce_transaction_id)
            WHERE x.redemption_transaction_id = rt.redemption_transaction_id AND NOT x.is_deleted
              AND NOT c.is_deleted AND c.status = 'COMPLETED' AND c.source_channel = 'COUNTER_REDEMPTION'
              AND c.organization_id = rt.organization_id AND c.subscription_id = rt.subscription_id
              AND c.customer_user_id = ou.user_id
       )
), legacy AS (
    SELECT b.subscription_id, 'LEGACY_BENEFIT_USAGE_WITHOUT_SUCCESSFUL_BASKET' AS reason
      FROM redemptions b
      JOIN subscriptions s USING (subscription_id)
      JOIN organization_user ou USING (organization_user_id)
      LEFT JOIN entity_status es ON es.entity_status_id = b.redemption_status_id
      LEFT JOIN statuses st ON st.status_id = es.status_id
     WHERE ou.organization_id = :'organization_id'
       AND (st.status_code IS NULL OR st.status_code IN ('SUCCESS', 'REVERSED'))
       AND NOT EXISTS (
           SELECT 1 FROM redemption_transaction_item i
           JOIN redemption_transaction rt USING (redemption_transaction_id)
            WHERE i.redemption_id = b.redemption_id AND rt.status = 'SUCCESS'
              AND rt.subscription_id = b.subscription_id AND rt.organization_id = ou.organization_id
       )
), orphan_offers AS (
    SELECT 'OFFER_USAGE_WITHOUT_SUCCESSFUL_BASKET' AS reason
      FROM offer_redemptions o
     WHERE o.organization_id = :'organization_id' AND o.status IN ('SUCCESS', 'REVERSED')
       AND NOT EXISTS (
           SELECT 1 FROM redemption_transaction_item i
           JOIN redemption_transaction rt USING (redemption_transaction_id)
            WHERE i.redemption_transaction_item_id = o.redemption_transaction_item_id
              AND i.offer_redemption_id = o.offer_redemption_id AND i.status = 'SUCCESS'
              AND rt.redemption_transaction_id = o.redemption_transaction_id
              AND rt.organization_id = o.organization_id AND rt.subscription_id = o.subscription_id
              AND rt.status = 'SUCCESS'
       )
)
SELECT reason, count(*) AS affected_records
  FROM (SELECT reason FROM baskets UNION ALL SELECT reason FROM legacy UNION ALL SELECT reason FROM orphan_offers) gaps
 GROUP BY reason ORDER BY reason;
ROLLBACK;

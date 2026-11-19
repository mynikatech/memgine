-- The immutable receipt is already issued at the canonical completion boundary.
-- This read model uses it as evidence and adds no writes to checkout or refunds.
CREATE INDEX ix_actual_savings_completed_orders
    ON "${schemaName}".commerce_transactions (organization_id, customer_user_id, subscription_id)
    WHERE status = 'COMPLETED' AND source_channel = 'COUNTER_REDEMPTION';
CREATE INDEX ix_actual_savings_completed_baskets
    ON "${schemaName}".redemption_transaction (subscription_id, organization_id)
    WHERE status = 'SUCCESS';
CREATE INDEX ix_actual_savings_basket_items
    ON "${schemaName}".redemption_transaction_item (redemption_transaction_id);
CREATE INDEX ix_actual_savings_item_benefit_redemption
    ON "${schemaName}".redemption_transaction_item (redemption_id)
    WHERE redemption_id IS NOT NULL;
CREATE INDEX ix_actual_savings_consumed_offers
    ON "${schemaName}".offer_redemptions (subscription_id)
    WHERE status IN ('SUCCESS', 'REVERSED');
CREATE INDEX ix_actual_savings_refund_commerce
    ON "${schemaName}".payment_refunds (commerce_transaction_id)
    WHERE commerce_transaction_id IS NOT NULL;

CREATE FUNCTION "${schemaName}".get_customer_transaction_actual_savings(
    p_customer_user_id varchar, p_commerce_ids varchar[]
)
RETURNS TABLE (
    transaction_id varchar, subscription_id varchar, redemption_transaction_id varchar,
    currency_code varchar, original_discount_minor bigint, reversal_minor bigint,
    net_savings_minor bigint, verification_state varchar, completed_at text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $fn$
WITH candidates AS MATERIALIZED (
    SELECT c.*, s.subscription_id AS owned_subscription_id
      FROM commerce_transactions c
      LEFT JOIN subscriptions s ON s.subscription_id = c.subscription_id AND NOT s.is_deleted
        AND EXISTS (
          SELECT 1 FROM organization_user ou
           WHERE ou.organization_user_id = s.organization_user_id
             AND ou.organization_id = c.organization_id AND ou.user_id = p_customer_user_id
             AND NOT ou.is_deleted
        )
     WHERE c.commerce_transaction_id = ANY (p_commerce_ids)
       AND c.customer_user_id = p_customer_user_id AND c.source_channel = 'COUNTER_REDEMPTION'
       AND NOT c.is_deleted
), linked AS MATERIALIZED (
    SELECT c.*, rt.redemption_transaction_id, rt.status AS redemption_status,
           rt.completed_at AS redemption_completed_at, l.link_count,
           r.transaction_receipt_id, r.discount_minor AS receipt_discount,
           r.total_minor AS receipt_total, r.currency_code AS receipt_currency,
           r.subtotal_minor AS receipt_subtotal, r.tax_minor AS receipt_tax
      FROM candidates c
      CROSS JOIN LATERAL (
          SELECT count(*) AS link_count, min(x.redemption_transaction_id) AS redemption_id
            FROM commerce_transaction_redemptions x
           WHERE x.commerce_transaction_id = c.commerce_transaction_id AND NOT x.is_deleted
      ) l
      LEFT JOIN redemption_transaction rt ON l.link_count = 1
        AND rt.redemption_transaction_id = l.redemption_id
        AND rt.organization_id = c.organization_id AND rt.subscription_id = c.owned_subscription_id
      LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id = c.commerce_transaction_id
        AND r.source_transaction_id = c.commerce_transaction_id AND r.receipt_kind = 'COUNTER_REDEMPTION'
        AND r.organization_id = c.organization_id AND r.customer_user_id = c.customer_user_id
), evidence AS MATERIALIZED (
    SELECT l.*, CASE
        WHEN l.status <> 'COMPLETED' OR l.completed_at IS NULL THEN 'NOT_FINALIZED'
        WHEN l.owned_subscription_id IS NULL THEN 'MISSING_OWNED_SUBSCRIPTION'
        WHEN l.link_count > 1 THEN 'AMBIGUOUS_REDEMPTION_LINK'
        WHEN l.redemption_transaction_id IS NULL OR l.redemption_status IS DISTINCT FROM 'SUCCESS'
          OR l.redemption_completed_at IS NULL THEN 'MISSING_REDEMPTION_LINK'
        WHEN EXISTS (
          SELECT 1 FROM commerce_transaction_redemptions x
          JOIN commerce_transactions other ON other.commerce_transaction_id = x.commerce_transaction_id
          WHERE x.redemption_transaction_id = l.redemption_transaction_id
            AND other.commerce_transaction_id <> l.commerce_transaction_id
            AND other.status = 'COMPLETED'
        ) THEN 'AMBIGUOUS_REDEMPTION_LINK'
        WHEN l.transaction_receipt_id IS NULL OR l.adjustment_total_minor IS NULL
          OR l.currency_code IS NULL OR l.total_minor IS NULL OR l.subtotal_minor IS NULL OR l.tax_total_minor IS NULL
          OR l.receipt_discount IS DISTINCT FROM l.adjustment_total_minor
          OR l.receipt_currency IS DISTINCT FROM l.currency_code OR l.receipt_total IS DISTINCT FROM l.total_minor
          OR l.receipt_subtotal IS DISTINCT FROM l.subtotal_minor OR l.receipt_tax IS DISTINCT FROM l.tax_total_minor
          OR l.adjustment_total_minor > l.subtotal_minor
          OR l.subtotal_minor::numeric - l.adjustment_total_minor + l.tax_total_minor <> l.total_minor
          THEN 'MISSING_FINALIZED_DISCOUNT'
        WHEN EXISTS (
          SELECT 1 FROM commerce_counter_timeout_recoveries tr
           WHERE tr.commerce_transaction_id = l.commerce_transaction_id AND tr.late_capture_seen
        ) OR EXISTS (
          SELECT 1 FROM poynt_collect_financial_exceptions e
           WHERE e.commerce_transaction_id = l.commerce_transaction_id
             AND e.case_status IN ('OPEN', 'UNDER_REVIEW')
             AND e.provider_outcome IN ('CAPTURED', 'UNRESOLVED')
        ) OR EXISTS (
          SELECT 1 FROM commerce_provider_payment_attempts a
           WHERE a.commerce_transaction_id = l.commerce_transaction_id
             AND a.provider_status IN ('PENDING', 'DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
             AND NOT EXISTS (
               SELECT 1 FROM commerce_counter_timeout_recoveries tr
                WHERE tr.commerce_transaction_id = l.commerce_transaction_id AND tr.action = 'CASH'
                  AND tr.terminal_payment_attempt_id = a.commerce_provider_payment_attempt_id
                  AND tr.provider_reference_id = a.provider_reference_id
                  AND tr.confirmed_no_success AND NOT tr.late_capture_seen
             )
        ) THEN 'PAYMENT_RECONCILIATION_REQUIRED'
        WHEN (l.total_minor = 0 AND nullif(btrim(l.provider_transaction_id), '') IS NOT NULL)
          OR NOT EXISTS (
          SELECT 1 FROM commerce_provider_payment_attempts a
           WHERE a.commerce_transaction_id = l.commerce_transaction_id AND a.provider_status = 'SUCCEEDED'
          HAVING count(*) = CASE WHEN l.total_minor = 0 THEN 0 ELSE 1 END
            AND count(*) FILTER (
              WHERE a.amount_minor = l.total_minor AND a.currency_code = l.currency_code
                AND nullif(btrim(a.provider_transaction_id), '') IS NOT NULL
                AND a.provider_transaction_id = l.provider_transaction_id
            ) = CASE WHEN l.total_minor = 0 THEN 0 ELSE 1 END
        ) THEN 'MISSING_OR_AMBIGUOUS_PAYMENT'
    END AS source_gap
    FROM linked l
), items AS MATERIALIZED (
    SELECT e.commerce_transaction_id, i.redemption_transaction_item_id, i.item_type,
           coalesce(i.benefit_id, i.offer_id) AS source_id, i.status,
           CASE WHEN i.item_type = 'BENEFIT' THEN bs.status_code ELSE o.status END AS consumption_status,
           rr.action_code, rr.redemption_resolution_id,
           coalesce(rr.action_code IN ('RESTORE_ONLY', 'REFUND_AND_RESTORE')
             AND rr.action_status = 'COMPLETED' AND rr.completed_at IS NOT NULL
             AND (CASE WHEN i.item_type = 'BENEFIT' THEN b.quantity ELSE o.quantity END) = i.quantity
             AND (rr.action_code = 'RESTORE_ONLY' OR (
               pr.execution_status = 'SUCCEEDED' AND pr.executed_at IS NOT NULL
               AND nullif(btrim(pr.provider_refund_reference), '') IS NOT NULL
               AND pr.organization_id = e.organization_id
               AND pr.commerce_transaction_id = e.commerce_transaction_id AND pr.currency_code = e.currency_code
               AND pr.original_provider_transaction_reference = e.provider_transaction_id
               AND pr.captured_amount_minor = e.total_minor AND pr.refund_amount_minor = e.total_minor
               AND rr.commerce_transaction_id = e.commerce_transaction_id
             )), false) AS verified_restore
      FROM evidence e
      JOIN redemption_transaction_item i ON i.redemption_transaction_id = e.redemption_transaction_id
      LEFT JOIN redemptions b ON b.redemption_id = i.redemption_id AND b.subscription_id = e.owned_subscription_id
        AND b.benefit_id = i.benefit_id
      LEFT JOIN entity_status be ON be.entity_status_id = b.redemption_status_id
      LEFT JOIN statuses bs ON bs.status_id = be.status_id
      LEFT JOIN offer_redemptions o ON o.offer_redemption_id = i.offer_redemption_id
        AND o.redemption_transaction_item_id = i.redemption_transaction_item_id
        AND o.redemption_transaction_id = e.redemption_transaction_id
        AND o.subscription_id = e.owned_subscription_id AND o.organization_id = e.organization_id AND o.offer_id = i.offer_id
      LEFT JOIN redemption_resolutions rr ON rr.redemption_transaction_item_id = i.redemption_transaction_item_id
        AND rr.redemption_transaction_id = e.redemption_transaction_id
        AND rr.organization_id = e.organization_id AND rr.subscription_id = e.owned_subscription_id
      LEFT JOIN payment_refunds pr ON pr.payment_refund_id = rr.payment_refund_id
     WHERE e.source_gap IS NULL
), item_evidence AS (
    SELECT commerce_transaction_id, count(*) AS item_count,
           count(*) FILTER (WHERE verified_restore AND consumption_status = 'REVERSED') AS restored_count,
           bool_or(status <> 'SUCCESS' OR consumption_status IS NULL
             OR (verified_restore AND consumption_status IS DISTINCT FROM 'REVERSED')
             OR (NOT verified_restore AND consumption_status IS DISTINCT FROM 'SUCCESS')
             OR (action_code IN ('RESTORE_ONLY', 'REFUND_AND_RESTORE') AND NOT verified_restore)) AS ambiguous
      FROM items GROUP BY commerce_transaction_id
), item_keys AS (
    -- 098 uniquely indexes benefit/offer IDs within a basket. Resolve the
    -- persisted source key to exactly one item before aggregating money.
    SELECT commerce_transaction_id, item_type, source_id,
           min(redemption_transaction_item_id) AS redemption_transaction_item_id
      FROM items
     GROUP BY commerce_transaction_id, item_type, source_id
    HAVING count(*) = 1
), allocation AS (
    SELECT e.commerce_transaction_id,
           coalesce(sum(a.applied_amount_minor), 0) AS original,
           coalesce(sum(a.applied_amount_minor) FILTER (WHERE i.verified_restore), 0) AS reversed,
           count(DISTINCT i.redemption_transaction_item_id) AS allocated_items,
           count(DISTINCT i.redemption_transaction_item_id) FILTER (WHERE i.verified_restore) AS allocated_restores,
           bool_or(a.status IS DISTINCT FROM 'APPLIED' OR a.applied_amount_minor IS NULL
             OR (a.currency_code IS NOT NULL AND a.currency_code <> e.currency_code)
             OR i.redemption_transaction_item_id IS NULL) FILTER (WHERE a.commerce_transaction_adjustment_id IS NOT NULL) AS ambiguous
      FROM evidence e
      LEFT JOIN commerce_transaction_adjustments a ON a.commerce_transaction_id = e.commerce_transaction_id AND NOT a.is_deleted
      LEFT JOIN item_keys k ON k.commerce_transaction_id = e.commerce_transaction_id
        AND a.source_type = k.item_type AND a.source_id = k.source_id
      LEFT JOIN items i ON i.commerce_transaction_id = k.commerce_transaction_id
        AND i.redemption_transaction_item_id = k.redemption_transaction_item_id
     WHERE e.source_gap IS NULL
     GROUP BY e.commerce_transaction_id
), classified AS (
    SELECT e.*, a.reversed, it.restored_count, it.item_count,
           CASE
             WHEN e.source_gap IS NOT NULL THEN e.source_gap
             WHEN it.item_count IS NULL OR a.ambiguous OR a.original IS DISTINCT FROM e.receipt_discount
               THEN 'MISSING_APPLIED_DISCOUNT_EVIDENCE'
             WHEN it.ambiguous OR (it.restored_count > 0 AND it.restored_count < it.item_count
                 AND (a.allocated_restores <> it.restored_count OR a.allocated_items <> it.item_count))
               THEN 'AMBIGUOUS_ITEM_REVERSAL'
             WHEN EXISTS (
               SELECT 1 FROM payment_refunds pr
                WHERE pr.commerce_transaction_id = e.commerce_transaction_id
                  AND pr.execution_status IN ('SUCCEEDED', 'PENDING', 'UNKNOWN_REQUIRES_RECONCILIATION',
                                              'UNSUPPORTED_REQUIRES_MANUAL')
                  AND NOT EXISTS (
                    SELECT 1 FROM redemption_resolutions rr
                      JOIN items i ON i.redemption_resolution_id = rr.redemption_resolution_id
                                 AND i.commerce_transaction_id = e.commerce_transaction_id
                     WHERE rr.payment_refund_id = pr.payment_refund_id
                       AND rr.commerce_transaction_id = e.commerce_transaction_id
                       AND pr.organization_id = e.organization_id AND pr.currency_code = e.currency_code
                       AND pr.captured_amount_minor = e.total_minor
                       AND pr.original_provider_transaction_reference = e.provider_transaction_id
                       AND (pr.execution_status <> 'SUCCEEDED' OR (
                         pr.executed_at IS NOT NULL AND nullif(btrim(pr.provider_refund_reference), '') IS NOT NULL
                       ))
                       AND (rr.action_code = 'REFUND_ONLY' OR i.verified_restore)
                  )
             ) THEN 'AMBIGUOUS_REFUND'
             ELSE 'VERIFIED'
           END AS verification
      FROM evidence e
      LEFT JOIN item_evidence it USING (commerce_transaction_id)
      LEFT JOIN allocation a USING (commerce_transaction_id)
), net AS (
    SELECT c.*, CASE WHEN c.verification = 'VERIFIED' THEN
                      CASE WHEN c.restored_count = c.item_count THEN c.receipt_discount ELSE c.reversed::bigint END
                    END AS verified_reversal
      FROM classified c
)
SELECT n.commerce_transaction_id, n.owned_subscription_id, n.redemption_transaction_id,
       n.currency_code, CASE WHEN n.source_gap IS NULL AND n.verification <> 'MISSING_APPLIED_DISCOUNT_EVIDENCE'
                            THEN n.receipt_discount END,
       n.verified_reversal, n.receipt_discount - n.verified_reversal,
       n.verification::varchar, n.completed_at::text
  FROM net n;
$fn$;

CREATE FUNCTION "${schemaName}".get_customer_subscription_actual_savings(
    p_customer_user_id varchar, p_organization_id varchar, p_subscription_id varchar
)
RETURNS TABLE (
    subscription_id varchar, currency_code varchar, net_savings_minor bigint,
    verified_net_savings_minor bigint, verified_redemption_count bigint,
    unverified_redemption_count bigint, unattributed_history_count bigint, coverage_state varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $fn$
WITH owned AS MATERIALIZED (
    SELECT s.subscription_id FROM subscriptions s
    JOIN organization_user ou ON ou.organization_user_id = s.organization_user_id
    WHERE s.subscription_id = p_subscription_id AND NOT s.is_deleted AND NOT ou.is_deleted
      AND ou.organization_id = p_organization_id AND ou.user_id = p_customer_user_id
), orders AS MATERIALIZED (
    SELECT c.commerce_transaction_id FROM owned s
    JOIN commerce_transactions c ON c.subscription_id = s.subscription_id
    WHERE c.organization_id = p_organization_id AND c.customer_user_id = p_customer_user_id
      AND c.status = 'COMPLETED' AND c.source_channel = 'COUNTER_REDEMPTION' AND NOT c.is_deleted
), savings AS MATERIALIZED (
    SELECT a.* FROM get_customer_transaction_actual_savings(
        p_customer_user_id, ARRAY(SELECT commerce_transaction_id FROM orders)
    ) a
), unassigned_orders AS (
    -- Count completed orders omitted from this subscription's order set unless
    -- a single successful basket binds them to a different owned subscription.
    -- Completely unattributed orders have no customer boundary within the org.
    SELECT count(*) AS gap_count
      FROM owned s
      JOIN commerce_transactions c ON c.organization_id = p_organization_id
       AND c.status = 'COMPLETED'
       AND (c.source_channel = 'COUNTER_REDEMPTION' OR EXISTS (
           SELECT 1 FROM commerce_transaction_redemptions x
            WHERE x.commerce_transaction_id = c.commerce_transaction_id AND NOT x.is_deleted
       ))
      AND (
          c.customer_user_id = p_customer_user_id
          OR c.subscription_id = s.subscription_id
          OR EXISTS (
              SELECT 1
              FROM commerce_transaction_redemptions x
              JOIN redemption_transaction rt
                ON rt.redemption_transaction_id = x.redemption_transaction_id
              WHERE x.commerce_transaction_id = c.commerce_transaction_id
                AND NOT x.is_deleted
                AND rt.organization_id = p_organization_id
                AND rt.subscription_id = s.subscription_id
          )
      )
     WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.commerce_transaction_id = c.commerce_transaction_id)
       AND NOT EXISTS (
            SELECT 1
              FROM commerce_transaction_redemptions x
              JOIN redemption_transaction rt ON rt.redemption_transaction_id = x.redemption_transaction_id
              JOIN subscriptions other ON other.subscription_id = rt.subscription_id
              JOIN organization_user ou ON ou.organization_user_id = other.organization_user_id
             WHERE x.commerce_transaction_id = c.commerce_transaction_id AND NOT x.is_deleted
               AND rt.organization_id = c.organization_id AND rt.status = 'SUCCESS'
               AND rt.completed_at IS NOT NULL AND rt.subscription_id <> s.subscription_id
               AND ou.organization_id = c.organization_id
               AND (c.customer_user_id IS NULL OR c.customer_user_id = ou.user_id)
               AND (c.subscription_id IS NULL OR c.subscription_id = rt.subscription_id)
               AND NOT EXISTS (
                   SELECT 1 FROM commerce_transaction_redemptions y
                    WHERE y.commerce_transaction_id = c.commerce_transaction_id AND NOT y.is_deleted
                      AND y.commerce_transaction_redemption_id <> x.commerce_transaction_redemption_id
               )
       )
), gaps AS (
    SELECT s.subscription_id,
        (SELECT count(*) FROM redemption_transaction rt
          WHERE rt.organization_id = p_organization_id AND rt.subscription_id = s.subscription_id AND rt.status = 'SUCCESS'
            AND NOT EXISTS (
              SELECT 1 FROM savings a
               WHERE a.subscription_id = s.subscription_id AND a.redemption_transaction_id = rt.redemption_transaction_id
              ))
        + (SELECT count(*) FROM redemptions b
             LEFT JOIN entity_status es ON es.entity_status_id = b.redemption_status_id
             LEFT JOIN statuses bs ON bs.status_id = es.status_id
            WHERE b.subscription_id = s.subscription_id
              AND (bs.status_code IS NULL OR bs.status_code IN ('SUCCESS', 'REVERSED'))
              AND NOT EXISTS (
                SELECT 1 FROM redemption_transaction_item i
                 JOIN redemption_transaction rt ON rt.redemption_transaction_id = i.redemption_transaction_id
                 WHERE i.redemption_id = b.redemption_id AND rt.subscription_id = s.subscription_id
                   AND rt.organization_id = p_organization_id AND rt.status = 'SUCCESS'
              ))
        + (SELECT count(*) FROM offer_redemptions o
            WHERE o.subscription_id = s.subscription_id AND o.organization_id = p_organization_id
              AND o.status IN ('SUCCESS', 'REVERSED')
              AND NOT EXISTS (
                SELECT 1 FROM redemption_transaction_item i
                 JOIN redemption_transaction rt ON rt.redemption_transaction_id = i.redemption_transaction_id
                 WHERE i.redemption_transaction_item_id = o.redemption_transaction_item_id
                   AND i.offer_redemption_id = o.offer_redemption_id AND i.status = 'SUCCESS'
                   AND rt.redemption_transaction_id = o.redemption_transaction_id
                   AND rt.subscription_id = s.subscription_id AND rt.organization_id = p_organization_id
                   AND rt.status = 'SUCCESS'
              ))
        + (SELECT gap_count FROM unassigned_orders) AS unattributed,
        (SELECT count(*) FROM savings a WHERE a.currency_code IS NULL OR a.verification_state IN (
            'NOT_FINALIZED', 'MISSING_OWNED_SUBSCRIPTION', 'MISSING_REDEMPTION_LINK',
            'AMBIGUOUS_REDEMPTION_LINK', 'MISSING_FINALIZED_DISCOUNT'
        )) AS unattributed_currency
    FROM owned s
), totals AS (
    SELECT a.currency_code, sum(a.net_savings_minor) AS verified_net,
           count(*) FILTER (WHERE a.verification_state = 'VERIFIED') AS verified_count,
           count(*) FILTER (WHERE a.verification_state <> 'VERIFIED') AS unverified_count
    FROM savings a GROUP BY a.currency_code
)
SELECT g.subscription_id, t.currency_code,
       CASE WHEN t.unverified_count = 0 AND g.unattributed = 0 AND g.unattributed_currency = 0
                 AND t.verified_net <= 9223372036854775807 THEN t.verified_net::bigint END,
       CASE WHEN t.verified_net <= 9223372036854775807 THEN t.verified_net::bigint END,
       coalesce(t.verified_count, 0), coalesce(t.unverified_count, 0), g.unattributed,
       (CASE
         WHEN t.verified_net > 9223372036854775807 THEN 'TOTAL_OUT_OF_RANGE'
         WHEN t.verified_count IS NULL AND g.unattributed = 0 THEN 'NO_REDEMPTION_HISTORY'
         WHEN coalesce(t.verified_count, 0) = 0 THEN 'NO_VERIFIED_DATA'
         WHEN t.unverified_count > 0 OR g.unattributed > 0 OR g.unattributed_currency > 0 THEN 'PARTIAL'
         ELSE 'COMPLETE'
       END)::varchar
  FROM gaps g LEFT JOIN totals t ON true
 ORDER BY t.currency_code NULLS LAST;
$fn$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_transaction_actual_savings(varchar, varchar[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_subscription_actual_savings(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_transaction_actual_savings(varchar, varchar[]) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_subscription_actual_savings(varchar, varchar, varchar) TO "${appRole}";

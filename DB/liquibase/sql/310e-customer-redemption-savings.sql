-- Forward replacement of canonical savings functions.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_transaction_actual_savings(
    p_customer_user_id varchar, p_commerce_ids varchar[]
)
RETURNS TABLE (
    transaction_id varchar, subscription_id varchar, redemption_transaction_id varchar,
    currency_code varchar, original_discount_minor bigint, reversal_minor bigint,
    net_savings_minor bigint, verification_state varchar, completed_at text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $fn$
WITH candidates AS MATERIALIZED (
    SELECT commerce_record.*, subscription_record.subscription_id AS owned_subscription_id
      FROM commerce_transactions commerce_record
      LEFT JOIN subscriptions subscription_record ON subscription_record.subscription_id = commerce_record.subscription_id AND NOT subscription_record.is_deleted
        AND EXISTS (
          SELECT 1 FROM organization_user organization_user_record
           WHERE organization_user_record.organization_user_id = subscription_record.organization_user_id
             AND organization_user_record.organization_id = commerce_record.organization_id AND organization_user_record.user_id = p_customer_user_id
             AND NOT organization_user_record.is_deleted
        )
     WHERE commerce_record.commerce_transaction_id = ANY (p_commerce_ids)
       AND commerce_record.customer_user_id = p_customer_user_id
       AND NOT commerce_record.is_deleted
), linked AS MATERIALIZED (
    SELECT commerce_record.*, redemption_record.redemption_transaction_id, redemption_record.status AS redemption_status,
           redemption_record.completed_at AS redemption_completed_at, linked_record.link_count,
           receipt_record.transaction_receipt_id, receipt_record.discount_minor AS receipt_discount,
           receipt_record.total_minor AS receipt_total, receipt_record.currency_code AS receipt_currency,
           receipt_record.subtotal_minor AS receipt_subtotal, receipt_record.tax_minor AS receipt_tax
      FROM candidates commerce_record
      CROSS JOIN LATERAL (
          SELECT count(*) AS link_count, min(redemption_link.redemption_transaction_id) AS redemption_id
            FROM commerce_transaction_redemptions redemption_link
           WHERE redemption_link.commerce_transaction_id = commerce_record.commerce_transaction_id AND NOT redemption_link.is_deleted
      ) linked_record
      LEFT JOIN redemption_transaction redemption_record ON linked_record.link_count = 1
        AND redemption_record.redemption_transaction_id = linked_record.redemption_id
        AND redemption_record.organization_id = commerce_record.organization_id AND redemption_record.subscription_id = commerce_record.owned_subscription_id
      -- The canonical receipt issuer uses this receipt kind for every linked
      -- redemption, including fulfillment. uq_transaction_receipts_commerce_source
      -- guarantees at most one receipt per Commerce transaction.
      LEFT JOIN transaction_receipts receipt_record ON receipt_record.source_commerce_transaction_id = commerce_record.commerce_transaction_id
        AND receipt_record.source_transaction_id = commerce_record.commerce_transaction_id AND receipt_record.receipt_kind = 'COUNTER_REDEMPTION'
        AND receipt_record.organization_id = commerce_record.organization_id AND receipt_record.customer_user_id = commerce_record.customer_user_id
), evidence AS MATERIALIZED (
    SELECT linked_record.*, CASE
        WHEN linked_record.status <> 'COMPLETED' OR linked_record.completed_at IS NULL THEN 'NOT_FINALIZED'
        WHEN linked_record.owned_subscription_id IS NULL THEN 'MISSING_OWNED_SUBSCRIPTION'
        WHEN linked_record.link_count > 1 THEN 'AMBIGUOUS_REDEMPTION_LINK'
        WHEN linked_record.redemption_transaction_id IS NULL OR linked_record.redemption_status IS DISTINCT FROM 'SUCCESS'
          OR linked_record.redemption_completed_at IS NULL THEN 'MISSING_REDEMPTION_LINK'
        WHEN EXISTS (
          SELECT 1 FROM fulfillments fulfillment
          LEFT JOIN statuses fulfillment_status ON fulfillment_status.status_id = fulfillment.fulfillment_status_id
          WHERE (fulfillment.commerce_transaction_id = linked_record.commerce_transaction_id
                 OR fulfillment.redemption_transaction_id = linked_record.redemption_transaction_id)
            AND (fulfillment.commerce_transaction_id IS DISTINCT FROM linked_record.commerce_transaction_id
              OR fulfillment.redemption_transaction_id IS DISTINCT FROM linked_record.redemption_transaction_id
              OR fulfillment.organization_id IS DISTINCT FROM linked_record.organization_id
              OR fulfillment.store_id IS DISTINCT FROM linked_record.store_id
              OR fulfillment.customer_user_id IS DISTINCT FROM linked_record.customer_user_id
              OR fulfillment_status.status_code IS DISTINCT FROM 'FULFILLED'
              OR fulfillment.fulfilled_at IS NULL OR fulfillment.actual_collection_at IS NULL)
        ) THEN 'MISSING_COLLECTION_EVIDENCE'
        WHEN EXISTS (
          SELECT 1 FROM commerce_transaction_redemptions redemption_link
          JOIN commerce_transactions other_commerce ON other_commerce.commerce_transaction_id = redemption_link.commerce_transaction_id
          WHERE redemption_link.redemption_transaction_id = linked_record.redemption_transaction_id
            AND other_commerce.commerce_transaction_id <> linked_record.commerce_transaction_id
            AND other_commerce.status = 'COMPLETED'
        ) THEN 'AMBIGUOUS_REDEMPTION_LINK'
        WHEN linked_record.transaction_receipt_id IS NULL OR linked_record.adjustment_total_minor IS NULL
          OR linked_record.currency_code IS NULL OR linked_record.total_minor IS NULL OR linked_record.subtotal_minor IS NULL OR linked_record.tax_total_minor IS NULL
          OR linked_record.receipt_discount IS DISTINCT FROM linked_record.adjustment_total_minor
          OR linked_record.receipt_currency IS DISTINCT FROM linked_record.currency_code OR linked_record.receipt_total IS DISTINCT FROM linked_record.total_minor
          OR linked_record.receipt_subtotal IS DISTINCT FROM linked_record.subtotal_minor OR linked_record.receipt_tax IS DISTINCT FROM linked_record.tax_total_minor
          OR linked_record.subtotal_minor < 0 OR linked_record.adjustment_total_minor < 0
          OR linked_record.tax_total_minor < 0 OR linked_record.total_minor < 0
          OR linked_record.adjustment_total_minor > linked_record.subtotal_minor
          OR linked_record.subtotal_minor::numeric - linked_record.adjustment_total_minor + linked_record.tax_total_minor <> linked_record.total_minor
          THEN 'MISSING_FINALIZED_DISCOUNT'
        WHEN EXISTS (
          SELECT 1 FROM commerce_counter_timeout_recoveries recovery_record
           WHERE recovery_record.commerce_transaction_id = linked_record.commerce_transaction_id AND recovery_record.late_capture_seen
        ) OR EXISTS (
          SELECT 1 FROM poynt_collect_financial_exceptions evidence_record
           WHERE (evidence_record.commerce_transaction_id = linked_record.commerce_transaction_id OR EXISTS (
             SELECT 1 FROM payment_intents payment_intent WHERE payment_intent.commerce_transaction_id = linked_record.commerce_transaction_id
              AND payment_intent.payment_intent_id IN (evidence_record.payment_intent_id, evidence_record.related_payment_intent_id)))
             AND evidence_record.case_status IN ('OPEN', 'UNDER_REVIEW')
             AND evidence_record.provider_outcome IN ('CAPTURED', 'UNRESOLVED')
        ) OR EXISTS (
          SELECT 1 FROM commerce_provider_payment_attempts financial_record
           WHERE financial_record.commerce_transaction_id = linked_record.commerce_transaction_id
             AND financial_record.provider_status IN ('PENDING', 'DISPATCHING', 'DISPATCHED', 'RECEIVED', 'STARTED')
             AND NOT EXISTS (
               SELECT 1 FROM commerce_counter_timeout_recoveries recovery_record
                WHERE recovery_record.commerce_transaction_id = linked_record.commerce_transaction_id AND recovery_record.action = 'CASH'
                  AND recovery_record.terminal_payment_attempt_id = financial_record.commerce_provider_payment_attempt_id
                  AND recovery_record.provider_reference_id = financial_record.provider_reference_id
                  AND recovery_record.confirmed_no_success AND NOT recovery_record.late_capture_seen
             )
        ) OR EXISTS (
          SELECT 1 FROM payment_intents payment_intent
           WHERE payment_intent.commerce_transaction_id = linked_record.commerce_transaction_id
             AND (payment_intent.status IN ('PENDING', 'PROCESSING') OR EXISTS (
               SELECT 1 FROM payment_attempts payment_attempt
                WHERE payment_attempt.payment_intent_id = payment_intent.payment_intent_id
                  AND payment_attempt.status IN ('PENDING', 'PROCESSING')))
        ) THEN 'PAYMENT_RECONCILIATION_REQUIRED'
        WHEN ((linked_record.total_minor = 0 OR EXISTS (
               SELECT 1 FROM fulfillments fulfillment JOIN statuses payment_timing
                 ON payment_timing.status_id = fulfillment.payment_timing_status_id
                WHERE fulfillment.commerce_transaction_id = linked_record.commerce_transaction_id
                  AND payment_timing.status_code = 'PAY_AT_COUNTER'))
              AND EXISTS (SELECT 1 FROM payment_intents payment_intent
                 LEFT JOIN poynt_collect_verified_captures verified_capture
                   ON verified_capture.payment_intent_id = payment_intent.payment_intent_id
                WHERE payment_intent.commerce_transaction_id = linked_record.commerce_transaction_id
                  AND (payment_intent.status = 'SUCCEEDED' OR verified_capture.payment_intent_id IS NOT NULL)))
          OR (linked_record.total_minor = 0 AND nullif(btrim(linked_record.provider_transaction_id), '') IS NOT NULL)
          OR NOT (
          (NOT EXISTS (
            SELECT 1 FROM fulfillments fulfillment JOIN statuses payment_timing
              ON payment_timing.status_id = fulfillment.payment_timing_status_id
             WHERE fulfillment.commerce_transaction_id = linked_record.commerce_transaction_id
               AND payment_timing.status_code = 'PAY_NOW' AND linked_record.total_minor > 0
          ) AND EXISTS (
          SELECT 1 FROM commerce_provider_payment_attempts financial_record
           WHERE financial_record.commerce_transaction_id = linked_record.commerce_transaction_id AND financial_record.provider_status = 'SUCCEEDED'
          HAVING count(*) = CASE WHEN linked_record.total_minor = 0 THEN 0 ELSE 1 END
            AND count(*) FILTER (
              WHERE financial_record.amount_minor = linked_record.total_minor AND financial_record.currency_code = linked_record.currency_code
                AND nullif(btrim(financial_record.provider_transaction_id), '') IS NOT NULL
                AND financial_record.provider_transaction_id = linked_record.provider_transaction_id
            ) = CASE WHEN linked_record.total_minor = 0 THEN 0 ELSE 1 END
        ))
          OR (
            linked_record.total_minor > 0 AND EXISTS (
              SELECT 1 FROM fulfillments fulfillment
              JOIN statuses fulfillment_status ON fulfillment_status.status_id = fulfillment.fulfillment_status_id
              JOIN statuses payment_timing ON payment_timing.status_id = fulfillment.payment_timing_status_id
              JOIN payment_intents payment_intent ON payment_intent.commerce_transaction_id = linked_record.commerce_transaction_id
              JOIN poynt_collect_verified_captures verified_capture ON verified_capture.payment_intent_id = payment_intent.payment_intent_id
              WHERE fulfillment.commerce_transaction_id = linked_record.commerce_transaction_id
                AND fulfillment.redemption_transaction_id = linked_record.redemption_transaction_id
                AND fulfillment.organization_id = linked_record.organization_id AND fulfillment.store_id = linked_record.store_id
                AND fulfillment.customer_user_id = linked_record.customer_user_id
                AND fulfillment_status.status_code = 'FULFILLED' AND fulfillment.fulfilled_at IS NOT NULL
                AND fulfillment.actual_collection_at IS NOT NULL AND payment_timing.status_code = 'PAY_NOW'
                AND payment_intent.organization_id = linked_record.organization_id AND payment_intent.store_id = linked_record.store_id
                AND payment_intent.customer_user_id = linked_record.customer_user_id AND payment_intent.status = 'SUCCEEDED'
                AND payment_intent.fulfillment_checkout IS NOT NULL AND payment_intent.currency_code = linked_record.currency_code
                AND payment_intent.amount * 100 = linked_record.total_minor
                AND verified_capture.organization_id = linked_record.organization_id AND verified_capture.amount_minor = linked_record.total_minor
                AND verified_capture.currency_code = linked_record.currency_code AND verified_capture.provider_transaction_id = linked_record.provider_transaction_id
                AND verified_capture.provider_transaction_id = payment_intent.provider_reference_id
                AND nullif(btrim(verified_capture.provider_transaction_id), '') IS NOT NULL
                AND nullif(btrim(verified_capture.merchant_business_id), '') = payment_intent.fulfillment_checkout->>'paymentBusinessId'
                AND nullif(btrim(verified_capture.merchant_store_id), '') = payment_intent.fulfillment_checkout->>'paymentStoreId'
                AND (SELECT count(*) FROM payment_intents other_intent LEFT JOIN poynt_collect_verified_captures other_capture
                       ON other_capture.payment_intent_id = other_intent.payment_intent_id
                     WHERE other_intent.commerce_transaction_id = linked_record.commerce_transaction_id
                       AND (other_intent.status = 'SUCCEEDED' OR other_capture.payment_intent_id IS NOT NULL)) = 1
                AND (SELECT count(*) FROM payment_attempts payment_attempt
                      WHERE payment_attempt.payment_intent_id = payment_intent.payment_intent_id AND payment_attempt.status = 'SUCCEEDED') = 1
                AND EXISTS (SELECT 1 FROM payment_attempts payment_attempt
                     WHERE payment_attempt.payment_intent_id = payment_intent.payment_intent_id AND payment_attempt.status = 'SUCCEEDED'
                       AND payment_attempt.amount * 100 = linked_record.total_minor AND payment_attempt.currency_code = linked_record.currency_code
                       AND payment_attempt.provider_reference_id = verified_capture.provider_transaction_id)
                AND NOT EXISTS (SELECT 1 FROM commerce_provider_payment_attempts terminal_attempt
                     WHERE terminal_attempt.commerce_transaction_id = linked_record.commerce_transaction_id AND terminal_attempt.provider_status = 'SUCCEEDED'
                       AND (terminal_attempt.payment_channel IS DISTINCT FROM 'LEGACY_PAYMENT_INTENT'
                         OR terminal_attempt.amount_minor IS DISTINCT FROM linked_record.total_minor
                         OR terminal_attempt.currency_code IS DISTINCT FROM linked_record.currency_code
                         OR coalesce(terminal_attempt.provider_transaction_id, terminal_attempt.provider_reference_id)
                           IS DISTINCT FROM linked_record.provider_transaction_id))
                AND (SELECT count(*) FROM commerce_provider_payment_attempts terminal_attempt
                     WHERE terminal_attempt.commerce_transaction_id = linked_record.commerce_transaction_id AND terminal_attempt.provider_status = 'SUCCEEDED') <= 1
            )
          )) THEN 'MISSING_OR_AMBIGUOUS_PAYMENT'
    END AS source_gap
    FROM linked linked_record
), items AS MATERIALIZED (
    SELECT evidence_record.commerce_transaction_id, redemption_item.redemption_transaction_item_id, redemption_item.item_type,
           coalesce(redemption_item.benefit_id, redemption_item.offer_id) AS source_id, redemption_item.status,
           CASE WHEN redemption_item.item_type = 'BENEFIT' THEN benefit_status.status_code ELSE offer_redemption.status END AS consumption_status,
           resolution_record.action_code, resolution_record.redemption_resolution_id,
           coalesce(resolution_record.action_code IN ('RESTORE_ONLY', 'REFUND_AND_RESTORE')
             AND resolution_record.action_status = 'COMPLETED' AND resolution_record.completed_at IS NOT NULL
             AND (CASE WHEN redemption_item.item_type = 'BENEFIT' THEN benefit_redemption.quantity ELSE offer_redemption.quantity END) = redemption_item.quantity
             AND (resolution_record.action_code = 'RESTORE_ONLY' OR (
               refund_record.execution_status = 'SUCCEEDED' AND refund_record.executed_at IS NOT NULL
               AND nullif(btrim(refund_record.provider_refund_reference), '') IS NOT NULL
               AND refund_record.organization_id = evidence_record.organization_id
               AND refund_record.commerce_transaction_id = evidence_record.commerce_transaction_id AND refund_record.currency_code = evidence_record.currency_code
               AND refund_record.original_provider_transaction_reference = evidence_record.provider_transaction_id
               AND refund_record.captured_amount_minor = evidence_record.total_minor AND refund_record.refund_amount_minor = evidence_record.total_minor
               AND resolution_record.commerce_transaction_id = evidence_record.commerce_transaction_id
             )), false) AS verified_restore
      FROM evidence evidence_record
      JOIN redemption_transaction_item redemption_item ON redemption_item.redemption_transaction_id = evidence_record.redemption_transaction_id
      LEFT JOIN redemptions benefit_redemption ON benefit_redemption.redemption_id = redemption_item.redemption_id AND benefit_redemption.subscription_id = evidence_record.owned_subscription_id
        AND benefit_redemption.benefit_id = redemption_item.benefit_id
      LEFT JOIN entity_status benefit_entity_status ON benefit_entity_status.entity_status_id = benefit_redemption.redemption_status_id
      LEFT JOIN statuses benefit_status ON benefit_status.status_id = benefit_entity_status.status_id
      LEFT JOIN offer_redemptions offer_redemption ON offer_redemption.offer_redemption_id = redemption_item.offer_redemption_id
        AND offer_redemption.redemption_transaction_item_id = redemption_item.redemption_transaction_item_id
        AND offer_redemption.redemption_transaction_id = evidence_record.redemption_transaction_id
        AND offer_redemption.subscription_id = evidence_record.owned_subscription_id AND offer_redemption.organization_id = evidence_record.organization_id AND offer_redemption.offer_id = redemption_item.offer_id
      LEFT JOIN redemption_resolutions resolution_record ON resolution_record.redemption_transaction_item_id = redemption_item.redemption_transaction_item_id
        AND resolution_record.redemption_transaction_id = evidence_record.redemption_transaction_id
        AND resolution_record.organization_id = evidence_record.organization_id AND resolution_record.subscription_id = evidence_record.owned_subscription_id
      LEFT JOIN payment_refunds refund_record ON refund_record.payment_refund_id = resolution_record.payment_refund_id
     WHERE evidence_record.source_gap IS NULL
), item_evidence AS (
    SELECT commerce_transaction_id, count(*) AS item_count,
           count(*) FILTER (WHERE verified_restore AND consumption_status = 'REVERSED') AS restored_count,
           bool_or(status <> 'SUCCESS' OR consumption_status IS NULL
             OR (verified_restore AND consumption_status IS DISTINCT FROM 'REVERSED')
             OR (NOT verified_restore AND consumption_status IS DISTINCT FROM 'SUCCESS')
             OR (action_code IN ('RESTORE_ONLY', 'REFUND_AND_RESTORE') AND NOT verified_restore)) AS ambiguous
      FROM items GROUP BY commerce_transaction_id
), item_keys AS (
    SELECT commerce_transaction_id, item_type, source_id,
           min(redemption_transaction_item_id) AS redemption_transaction_item_id
      FROM items
     GROUP BY commerce_transaction_id, item_type, source_id
    HAVING count(*) = 1
), allocation AS (
    SELECT evidence_record.commerce_transaction_id,
           coalesce(sum(financial_record.applied_amount_minor), 0) AS original,
           coalesce(sum(financial_record.applied_amount_minor) FILTER (WHERE redemption_item.verified_restore), 0) AS reversed,
           count(DISTINCT redemption_item.redemption_transaction_item_id) AS allocated_items,
           count(DISTINCT redemption_item.redemption_transaction_item_id) FILTER (WHERE redemption_item.verified_restore) AS allocated_restores,
           bool_or(financial_record.status IS DISTINCT FROM 'APPLIED' OR financial_record.applied_amount_minor IS NULL
             OR (financial_record.currency_code IS NOT NULL AND financial_record.currency_code <> evidence_record.currency_code)
             OR redemption_item.redemption_transaction_item_id IS NULL) FILTER (WHERE financial_record.commerce_transaction_adjustment_id IS NOT NULL) AS ambiguous
      FROM evidence evidence_record
      LEFT JOIN commerce_transaction_adjustments financial_record ON financial_record.commerce_transaction_id = evidence_record.commerce_transaction_id AND NOT financial_record.is_deleted
      LEFT JOIN item_keys item_key ON item_key.commerce_transaction_id = evidence_record.commerce_transaction_id
        AND financial_record.source_type = item_key.item_type AND financial_record.source_id = item_key.source_id
      LEFT JOIN items redemption_item ON redemption_item.commerce_transaction_id = item_key.commerce_transaction_id
        AND redemption_item.redemption_transaction_item_id = item_key.redemption_transaction_item_id
     WHERE evidence_record.source_gap IS NULL
     GROUP BY evidence_record.commerce_transaction_id
), classified AS (
    SELECT evidence_record.*, financial_record.reversed, item_summary.restored_count, item_summary.item_count,
           CASE
             WHEN evidence_record.source_gap IS NOT NULL THEN evidence_record.source_gap
             WHEN item_summary.item_count IS NULL OR financial_record.ambiguous OR financial_record.original IS DISTINCT FROM evidence_record.receipt_discount
               THEN 'MISSING_APPLIED_DISCOUNT_EVIDENCE'
             WHEN item_summary.ambiguous OR (item_summary.restored_count > 0 AND item_summary.restored_count < item_summary.item_count
                 AND (financial_record.allocated_restores <> item_summary.restored_count OR financial_record.allocated_items <> item_summary.item_count))
               THEN 'AMBIGUOUS_ITEM_REVERSAL'
             WHEN EXISTS (
               SELECT 1 FROM payment_refunds refund_record
                WHERE (refund_record.commerce_transaction_id = evidence_record.commerce_transaction_id OR EXISTS (
                    SELECT 1 FROM payment_intents payment_intent
                     WHERE payment_intent.commerce_transaction_id = evidence_record.commerce_transaction_id
                       AND payment_intent.payment_intent_id = refund_record.payment_intent_id))
                  AND (refund_record.approval_status <> 'REJECTED' OR refund_record.execution_status = 'SUCCEEDED')
                  AND refund_record.execution_status IN ('NOT_EXECUTED', 'READY', 'SUCCEEDED', 'PENDING',
                                              'UNKNOWN_REQUIRES_RECONCILIATION', 'UNSUPPORTED_REQUIRES_MANUAL')
                  AND NOT EXISTS (
                    SELECT 1 FROM redemption_resolutions resolution_record
                      JOIN items redemption_item ON redemption_item.redemption_resolution_id = resolution_record.redemption_resolution_id
                                 AND redemption_item.commerce_transaction_id = evidence_record.commerce_transaction_id
                     WHERE resolution_record.payment_refund_id = refund_record.payment_refund_id
                       AND resolution_record.commerce_transaction_id = evidence_record.commerce_transaction_id
                       AND refund_record.organization_id = evidence_record.organization_id AND refund_record.currency_code = evidence_record.currency_code
                       AND refund_record.captured_amount_minor = evidence_record.total_minor
                       AND refund_record.original_provider_transaction_reference = evidence_record.provider_transaction_id
                       AND refund_record.execution_status = 'SUCCEEDED'
                       AND refund_record.executed_at IS NOT NULL AND nullif(btrim(refund_record.provider_refund_reference), '') IS NOT NULL
                       AND resolution_record.action_status = 'COMPLETED' AND resolution_record.completed_at IS NOT NULL
                       AND (resolution_record.action_code = 'REFUND_ONLY' OR redemption_item.verified_restore)
                  )
             ) THEN 'AMBIGUOUS_REFUND'
             ELSE 'VERIFIED'
           END AS verification
      FROM evidence evidence_record
      LEFT JOIN item_evidence item_summary USING (commerce_transaction_id)
      LEFT JOIN allocation financial_record USING (commerce_transaction_id)
), net AS (
    SELECT commerce_record.*, CASE WHEN commerce_record.verification = 'VERIFIED' THEN
                      CASE WHEN commerce_record.restored_count = commerce_record.item_count THEN commerce_record.receipt_discount ELSE commerce_record.reversed::bigint END
                    END AS verified_reversal
      FROM classified commerce_record
)
SELECT net_record.commerce_transaction_id, net_record.owned_subscription_id, net_record.redemption_transaction_id,
       net_record.currency_code, CASE WHEN net_record.source_gap IS NULL AND net_record.verification <> 'MISSING_APPLIED_DISCOUNT_EVIDENCE'
                            THEN net_record.receipt_discount END,
       net_record.verified_reversal, net_record.receipt_discount - net_record.verified_reversal,
       net_record.verification::varchar, net_record.completed_at::text
  FROM net net_record;
$fn$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_subscription_actual_savings(
    p_customer_user_id varchar, p_organization_id varchar, p_subscription_id varchar
)
RETURNS TABLE (
    subscription_id varchar, currency_code varchar, net_savings_minor bigint,
    verified_net_savings_minor bigint, verified_redemption_count bigint,
    unverified_redemption_count bigint, unattributed_history_count bigint, coverage_state varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $fn$
WITH owned AS MATERIALIZED (
    SELECT subscription_record.subscription_id FROM subscriptions subscription_record
    JOIN organization_user organization_user_record ON organization_user_record.organization_user_id = subscription_record.organization_user_id
    WHERE subscription_record.subscription_id = p_subscription_id AND NOT subscription_record.is_deleted AND NOT organization_user_record.is_deleted
      AND organization_user_record.organization_id = p_organization_id AND organization_user_record.user_id = p_customer_user_id
), orders AS MATERIALIZED (
    SELECT commerce_record.commerce_transaction_id FROM owned subscription_record
    JOIN commerce_transactions commerce_record ON commerce_record.subscription_id = subscription_record.subscription_id
    WHERE commerce_record.organization_id = p_organization_id AND commerce_record.customer_user_id = p_customer_user_id
      AND commerce_record.status = 'COMPLETED' AND NOT commerce_record.is_deleted
      AND (EXISTS (SELECT 1 FROM commerce_transaction_redemptions redemption_link
                    WHERE redemption_link.commerce_transaction_id = commerce_record.commerce_transaction_id AND NOT redemption_link.is_deleted)
           OR EXISTS (SELECT 1 FROM fulfillments fulfillment WHERE fulfillment.commerce_transaction_id = commerce_record.commerce_transaction_id)
           OR EXISTS (SELECT 1 FROM transaction_receipts receipt WHERE receipt.source_commerce_transaction_id = commerce_record.commerce_transaction_id AND receipt.receipt_kind = 'COUNTER_REDEMPTION'))
), savings AS MATERIALIZED (
    SELECT financial_record.* FROM get_customer_transaction_actual_savings(
        p_customer_user_id, ARRAY(SELECT commerce_transaction_id FROM orders)
    ) financial_record
), unassigned_orders AS (
    SELECT count(*) AS gap_count
      FROM owned subscription_record
      JOIN commerce_transactions commerce_record ON commerce_record.organization_id = p_organization_id
       AND commerce_record.status = 'COMPLETED'
       AND (EXISTS (SELECT 1 FROM fulfillments fulfillment WHERE fulfillment.commerce_transaction_id = commerce_record.commerce_transaction_id)
         OR EXISTS (SELECT 1 FROM transaction_receipts receipt WHERE receipt.source_commerce_transaction_id = commerce_record.commerce_transaction_id AND receipt.receipt_kind = 'COUNTER_REDEMPTION') OR EXISTS (
           SELECT 1 FROM commerce_transaction_redemptions redemption_link
            WHERE redemption_link.commerce_transaction_id = commerce_record.commerce_transaction_id AND NOT redemption_link.is_deleted
       ))
      AND (
          commerce_record.customer_user_id = p_customer_user_id
          OR commerce_record.subscription_id = subscription_record.subscription_id
          OR EXISTS (
              SELECT 1
              FROM commerce_transaction_redemptions redemption_link
              JOIN redemption_transaction redemption_record
                ON redemption_record.redemption_transaction_id = redemption_link.redemption_transaction_id
              WHERE redemption_link.commerce_transaction_id = commerce_record.commerce_transaction_id
                AND NOT redemption_link.is_deleted
                AND redemption_record.organization_id = p_organization_id
                AND redemption_record.subscription_id = subscription_record.subscription_id
          )
      )
     WHERE NOT EXISTS (SELECT 1 FROM orders owned_order WHERE owned_order.commerce_transaction_id = commerce_record.commerce_transaction_id)
       AND NOT EXISTS (
            SELECT 1
              FROM commerce_transaction_redemptions redemption_link
              JOIN redemption_transaction redemption_record ON redemption_record.redemption_transaction_id = redemption_link.redemption_transaction_id
              JOIN subscriptions other_subscription ON other_subscription.subscription_id = redemption_record.subscription_id
              JOIN organization_user organization_user_record ON organization_user_record.organization_user_id = other_subscription.organization_user_id
             WHERE redemption_link.commerce_transaction_id = commerce_record.commerce_transaction_id AND NOT redemption_link.is_deleted
               AND redemption_record.organization_id = commerce_record.organization_id AND redemption_record.status = 'SUCCESS'
               AND redemption_record.completed_at IS NOT NULL AND redemption_record.subscription_id <> subscription_record.subscription_id
               AND organization_user_record.organization_id = commerce_record.organization_id
               AND (commerce_record.customer_user_id IS NULL OR commerce_record.customer_user_id = organization_user_record.user_id)
               AND (commerce_record.subscription_id IS NULL OR commerce_record.subscription_id = redemption_record.subscription_id)
               AND NOT EXISTS (
                   SELECT 1 FROM commerce_transaction_redemptions other_link
                    WHERE other_link.commerce_transaction_id = commerce_record.commerce_transaction_id AND NOT other_link.is_deleted
                      AND other_link.commerce_transaction_redemption_id <> redemption_link.commerce_transaction_redemption_id
               )
       )
), gaps AS (
    SELECT subscription_record.subscription_id,
        (SELECT count(*) FROM redemption_transaction redemption_record
          WHERE redemption_record.organization_id = p_organization_id AND redemption_record.subscription_id = subscription_record.subscription_id AND redemption_record.status = 'SUCCESS'
            AND NOT EXISTS (
              SELECT 1 FROM savings financial_record
               WHERE financial_record.subscription_id = subscription_record.subscription_id AND financial_record.redemption_transaction_id = redemption_record.redemption_transaction_id
              ))
        + (SELECT count(*) FROM redemptions benefit_redemption
             LEFT JOIN entity_status redemption_entity_status ON redemption_entity_status.entity_status_id = benefit_redemption.redemption_status_id
             LEFT JOIN statuses benefit_status ON benefit_status.status_id = redemption_entity_status.status_id
            WHERE benefit_redemption.subscription_id = subscription_record.subscription_id
              AND (benefit_status.status_code IS NULL OR benefit_status.status_code IN ('SUCCESS', 'REVERSED'))
              AND NOT EXISTS (
                SELECT 1 FROM redemption_transaction_item redemption_item
                 JOIN redemption_transaction redemption_record ON redemption_record.redemption_transaction_id = redemption_item.redemption_transaction_id
                 WHERE redemption_item.redemption_id = benefit_redemption.redemption_id AND redemption_record.subscription_id = subscription_record.subscription_id
                   AND redemption_record.organization_id = p_organization_id AND redemption_record.status = 'SUCCESS'
              ))
        + (SELECT count(*) FROM offer_redemptions offer_redemption
            WHERE offer_redemption.subscription_id = subscription_record.subscription_id AND offer_redemption.organization_id = p_organization_id
              AND offer_redemption.status IN ('SUCCESS', 'REVERSED')
              AND NOT EXISTS (
                SELECT 1 FROM redemption_transaction_item redemption_item
                 JOIN redemption_transaction redemption_record ON redemption_record.redemption_transaction_id = redemption_item.redemption_transaction_id
                 WHERE redemption_item.redemption_transaction_item_id = offer_redemption.redemption_transaction_item_id
                   AND redemption_item.offer_redemption_id = offer_redemption.offer_redemption_id AND redemption_item.status = 'SUCCESS'
                   AND redemption_record.redemption_transaction_id = offer_redemption.redemption_transaction_id
                   AND redemption_record.subscription_id = subscription_record.subscription_id AND redemption_record.organization_id = p_organization_id
                   AND redemption_record.status = 'SUCCESS'
              ))
        + (SELECT gap_count FROM unassigned_orders) AS unattributed,
        (SELECT count(*) FROM savings financial_record WHERE financial_record.currency_code IS NULL OR financial_record.verification_state IN (
            'NOT_FINALIZED', 'MISSING_OWNED_SUBSCRIPTION', 'MISSING_REDEMPTION_LINK',
            'AMBIGUOUS_REDEMPTION_LINK', 'MISSING_FINALIZED_DISCOUNT', 'MISSING_COLLECTION_EVIDENCE'
        )) AS unattributed_currency
    FROM owned subscription_record
), totals AS (
    SELECT financial_record.currency_code,
           sum(financial_record.net_savings_minor) FILTER (WHERE financial_record.verification_state = 'VERIFIED') AS verified_net,
           count(*) FILTER (WHERE financial_record.verification_state = 'VERIFIED') AS verified_count,
           count(*) FILTER (WHERE financial_record.verification_state <> 'VERIFIED') AS unverified_count
    FROM savings financial_record GROUP BY financial_record.currency_code
)
SELECT coverage_gap.subscription_id, total_record.currency_code,
       CASE WHEN total_record.unverified_count = 0 AND coverage_gap.unattributed = 0 AND coverage_gap.unattributed_currency = 0
                 AND total_record.verified_net <= 9223372036854775807 THEN total_record.verified_net::bigint END,
       CASE WHEN total_record.verified_net <= 9223372036854775807 THEN total_record.verified_net::bigint END,
       coalesce(total_record.verified_count, 0), coalesce(total_record.unverified_count, 0), coverage_gap.unattributed,
       (CASE
         WHEN total_record.verified_net > 9223372036854775807 THEN 'TOTAL_OUT_OF_RANGE'
         WHEN total_record.verified_count IS NULL AND coverage_gap.unattributed = 0 THEN 'NO_REDEMPTION_HISTORY'
         WHEN coalesce(total_record.verified_count, 0) = 0 THEN 'NO_VERIFIED_DATA'
         WHEN total_record.unverified_count > 0 OR coverage_gap.unattributed > 0 OR coverage_gap.unattributed_currency > 0 THEN 'PARTIAL'
         ELSE 'COMPLETE'
       END)::varchar
  FROM gaps coverage_gap LEFT JOIN totals total_record ON true
 ORDER BY total_record.currency_code NULLS LAST;
$fn$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_transaction_actual_savings(varchar, varchar[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_subscription_actual_savings(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_transaction_actual_savings(varchar, varchar[]) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_subscription_actual_savings(varchar, varchar, varchar) TO "${appRole}";


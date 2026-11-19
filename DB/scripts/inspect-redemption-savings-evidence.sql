-- Optional DEV diagnostic for the supplied historical order.
-- Run manually using the approved DEV connection. No data is written.
BEGIN READ ONLY;
SET LOCAL search_path TO pg_catalog, memginedev;

WITH target AS (
    SELECT * FROM commerce_transactions
     WHERE commerce_transaction_id = 'CTX_a11a4cc1-283b-41e9-b37d-d131b26b62a6'
)
SELECT c.status, c.source_channel, c.completed_at, c.subtotal_minor, c.adjustment_total_minor,
       c.tax_total_minor, c.total_minor, c.currency_code,
       c.provider_transaction_id IS NOT NULL AS has_capture_reference,
       EXISTS (
           SELECT 1 FROM subscriptions s JOIN organization_user ou USING (organization_user_id)
            WHERE s.subscription_id = c.subscription_id AND ou.user_id = c.customer_user_id
              AND ou.organization_id = c.organization_id AND NOT s.is_deleted AND NOT ou.is_deleted
       ) AS has_exact_owned_subscription,
       r.transaction_receipt_id IS NOT NULL AS receipt_present,
       r.receipt_kind, r.source_transaction_id = c.commerce_transaction_id AS receipt_source_matches,
       r.organization_id = c.organization_id AND r.customer_user_id = c.customer_user_id AS receipt_owner_matches,
       r.subtotal_minor AS receipt_subtotal, r.discount_minor AS receipt_discount,
       r.tax_minor AS receipt_tax, r.total_minor AS receipt_total, r.currency_code AS receipt_currency,
       nullif(btrim(r.receipt_snapshot #>> '{lines,0,description}'), '') AS receipt_description,
       a.verification_state
  FROM target c
  LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id = c.commerce_transaction_id
  LEFT JOIN LATERAL get_customer_transaction_actual_savings(
       c.customer_user_id, ARRAY[c.commerce_transaction_id]
  ) a ON true;

SELECT x.is_deleted AS link_deleted, rt.status AS basket_status, rt.completed_at,
       rt.organization_id = c.organization_id AND rt.subscription_id = c.subscription_id AS basket_owner_matches,
       (SELECT count(*) FROM commerce_transaction_redemptions other
         JOIN commerce_transactions completed USING (commerce_transaction_id)
        WHERE other.redemption_transaction_id = rt.redemption_transaction_id
          AND completed.status = 'COMPLETED') AS completed_order_links
  FROM commerce_transactions c
  JOIN commerce_transaction_redemptions x USING (commerce_transaction_id)
  JOIN redemption_transaction rt USING (redemption_transaction_id)
 WHERE c.commerce_transaction_id = 'CTX_a11a4cc1-283b-41e9-b37d-d131b26b62a6';

SELECT l.description AS recorded_product_description, l.is_deleted AS line_deleted,
       l.source_entity_type, l.price_source, l.quantity, l.line_subtotal_minor, l.currency_code,
       a.status AS adjustment_status, a.applied_amount_minor, a.currency_code AS adjustment_currency,
       a.is_deleted AS adjustment_deleted,
       a.source_type = l.source_entity_type AND a.source_id = l.source_entity_id AS exact_source_matches
  FROM commerce_transaction_lines l
  FULL JOIN commerce_transaction_adjustments a ON a.target_line_id = l.commerce_transaction_line_id
    AND a.commerce_transaction_id = l.commerce_transaction_id
 WHERE coalesce(l.commerce_transaction_id, a.commerce_transaction_id) = 'CTX_a11a4cc1-283b-41e9-b37d-d131b26b62a6';

SELECT payment_channel, provider_status, amount_minor, currency_code
  FROM commerce_provider_payment_attempts
 WHERE commerce_transaction_id = 'CTX_a11a4cc1-283b-41e9-b37d-d131b26b62a6';

SELECT execution_status, refund_amount_minor, currency_code
  FROM payment_refunds
 WHERE commerce_transaction_id = 'CTX_a11a4cc1-283b-41e9-b37d-d131b26b62a6';
ROLLBACK;

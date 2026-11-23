-- Reuse the canonical subscription coverage calculation, including its
-- transaction-level verification and conservative unattributed-history rules.
-- A Commerce transaction has one subscription_id, so it cannot contribute to
-- two owned subscription totals. The canonical verifier rejects ambiguous links.
CREATE FUNCTION "${schemaName}".get_customer_business_actual_savings(
    p_customer_user_id varchar, p_organization_id varchar
)
RETURNS TABLE (
    subscription_id varchar, membership_name varchar, plan_name varchar,
    currency_code varchar, verified_net_savings_minor bigint,
    verified_redemption_count bigint, coverage_state varchar,
    active_plan_currency_code varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}", pg_temp
AS $body$
    WITH active_plan_currency AS (
        SELECT CASE WHEN count(*) FILTER (WHERE currency.currency_id IS NULL OR currency.currency_code IS NULL
                           OR currency.currency_code !~ '^[A-Z]{3}$'
                           OR NOT coalesce(currency.is_active, false)) = 0
                          AND count(DISTINCT currency.currency_code) = 1
                    THEN min(currency.currency_code) END AS currency_code
          FROM membership_products product
          JOIN entity_status product_status ON product_status.entity_status_id = product.product_status_id
          JOIN statuses product_state ON product_state.status_id = product_status.status_id
          JOIN subscription_plans plan ON plan.membership_product_id = product.membership_product_id
          JOIN entity_status plan_status ON plan_status.entity_status_id = plan.subscription_plan_status_id
          JOIN statuses plan_state ON plan_state.status_id = plan_status.status_id
          LEFT JOIN currencies currency ON currency.currency_id = plan.currency_id
         WHERE product.organization_id = p_organization_id AND NOT product.is_deleted AND NOT plan.is_deleted
           AND product_state.status_code = 'ACTIVE' AND plan_state.status_code = 'ACTIVE'
           AND product.effective_date <= CURRENT_DATE AND (product.expiry_date IS NULL OR product.expiry_date >= CURRENT_DATE)
           AND plan.effective_date <= CURRENT_DATE AND (plan.expiry_date IS NULL OR plan.expiry_date >= CURRENT_DATE)
    ), owned_savings AS (
    SELECT subscription.subscription_id,
           coalesce(nullif(product.display_name, ''), product.membership_product_name)::varchar AS membership_name,
           plan.subscription_plan_name AS plan_name,
           savings.currency_code, savings.verified_net_savings_minor,
           savings.verified_redemption_count, savings.coverage_state
      FROM subscriptions subscription
      JOIN organization_user organization_user
        ON organization_user.organization_user_id = subscription.organization_user_id
       AND organization_user.organization_id = p_organization_id
       AND organization_user.user_id = p_customer_user_id
       AND NOT organization_user.is_deleted
      JOIN subscription_plans plan ON plan.subscription_plan_id = subscription.subscription_plan_id
      JOIN membership_products product ON product.membership_product_id = plan.membership_product_id
       AND product.organization_id = p_organization_id
      CROSS JOIN LATERAL get_customer_subscription_actual_savings(
          p_customer_user_id, p_organization_id, subscription.subscription_id
      ) savings
     WHERE NOT subscription.is_deleted
    ), unattributed_history AS (
      SELECT EXISTS (
        SELECT 1 FROM commerce_transactions commerce
         WHERE commerce.organization_id = p_organization_id
           AND commerce.customer_user_id = p_customer_user_id
           AND commerce.status = 'COMPLETED' AND NOT commerce.is_deleted
           AND (EXISTS (SELECT 1 FROM fulfillments fulfillment
                  WHERE fulfillment.commerce_transaction_id = commerce.commerce_transaction_id)
             OR EXISTS (SELECT 1 FROM transaction_receipts receipt
                  WHERE receipt.source_commerce_transaction_id = commerce.commerce_transaction_id
                    AND receipt.receipt_kind = 'COUNTER_REDEMPTION')
             OR EXISTS (SELECT 1 FROM commerce_transaction_redemptions redemption_link
                  WHERE redemption_link.commerce_transaction_id = commerce.commerce_transaction_id
                    AND NOT redemption_link.is_deleted))
           AND NOT EXISTS (SELECT 1 FROM owned_savings owned_membership
                 WHERE owned_membership.subscription_id = commerce.subscription_id)
      ) AS has_gap
    )
    SELECT coalesce(owned_savings.subscription_id, '')::varchar,
           coalesce(owned_savings.membership_name, '')::varchar,
           coalesce(owned_savings.plan_name, '')::varchar,
           owned_savings.currency_code, owned_savings.verified_net_savings_minor,
           coalesce(owned_savings.verified_redemption_count, 0)::bigint,
           coalesce(owned_savings.coverage_state, CASE WHEN unattributed_history.has_gap
             THEN 'NO_VERIFIED_DATA' ELSE 'NO_REDEMPTION_HISTORY' END)::varchar,
           active_plan_currency.currency_code::varchar
      FROM active_plan_currency CROSS JOIN unattributed_history LEFT JOIN owned_savings ON true
    UNION ALL
    -- An empty subscription ID is a coverage-only row understood by the
    -- existing business aggregator; it never contributes a savings amount.
    SELECT ''::varchar, ''::varchar, ''::varchar, NULL::varchar, NULL::bigint,
           0::bigint, 'NO_VERIFIED_DATA'::varchar, active_plan_currency.currency_code::varchar
      FROM active_plan_currency CROSS JOIN unattributed_history
     WHERE unattributed_history.has_gap AND EXISTS (SELECT 1 FROM owned_savings)
     ORDER BY 1, 4 NULLS LAST;
$body$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_business_actual_savings(varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_business_actual_savings(varchar, varchar) TO "${appRole}";

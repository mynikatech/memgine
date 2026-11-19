-- LOCAL/DEV only. Run with psql -X -f against a designated test account.
-- Required variables: fixture_provenance=S2_ACTUAL_SAVINGS_PENDING, schema_name,
-- organization_id, customer_user_id, subscription_id, store_id, staff_id,
-- actor_user_id, benefit_id, product_id. After migration 299 only.
-- Exercise the canonical pending path and roll back. Never start provider pricing
-- or payment. Existing order, payment, redemption and receipt states are untouched.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path TO pg_catalog, :"schema_name";
SET LOCAL lock_timeout = '2s';

SELECT (current_database() = 'memgine_dev' AND :'schema_name' = 'memginedev'
        AND :'fixture_provenance' = 'S2_ACTUAL_SAVINGS_PENDING'
        AND EXISTS (
            SELECT 1 FROM subscriptions s JOIN organization_user ou USING (organization_user_id)
             WHERE s.subscription_id = :'subscription_id' AND NOT s.is_deleted AND NOT ou.is_deleted
               AND ou.organization_id = :'organization_id' AND ou.user_id = :'customer_user_id'
        )) AS fixture_scope_valid
\gset
\if :fixture_scope_valid
SELECT b."transactionId" AS fixture_basket_id
  FROM create_counter_redemption_transaction_with_products(
      :'organization_id', :'store_id', :'staff_id', :'subscription_id',
      ARRAY[:'benefit_id']::varchar[], ARRAY[]::varchar[], 'STAFF_ASSISTED',
      jsonb_build_object('BENEFIT:' || :'benefit_id', :'product_id'), :'actor_user_id'
  ) b
\gset

SELECT c."commerceTransactionId" AS fixture_commerce_id
  FROM commerce_prepare_counter_redemption_transaction(
      :'fixture_basket_id', :'organization_id', :'store_id', :'staff_id', :'actor_user_id'
  ) c
\gset

SELECT :'fixture_provenance' AS provenance, a.*,
       (a.subscription_id = :'subscription_id' AND a.verification_state = 'NOT_FINALIZED'
         AND a.original_discount_minor IS NULL AND a.reversal_minor IS NULL AND a.net_savings_minor IS NULL
         AND NOT EXISTS (SELECT 1 FROM commerce_provider_payment_attempts p WHERE p.commerce_transaction_id = a.transaction_id)
         AND NOT EXISTS (SELECT 1 FROM transaction_receipts r WHERE r.source_commerce_transaction_id = a.transaction_id)
       ) AS passed
  FROM get_customer_transaction_actual_savings(
      :'customer_user_id', ARRAY[:'fixture_commerce_id']::varchar[]
  ) a;
\else
\echo Refusing fixture preparation because LOCAL/DEV provenance or test ownership did not validate.
\endif
ROLLBACK;

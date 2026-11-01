-- Replace only the public projections of the deployed transaction-history functions.
-- Internal identifiers remain in transaction_id for authorized API operations and
-- are never selected as a customer-facing transaction_number.

CREATE OR REPLACE FUNCTION "${schemaName}".receipt_customer_transaction_history(
    p_customer_user_id varchar, p_organization_id varchar, p_status varchar,
    p_transaction_type varchar, p_search varchar, p_limit integer, p_offset integer
)
RETURNS TABLE(
  transaction_id varchar, transaction_number varchar, organization_id varchar,
  organization_name varchar, store_id varchar, store_name varchar,
  customer_user_id varchar, transaction_type varchar, status varchar,
  payment_method varchar, currency_code varchar, total_minor bigint,
  occurred_at text, receipt_id varchar, receipt_number varchar,
  receipt_available boolean, refund_status varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH commerce AS (
  SELECT t.commerce_transaction_id AS transaction_id,
    COALESCE(r.receipt_number, rt.redemption_transaction_number,
      'ORDER-' || upper(right(t.commerce_transaction_id, 8)))::varchar AS transaction_number,
    t.organization_id,o.organization_name,t.store_id,s.store_name,t.customer_user_id,
    CASE WHEN rt.redemption_transaction_number IS NOT NULL THEN 'COUNTER_REDEMPTION' ELSE t.source_channel END::varchar AS transaction_type,
    t.status::varchar,
    CASE WHEN COALESCE(t.total_minor,0)=0 THEN 'NO_PAYMENT'
         WHEN pa.payment_channel='CASH' THEN 'CASH'
         WHEN pa.payment_channel='REMOTE_TERMINAL' THEN 'POYNT_TERMINAL'
         WHEN pa.payment_channel='LEGACY_PAYMENT_INTENT' THEN 'CONFIGURED_PROVIDER'
         WHEN pa.payment_channel IS NOT NULL THEN pa.payment_channel
         ELSE 'PAYMENT_METHOD_NOT_RECORDED' END::varchar AS payment_method,
    COALESCE(t.currency_code,'CAD')::varchar AS currency_code,COALESCE(t.total_minor,0)::bigint AS total_minor,
    COALESCE(t.completed_at,t.updated_at,t.created_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END
      FROM payment_refunds pr WHERE pr.commerce_transaction_id=t.commerce_transaction_id)::varchar AS refund_status
  FROM commerce_transactions t JOIN organization o ON o.organization_id=t.organization_id
    LEFT JOIN stores s ON s.store_id=t.store_id
    LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id=t.commerce_transaction_id
    LEFT JOIN commerce_transaction_redemptions cx ON cx.commerce_transaction_id=t.commerce_transaction_id AND NOT cx.is_deleted
    LEFT JOIN redemption_transaction rt ON rt.redemption_transaction_id=cx.redemption_transaction_id
    LEFT JOIN LATERAL (SELECT a.payment_channel FROM commerce_provider_payment_attempts a
      WHERE a.commerce_transaction_id=t.commerce_transaction_id AND a.provider_status='SUCCEEDED'
      ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC LIMIT 1) pa ON true
  WHERE NOT t.is_deleted AND t.customer_user_id=$1 AND ($2 IS NULL OR t.organization_id=$2)
), intents AS (
  SELECT p.payment_intent_id AS transaction_id,COALESCE(r.receipt_number,'ORDER-' || upper(right(p.payment_intent_id,8)))::varchar AS transaction_number,
    p.organization_id,o.organization_name,p.store_id,s.store_name,p.customer_user_id,
    'MEMBERSHIP_PURCHASE'::varchar AS transaction_type,p.status::varchar,pc.provider_code::varchar AS payment_method,p.currency_code::varchar,
    round(p.amount*100)::bigint AS total_minor,p.updated_at::text AS occurred_at,r.transaction_receipt_id AS receipt_id,r.receipt_number,
    (r.transaction_receipt_id IS NOT NULL) AS receipt_available,
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END FROM payment_refunds pr WHERE pr.payment_intent_id=p.payment_intent_id)::varchar AS refund_status
  FROM payment_intents p JOIN organization o ON o.organization_id=p.organization_id JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
    LEFT JOIN stores s ON s.store_id=p.store_id LEFT JOIN transaction_receipts r ON r.source_payment_intent_id=p.payment_intent_id
  WHERE p.customer_user_id=$1 AND ($2 IS NULL OR p.organization_id=$2)
    AND NOT EXISTS (SELECT 1 FROM commerce_transactions t WHERE NOT t.is_deleted AND t.organization_id=p.organization_id AND t.customer_user_id=p.customer_user_id AND t.subscription_id IS NOT NULL AND t.subscription_id=p.finalized_subscription_id)
), refunds AS (
  SELECT pr.payment_refund_id AS transaction_id,COALESCE(r.receipt_number,'REFUND-' || upper(right(pr.payment_refund_id,8)))::varchar AS transaction_number,
    pr.organization_id,o.organization_name,pr.original_store_id AS store_id,s.store_name,COALESCE(ct.customer_user_id,pi.customer_user_id) AS customer_user_id,
    'REFUND'::varchar AS transaction_type,pr.execution_status::varchar AS status,pr.original_provider_code::varchar AS payment_method,pr.currency_code::varchar,
    (-pr.refund_amount_minor)::bigint AS total_minor,COALESCE(pr.executed_at,pr.updated_at,pr.requested_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,pr.execution_status::varchar AS refund_status
  FROM payment_refunds pr JOIN organization o ON o.organization_id=pr.organization_id LEFT JOIN stores s ON s.store_id=pr.original_store_id
    LEFT JOIN commerce_transactions ct ON ct.commerce_transaction_id=pr.commerce_transaction_id LEFT JOIN payment_intents pi ON pi.payment_intent_id=pr.payment_intent_id
    LEFT JOIN transaction_receipts r ON r.source_refund_id=pr.payment_refund_id
  WHERE COALESCE(ct.customer_user_id,pi.customer_user_id)=$1 AND ($2 IS NULL OR pr.organization_id=$2)
)
SELECT x.transaction_id::varchar,x.transaction_number::varchar,x.organization_id::varchar,x.organization_name::varchar,x.store_id::varchar,x.store_name::varchar,x.customer_user_id::varchar,x.transaction_type::varchar,x.status::varchar,x.payment_method::varchar,x.currency_code::varchar,x.total_minor::bigint,x.occurred_at::text,x.receipt_id::varchar,x.receipt_number::varchar,x.receipt_available::boolean,x.refund_status::varchar
FROM (SELECT * FROM commerce UNION ALL SELECT * FROM intents UNION ALL SELECT * FROM refunds) x
WHERE ($3 IS NULL OR x.status=$3) AND ($4 IS NULL OR x.transaction_type=$4)
  AND ($5 IS NULL OR x.transaction_number ILIKE '%'||$5||'%' OR x.receipt_number ILIKE '%'||$5||'%')
ORDER BY x.occurred_at DESC,x.transaction_id DESC LIMIT $6 OFFSET $7;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".receipt_counter_transaction_history(
    p_organization_id varchar, p_store_id varchar, p_staff_id varchar, p_actor_user_id varchar,
    p_customer_user_id varchar, p_status varchar, p_transaction_type varchar,
    p_payment_method varchar, p_search varchar, p_limit integer, p_offset integer
)
RETURNS TABLE(
  transaction_id varchar, transaction_number varchar, organization_id varchar,
  organization_name varchar, store_id varchar, store_name varchar,
  customer_user_id varchar, transaction_type varchar, status varchar,
  payment_method varchar, currency_code varchar, total_minor bigint,
  occurred_at text, receipt_id varchar, receipt_number varchar,
  receipt_available boolean, refund_status varchar
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
WITH commerce AS (
  SELECT t.commerce_transaction_id AS transaction_id,
    COALESCE(r.receipt_number,rt.redemption_transaction_number,'ORDER-'||upper(right(t.commerce_transaction_id,8)))::varchar AS transaction_number,
    t.organization_id,o.organization_name,t.store_id,s.store_name,t.customer_user_id,
    CASE WHEN rt.redemption_transaction_number IS NOT NULL THEN 'COUNTER_REDEMPTION' ELSE t.source_channel END::varchar AS transaction_type,t.status::varchar,
    CASE WHEN COALESCE(t.total_minor,0)=0 THEN 'NO_PAYMENT' WHEN pa.payment_channel='CASH' THEN 'CASH' WHEN pa.payment_channel='REMOTE_TERMINAL' THEN 'POYNT_TERMINAL' WHEN pa.payment_channel='LEGACY_PAYMENT_INTENT' THEN 'CONFIGURED_PROVIDER' WHEN pa.payment_channel IS NOT NULL THEN pa.payment_channel ELSE 'PAYMENT_METHOD_NOT_RECORDED' END::varchar AS payment_method,
    COALESCE(t.currency_code,'CAD')::varchar AS currency_code,COALESCE(t.total_minor,0)::bigint AS total_minor,COALESCE(t.completed_at,t.updated_at,t.created_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END FROM payment_refunds pr WHERE pr.commerce_transaction_id=t.commerce_transaction_id)::varchar AS refund_status
  FROM commerce_transactions t JOIN organization o ON o.organization_id=t.organization_id LEFT JOIN stores s ON s.store_id=t.store_id
    LEFT JOIN transaction_receipts r ON r.source_commerce_transaction_id=t.commerce_transaction_id
    LEFT JOIN commerce_transaction_redemptions cx ON cx.commerce_transaction_id=t.commerce_transaction_id AND NOT cx.is_deleted
    LEFT JOIN redemption_transaction rt ON rt.redemption_transaction_id=cx.redemption_transaction_id
    LEFT JOIN LATERAL (SELECT a.payment_channel FROM commerce_provider_payment_attempts a WHERE a.commerce_transaction_id=t.commerce_transaction_id AND a.provider_status='SUCCEEDED' ORDER BY a.created_at DESC,a.commerce_provider_payment_attempt_id DESC LIMIT 1) pa ON true
  WHERE NOT t.is_deleted AND t.organization_id=$1 AND t.store_id=$2 AND ($5 IS NULL OR t.customer_user_id=$5)
), refunds AS (
  SELECT pr.payment_refund_id AS transaction_id,COALESCE(r.receipt_number,'REFUND-'||upper(right(pr.payment_refund_id,8)))::varchar AS transaction_number,
    pr.organization_id,o.organization_name,pr.original_store_id AS store_id,s.store_name,COALESCE(ct.customer_user_id,pi.customer_user_id) AS customer_user_id,
    'REFUND'::varchar AS transaction_type,pr.execution_status::varchar AS status,pr.original_provider_code::varchar AS payment_method,pr.currency_code::varchar,(-pr.refund_amount_minor)::bigint AS total_minor,
    COALESCE(pr.executed_at,pr.updated_at,pr.requested_at)::text AS occurred_at,r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,pr.execution_status::varchar AS refund_status
  FROM payment_refunds pr JOIN organization o ON o.organization_id=pr.organization_id LEFT JOIN stores s ON s.store_id=pr.original_store_id
    LEFT JOIN commerce_transactions ct ON ct.commerce_transaction_id=pr.commerce_transaction_id LEFT JOIN payment_intents pi ON pi.payment_intent_id=pr.payment_intent_id LEFT JOIN transaction_receipts r ON r.source_refund_id=pr.payment_refund_id
  WHERE pr.organization_id=$1 AND pr.original_store_id=$2 AND ($5 IS NULL OR COALESCE(ct.customer_user_id,pi.customer_user_id)=$5)
)
SELECT x.transaction_id::varchar,x.transaction_number::varchar,x.organization_id::varchar,x.organization_name::varchar,x.store_id::varchar,x.store_name::varchar,x.customer_user_id::varchar,x.transaction_type::varchar,x.status::varchar,x.payment_method::varchar,x.currency_code::varchar,x.total_minor::bigint,x.occurred_at::text,x.receipt_id::varchar,x.receipt_number::varchar,x.receipt_available::boolean,x.refund_status::varchar
FROM (SELECT * FROM commerce UNION ALL SELECT * FROM refunds) x
WHERE counter_can_operate($1,$2,$3,$4) AND ($6 IS NULL OR x.status=$6) AND ($7 IS NULL OR x.transaction_type=$7) AND ($8 IS NULL OR x.payment_method=$8)
  AND ($9 IS NULL OR x.transaction_number ILIKE '%'||$9||'%' OR x.receipt_number ILIKE '%'||$9||'%')
ORDER BY x.occurred_at DESC,x.transaction_id DESC LIMIT $10 OFFSET $11;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".receipt_counter_transaction_history(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".receipt_counter_transaction_history(varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,integer) TO "${appRole}";

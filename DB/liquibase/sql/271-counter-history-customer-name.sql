-- W271: expose customer name only in staff-authorized counter history.
-- Rebuild the same function because PostgreSQL CREATE OR REPLACE cannot change RETURNS TABLE.
-- Re-runnable manually: DROP IF EXISTS followed by CREATE and idempotent privileges.
-- Run in a transaction (Liquibase default), and do not use CASCADE.
-- Preserve the 11 input arguments, authorization, financial data and filtering from W268.
-- Do not apply this migration if the previous W271 (_named wrapper) was already executed;
-- use a subsequent migration number in that case.

DROP FUNCTION IF EXISTS "${schemaName}".receipt_counter_transaction_history(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,integer
);

CREATE FUNCTION "${schemaName}".receipt_counter_transaction_history(
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
  receipt_available boolean, refund_status varchar, customer_display_name varchar
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
SELECT x.transaction_id::varchar,x.transaction_number::varchar,x.organization_id::varchar,x.organization_name::varchar,x.store_id::varchar,x.store_name::varchar,x.customer_user_id::varchar,x.transaction_type::varchar,x.status::varchar,x.payment_method::varchar,x.currency_code::varchar,x.total_minor::bigint,x.occurred_at::text,x.receipt_id::varchar,x.receipt_number::varchar,x.receipt_available::boolean,x.refund_status::varchar,
  (
    SELECT COALESCE(
      NULLIF(BTRIM(u.display_name), ''),
      NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(u.first_name), ''), NULLIF(BTRIM(u.middle_name), ''), NULLIF(BTRIM(u.last_name), ''))), '')
    )::varchar
    FROM organization_user ou
    JOIN "user" u ON u.user_id=ou.user_id
    JOIN organization_user_types ot ON ot.organization_user_type_id=ou.organization_user_type_id
    WHERE ou.organization_id=x.organization_id
      AND ou.user_id=x.customer_user_id
      AND ot.organization_user_type_code='CUSTOMER'
      AND NOT ou.is_deleted AND NOT u.is_deleted
    ORDER BY ou.organization_user_id
    LIMIT 1
  ) AS customer_display_name
FROM (SELECT * FROM commerce UNION ALL SELECT * FROM refunds) x
WHERE counter_can_operate($1,$2,$3,$4) AND ($6 IS NULL OR x.status=$6) AND ($7 IS NULL OR x.transaction_type=$7) AND ($8 IS NULL OR x.payment_method=$8)
  AND ($9 IS NULL OR x.transaction_number ILIKE '%'||$9||'%' OR x.receipt_number ILIKE '%'||$9||'%')
ORDER BY x.occurred_at DESC,x.transaction_id DESC LIMIT $10 OFFSET $11;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".receipt_counter_transaction_history(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".receipt_counter_transaction_history(
    varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,varchar,integer,integer
) TO "${appRole}";

-- Preserve the original OID's security contract. Changing OUT columns
-- requires a new OID, so reject unexpected owners, ACLs or dependencies.
DO $history_preflight$
DECLARE
    prior_function regprocedure := '"${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer)'::regprocedure;
    app_role oid := to_regrole('${appRole}');
BEGIN
    IF app_role IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_proc p
        WHERE p.oid = prior_function AND pg_get_userbyid(p.proowner) = current_user
          AND p.prosecdef AND p.provolatile = 's'
          AND cardinality(p.proallargtypes) - p.pronargs = 17
          AND p.proconfig = ARRAY[format('search_path=pg_catalog, %I', '${schemaName}')]
    ) THEN
        RAISE EXCEPTION 'Unexpected owner or security attributes on canonical customer history';
    END IF;
    IF NOT has_function_privilege(app_role, prior_function, 'EXECUTE') OR EXISTS (
        SELECT 1 FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE p.oid = prior_function AND acl.grantee <> p.proowner
          AND (acl.grantee <> app_role OR acl.is_grantable OR acl.grantor <> p.proowner)
    ) THEN
        RAISE EXCEPTION 'Unexpected grants on canonical customer history';
    END IF;
END;
$history_preflight$;

-- RESTRICT also checks live catalog dependencies that source review cannot see.
DROP FUNCTION "${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer) RESTRICT;

CREATE FUNCTION "${schemaName}".receipt_customer_transaction_history(
    p_customer_user_id varchar, p_organization_id varchar, p_status varchar,
    p_transaction_type varchar, p_search varchar, p_limit integer, p_offset integer
)
RETURNS TABLE(
  transaction_id varchar, transaction_number varchar, organization_id varchar,
  organization_name varchar, store_id varchar, store_name varchar,
  customer_user_id varchar, transaction_type varchar, status varchar,
  payment_method varchar, currency_code varchar, total_minor bigint,
  occurred_at text, receipt_id varchar, receipt_number varchar,
  receipt_available boolean, refund_status varchar,
  subscription_id varchar, item_description text, canonical_order_id varchar
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
      FROM payment_refunds pr WHERE pr.commerce_transaction_id=t.commerce_transaction_id)::varchar AS refund_status,
    'COMMERCE'::text AS source_kind
  FROM commerce_transactions t JOIN organization o ON o.organization_id=t.organization_id
    LEFT JOIN stores s ON s.store_id=t.store_id
    -- Choose one immutable receipt before applying history pagination. A legacy
    -- duplicate receipt must not duplicate or displace an order in the page.
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_commerce_transaction_id=t.commerce_transaction_id
         AND receipt.organization_id=t.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
    -- Keep legacy search on any linked redemption number when there is no receipt.
    -- Reduce the link to one stable row before filtering and pagination.
    LEFT JOIN LATERAL (
      SELECT linked.redemption_transaction_number
        FROM commerce_transaction_redemptions cx
        JOIN redemption_transaction linked USING (redemption_transaction_id)
       WHERE cx.commerce_transaction_id=t.commerce_transaction_id AND NOT cx.is_deleted
       ORDER BY (r.receipt_number IS NULL AND $5 IS NOT NULL
                 AND linked.redemption_transaction_number ILIKE '%'||$5||'%') DESC,
                linked.redemption_transaction_id
       LIMIT 1
    ) rt ON true
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
    (SELECT CASE WHEN count(*) FILTER (WHERE pr.execution_status='SUCCEEDED')>0 THEN 'REFUNDED' WHEN count(*)>0 THEN max(pr.execution_status) END FROM payment_refunds pr WHERE pr.payment_intent_id=p.payment_intent_id)::varchar AS refund_status,
    'INTENT'::text AS source_kind
  FROM payment_intents p JOIN organization o ON o.organization_id=p.organization_id JOIN payment_provider_configs pc ON pc.payment_provider_config_id=p.payment_provider_config_id
    LEFT JOIN stores s ON s.store_id=p.store_id
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_payment_intent_id=p.payment_intent_id
         AND receipt.organization_id=p.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
  WHERE p.customer_user_id=$1 AND ($2 IS NULL OR p.organization_id=$2)
    AND NOT EXISTS (SELECT 1 FROM commerce_transactions t WHERE NOT t.is_deleted AND t.organization_id=p.organization_id AND t.customer_user_id=p.customer_user_id AND t.subscription_id IS NOT NULL AND t.subscription_id=p.finalized_subscription_id)
), refunds AS (
  SELECT pr.payment_refund_id AS transaction_id,COALESCE(r.receipt_number,'REFUND-' || upper(right(pr.payment_refund_id,8)))::varchar AS transaction_number,
    pr.organization_id,o.organization_name,pr.original_store_id AS store_id,s.store_name,COALESCE(ct.customer_user_id,pi.customer_user_id) AS customer_user_id,
    'REFUND'::varchar AS transaction_type,pr.execution_status::varchar AS status,pr.original_provider_code::varchar AS payment_method,pr.currency_code::varchar,
    (-pr.refund_amount_minor)::bigint AS total_minor,COALESCE(pr.executed_at,pr.updated_at,pr.requested_at)::text AS occurred_at,
    r.transaction_receipt_id AS receipt_id,r.receipt_number,(r.transaction_receipt_id IS NOT NULL) AS receipt_available,pr.execution_status::varchar AS refund_status,
    'REFUND'::text AS source_kind
  FROM payment_refunds pr JOIN organization o ON o.organization_id=pr.organization_id LEFT JOIN stores s ON s.store_id=pr.original_store_id
    LEFT JOIN commerce_transactions ct ON ct.commerce_transaction_id=pr.commerce_transaction_id LEFT JOIN payment_intents pi ON pi.payment_intent_id=pr.payment_intent_id
    LEFT JOIN LATERAL (
      SELECT receipt.transaction_receipt_id, receipt.receipt_number
        FROM transaction_receipts receipt
       WHERE receipt.source_refund_id=pr.payment_refund_id
         AND receipt.organization_id=pr.organization_id
         AND receipt.customer_user_id=$1
       ORDER BY receipt.issued_at DESC, receipt.transaction_receipt_id DESC
       LIMIT 1
    ) r ON true
  WHERE COALESCE(ct.customer_user_id,pi.customer_user_id)=$1 AND ($2 IS NULL OR pr.organization_id=$2)
), history_page AS MATERIALIZED (
  SELECT x.*
    FROM (SELECT * FROM commerce UNION ALL SELECT * FROM intents UNION ALL SELECT * FROM refunds) x
   WHERE ($3 IS NULL OR x.status=$3) AND ($4 IS NULL OR x.transaction_type=$4)
     AND ($5 IS NULL OR x.transaction_number ILIKE '%'||$5||'%' OR x.receipt_number ILIKE '%'||$5||'%')
   ORDER BY x.occurred_at DESC,x.transaction_id DESC LIMIT $6 OFFSET $7
), originals AS (
  SELECT h.*, p.finalized_subscription_id, c.subscription_id AS commerce_subscription_id,
         c.commerce_transaction_id, c.is_deleted AS commerce_deleted,
         (h.source_kind = 'REFUND' AND (
             f.organization_id IS DISTINCT FROM h.organization_id
             OR (f.commerce_transaction_id IS NOT NULL AND f.payment_intent_id IS NOT NULL
                 AND p.commerce_transaction_id IS NOT NULL
                 AND f.commerce_transaction_id <> p.commerce_transaction_id)
           )
          OR (c.commerce_transaction_id IS NOT NULL AND c.is_deleted)
          OR p.payment_intent_id IS NOT NULL AND
            (p.organization_id IS DISTINCT FROM h.organization_id OR p.customer_user_id IS DISTINCT FROM $1)
          OR c.commerce_transaction_id IS NOT NULL AND
            (c.organization_id IS DISTINCT FROM h.organization_id OR c.customer_user_id IS DISTINCT FROM $1)
          OR p.finalized_subscription_id IS NOT NULL AND c.subscription_id IS NOT NULL
            AND p.finalized_subscription_id <> c.subscription_id
          OR EXISTS (
            SELECT 1 FROM commerce_transaction_redemptions cx
            JOIN redemption_transaction rt USING (redemption_transaction_id)
            WHERE cx.commerce_transaction_id = c.commerce_transaction_id AND NOT cx.is_deleted
              AND (rt.organization_id IS DISTINCT FROM h.organization_id OR
                   rt.subscription_id IS DISTINCT FROM coalesce(c.subscription_id, p.finalized_subscription_id))
          )
          OR EXISTS (
            SELECT 1 FROM payment_intents linked
            WHERE linked.commerce_transaction_id = c.commerce_transaction_id
              AND (linked.organization_id IS DISTINCT FROM h.organization_id OR
                   linked.customer_user_id IS DISTINCT FROM $1 OR
                   (linked.finalized_subscription_id IS NOT NULL
                    AND coalesce(c.subscription_id, p.finalized_subscription_id) IS NOT NULL
                    AND linked.finalized_subscription_id <> coalesce(c.subscription_id, p.finalized_subscription_id)))
          )) AS evidence_conflicts
    FROM history_page h
    LEFT JOIN payment_refunds f ON h.source_kind = 'REFUND' AND f.payment_refund_id = h.transaction_id
    LEFT JOIN payment_intents p ON p.payment_intent_id = CASE
        WHEN h.source_kind = 'INTENT' THEN h.transaction_id ELSE f.payment_intent_id END
    LEFT JOIN commerce_transactions c ON c.commerce_transaction_id = CASE
        WHEN h.source_kind = 'COMMERCE' THEN h.transaction_id
        ELSE coalesce(f.commerce_transaction_id, p.commerce_transaction_id) END
)
SELECT h.transaction_id::varchar, h.transaction_number::varchar, h.organization_id::varchar,
       h.organization_name::varchar, h.store_id::varchar, h.store_name::varchar, h.customer_user_id::varchar,
       h.transaction_type::varchar, h.status::varchar, h.payment_method::varchar, h.currency_code::varchar,
       h.total_minor::bigint, h.occurred_at::text, h.receipt_id::varchar, h.receipt_number::varchar,
       h.receipt_available::boolean, h.refund_status::varchar,
       s.subscription_id::varchar,
       nullif(btrim(r.receipt_snapshot #>> '{lines,0,description}'), ''),
       CASE WHEN h.source_kind = 'INTENT' AND NOT h.evidence_conflicts AND h.commerce_deleted IS FALSE
                 AND (coalesce(h.finalized_subscription_id, h.commerce_subscription_id) IS NULL OR s.subscription_id IS NOT NULL)
            THEN h.commerce_transaction_id ELSE h.transaction_id END::varchar
  FROM originals h
  LEFT JOIN subscriptions s ON NOT h.evidence_conflicts AND NOT s.is_deleted
    AND s.subscription_id = coalesce(h.finalized_subscription_id, h.commerce_subscription_id)
    AND EXISTS (
      SELECT 1 FROM organization_user ou
       WHERE ou.organization_user_id = s.organization_user_id AND ou.organization_id = h.organization_id
         AND ou.user_id = $1 AND NOT ou.is_deleted
    )
  LEFT JOIN transaction_receipts r ON r.transaction_receipt_id = h.receipt_id
    AND r.organization_id = h.organization_id AND r.customer_user_id = $1
 ORDER BY h.occurred_at DESC,h.transaction_id DESC;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer) TO "${appRole}";

-- Refuse elevated grants associated with current default privileges.
DO $history_acl$
DECLARE
    history_function regprocedure := '"${schemaName}".receipt_customer_transaction_history(varchar,varchar,varchar,varchar,varchar,integer,integer)'::regprocedure;
    app_role oid := to_regrole('${appRole}');
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        WHERE p.oid = history_function AND acl.grantee <> p.proowner
          AND (acl.grantee <> app_role OR acl.is_grantable OR acl.grantor <> p.proowner)
    ) THEN
        RAISE EXCEPTION 'Unexpected default grants on recreated canonical customer history';
    END IF;
END;
$history_acl$;

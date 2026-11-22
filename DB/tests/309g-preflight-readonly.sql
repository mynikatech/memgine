-- 309G verification, read-only. Run after migration and customer test actions.
-- Never print raw six-digit codes or stored HMAC values.
SELECT 'IMMEDIATE_REDEMPTION' AS credential_kind, c.store_id,
       COUNT(*) FILTER (WHERE c.revoked_at IS NULL AND c.used_at IS NULL
           AND c.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AS active_codes,
       COUNT(*) FILTER (WHERE c.used_at IS NOT NULL) AS used_codes
FROM memginedev.redemption_six_digit_credentials c
GROUP BY c.store_id
UNION ALL
SELECT 'ADVANCE_PICKUP',f.store_id,
       COUNT(*) FILTER (WHERE c.revoked_at IS NULL AND c.used_at IS NULL
           AND c.expires_at>CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
       COUNT(*) FILTER (WHERE c.used_at IS NOT NULL)
FROM memginedev.fulfillment_credentials c
JOIN memginedev.fulfillments f ON f.fulfillment_id=c.fulfillment_id
JOIN memginedev.statuses typ ON typ.status_id=c.credential_type_status_id
   AND typ.status_code='PICKUP_CODE'
GROUP BY f.store_id
ORDER BY store_id,credential_kind;

-- Inspect redemption transaction without exposing QR/code secrets. Substitute a real transaction ID.
SELECT t.redemption_transaction_number,t.redemption_method,t.status,
       t.store_id, t.expires_at,
       (SELECT count(*) FROM memginedev.redemption_six_digit_credentials c
         WHERE c.redemption_transaction_id=t.redemption_transaction_id
           AND c.used_at IS NOT NULL) AS code_verifications
FROM memginedev.redemption_transaction t
WHERE t.redemption_transaction_id='REPLACE_WITH_REDEMPTION_TRANSACTION_ID';

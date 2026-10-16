-- DEV ONLY. Creates and COMMITS two synthetic PENDING intents for the SAME
-- organization/customer/membership product. No provider calls or existing-row changes.
-- Intended only for the four-part controlled concurrency test.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
DO $test$
DECLARE
 f record;
 id_a constant varchar(64) := 'P3AXINT-A-20261016';
 id_b constant varchar(64) := 'P3AXINT-B-20261016';
BEGIN
 IF EXISTS (SELECT 1 FROM payment_intents WHERE payment_intent_id IN (id_a,id_b) OR idempotency_key IN (id_a,id_b)) THEN
   RAISE EXCEPTION 'P3A FIXTURE EXISTS: stop and inspect before continuing';
 END IF;
 SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
        i.payment_provider_config_id, i.amount, i.currency_code,
        i.subtotal_amount, i.tax_rate, i.tax_amount, i.tax_code, i.tax_name
 INTO f FROM payment_intents i
 JOIN subscription_plans sp ON sp.subscription_plan_id=i.membership_plan_id
 JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
 WHERE i.authorization_mode='CUSTOMER_SESSION' AND i.customer_user_id IS NOT NULL
   AND pc.provider_code='POYNT_COLLECT' AND i.amount>0
   AND NOT EXISTS (
     SELECT 1 FROM organization_user ou
     JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
     JOIN subscription_plans xp ON xp.subscription_plan_id=s.subscription_plan_id
     JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
     JOIN statuses st ON st.status_id=es.status_id
     WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
       AND NOT ou.is_deleted AND NOT s.is_deleted
       AND xp.membership_product_id=sp.membership_product_id
       AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE)
   AND NOT EXISTS (
     SELECT 1 FROM payment_intents x
     JOIN subscription_plans xp ON xp.subscription_plan_id=x.membership_plan_id
     WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
       AND x.authorization_mode='CUSTOMER_SESSION'
       AND xp.membership_product_id=sp.membership_product_id
       AND x.finalized_subscription_id IS NULL
       AND (x.status IN ('PROCESSING','SUCCEEDED') OR EXISTS (
         SELECT 1 FROM poynt_collect_verified_captures c WHERE c.payment_intent_id=x.payment_intent_id)))
 ORDER BY i.created_at DESC LIMIT 1;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'P3A FIXTURE UNAVAILABLE: no eligible customer/product; no rows committed';
 END IF;
 INSERT INTO payment_intents (
    payment_intent_id, organization_id, payment_provider_config_id,
    authorization_mode, membership_plan_id, customer_user_id,
    subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
    amount,currency_code,status,idempotency_key,created_by,updated_by)
 SELECT x.id,f.organization_id,f.payment_provider_config_id,
    'CUSTOMER_SESSION',f.membership_plan_id,f.customer_user_id,
    f.subtotal_amount,f.tax_rate,f.tax_amount,f.tax_code,f.tax_name,
    f.amount,f.currency_code,'PENDING',x.id,f.customer_user_id,f.customer_user_id
 FROM (VALUES(id_a),(id_b)) AS x(id);
 RAISE NOTICE 'P3A SETUP PASS: two DIFFERENT synthetic PENDING intents created for same customer/product; COMMIT follows';
END $test$;
COMMIT;

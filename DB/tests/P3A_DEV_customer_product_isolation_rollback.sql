-- P3-A: Isolated Collect claims across customers and membership products.
-- DEV ONLY. Run the entire script in one pgAdmin tab. No provider call is made.
-- Inserts/updates are restricted to newly created synthetic payment intents.
-- Existing rows are only read. ALL synthetic rows are removed by final ROLLBACK.
-- Missing independent fixtures produce SKIP notices, not false PASS notices.
BEGIN;
SET LOCAL search_path TO memginedev, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

DO $test$
DECLARE
  seed record;
  other_customer record;
  other_product record;
  seed_id varchar(64) := 'P3AISO-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  second_id varchar(64) := 'P3AISO-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  third_id varchar(64) := 'P3AISO-' || substr(md5(clock_timestamp()::text || random()::text),1,22);
  permitted boolean;
  st varchar(32);
  count_pass integer := 0;
BEGIN
  -- Candidate customer/plan: use an existing Collect pricing snapshot only as a
  -- FK/pricing template. The actual intent being claimed below is synthetic.
  SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
         sp.membership_product_id, i.payment_provider_config_id,
         i.amount, i.currency_code, i.subtotal_amount, i.tax_rate,
         i.tax_amount, i.tax_code, i.tax_name
    INTO seed
    FROM payment_intents i
    JOIN subscription_plans sp ON sp.subscription_plan_id=i.membership_plan_id
    JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
   WHERE i.authorization_mode='CUSTOMER_SESSION' AND i.customer_user_id IS NOT NULL
     AND i.amount > 0 AND pc.provider_code='POYNT_COLLECT'
     AND NOT EXISTS (
       SELECT 1 FROM organization_user ou
       JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
       JOIN subscription_plans p ON p.subscription_plan_id=s.subscription_plan_id
       JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
       JOIN statuses st ON st.status_id=es.status_id
       WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
         AND NOT ou.is_deleted AND NOT s.is_deleted
         AND p.membership_product_id=sp.membership_product_id
         AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_intents x
       JOIN subscription_plans p ON p.subscription_plan_id=x.membership_plan_id
       WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
         AND x.authorization_mode='CUSTOMER_SESSION'
         AND p.membership_product_id=sp.membership_product_id
         AND x.finalized_subscription_id IS NULL
         AND (x.status IN ('PROCESSING','SUCCEEDED') OR EXISTS (
           SELECT 1 FROM poynt_collect_verified_captures cap
           WHERE cap.payment_intent_id=x.payment_intent_id
         ))
     )
   ORDER BY i.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'P3A FIXTURE UNAVAILABLE: no eligible Collect customer/product for isolation test';
  END IF;

  INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,
       authorization_mode,membership_plan_id,customer_user_id,
       subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
       amount,currency_code,status,idempotency_key,created_by,updated_by)
  VALUES(seed_id,seed.organization_id,seed.payment_provider_config_id,'CUSTOMER_SESSION',
       seed.membership_plan_id,seed.customer_user_id,
       seed.subtotal_amount,seed.tax_rate,seed.tax_amount,seed.tax_code,seed.tax_name,
       seed.amount,seed.currency_code,'PENDING',seed_id,seed.customer_user_id,seed.customer_user_id);
  SELECT payment_claim_poynt_collect_charge(seed.organization_id,seed_id,seed.customer_user_id)
    INTO permitted;
  IF permitted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'P3A FAIL: primary synthetic claim did not succeed';
  END IF;
  RAISE NOTICE 'P3A PASS: original customer/product synthetic claim is PROCESSING';

  -- DIFFERENT CUSTOMER, SAME PRODUCT, SAME ORGANIZATION.
  SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
         sp.membership_product_id, i.payment_provider_config_id,
         i.amount, i.currency_code, i.subtotal_amount, i.tax_rate,
         i.tax_amount, i.tax_code, i.tax_name
    INTO other_customer
    FROM payment_intents i
    JOIN subscription_plans sp ON sp.subscription_plan_id=i.membership_plan_id
    JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
   WHERE i.organization_id=seed.organization_id
     AND sp.membership_product_id=seed.membership_product_id
     AND i.customer_user_id IS DISTINCT FROM seed.customer_user_id
     AND i.customer_user_id IS NOT NULL AND i.authorization_mode='CUSTOMER_SESSION'
     AND i.amount>0 AND pc.provider_code='POYNT_COLLECT'
     AND NOT EXISTS (
       SELECT 1 FROM organization_user ou
       JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
       JOIN subscription_plans p ON p.subscription_plan_id=s.subscription_plan_id
       JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
       JOIN statuses st ON st.status_id=es.status_id
       WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
         AND NOT ou.is_deleted AND NOT s.is_deleted
         AND p.membership_product_id=sp.membership_product_id
         AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_intents x
       JOIN subscription_plans p ON p.subscription_plan_id=x.membership_plan_id
       WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
         AND x.authorization_mode='CUSTOMER_SESSION'
         AND p.membership_product_id=sp.membership_product_id
         AND x.finalized_subscription_id IS NULL
         AND (x.status IN ('PROCESSING','SUCCEEDED') OR EXISTS (
           SELECT 1 FROM poynt_collect_verified_captures cap
           WHERE cap.payment_intent_id=x.payment_intent_id
         ))
     )
   ORDER BY i.created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RAISE NOTICE 'P3A SKIP: no eligible SECOND customer for same product in DEV; different-customer isolation NOT verified';
  ELSE
    INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,
         authorization_mode,membership_plan_id,customer_user_id,
         subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
         amount,currency_code,status,idempotency_key,created_by,updated_by)
    VALUES(second_id,other_customer.organization_id,other_customer.payment_provider_config_id,
         'CUSTOMER_SESSION',other_customer.membership_plan_id,other_customer.customer_user_id,
         other_customer.subtotal_amount,other_customer.tax_rate,other_customer.tax_amount,
         other_customer.tax_code,other_customer.tax_name,other_customer.amount,
         other_customer.currency_code,'PENDING',second_id,
         other_customer.customer_user_id,other_customer.customer_user_id);
    SELECT payment_claim_poynt_collect_charge(other_customer.organization_id,second_id,
           other_customer.customer_user_id) INTO permitted;
    SELECT status INTO st FROM payment_intents WHERE payment_intent_id=second_id;
    IF permitted IS DISTINCT FROM true OR st IS DISTINCT FROM 'PROCESSING' THEN
      RAISE EXCEPTION 'P3A FAIL: different customer blocked by unrelated PROCESSING payment';
    END IF;
    count_pass:=count_pass+1;
    RAISE NOTICE 'P3A PASS: second customer can claim same product despite first customer PROCESSING';
  END IF;

  -- SAME CUSTOMER, DIFFERENT PRODUCT, SAME ORGANIZATION.
  SELECT i.organization_id, i.customer_user_id, i.membership_plan_id,
         sp.membership_product_id, i.payment_provider_config_id,
         i.amount, i.currency_code, i.subtotal_amount, i.tax_rate,
         i.tax_amount, i.tax_code, i.tax_name
    INTO other_product
    FROM payment_intents i
    JOIN subscription_plans sp ON sp.subscription_plan_id=i.membership_plan_id
    JOIN payment_provider_configs pc ON pc.payment_provider_config_id=i.payment_provider_config_id
   WHERE i.organization_id=seed.organization_id
     AND i.customer_user_id=seed.customer_user_id
     AND sp.membership_product_id<>seed.membership_product_id
     AND i.authorization_mode='CUSTOMER_SESSION' AND i.amount>0
     AND pc.provider_code='POYNT_COLLECT'
     AND NOT EXISTS (
       SELECT 1 FROM organization_user ou
       JOIN subscriptions s ON s.organization_user_id=ou.organization_user_id
       JOIN subscription_plans p ON p.subscription_plan_id=s.subscription_plan_id
       JOIN entity_status es ON es.entity_status_id=s.subscription_status_id
       JOIN statuses st ON st.status_id=es.status_id
       WHERE ou.organization_id=i.organization_id AND ou.user_id=i.customer_user_id
         AND NOT ou.is_deleted AND NOT s.is_deleted
         AND p.membership_product_id=sp.membership_product_id
         AND st.status_code='ACTIVE' AND s.end_date>=CURRENT_DATE
     )
     AND NOT EXISTS (
       SELECT 1 FROM payment_intents x
       JOIN subscription_plans p ON p.subscription_plan_id=x.membership_plan_id
       WHERE x.organization_id=i.organization_id AND x.customer_user_id=i.customer_user_id
         AND x.authorization_mode='CUSTOMER_SESSION'
         AND p.membership_product_id=sp.membership_product_id
         AND x.finalized_subscription_id IS NULL
         AND (x.status IN ('PROCESSING','SUCCEEDED') OR EXISTS (
           SELECT 1 FROM poynt_collect_verified_captures cap
           WHERE cap.payment_intent_id=x.payment_intent_id
         ))
     )
   ORDER BY i.created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'P3A SKIP: no eligible SECOND membership product for same customer in DEV; different-product isolation NOT verified';
  ELSE
    INSERT INTO payment_intents(payment_intent_id,organization_id,payment_provider_config_id,
         authorization_mode,membership_plan_id,customer_user_id,
         subtotal_amount,tax_rate,tax_amount,tax_code,tax_name,
         amount,currency_code,status,idempotency_key,created_by,updated_by)
    VALUES(third_id,other_product.organization_id,other_product.payment_provider_config_id,
         'CUSTOMER_SESSION',other_product.membership_plan_id,other_product.customer_user_id,
         other_product.subtotal_amount,other_product.tax_rate,other_product.tax_amount,
         other_product.tax_code,other_product.tax_name,other_product.amount,
         other_product.currency_code,'PENDING',third_id,
         other_product.customer_user_id,other_product.customer_user_id);
    SELECT payment_claim_poynt_collect_charge(other_product.organization_id,third_id,
           other_product.customer_user_id) INTO permitted;
    SELECT status INTO st FROM payment_intents WHERE payment_intent_id=third_id;
    IF permitted IS DISTINCT FROM true OR st IS DISTINCT FROM 'PROCESSING' THEN
      RAISE EXCEPTION 'P3A FAIL: different product blocked by unrelated PROCESSING payment';
    END IF;
    count_pass:=count_pass+1;
    RAISE NOTICE 'P3A PASS: same customer can claim different product despite first product PROCESSING';
  END IF;
  RAISE NOTICE 'P3A COMPLETE: % of 2 independent isolation scenarios passed; outer ROLLBACK follows', count_pass;
END
$test$;
ROLLBACK;

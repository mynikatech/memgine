-- P4-B final concurrent SUCCESS verification from NEW connection, DEV 15432.
BEGIN READ ONLY;
SET LOCAL search_path = memginedev, pg_catalog;
DO $test$
DECLARE c commerce_transactions%ROWTYPE; p payment_intents%ROWTYPE;
 v_cases int; v_s int; v_attempts int; v_provider int;
BEGIN
 SELECT * INTO c FROM commerce_transactions WHERE commerce_transaction_id='P4BCS-C-20261016';
 SELECT * INTO p FROM payment_intents WHERE payment_intent_id='P4BCS-I-20261016';
 IF c.status IS DISTINCT FROM 'PROVIDER_SUCCEEDED' OR c.subscription_id IS NULL
 OR p.finalized_subscription_id IS DISTINCT FROM c.subscription_id
 OR p.customer_user_id IS DISTINCT FROM 'P4BCS-U-20261017'
 OR c.customer_user_id IS DISTINCT FROM 'P4BCS-U-20261017' THEN
  RAISE EXCEPTION 'P4B CS VERIFY FAIL: transaction/subscription mismatch';
 END IF;
 SELECT count(*) INTO v_cases FROM poynt_collect_financial_exceptions
 WHERE commerce_transaction_id=c.commerce_transaction_id AND case_status='RESOLVED'
 AND fulfillment_outcome='FULFILLED' AND related_subscription_id=c.subscription_id;
 SELECT count(*) INTO v_s FROM subscriptions
 WHERE organization_user_id='P4BCS-OU-20261017' AND subscription_id=c.subscription_id AND NOT is_deleted;
 SELECT count(*) INTO v_attempts FROM payment_attempts WHERE payment_intent_id=p.payment_intent_id;
 SELECT count(*) INTO v_provider FROM commerce_provider_payment_attempts
 WHERE commerce_transaction_id=c.commerce_transaction_id AND provider_status='SUCCEEDED'
 AND provider_transaction_id='P4BCS-TX-20261016';
 IF v_cases<>1 OR v_s<>1 OR v_attempts<>1 OR v_provider<>1
 OR (SELECT count(*) FROM subscriptions WHERE organization_user_id='P4BCS-OU-20261017')<>1
 OR (SELECT count(*) FROM poynt_collect_financial_exceptions WHERE commerce_transaction_id=c.commerce_transaction_id)<>1 THEN
   RAISE EXCEPTION 'P4B CS VERIFY FAIL: duplicate fulfillment or inconsistent evidence';
 END IF;
 RAISE NOTICE 'P4B CS VERIFY PASS: committed single membership, single resolved exception, provider evidence intact';
END $test$;
ROLLBACK;

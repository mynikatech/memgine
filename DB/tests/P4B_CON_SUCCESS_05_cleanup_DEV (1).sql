-- P4-B concurrent SUCCESS guarded cleanup, DEV ONLY, port 15432.
-- Run ONLY after both sessions COMMIT and Step 4 VERIFY PASS.
-- Must NEVER be run against production or unrelated records.
BEGIN;
SET LOCAL search_path = memginedev, pg_catalog;
SET LOCAL lock_timeout = '8s';
DO $clean$
DECLARE c commerce_transactions%ROWTYPE; p payment_intents%ROWTYPE;
 v_sub varchar; n int;
BEGIN
 SELECT * INTO c FROM commerce_transactions
  WHERE commerce_transaction_id='P4BCS-C-20261016' FOR UPDATE;
 SELECT * INTO p FROM payment_intents
  WHERE payment_intent_id='P4BCS-I-20261016' FOR UPDATE;
 v_sub := c.subscription_id;
 IF c.commerce_transaction_id IS NULL OR c.status IS DISTINCT FROM 'PROVIDER_SUCCEEDED'
    OR c.organization_id IS DISTINCT FROM 'ORG_ece1b2f6-0e01-4d1b-ac11-3528e136cc1b'
    OR c.source_channel IS DISTINCT FROM 'COUNTER'
    OR c.customer_user_id IS DISTINCT FROM 'P4BCS-U-20261017'
    OR c.provider_transaction_id IS DISTINCT FROM 'P4BCS-TX-20261016'
    OR v_sub IS NULL
    OR p.payment_intent_id IS NULL OR p.commerce_transaction_id IS DISTINCT FROM c.commerce_transaction_id
    OR p.customer_user_id IS DISTINCT FROM 'P4BCS-U-20261017'
    OR p.finalized_subscription_id IS DISTINCT FROM v_sub
    OR p.business_otp_challenge_id IS DISTINCT FROM 'P4BCS-OTP-20261016'
    OR NOT EXISTS(SELECT 1 FROM subscriptions WHERE subscription_id=v_sub
      AND organization_user_id='P4BCS-OU-20261017')
    OR NOT EXISTS(SELECT 1 FROM "user" WHERE user_id='P4BCS-U-20261017' AND user_code='P4BCS-U-20261017')
    OR NOT EXISTS(SELECT 1 FROM organization_user WHERE organization_user_id='P4BCS-OU-20261017'
      AND user_id='P4BCS-U-20261017')
 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: synthetic ownership, identity, or fulfillment state mismatch'; END IF;

 IF (SELECT count(*) FROM poynt_collect_financial_exceptions
  WHERE commerce_transaction_id=c.commerce_transaction_id
    AND related_subscription_id=v_sub AND case_status='RESOLVED' AND fulfillment_outcome='FULFILLED') <> 1
 OR (SELECT count(*) FROM commerce_provider_payment_attempts
  WHERE commerce_transaction_id=c.commerce_transaction_id
   AND provider_reference_id='P4BCS-REF-20261016'
   AND provider_transaction_id='P4BCS-TX-20261016'
   AND provider_status='SUCCEEDED') <> 1
 OR (SELECT count(*) FROM commerce_provider_payment_attempts WHERE commerce_transaction_id=c.commerce_transaction_id) <> 1
 OR (SELECT count(*) FROM payment_attempts WHERE payment_intent_id=p.payment_intent_id) <> 1
 OR (SELECT count(*) FROM subscriptions WHERE organization_user_id='P4BCS-OU-20261017') <> 1
 OR (SELECT count(*) FROM business_otp_context WHERE otp_challenge_id='P4BCS-OTP-20261016'
    AND user_id='P4BCS-U-20261017') <> 1
 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: unexpected synthetic dependency count'; END IF;

 DELETE FROM poynt_collect_financial_exceptions
  WHERE commerce_transaction_id=c.commerce_transaction_id AND related_subscription_id=v_sub;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: exception delete count %',n; END IF;

 DELETE FROM commerce_provider_payment_attempts WHERE commerce_transaction_id=c.commerce_transaction_id;
 DELETE FROM payment_attempts WHERE payment_intent_id=p.payment_intent_id;

 -- Break the two subscription references before removing the generated subscription.
 UPDATE commerce_transactions SET subscription_id=NULL
  WHERE commerce_transaction_id=c.commerce_transaction_id AND subscription_id=v_sub;
 UPDATE payment_intents SET finalized_subscription_id=NULL
  WHERE payment_intent_id=p.payment_intent_id AND finalized_subscription_id=v_sub;

 DELETE FROM subscriptions
  WHERE subscription_id=v_sub AND organization_user_id='P4BCS-OU-20261017';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: subscription delete count %',n; END IF;

 DELETE FROM payment_intents WHERE payment_intent_id=p.payment_intent_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: intent delete count %',n; END IF;

 DELETE FROM commerce_transactions WHERE commerce_transaction_id=c.commerce_transaction_id;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: Commerce delete count %',n; END IF;

 DELETE FROM business_otp_context
  WHERE otp_challenge_id='P4BCS-OTP-20261016' AND user_id='P4BCS-U-20261017';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: context delete count %',n; END IF;
 DELETE FROM otp_challenges WHERE otp_challenge_id='P4BCS-OTP-20261016';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: challenge delete count %',n; END IF;

 DELETE FROM organization_user WHERE organization_user_id='P4BCS-OU-20261017' AND user_id='P4BCS-U-20261017';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: organization customer delete count %',n; END IF;
 DELETE FROM "user" WHERE user_id='P4BCS-U-20261017' AND user_code='P4BCS-U-20261017';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'P4B CS CLEANUP STOP: synthetic user delete count %',n; END IF;

 RAISE NOTICE 'P4B CS CLEANUP PASS: committed synthetic evidence, membership, case, and customer removed';
END $clean$;
COMMIT;

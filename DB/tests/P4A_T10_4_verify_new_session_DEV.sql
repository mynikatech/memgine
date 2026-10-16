-- P4-A T10 (4/5): execute in a NEW pgAdmin connection/tab after step 3 COMMIT.
-- Read-only visibility and ownership assertion.
BEGIN READ ONLY;
SET LOCAL search_path=memginedev,pg_catalog;
DO $test$
DECLARE n int;
BEGIN
 SELECT count(*) INTO n
 FROM poynt_collect_financial_exceptions e
 JOIN commerce_transactions c ON c.commerce_transaction_id=e.commerce_transaction_id
 JOIN commerce_provider_payment_attempts a ON a.commerce_transaction_id=c.commerce_transaction_id
 WHERE c.commerce_transaction_id='P4ADUR-C-20261016'
 AND c.status='PROVIDER_SUCCEEDED' AND c.provider_transaction_id='P4ADUR-TX-20261016'
 AND a.provider_reference_id='P4ADUR-REF-20261016' AND a.provider_status='SUCCEEDED'
 AND a.provider_transaction_id=c.provider_transaction_id
 AND e.organization_id=c.organization_id
 AND e.provider_transaction_id=a.provider_transaction_id
 AND e.amount_minor=a.amount_minor AND e.amount_minor=c.total_minor
 AND upper(e.currency_code)=upper(c.currency_code)
 AND e.classification='CAPTURED_UNFULFILLED'
 AND e.provider_outcome='CAPTURED' AND e.fulfillment_outcome='FAILED'
 AND e.case_status='OPEN';
 IF n<>1 THEN RAISE EXCEPTION 'P4A T10 FAIL: durable cross-session case/evidence count %, expected 1',n; END IF;
 RAISE NOTICE 'P4A T10 VERIFY PASS: new session sees committed case and intact provider success evidence';
END $test$;
ROLLBACK;

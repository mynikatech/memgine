-- P4-A T10 (3/5): persist exception in SEPARATE transaction.
BEGIN;
SET LOCAL search_path=memginedev,pg_catalog;
DO $test$
DECLARE first_id varchar; second_id varchar; n int;
BEGIN
 first_id:=commerce_open_remote_terminal_financial_exception('P4ADUR-REF-20261016');
 second_id:=commerce_open_remote_terminal_financial_exception('P4ADUR-REF-20261016');
 IF first_id IS NULL OR first_id IS DISTINCT FROM second_id THEN
 RAISE EXCEPTION 'P4A T10 FAIL: no case or inconsistent case ID'; END IF;
 SELECT count(*) INTO n FROM poynt_collect_financial_exceptions
 WHERE commerce_transaction_id='P4ADUR-C-20261016'
 AND provider_reference_id='P4ADUR-REF-20261016'
 AND provider_transaction_id='P4ADUR-TX-20261016'
 AND case_status='OPEN' AND classification='CAPTURED_UNFULFILLED'
 AND source_channel='COUNTER' AND provider_outcome='CAPTURED'
 AND fulfillment_outcome='FAILED';
 IF n<>1 THEN RAISE EXCEPTION 'P4A T10 FAIL: expected one matching case, found %',n; END IF;
 RAISE NOTICE 'P4A T10 OPEN PASS: one case created; duplicate opener reused same ID; COMMIT follows';
END $test$;
COMMIT;

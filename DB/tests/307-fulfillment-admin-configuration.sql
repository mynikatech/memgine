-- Execute manually against LOCAL after applying 307. Transaction rolls back.
BEGIN;

DO $test$
DECLARE v_schema text := '${schemaName}';
 v_count integer;
 v_org varchar;
 v_actor varchar;
 v_customer varchar;
 v_store varchar;
 v_before jsonb;
 v_saved jsonb;
 v_store_result jsonb;
 v_qr integer;
 v_qr_after integer;
 v_deleted boolean;
 v_deleted_after boolean;
 v_expected integer;
 v_stale_blocked boolean := FALSE;
 v_invalid_blocked boolean := FALSE;
 v_denied boolean := FALSE;
BEGIN
 -- Required functions exist and have correct signatures.
 SELECT count(*) INTO v_count
 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname=v_schema AND (p.proname,pg_get_function_identity_arguments(p.oid)) IN (
  ('fulfillment_policy_defaults',''),
  ('fulfillment_merge_policy','p_base jsonb, p_override jsonb'),
  ('fulfillment_apply_store_overrides','p_org_policy jsonb, p_store_overrides jsonb'),
  ('fulfillment_validate_policy','p_policy jsonb, p_store_override boolean'),
  ('fulfillment_resolve_org_policy','p_organization_id character varying'),
  ('get_organization_fulfillment_policy','p_organization_id character varying, p_actor_user_id character varying'),
  ('save_organization_fulfillment_policy','p_organization_id character varying, p_policy jsonb, p_expected_version integer, p_actor_user_id character varying'),
  ('get_store_fulfillment_overrides','p_organization_id character varying, p_store_id character varying, p_actor_user_id character varying'),
  ('save_store_fulfillment_overrides','p_organization_id character varying, p_store_id character varying, p_overrides jsonb, p_expected_version integer, p_actor_user_id character varying'),
  ('get_fulfillment_policy_reference_choices','p_organization_id character varying, p_actor_user_id character varying')
 );
 IF v_count <> 10 THEN
  RAISE EXCEPTION 'Expected 10 fulfillment configuration SQL functions, found %',v_count;
 END IF;

 -- Verify a permission boundary independently of fixture availability.
 IF EXISTS (
   SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace,
       LATERAL aclexplode(p.proacl) acl
   WHERE ns.nspname=v_schema AND p.proname='save_organization_fulfillment_policy'
     AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
 ) THEN
   RAISE EXCEPTION 'PUBLIC must not be able to execute fulfillment configuration saves';
 END IF;
 IF NOT has_function_privilege('${appRole}', '"${schemaName}".save_organization_fulfillment_policy(varchar,jsonb,integer,varchar)', 'EXECUTE') THEN
   RAISE EXCEPTION 'Application role has no fulfillment configuration save EXECUTE privilege';
 END IF;

 -- Fixture: select a currently authorized org admin; fail explicitly if absent.
 SELECT o.organization_id, ou.user_id INTO v_org,v_actor
 FROM "${schemaName}".organization o
 JOIN "${schemaName}".organization_user ou ON ou.organization_id=o.organization_id AND NOT ou.is_deleted
 WHERE NOT o.is_deleted AND "${schemaName}".can_administer_organization(o.organization_id,ou.user_id)
 ORDER BY o.organization_id LIMIT 1;
 IF v_org IS NULL THEN
  RAISE EXCEPTION 'No authorized organization admin fixture exists for the 307 integration tests';
 END IF;

 v_before := "${schemaName}".get_organization_fulfillment_policy(v_org,v_actor);
 IF v_before #>> '{effectivePolicy,fulfillmentTypes,ORDER,journeys,IMMEDIATE_PAY_AT_COUNTER}' IS NULL THEN
   RAISE EXCEPTION 'Default Counter fulfillment journey missing';
 END IF;
 SELECT c.redemption_qr_expiry_minutes,c.is_deleted INTO v_qr,v_deleted
 FROM "${schemaName}".organization_redemption_configurations c WHERE c.organization_id=v_org;
 v_expected := (v_before->>'versionNo')::integer;
 v_saved := "${schemaName}".save_organization_fulfillment_policy(
   v_org,
   jsonb_build_object('fulfillmentTypes',jsonb_build_object('ORDER',
     jsonb_build_object('enabled',true,'workflow','SIMPLE','journeys',
       jsonb_build_object('IMMEDIATE_PAY_AT_COUNTER',true,'ADVANCE_PAY_NOW',false,'ADVANCE_PAY_AT_COUNTER',false)))),
   v_expected,v_actor);
 IF (v_saved->>'versionNo')::integer <= v_expected THEN
   RAISE EXCEPTION 'Organization configuration version was not incremented';
 END IF;
 SELECT c.redemption_qr_expiry_minutes,c.is_deleted INTO v_qr_after,v_deleted_after
 FROM "${schemaName}".organization_redemption_configurations c WHERE c.organization_id=v_org;
 IF v_qr IS NOT NULL AND (v_qr_after IS DISTINCT FROM v_qr OR v_deleted_after IS DISTINCT FROM v_deleted) THEN
   RAISE EXCEPTION 'Saving fulfillment configuration modified existing QR settings';
 END IF;

 BEGIN
  PERFORM "${schemaName}".save_organization_fulfillment_policy(v_org,'{}'::jsonb,v_expected,v_actor);
 EXCEPTION WHEN SQLSTATE '40001' THEN v_stale_blocked := TRUE;
 END;
 IF NOT v_stale_blocked THEN RAISE EXCEPTION 'Stale organization configuration save was not rejected'; END IF;

 BEGIN
  PERFORM "${schemaName}".save_organization_fulfillment_policy(v_org,
   '{"fulfillmentTypes":{"ORDER":{"journeys":{"NOT_IMPLEMENTED":true}}}}'::jsonb,
   (v_saved->>'versionNo')::integer,v_actor);
 EXCEPTION WHEN SQLSTATE '22023' THEN v_invalid_blocked := TRUE;
 END;
 IF NOT v_invalid_blocked THEN RAISE EXCEPTION 'Unsupported journey setting was not rejected'; END IF;

 SELECT s.store_id INTO v_store FROM "${schemaName}".stores s
 WHERE s.organization_id=v_org AND NOT s.is_deleted LIMIT 1;
 IF v_store IS NOT NULL THEN
   v_store_result := "${schemaName}".get_store_fulfillment_overrides(v_org,v_store,v_actor);
   IF v_store_result #>> '{effectivePolicy,fulfillmentTypes,ORDER,workflow}' <> 'SIMPLE' THEN
     RAISE EXCEPTION 'Store failed to inherit organization workflow';
   END IF;
   -- Store may disable Counter without changing organization defaults.
   v_store_result := "${schemaName}".save_store_fulfillment_overrides(v_org,v_store,
     '{"fulfillmentTypes":{"ORDER":{"journeys":{"IMMEDIATE_PAY_AT_COUNTER":false}}}}'::jsonb,
     (v_store_result->>'versionNo')::integer,v_actor);
   IF (v_store_result #>> '{effectivePolicy,fulfillmentTypes,ORDER,journeys,IMMEDIATE_PAY_AT_COUNTER}')::boolean THEN
     RAISE EXCEPTION 'Store Counter journey override was not applied';
   END IF;
   -- Store may NOT enable disabled org advance method.
   v_invalid_blocked := FALSE;
   BEGIN
     PERFORM "${schemaName}".save_store_fulfillment_overrides(v_org,v_store,
       '{"fulfillmentTypes":{"ORDER":{"journeys":{"ADVANCE_PAY_NOW":true}}}}'::jsonb,
       (v_store_result->>'versionNo')::integer,v_actor);
   EXCEPTION WHEN SQLSTATE '22023' THEN v_invalid_blocked := TRUE;
   END;
   IF NOT v_invalid_blocked THEN RAISE EXCEPTION 'Store enabled org-disabled advance method'; END IF;
 END IF;

 SELECT u.user_id INTO v_customer FROM "${schemaName}"."user" u
 WHERE NOT u.is_deleted AND NOT "${schemaName}".can_administer_organization(v_org,u.user_id)
 LIMIT 1;
 IF v_customer IS NOT NULL THEN
   BEGIN
     PERFORM "${schemaName}".get_organization_fulfillment_policy(v_org,v_customer);
   EXCEPTION WHEN insufficient_privilege THEN v_denied := TRUE;
   END;
   IF NOT v_denied THEN RAISE EXCEPTION 'Non-admin actor could read Admin policy'; END IF;
 END IF;
 RAISE NOTICE 'Fulfillment Admin tests passed (fixture org %, actor %). Transaction will roll back.',v_org,v_actor;
END;
$test$;
ROLLBACK;

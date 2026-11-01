-- Extends the existing append-only agreement acceptance function to Counter.
-- No new table, trigger, or mutation of previously accepted documents.
CREATE OR REPLACE FUNCTION "${schemaName}".record_membership_agreement_acceptance(
 p_acceptance_id varchar, p_organization_id varchar, p_customer_user_id varchar,
 p_membership_product_id varchar, p_purchase_reference varchar,
 p_acceptance_channel varchar, p_agreement_text text, p_agreement_sha256 varchar,
 p_agreement_snapshot jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
DECLARE v_record membership_agreement_acceptance%ROWTYPE;
BEGIN
 IF NULLIF(btrim(p_purchase_reference),'') IS NULL OR length(p_purchase_reference)>160
   OR p_acceptance_channel NOT IN ('CUSTOMER_WEB','CUSTOMER_MOBILE','COUNTER_CUSTOMER')
   OR length(p_agreement_text) NOT BETWEEN 1 AND 100000
   OR p_agreement_sha256 !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(p_agreement_snapshot) IS DISTINCT FROM 'object'
   OR NULLIF(p_agreement_snapshot->>'planId','') IS NULL THEN
  RAISE EXCEPTION 'Invalid membership agreement acceptance' USING ERRCODE='22023';
 END IF;
 IF p_acceptance_channel = 'COUNTER_CUSTOMER' AND
    (NULLIF(p_agreement_snapshot->>'counterStoreId','') IS NULL OR
     NULLIF(p_agreement_snapshot->>'counterStaffId','') IS NULL OR
     NULLIF(p_agreement_snapshot->>'counterActorUserId','') IS NULL OR
     p_agreement_snapshot->>'consentMethod' IS DISTINCT FROM 'CUSTOMER_TAPPED_COUNTER_SCREEN') THEN
  RAISE EXCEPTION 'Counter acceptance context is required' USING ERRCODE='22023';
 END IF;
 IF NOT customer_can_start_membership_purchase(p_organization_id,p_customer_user_id) THEN
  RAISE EXCEPTION 'Customer is not eligible for this organization' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM membership_products mp
  JOIN subscription_plans sp ON sp.membership_product_id=mp.membership_product_id
  WHERE mp.organization_id=p_organization_id
   AND mp.membership_product_id=p_membership_product_id
   AND sp.subscription_plan_id=(p_agreement_snapshot->>'planId')
   AND NOT mp.is_deleted AND NOT sp.is_deleted
 ) THEN
  RAISE EXCEPTION 'Membership plan is not available' USING ERRCODE='22023';
 END IF;
 INSERT INTO membership_agreement_acceptance (
  acceptance_id,organization_id,customer_user_id,membership_product_id,
  purchase_reference,acceptance_channel,agreement_text,agreement_sha256,agreement_snapshot
 ) VALUES (
  p_acceptance_id,p_organization_id,p_customer_user_id,p_membership_product_id,
  p_purchase_reference,p_acceptance_channel,p_agreement_text,p_agreement_sha256,p_agreement_snapshot
 ) ON CONFLICT (organization_id,purchase_reference) DO NOTHING;
 SELECT * INTO v_record FROM membership_agreement_acceptance
  WHERE organization_id=p_organization_id AND purchase_reference=p_purchase_reference;
 IF NOT FOUND OR v_record.customer_user_id IS DISTINCT FROM p_customer_user_id
   OR v_record.membership_product_id IS DISTINCT FROM p_membership_product_id
   OR v_record.acceptance_channel IS DISTINCT FROM p_acceptance_channel
   OR v_record.agreement_sha256 IS DISTINCT FROM p_agreement_sha256
   OR v_record.agreement_text IS DISTINCT FROM p_agreement_text
   OR v_record.agreement_snapshot IS DISTINCT FROM p_agreement_snapshot THEN
  RAISE EXCEPTION 'Purchase reference already belongs to different agreement' USING ERRCODE='23505';
 END IF;
 RETURN jsonb_build_object(
  'acceptanceId',v_record.acceptance_id,
  'organizationId',v_record.organization_id,
  'customerUserId',v_record.customer_user_id,
  'membershipProductId',v_record.membership_product_id,
  'purchaseReference',v_record.purchase_reference,
  'acceptanceChannel',v_record.acceptance_channel,
  'agreementText',v_record.agreement_text,
  'agreementSha256',v_record.agreement_sha256,
  'acceptedAt',v_record.accepted_at::text
 );
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".record_membership_agreement_acceptance(varchar,varchar,varchar,varchar,varchar,varchar,text,varchar,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".record_membership_agreement_acceptance(varchar,varchar,varchar,varchar,varchar,varchar,text,varchar,jsonb) TO "${appRole}";

-- Membership agreement purchase consent: append-only and idempotent, without triggers.
-- Only server-authenticated customer purchase paths should call this function.
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
   OR p_acceptance_channel NOT IN ('CUSTOMER_WEB','CUSTOMER_MOBILE')
   OR length(p_agreement_text) NOT BETWEEN 1 AND 100000
   OR p_agreement_sha256 !~ '^[0-9a-f]{64}$'
   OR jsonb_typeof(p_agreement_snapshot) IS DISTINCT FROM 'object'
   OR NULLIF(p_agreement_snapshot->>'planId','') IS NULL THEN
  RAISE EXCEPTION 'Invalid membership agreement acceptance' USING ERRCODE='22023';
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

CREATE OR REPLACE FUNCTION "${schemaName}".customer_has_membership_agreement(
 p_organization_id varchar,p_customer_user_id varchar,
 p_plan_id varchar,p_purchase_reference varchar,p_explicit_offer_id varchar,p_agreement_sha256 varchar
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM membership_agreement_acceptance a
  JOIN subscription_plans sp ON sp.subscription_plan_id=(a.agreement_snapshot->>'planId')
  WHERE a.organization_id=p_organization_id
    AND a.customer_user_id=p_customer_user_id
    AND a.purchase_reference=p_purchase_reference
    AND a.agreement_snapshot->>'planId'=p_plan_id
    AND COALESCE(a.agreement_snapshot->>'explicitOfferId','') = COALESCE(p_explicit_offer_id,'')
    AND a.agreement_sha256 = p_agreement_sha256
    AND sp.membership_product_id=a.membership_product_id
 );
$function$;

-- Return the payment-linked subscription for the customer History card. No mutation of consent.
CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_agreements(
 p_organization_id varchar,p_customer_user_id varchar
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'acceptanceId',a.acceptance_id,
  'organizationId',a.organization_id,
  'customerUserId',a.customer_user_id,
  'membershipProductId',a.membership_product_id,
  'purchaseReference',a.purchase_reference,
  'acceptanceChannel',a.acceptance_channel,
  'agreementText',a.agreement_text,
  'agreementSha256',a.agreement_sha256,
  'acceptedAt',a.accepted_at::text,
  'subscriptionId',p.finalized_subscription_id
 ) ORDER BY a.accepted_at DESC), '[]'::jsonb)
 FROM membership_agreement_acceptance a
 LEFT JOIN LATERAL (
  SELECT i.finalized_subscription_id FROM payment_intents i
   WHERE i.organization_id=a.organization_id
     AND i.customer_user_id=a.customer_user_id
     AND i.idempotency_key=a.purchase_reference
     AND i.membership_plan_id=(a.agreement_snapshot->>'planId')
     AND i.finalized_subscription_id IS NOT NULL
   ORDER BY i.created_at DESC LIMIT 1
 ) p ON TRUE
 WHERE a.organization_id=p_organization_id AND a.customer_user_id=p_customer_user_id;
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_agreement(
 p_organization_id varchar,p_customer_user_id varchar,p_acceptance_id varchar
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT rec.value
 FROM jsonb_array_elements("${schemaName}".get_customer_membership_agreements(
  p_organization_id,p_customer_user_id)) rec(value)
 WHERE rec.value->>'acceptanceId'=p_acceptance_id
 LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".record_membership_agreement_acceptance(varchar,varchar,varchar,varchar,varchar,varchar,text,varchar,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".customer_has_membership_agreement(varchar,varchar,varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".record_membership_agreement_acceptance(varchar,varchar,varchar,varchar,varchar,varchar,text,varchar,jsonb) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".customer_has_membership_agreement(varchar,varchar,varchar,varchar,varchar,varchar) TO "${appRole}";
REVOKE ALL ON TABLE "${schemaName}".membership_agreement_acceptance FROM "${appRole}";

-- A pre-release payment attempt may already exist. Do not break recovery of its
-- existing idempotency key, even though it has no agreement record.
CREATE OR REPLACE FUNCTION "${schemaName}".customer_existing_membership_payment(
 p_organization_id varchar,p_customer_user_id varchar,
 p_plan_id varchar,p_purchase_reference varchar
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT EXISTS (
  SELECT 1 FROM payment_intents i
  WHERE i.organization_id=p_organization_id
    AND i.customer_user_id=p_customer_user_id
    AND i.membership_plan_id=p_plan_id
    AND i.idempotency_key=p_purchase_reference
 );
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".customer_existing_membership_payment(varchar,varchar,varchar,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".customer_existing_membership_payment(varchar,varchar,varchar,varchar) TO "${appRole}";


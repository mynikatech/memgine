-- Membership agreement acceptance storage access. Does not mutate prior consent.
-- Payment enforcement is deliberately NOT enabled in this migration; it must be
-- deployed together with the purchase API and all payment entry point guards.
CREATE INDEX IF NOT EXISTS ix_membership_agreement_lookup
  ON "${schemaName}".membership_agreement_acceptance
  (organization_id, customer_user_id, membership_product_id, accepted_at DESC);

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_agreements(
    p_organization_id varchar, p_customer_user_id varchar
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'acceptanceId', a.acceptance_id,
   'organizationId', a.organization_id,
   'customerUserId', a.customer_user_id,
   'membershipProductId', a.membership_product_id,
   'purchaseReference', a.purchase_reference,
   'acceptanceChannel', a.acceptance_channel,
   'agreementText', a.agreement_text,
   'agreementSha256', a.agreement_sha256,
   'acceptedAt', a.accepted_at
 ) ORDER BY a.accepted_at DESC), '[]'::jsonb)
 FROM membership_agreement_acceptance a
 WHERE a.organization_id = p_organization_id
   AND a.customer_user_id = p_customer_user_id
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".get_customer_membership_agreement(
    p_organization_id varchar, p_customer_user_id varchar, p_acceptance_id varchar
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT jsonb_build_object(
   'acceptanceId', a.acceptance_id,
   'organizationId', a.organization_id,
   'customerUserId', a.customer_user_id,
   'membershipProductId', a.membership_product_id,
   'purchaseReference', a.purchase_reference,
   'acceptanceChannel', a.acceptance_channel,
   'agreementText', a.agreement_text,
   'agreementSha256', a.agreement_sha256,
   'acceptedAt', a.accepted_at
 )
 FROM membership_agreement_acceptance a
 WHERE a.organization_id = p_organization_id
   AND a.customer_user_id = p_customer_user_id
   AND a.acceptance_id = p_acceptance_id
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".get_customer_membership_agreements(varchar, varchar) FROM PUBLIC;
REVOKE ALL ON FUNCTION "${schemaName}".get_customer_membership_agreement(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_membership_agreements(varchar, varchar) TO "${appRole}";
GRANT EXECUTE ON FUNCTION "${schemaName}".get_customer_membership_agreement(varchar, varchar, varchar) TO "${appRole}";

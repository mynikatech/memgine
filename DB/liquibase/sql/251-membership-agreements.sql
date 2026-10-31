-- Organization-managed terms, distinct from existing Disclaimer.
ALTER TABLE "${schemaName}".organization_details
  ADD COLUMN membership_terms_and_conditions text;

ALTER TABLE "${schemaName}".organization_details
  ADD CONSTRAINT ck_membership_terms_length
  CHECK (membership_terms_and_conditions IS NULL OR length(membership_terms_and_conditions) <= 30000);

-- Preserve the exact rendered agreement for each explicit acceptance.
-- A purchase workflow must later associate one acceptance with each payment attempt.
CREATE TABLE "${schemaName}".membership_agreement_acceptance (
  acceptance_id varchar(80) PRIMARY KEY,
  organization_id varchar(64) NOT NULL,
  customer_user_id varchar(80) NOT NULL,
  membership_product_id varchar(80) NOT NULL,
  purchase_reference varchar(160) NOT NULL,
  acceptance_channel varchar(32) NOT NULL,
  agreement_text text NOT NULL,
  agreement_sha256 char(64) NOT NULL,
  agreement_snapshot jsonb NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_membership_agreement_channel CHECK (acceptance_channel IN ('CUSTOMER_WEB', 'CUSTOMER_MOBILE', 'COUNTER_CUSTOMER')),
  CONSTRAINT ck_membership_agreement_text CHECK (length(agreement_text) BETWEEN 1 AND 100000),
  CONSTRAINT ck_membership_agreement_sha CHECK (agreement_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ck_membership_agreement_snapshot CHECK (jsonb_typeof(agreement_snapshot) = 'object'),
  CONSTRAINT uq_membership_agreement_purchase UNIQUE (organization_id, purchase_reference)
);

CREATE INDEX ix_membership_agreement_customer
  ON "${schemaName}".membership_agreement_acceptance
  (customer_user_id, accepted_at DESC);

-- Deliberately no UPDATE or DELETE interface for acceptance records.
-- Access and immutable writes must be enforced by a server-owned service.

CREATE OR REPLACE FUNCTION "${schemaName}".get_membership_terms(p_organization_id varchar)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
 SELECT d.membership_terms_and_conditions
 FROM organization_details d
 WHERE d.organization_id = p_organization_id AND d.is_deleted = false
$function$;

CREATE OR REPLACE FUNCTION "${schemaName}".save_membership_terms(
 p_organization_id varchar, p_terms text, p_actor_user_id varchar
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
 IF NOT can_administer_organization(p_organization_id, p_actor_user_id) THEN
  RAISE EXCEPTION 'Organization administration is not permitted' USING ERRCODE = '42501';
 END IF;
 IF p_terms IS NOT NULL AND length(p_terms) > 30000 THEN
  RAISE EXCEPTION 'Membership terms exceed 30000 characters' USING ERRCODE = '22023';
 END IF;
 UPDATE organization_details
 SET membership_terms_and_conditions = NULLIF(p_terms, ''),
     updated_at = CURRENT_TIMESTAMP, updated_by = p_actor_user_id,
     version_no = version_no + 1
 WHERE organization_id = p_organization_id AND is_deleted = false;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Organization details not found' USING ERRCODE = 'P0002';
 END IF;
 RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION "${schemaName}".save_membership_terms(varchar,text,varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".save_membership_terms(varchar,text,varchar) TO "${appRole}";
REVOKE ALL ON FUNCTION "${schemaName}".get_membership_terms(varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "${schemaName}".get_membership_terms(varchar) TO "${appRole}";

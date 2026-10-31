-- Agreement acceptance must be an immutable historical record.
-- The existing table is introduced by migration 251.
-- Prevent even accidental modification through routine application SQL.
CREATE OR REPLACE FUNCTION "${schemaName}".reject_membership_agreement_mutation()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, "${schemaName}"
AS $function$
BEGIN
  RAISE EXCEPTION 'Membership agreement acceptances are immutable' USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_membership_agreement_immutable ON "${schemaName}".membership_agreement_acceptance;
CREATE TRIGGER trg_membership_agreement_immutable
BEFORE UPDATE OR DELETE ON "${schemaName}".membership_agreement_acceptance
FOR EACH ROW EXECUTE FUNCTION "${schemaName}".reject_membership_agreement_mutation();

-- A past purchase must never be silently associated with a different agreement.
CREATE INDEX IF NOT EXISTS ix_membership_agreement_lookup
ON "${schemaName}".membership_agreement_acceptance
(organization_id, customer_user_id, purchase_reference);

-- Preserve exact content in agreement_text; snapshot jsonb is metadata and
-- must NOT be used as a replacement for the exact rendered agreement.
COMMENT ON COLUMN "${schemaName}".membership_agreement_acceptance.agreement_text IS
  'Exact UTF-8 agreement text presented to the customer at acceptance time; immutable.';

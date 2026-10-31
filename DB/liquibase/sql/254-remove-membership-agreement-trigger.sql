-- Remove the trigger installed by migration 253 without changing the applied changeset.
-- Historical acceptance records remain append-only by application contract.
DROP TRIGGER IF EXISTS trg_membership_agreement_immutable
    ON "${schemaName}".membership_agreement_acceptance;

DROP FUNCTION IF EXISTS "${schemaName}".reject_membership_agreement_mutation();

-- Restrict direct mutation where the runtime DB role has table privileges.
-- Existing application read/write functions should be audited separately:
-- SECURITY DEFINER functions can have privileges independent of this role.
REVOKE UPDATE, DELETE, TRUNCATE
    ON TABLE "${schemaName}".membership_agreement_acceptance
    FROM "${appRole}";

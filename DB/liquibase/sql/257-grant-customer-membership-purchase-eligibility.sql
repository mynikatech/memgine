-- Permit the Memgine runtime application role to check the authenticated
-- customer's eligibility during Membership Agreement preview.
-- Read-only eligibility check; does not alter payments or agreement records.
GRANT EXECUTE ON FUNCTION
    "${schemaName}".customer_can_start_membership_purchase(varchar, varchar)
TO "${appRole}";

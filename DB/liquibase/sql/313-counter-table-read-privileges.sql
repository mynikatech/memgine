
-- Migration 313
-- Grant application-role read access to Counter fulfillment tables.
-- No data changes or schema changes.

GRANT SELECT ON TABLE
    "${schemaName}".fulfillments,
    "${schemaName}".redemption_entitlement_reservations
TO "${appRole}";
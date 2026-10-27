-- W225: Grant the Memgine application database role EXECUTE on W223/W224
-- manual commerce-product relink functions.
-- Permissions only: does not change Products, mappings, audit records, or RBAC.
-- Existing function-level REVOKE FROM PUBLIC remains in force.

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_preview_manual_product_relink(
    varchar, varchar, varchar, varchar
) TO "${appRole}";

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_confirm_manual_product_relink(
    varchar, varchar, varchar, integer, integer, varchar, varchar
) TO "${appRole}";

GRANT EXECUTE ON FUNCTION "${schemaName}".commerce_get_manual_relink_candidates(
    varchar, varchar, varchar, varchar
) TO "${appRole}";

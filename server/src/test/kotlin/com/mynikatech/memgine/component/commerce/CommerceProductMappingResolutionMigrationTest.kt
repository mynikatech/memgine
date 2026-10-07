package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

class CommerceProductMappingResolutionMigrationTest {
    private val sql: String by lazy {
        Files.readString(
            Path.of(
                "..",
                "DB",
                "liquibase",
                "sql",
                "147-organization-product-mapping-resolution.sql"
            )
        )
    }

    @Test
    fun `mapping resolution is admin protected atomic and scoped to the selected product mapping set`() {
        assertTrue(sql.contains("organization_product_actor("))
        assertTrue(sql.contains("LOCK TABLE commerce_product_mappings IN SHARE ROW EXCLUSIVE MODE"))
        assertTrue(sql.contains("product_id = p_product_id"))
        assertTrue(sql.contains("integration_configuration_id = v_integration_configuration_id"))
        assertTrue(sql.contains("store_id IS NOT DISTINCT FROM v_store_id"))
        assertTrue(sql.contains("commerce_product_mapping_id <> p_selected_mapping_id"))
        assertTrue(sql.contains("v_active_mapping_count < 2"))
    }

    @Test
    fun `mapping resolution only soft deletes sibling mappings`() {
        assertTrue(sql.contains("SET is_active = false,"))
        assertTrue(sql.contains("is_deleted = true,"))
        assertTrue(sql.contains("version_no = version_no + 1"))
        assertTrue(sql.contains("SECURITY DEFINER"))
        assertTrue(sql.contains("SET search_path = pg_catalog, \"${'$'}{schemaName}\""))
        assertTrue(sql.contains("REVOKE ALL ON FUNCTION"))
        assertTrue(sql.contains("TO \"${'$'}{appRole}\""))
    }
}

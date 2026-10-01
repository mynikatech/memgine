package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Documents the database boundary for administrative payment-route management.
 * PostgreSQL behavior is verified when the migration is applied; these checks
 * prevent accidental removal of the authorization and lifecycle safeguards.
 */
class CommercePaymentProviderRouteManagementMigrationTest {
    private val sql: String by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "118-commerce-payment-provider-route-management.sql"))
    }

    private val resolutionSql: String by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "117-commerce-payment-provider-routing.sql"))
    }

    @Test
    fun `route management is organization-admin protected and validates active matching integrations`() {
        assertTrue(sql.contains("can_administer_organization(p_organization_id, p_actor_user_id)"))
        assertTrue(sql.contains("integration.organization_id = p_organization_id"))
        assertTrue(sql.contains("upper(integration.provider) = v_provider"))
        assertTrue(sql.contains("integration_status.is_active"))
        assertTrue(sql.contains("integration_state.status_code = 'ACTIVE'"))
        assertTrue(sql.contains("Commerce payment store is not in organization"))
    }

    @Test
    fun `TEST routes have no integration and route lifecycle is versioned soft delete`() {
        assertTrue(sql.contains("TEST payment provider cannot have an integration configuration"))
        assertTrue(sql.contains("is_deleted = true"))
        assertTrue(sql.contains("is_enabled = false"))
        assertTrue(sql.contains("version_no = version_no + 1"))
        assertTrue(sql.contains("ERRCODE = '40001'"))
    }

    @Test
    fun `effective resolution retains store override before organization default`() {
        assertTrue(resolutionSql.contains("route.store_id = p_store_id OR route.store_id IS NULL"))
        assertTrue(resolutionSql.contains("ORDER BY CASE WHEN route.store_id = p_store_id THEN 0 ELSE 1 END"))
        assertTrue(resolutionSql.contains("route.is_enabled"))
        assertTrue(resolutionSql.contains("NOT route.is_deleted"))
    }
}

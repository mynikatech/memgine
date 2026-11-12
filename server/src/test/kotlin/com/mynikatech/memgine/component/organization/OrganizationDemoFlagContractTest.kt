package com.mynikatech.memgine.component.organization

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * DEMO-001 through DEMO-012 migration/API contract coverage.
 *
 * Database behavior is intentionally not executed here: deployment validation
 * uses an isolated PostgreSQL environment. These checks protect the source
 * contract, including legacy request preservation and Platform Admin gating.
 */
class OrganizationDemoFlagContractTest {
    private val migration: String = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "287-organization-demo-flag.sql")
    )

    @Test
    fun `DEMO-001 DEMO-002 DEMO-003 creation defaults and explicit boolean values are defined`() {
        assertTrue(migration.contains("ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT FALSE"))
        assertTrue(migration.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".create_organization("))
        assertTrue(migration.contains("website_url, is_demo,"))
        assertTrue(migration.contains("COALESCE((p_organization->>'isDemo')::boolean, FALSE)"))
        assertTrue(!migration.contains("v_is_demo"))
    }

    @Test
    fun `DEMO-004 DEMO-005 DEMO-006 reads project isDemo through all authoritative APIs`() {
        assertTrue(migration.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".get_organization("))
        assertTrue(migration.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".get_organizations()"))
        assertTrue(migration.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".get_organization_aggregate("))
        assertTrue(migration.contains("'isDemo', o.is_demo"))
    }

    @Test
    fun `DEMO-007 DEMO-008 DEMO-009 update is explicit and legacy omission preserves the stored value`() {
        assertTrue(migration.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".update_organization("))
        assertTrue(migration.contains("p_organization ? 'isDemo'"))
        assertTrue(migration.contains("p_organization->'isDemo' <> 'null'::jsonb"))
        assertTrue(migration.contains("SET is_demo = (p_organization->>'isDemo')::boolean"))
    }

    @Test
    fun `DEMO-010 existing organizations receive the REAL default`() {
        assertTrue(migration.contains("is_demo boolean NOT NULL DEFAULT FALSE"))
    }

    @Test
    fun `DEMO-011 explicit demo changes retain Platform Admin authorization`() {
        assertTrue(migration.contains("'PLATFORM_ADMIN_ACCESS'"))
        assertTrue(migration.contains("Demo organization configuration is not permitted"))
    }

    @Test
    fun `DEMO-012 frontend mapper includes the demo checkbox value`() {
        val mapper = Files.readString(
            Path.of("..", "frontend", "src", "data", "api", "mappers", "organization-api-mapper.ts")
        )
        assertTrue(mapper.contains("isDemo: organization.isDemo ?? false"))
    }
}

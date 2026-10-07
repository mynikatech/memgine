package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

class PlatformPoyntTerminalBindingMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "149-platform-poynt-terminal-bindings.sql"))
    }
    private val normalized by lazy { sql.replace(Regex("\\s+"), "") }

    @Test
    fun `terminal mutations require platform admin and expose no credentials`() {
        assertTrue(normalized.contains("rbac_has_capability(p_actor_user_id,NULL,'PLATFORM_ADMIN_ACCESS')"))
        assertTrue(normalized.contains("REVOKEALLONFUNCTION"))
        assertTrue(normalized.contains("TO\"\${appRole}\""))
        assertTrue(!sql.contains("credential_secret_reference"))
        assertTrue(!sql.contains("private_key"))
    }

    @Test
    fun `organization terminal operations require organization administration and derive provider identity`() {
        assertTrue(normalized.contains("organization_list_poynt_terminal_bindings"))
        assertTrue(normalized.contains("organization_save_poynt_terminal_binding"))
        assertTrue(normalized.contains("can_administer_organization(p_organization_id,p_actor_user_id)"))
        assertTrue(normalized.contains("c.connection_status='VERIFIED'"))
        assertTrue(normalized.contains("btrim(v_business_id)"))
    }

    @Test
    fun `terminal binding validates organization store and configured provider identity`() {
        assertTrue(normalized.contains("s.organization_id=v_organization_id"))
        assertTrue(normalized.contains("btrim(p_poynt_business_id)ISDISTINCTFROMbtrim(v_config_business_id)"))
        assertTrue(normalized.contains("b.integration_configuration_id=p_integration_id"))
        assertTrue(normalized.contains("upper(i.provider)='POYNT'"))
    }

    @Test
    fun `migration contains no trigger based payment bridge enforcement`() {
        assertTrue(!normalized.contains("CREATETRIGGER"))
        assertTrue(!normalized.contains("RETURNStrigger"))
        assertTrue(!sql.contains("enforce_remote_terminal_integration_binding"))
        assertTrue(!sql.contains("target_pos_device_id"))
    }

    @Test
    fun `deactivation is soft and revokes the generated pos device`() {
        val deactivate = sql.substringAfter("platform_deactivate_poynt_terminal_binding")
            .substringBefore("enforce_remote_terminal_integration_binding")
            .replace(Regex("\\s+"), "")
        assertTrue(deactivate.contains("SETis_deleted=true"))
        assertTrue(deactivate.contains("revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP)"))
        assertTrue(!deactivate.contains("DELETEFROM"))
    }
}

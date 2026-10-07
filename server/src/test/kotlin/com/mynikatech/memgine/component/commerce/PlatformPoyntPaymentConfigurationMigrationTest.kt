package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/** Static safeguards for the unapplied platform-only Poynt configuration migration. */
class PlatformPoyntPaymentConfigurationMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "148-platform-poynt-payment-configuration.sql"))
    }
    private val normalized by lazy { sql.replace(Regex("\\s+"), "") }

    @Test
    fun `platform writes and organization summaries have separate authorized boundaries`() {
        assertTrue(normalized.contains("rbac_has_capability(p_actor_user_id,NULL,'PLATFORM_ADMIN_ACCESS')"))
        assertTrue(normalized.contains("can_administer_organization(p_organization_id,p_actor_user_id)"))
        assertTrue(normalized.contains("SECURITYDEFINERSETsearch_path=pg_catalog,\"\${schemaName}\""))
        assertTrue(sql.contains("REVOKE ALL ON FUNCTION"))
        assertTrue(sql.contains("TO \"\${appRole}\""))
    }

    @Test
    fun `verification state is persisted without exposing the secret in organization summaries`() {
        assertTrue(sql.contains("credential_status"))
        assertTrue(sql.contains("connection_status"))
        assertTrue(sql.contains("last_verified_at"))
        val summaries = sql.substringAfter("organization_get_poynt_payment_summaries")
        assertTrue(!summaries.contains("credential_secret_reference"))
        val platformRead = sql.substringAfter("platform_get_poynt_payment_configuration")
            .substringBefore("platform_get_poynt_backend_credential_reference")
        assertTrue(!platformRead.contains("credential_secret_reference"))
        assertTrue(!platformRead.contains("credentialSecretReference"))
        assertTrue(sql.contains("platform_get_poynt_backend_credential_reference"))
    }

    @Test
    fun `backend assigned credentials retain their status when merchant fields are edited`() {
        assertTrue(sql.contains("p_backend_credential_secret_reference"))
        assertTrue(normalized.contains("credential_status=CASEWHEN"))
        assertTrue(normalized.contains("connection_status='NOT_TESTED'"))
        assertTrue(sql.contains("platform_record_poynt_credential_status"))
        assertTrue(sql.contains("Invalid Poynt verification status"))
    }

    @Test
    fun `configuration audit identity is an active organization user`() {
        assertTrue(normalized.contains("organization_user_status_id='entity-status-org-user-active'"))
    }

    @Test
    fun `platform integration shell supports only integrated POS Poynt and protects configured provider changes`() {
        val shell = sql.substringAfter("platform_save_payment_integration_shell")
            .substringBefore("platform_get_poynt_payment_configuration")
            .replace(Regex("\\s+"), "")
        assertTrue(shell.contains("rbac_has_capability(p_actor_user_id,NULL,'PLATFORM_ADMIN_ACCESS')"))
        assertTrue(shell.contains("p_integration_type_id<>'integration-type-pos'"))
        assertTrue(shell.contains("upper(btrim(p_provider))<>'POYNT'"))
        assertTrue(shell.contains("commerce_provider_catalog_configurations"))
        assertTrue(shell.contains("commerce_payment_provider_routes"))
        assertTrue(shell.contains("poynt_terminal_bindings"))
        assertTrue(shell.contains("Paymentprovidercannotchangeafterproviderconfigurationorroutingexists"))
        assertTrue(shell.contains("version_no=version_no+1"))
    }

    @Test
    fun `platform list is provider aware without returning credential references`() {
        val list = sql.substringAfter("platform_list_payment_integrations")
            .substringBefore("platform_save_payment_integration_shell")
        assertTrue(list.contains("upper(i.provider)"))
        assertTrue(list.replace(Regex("\\s+"), "").contains("upper(i.provider)::varchar='POYNT'"))
        assertTrue(!list.contains("credential_secret_reference"))
    }
}

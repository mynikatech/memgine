package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PoyntCredentialProfileMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "150-poynt-credential-profiles.sql"))
    }
    private val normalized by lazy { sql.replace(Regex("\\s+"), "") }

    @Test
    fun `profile schema assigns reusable logical profile without replacing runtime reference`() {
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS \"\${schemaName}\".poynt_credential_profiles"))
        assertTrue(sql.contains("ADD COLUMN IF NOT EXISTS credential_profile_id varchar(40)"))
        assertTrue(sql.contains("FOREIGN KEY (credential_profile_id)"))
        assertTrue(sql.contains("ix_commerce_provider_catalog_credential_profile"))
        assertFalse(sql.contains("UNIQUE (credential_profile_id)"))
    }

    @Test
    fun `profile list is platform authorized and never returns secret reference`() {
        val list = sql.substringAfter("platform_list_poynt_credential_profiles")
            .substringBefore("DROP FUNCTION IF EXISTS \"\${schemaName}\".platform_list_payment_integrations")
        assertTrue(list.contains("PLATFORM_ADMIN_ACCESS"))
        assertTrue(list.contains("SECURITY DEFINER"))
        assertTrue(list.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
        assertTrue(list.contains("\"credentialProfileId\""))
        assertTrue(list.contains("\"displayName\""))
        assertFalse(list.substringAfter("RETURNS TABLE").substringBefore("LANGUAGE").contains("secret_reference"))
        assertTrue(sql.contains("REVOKE ALL ON FUNCTION"))
        assertTrue(sql.contains("TO \"\${appRole}\""))
    }

    @Test
    fun `save resolves active profile and persists profile plus runtime reference`() {
        val save = normalized.substringAfter("platform_save_poynt_payment_configuration(")
        assertTrue(save.contains("p_credential_profile_idvarchar"))
        assertTrue(save.contains("p.is_activeANDNOTp.is_deleted"))
        assertTrue(save.contains("credential_profile_id,credential_secret_reference"))
        assertTrue(save.contains("p_credential_profile_id,v_secret_reference"))
        assertTrue(save.contains("ISDISTINCTFROMEXCLUDED.credential_profile_idTHEN'NOT_CONFIGURED'"))
        assertTrue(save.contains("connection_status='NOT_TESTED'"))
        assertTrue(save.contains("NULLIF(btrim(p_provider_store_id),'')"))
    }

    @Test
    fun `backfill uses exact configured reference only`() {
        assertTrue(normalized.contains("c.credential_secret_reference=p.secret_reference"))
        assertTrue(normalized.contains("c.credential_profile_idISNULL"))
        assertFalse(sql.contains("LIKE"))
    }

    @Test
    fun `dev and local seed profile while prod does not seed a secret`() {
        val local = Files.readString(Path.of("..", "DB", "env", "local", "db.changelog-master.local.yaml"))
        val dev = Files.readString(Path.of("..", "DB", "env", "dev", "db.changelog-master.dev.yaml"))
        val prod = Files.readString(Path.of("..", "DB", "env", "prod", "db.changelog-master.prod.yaml"))
        listOf(local, dev).forEach {
            assertTrue(it.contains("POYNT-CRED-001"))
            assertTrue(it.contains("memgine/dev/poynt/cloud-app"))
            assertTrue(it.contains("value: \"true\""))
        }
        assertTrue(prod.contains("poyntCredentialProfileSeedEnabled"))
        assertTrue(prod.contains("value: \"false\""))
        assertFalse(prod.contains("memgine/dev/poynt/cloud-app"))
    }
}

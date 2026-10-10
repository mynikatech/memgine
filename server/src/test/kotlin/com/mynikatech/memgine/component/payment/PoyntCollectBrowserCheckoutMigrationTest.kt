package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PoyntCollectBrowserCheckoutMigrationTest {
    private val sql = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "156-poynt-collect-browser-checkout.sql")
    )

    @Test fun `checkout establishment stores only opaque token hashes`() {
        assertTrue(sql.contains("establishment_token_hash varchar(64) NOT NULL UNIQUE"))
        assertTrue(sql.contains("browser_session_hash varchar(64) UNIQUE"))
        assertTrue(sql.contains("csrf_token_hash varchar(64)"))
        assertFalse(sql.contains("establishment_token varchar"))
    }

    @Test fun `redeem is atomically one time and browser sessions expire`() {
        assertTrue(sql.contains("FOR UPDATE"))
        assertTrue(sql.contains("v_session.established_at IS NOT NULL"))
        assertTrue(sql.contains("v_session.expires_at <= CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("s.browser_expires_at > CURRENT_TIMESTAMP"))
    }

    @Test fun `checkout functions are security definer with restricted execution`() {
        assertTrue(sql.contains("SECURITY DEFINER"))
        assertTrue(sql.contains("SET search_path = pg_catalog"))
        assertTrue(sql.contains("REVOKE ALL ON FUNCTION"))
        assertTrue(sql.contains("TO \"${'$'}{appRole}\""))
    }
}

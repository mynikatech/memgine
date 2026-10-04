package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/** Static contract checks; PostgreSQL concurrency still requires runtime validation. */
class PoyntCollectMigrationSecurityTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "142-poynt-collect-payment.sql"))
    }

    @Test fun `configuration is scoped to authorized CUSTOMER_SESSION intent and organization`() {
        assertTrue(sql.contains("pi.payment_intent_id = p_intent_id"))
        assertTrue(sql.contains("pi.organization_id = p_organization_id"))
        assertTrue(sql.contains("payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)"))
        assertTrue(sql.contains("pi.authorization_mode = 'CUSTOMER_SESSION'"))
        assertTrue(sql.contains("c.organization_id = p_organization_id"))
        assertTrue(sql.contains("v_count <> 1"))
    }

    @Test fun `charge claim locks the intent and cannot claim again`() {
        assertTrue(sql.contains("FOR UPDATE"))
        assertTrue(sql.contains("v_intent.status <> 'PENDING' OR v_intent.provider_reference_id IS NOT NULL"))
        assertTrue(sql.contains("payment_actor_is_authorized(p_intent_id, p_actor_user_id)"))
        assertTrue(sql.contains("SET status = 'PROCESSING'"))
    }

    @Test fun `definer functions use constrained path and runtime grants`() {
        assertTrue(sql.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
        assertTrue(sql.contains("FROM PUBLIC"))
        assertTrue(sql.contains("TO \"\${appRole}\""))
    }
}

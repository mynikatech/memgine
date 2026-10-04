package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/** Static contract checks; PostgreSQL concurrency still requires runtime validation. */
class PoyntCollectMigrationSecurityTest {
    private val claimSql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "142-poynt-collect-payment.sql"))
    }
    private val readerSql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "143-customer-commerce-payment-routing.sql"))
            .substringAfter("CREATE OR REPLACE FUNCTION \"\${schemaName}\".payment_get_poynt_collect_configuration(")
    }

    @Test fun `configuration is scoped to authorized CUSTOMER_SESSION intent and organization`() {
        assertTrue(readerSql.contains("pi.payment_intent_id = p_intent_id"))
        assertTrue(readerSql.contains("pi.organization_id = p_organization_id"))
        assertTrue(readerSql.contains("payment_actor_is_authorized(pi.payment_intent_id, p_actor_user_id)"))
        assertTrue(readerSql.contains("pi.authorization_mode = 'CUSTOMER_SESSION'"))
        assertTrue(readerSql.contains("c.organization_id = p_organization_id"))
        assertTrue(readerSql.contains("c.integration_configuration_id = v_intent.collect_integration_configuration_id"))
    }

    @Test fun `charge claim locks the intent and cannot claim again`() {
        assertTrue(claimSql.contains("FOR UPDATE"))
        assertTrue(claimSql.contains("v_intent.status <> 'PENDING' OR v_intent.provider_reference_id IS NOT NULL"))
        assertTrue(claimSql.contains("payment_actor_is_authorized(p_intent_id, p_actor_user_id)"))
        assertTrue(claimSql.contains("SET status = 'PROCESSING'"))
    }

    @Test fun `definer functions use constrained path and runtime grants`() {
        assertTrue(readerSql.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
        assertTrue(readerSql.contains("FROM PUBLIC"))
        assertTrue(readerSql.contains("TO \"\${appRole}\""))
    }
}

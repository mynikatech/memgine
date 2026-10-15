package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/** Static guardrails. Actual DB transaction/row-lock behavior requires integration tests. */
class PoyntCollectCaptureEvidenceMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "158-poynt-collect-capture-evidence.sql"))
    }

    @Test fun `verified capture has one record per intent and unique provider transaction`() {
        assertTrue(sql.contains("payment_intent_id varchar(64) PRIMARY KEY"))
        assertTrue(sql.contains("provider_transaction_id varchar(160) NOT NULL UNIQUE"))
        assertTrue(sql.contains("amount_minor bigint NOT NULL CHECK (amount_minor > 0)"))
    }

    @Test fun `capture is authorized and matched against saved intent details`() {
        assertTrue(sql.contains("payment_actor_is_authorized(p_intent_id, p_actor_user_id)"))
        assertTrue(sql.contains("v_intent.provider_reference_id IS DISTINCT FROM p_transaction_id"))
        assertTrue(sql.contains("round(v_intent.amount * 100)::bigint <> p_amount_minor"))
        assertTrue(sql.contains("upper(v_intent.currency_code) <> upper(p_currency_code)"))
        assertTrue(sql.contains("v_provider_code IS DISTINCT FROM 'POYNT_COLLECT'"))
    }

    @Test fun `capture upsert is locked and conflicting evidence is rejected`() {
        assertTrue(sql.contains("WHERE payment_intent_id = p_intent_id AND organization_id = p_organization_id FOR UPDATE"))
        assertTrue(sql.contains("WHERE payment_intent_id = p_intent_id FOR UPDATE"))
        assertTrue(sql.contains("Conflicting verified capture"))
        assertTrue(sql.contains("SET search_path = pg_catalog, \"\${schemaName}\""))
    }
}

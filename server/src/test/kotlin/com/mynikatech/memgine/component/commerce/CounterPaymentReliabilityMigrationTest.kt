package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Source-level contract checks for migration 280. Database lifecycle cases are
 * intentionally left to disposable-PostgreSQL integration tests; this suite
 * must never contact a provider or a shared database.
 */
class CounterPaymentReliabilityMigrationTest {
    private val sql = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "280-counter-payment-reliability.sql")
    )

    @Test
    fun `migration adds no table trigger or parallel payment state machine`() {
        assertFalse(sql.contains("CREATE TABLE", ignoreCase = true))
        assertFalse(sql.contains("CREATE TRIGGER", ignoreCase = true))
        assertTrue(sql.contains("commerce_record_remote_payment_callback("))
    }

    @Test
    fun `checkout summary exposes persisted attempt recovery state`() {
        assertTrue(sql.contains("commerce_get_counter_redemption_payment_attempt_summary"))
        assertTrue(sql.contains("\"retryAllowed\" boolean"))
        assertTrue(sql.contains("\"unresolvedPayment\" boolean"))
        assertTrue(sql.contains("a.provider_status IN ('FAILED','CANCELLED')"))
    }

    @Test
    fun `unpaid close permits only resolved verified failure evidence`() {
        assertTrue(sql.contains("commerce_close_counter_redemption_unpaid"))
        assertTrue(sql.contains("'PENDING','DISPATCHING','DISPATCHED','RECEIVED','STARTED','SUCCEEDED'"))
        assertTrue(sql.contains("e.case_status IN ('RESOLVED','CLOSED')"))
        assertTrue(sql.contains("e.provider_outcome IN ('FAILED','CANCELLED')"))
        assertTrue(sql.contains("e.classification='PROVIDER_OUTCOME_FAILED'"))
    }

    @Test
    fun `late capture preserves its first evidence and conflicting capture returns a traceable non-success`() {
        assertTrue(sql.contains("Late captured terminal callback conflicts with an earlier terminal outcome."))
        assertTrue(sql.contains("'MANUAL_REVIEW'"))
        assertTrue(sql.contains("provider_transaction_id=COALESCE(v_case.provider_transaction_id"))
        assertTrue(sql.contains("RETURN false;"))
    }

    @Test
    fun `payment evidence is locked before unpaid closure and retry uses the same safe exception rule`() {
        assertTrue(sql.contains("WHERE a.commerce_transaction_id=c.commerce_transaction_id FOR UPDATE"))
        assertTrue(sql.contains("WHERE e.commerce_transaction_id=c.commerce_transaction_id FOR UPDATE"))
        assertTrue(sql.contains("NOT active.value AND NOT unresolved.value"))
        assertTrue(sql.contains("active.value OR unresolved.value"))
    }

    @Test
    fun `callback detail establishes the transaction attempt exception lock order`() {
        assertTrue(sql.contains("SELECT * INTO v_transaction FROM commerce_transactions"))
        assertTrue(sql.contains("AND commerce_transaction_id=v_transaction_id"))
        assertTrue(sql.contains("poynt_collect_financial_exceptions\n          WHERE commerce_transaction_id"))
    }
}

package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Fast regression checks for the unapplied migration. Executable PostgreSQL
 * scenarios belong in the opt-in container fixture once this repository has a
 * disposable database test convention; these checks do not substitute for it.
 */
class PaymentRefundMigrationTest {
    private val sql = Files.readString(
        Path.of("..", "DB", "liquibase", "sql", "176-central-payment-refunds.sql")
    )

    @Test
    fun `ledger has the three central refund relations and reservation index`() {
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS \"\${schemaName}\".payment_refunds"))
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS \"\${schemaName}\".payment_refund_events"))
        assertTrue(sql.contains("CREATE TABLE IF NOT EXISTS \"\${schemaName}\".payment_refund_attempts"))
        assertTrue(sql.contains("ux_payment_refunds_org_idempotency"))
        assertTrue(sql.contains("pg_advisory_xact_lock"))
    }

    @Test
    fun `MVP request auto approves without a human approval workflow`() {
        assertTrue(sql.contains("'APPROVED','READY',CURRENT_TIMESTAMP"))
        assertTrue(sql.contains("'AUTO_APPROVED'"))
        assertTrue(sql.contains("'SYSTEM_POLICY'"))
        assertFalse(sql.contains("PAYMENT_REFUND_APPROVE"))
        assertFalse(sql.contains("payment_refund_transition"))
    }

    @Test
    fun `historical provider evidence and safe linkage checks remain mandatory`() {
        assertTrue(sql.contains("payment_provider_configs"))
        assertFalse(sql.contains("AND is_enabled"))
        assertTrue(sql.contains("poynt_collect_verified_captures"))
        assertTrue(sql.contains("f.payment_intent_id=p_payment_intent_id"))
        assertTrue(sql.contains("s.customer_user_id=v_intent.customer_user_id"))
    }

    @Test
    fun `idempotency compares immutable request inputs and unknown reservations stay held`() {
        assertTrue(sql.contains("v_existing.support_request_id IS DISTINCT FROM p_support_request_id"))
        assertTrue(sql.contains("v_existing.financial_exception_id IS DISTINCT FROM p_financial_exception_id"))
        assertTrue(sql.contains("NOT (execution_status='FAILED' OR approval_status='REJECTED')"))
    }
}

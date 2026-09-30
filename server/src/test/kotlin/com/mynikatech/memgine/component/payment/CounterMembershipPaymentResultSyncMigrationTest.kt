package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * Keeps the provider-neutral database contract explicit until a PostgreSQL
 * integration harness is available. Runtime behavior is validated on applying
 * migration 114; this test prevents accidental removal of the safety branches.
 */
class CounterMembershipPaymentResultSyncMigrationTest {
    private val sql: String by lazy {
        Files.readString(Path.of("..", "DB", "liquibase", "sql", "114-counter-membership-commerce-payment-result-sync.sql"))
    }

    @Test
    fun `linked Counter result sync is provider neutral and idempotent`() {
        assertTrue(sql.contains("commerce_sync_membership_payment_result"))
        assertTrue(sql.contains("v_commerce.source_channel IS DISTINCT FROM 'COUNTER_MEMBERSHIP'"))
        assertTrue(sql.contains("v_payment_status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED')"))
        assertTrue(sql.contains("IF v_commerce.status = 'PROVIDER_SUCCEEDED' THEN"))
        assertTrue(sql.contains("payment_channel = 'LEGACY_PAYMENT_INTENT'"))
        assertTrue(sql.contains("v_evidence_reference := 'PAYMENT_INTENT:' || v_payment.payment_intent_id"))
        assertTrue(sql.contains("provider_transaction_id"))
    }

    @Test
    fun `payment persistence remains independent from retryable Commerce sync`() {
        assertTrue(!sql.contains("PERFORM commerce_sync_membership_payment_result(v_intent.organization_id"))
        assertTrue(sql.contains("CREATE OR REPLACE FUNCTION \"\${schemaName}\".payment_cancel_intent"))
        assertTrue(!sql.contains("PERFORM commerce_sync_membership_payment_result(p_organization_id"))
        assertTrue(sql.contains("v_existing_evidence AND v_commerce.status = 'ORDER_CREATED'"))
    }
}

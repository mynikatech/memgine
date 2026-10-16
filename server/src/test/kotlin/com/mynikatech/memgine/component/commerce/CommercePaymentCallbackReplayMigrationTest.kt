package com.mynikatech.memgine.component.commerce

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Static migration guards for Payment Bridge callback replay handling.
 *
 * These assertions intentionally do not execute SQL transactions. The project has no
 * focused Commerce database fixture for the callback/finalization path; runtime locking
 * and row-state behavior must be exercised against a disposable database separately.
 */
class CommercePaymentCallbackReplayMigrationTest {
    private val callbackSql by lazy {
        Files.readString(
            Path.of(
                "..",
                "DB",
                "liquibase",
                "sql",
                "163-commerce-payment-callback-replay.sql"
            )
        ).replace("\r\n", "\n")
    }
    private val redemptionSql by lazy {
        Files.readString(
            Path.of(
                "..",
                "DB",
                "liquibase",
                "sql",
                "135-counter-redemption-pos-payment.sql"
            )
        ).replace("\r\n", "\n")
    }
    private val membershipSql by lazy {
        Files.readString(
            Path.of(
                "..",
                "DB",
                "liquibase",
                "sql",
                "122-counter-membership-commerce-payment-routing.sql"
            )
        ).replace("\r\n", "\n")
    }

    @Test
    fun `valid captured callback still records provider success`() {
        assertTrue(
            callbackSql.contains(
                "UPDATE commerce_provider_payment_attempts\n    SET\n        provider_status = 'SUCCEEDED'"
            )
        )
        assertTrue(
            callbackSql.contains(
                "UPDATE commerce_transactions\n    SET\n        status = 'PROVIDER_SUCCEEDED'"
            )
        )
    }

    @Test
    fun `exact successful replay accepts provider succeeded or completed without writes`() {
        val replayBlock = callbackSql
            .substringAfter("Exact successful callback replay is idempotent.")
            .substringBefore("A successful callback must never silently overwrite")

        assertTrue(
            replayBlock.contains(
                "t.status IN ('PROVIDER_SUCCEEDED', 'COMPLETED')"
            )
        )
        assertTrue(replayBlock.contains("RETURN true;"))
        assertFalse(replayBlock.contains("UPDATE "))
        assertFalse(replayBlock.contains("INSERT "))
    }

    @Test
    fun `successful replay retains strict capture correlation before its no op branch`() {
        val replayIndex = callbackSql.indexOf("Exact successful callback replay is idempotent.")
        val validation = callbackSql.substring(0, replayIndex)

        assertTrue(validation.contains("IS DISTINCT FROM 'CAPTURED'"))
        assertTrue(validation.contains("p_amount_minor IS DISTINCT FROM t.total_minor"))
        assertTrue(validation.contains("IS DISTINCT FROM t.currency_code"))
        assertTrue(validation.contains("p_provider_business_id"))
        assertTrue(validation.contains("p_provider_store_id"))

        val replayBlock = callbackSql.substring(replayIndex)
            .substringBefore("A successful callback must never silently overwrite")
        assertTrue(
            replayBlock.contains(
                "a.provider_transaction_id IS NOT DISTINCT FROM\n               p_provider_transaction_id"
            )
        )
        assertTrue(
            replayBlock.contains(
                "t.provider_transaction_id IS NOT DISTINCT FROM\n               p_provider_transaction_id"
            )
        )
    }

    @Test
    fun `failed cancelled and invalid state callbacks remain rejected`() {
        assertTrue(
            callbackSql.contains(
                "IF a.provider_status IN (\n        'FAILED',\n        'CANCELLED'\n    ) THEN"
            )
        )
        assertTrue(
            callbackSql.contains(
                "Remote payment callback conflicts with terminal attempt state"
            )
        )
        assertTrue(
            callbackSql.contains(
                "IF t.status IS DISTINCT FROM 'PROVIDER_IN_PROGRESS' THEN"
            )
        )
    }

    @Test
    fun `callback locking and existing finalizers prevent duplicate fulfillment`() {
        assertTrue(
            callbackSql.contains(
                "WHERE provider_reference_id = p_reference_id\n      AND payment_channel = 'REMOTE_TERMINAL'\n    FOR UPDATE"
            )
        )
        assertTrue(
            callbackSql.contains(
                "WHERE commerce_transaction_id = a.commerce_transaction_id\n      AND NOT is_deleted\n    FOR UPDATE"
            )
        )

        val redemptionFinalizer = redemptionSql
            .substringAfter(
                "CREATE OR REPLACE FUNCTION \"\${schemaName}\"." +
                    "commerce_finalize_counter_redemption_transaction("
            )
            .substringBefore("Forward-fix migration 123's remote callback actor conversion")
        val redemptionCompleted = redemptionFinalizer.indexOf("IF c.status = 'COMPLETED' THEN")
        val redemptionFinalize = redemptionFinalizer.indexOf(
            "IF c.status <> 'PROVIDER_SUCCEEDED' THEN"
        )
        assertTrue(redemptionCompleted >= 0 && redemptionCompleted < redemptionFinalize)
        assertTrue(redemptionFinalizer.substring(redemptionCompleted, redemptionFinalize).contains("RETURN true;"))

        val membershipFinalizer = membershipSql
            .substringAfter("commerce_finalize_counter_membership_payment(")
            .substringBefore("commerce_record_counter_terminal_payment_result")
        val alreadyFinalized = membershipFinalizer.indexOf(
            "IF p.finalized_subscription_id IS NOT NULL THEN"
        )
        val finalizeMembership = membershipFinalizer.indexOf("payment_finalize_membership(")
        assertTrue(alreadyFinalized >= 0 && alreadyFinalized < finalizeMembership)
        assertTrue(
            membershipFinalizer.substring(alreadyFinalized, finalizeMembership)
                .contains("RETURN p.finalized_subscription_id;")
        )
    }
}

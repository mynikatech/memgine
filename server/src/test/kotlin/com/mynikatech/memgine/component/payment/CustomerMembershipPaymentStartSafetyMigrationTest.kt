package com.mynikatech.memgine.component.payment

import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.Test
import kotlin.test.assertTrue

/** Static guardrails; concurrent transaction behavior remains an integration-test concern. */
class CustomerMembershipPaymentStartSafetyMigrationTest {
    private val sql by lazy {
        Files.readString(Path.of(
            "..", "DB", "liquibase", "sql",
            "162-customer-membership-payment-start-safety.sql"
        ))
    }
    private val paymentService by lazy {
        Files.readString(Path.of(
            "src", "main", "kotlin", "com", "mynikatech", "memgine",
            "component", "payment", "PaymentService.kt"
        ))
    }

    @Test fun `same idempotency key remains owned by its existing checkout`() {
        val idempotencyGuard = sql.substringAfter(
            "-- The established idempotency key always owns its existing checkout"
        ).substringBefore("-- This is the same active-membership rule")
        assertTrue(idempotencyGuard.contains("i.idempotency_key = p_payment_idempotency_key"))
        assertTrue(idempotencyGuard.contains("RETURN NULL"))
    }

    @Test fun `active subscription blocks a new checkout for the same membership product`() {
        assertTrue(sql.contains("existing_plan.membership_product_id = v_membership_product_id"))
        assertTrue(sql.contains("existing_state.status_code = 'ACTIVE'"))
        assertTrue(sql.contains("s.end_date >= CURRENT_DATE"))
        assertTrue(sql.contains("Customer already has an active subscription for this membership"))
    }

    @Test fun `concurrent starts are serialized before checking open checkouts`() {
        assertTrue(sql.contains("pg_advisory_xact_lock(hashtext("))
        assertTrue(sql.contains("customer-membership-start:"))
        assertTrue(sql.contains("i.status IN ('PENDING', 'PROCESSING', 'SUCCEEDED')"))
        assertTrue(sql.contains("i.finalized_subscription_id IS NULL"))
    }

    @Test fun `captured unfulfilled cases resume their existing same plan payment`() {
        assertTrue(sql.contains("FROM poynt_collect_financial_exceptions e"))
        assertTrue(sql.contains("e.case_status IN ('OPEN', 'UNDER_REVIEW')"))
        assertTrue(sql.contains("v_recovery_count = 1"))
        assertTrue(sql.contains("v_recovery_plan_id = p_subscription_plan_id"))
        assertTrue(sql.contains("RETURN v_recovery_intent_id"))
    }

    @Test fun `financial exception recovery precedes the active subscription guard`() {
        val exceptionLookup = sql.indexOf("FROM poynt_collect_financial_exceptions e")
        val activeGuard = sql.indexOf("Customer already has an active subscription for this membership")
        assertTrue(exceptionLookup >= 0 && exceptionLookup < activeGuard)
    }

    @Test fun `different plan checkout for the same membership product requires review`() {
        assertTrue(sql.contains("Existing membership payment terms require review before another purchase"))
        assertTrue(sql.contains("existing_plan.membership_product_id = v_membership_product_id"))
    }

    @Test fun `different explicit offer cannot silently reuse a pending checkout`() {
        assertTrue(sql.contains("p_explicit_offer_id varchar"))
        assertTrue(sql.contains("v_recovery_offer_id IS NOT DISTINCT FROM p_explicit_offer_id"))
    }

    @Test fun `guard scope is the current membership product and does not add a plan uniqueness constraint`() {
        assertTrue(sql.contains("v_membership_product_id"))
        assertTrue(sql.contains("It does not create a durable"))
        assertTrue(sql.contains("product/plan purchase restriction."))
    }

    @Test fun `recovered non pending intents cannot create a second provider checkout`() {
        assertTrue(paymentService.contains("return if (intent.status == \"PENDING\")"))
        assertTrue(paymentService.contains("Never create another provider checkout from it"))
    }

}

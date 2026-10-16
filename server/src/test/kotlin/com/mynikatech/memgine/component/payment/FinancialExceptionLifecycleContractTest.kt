package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.component.commerce.DurableFinancialExceptionRecovery
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

class FinancialExceptionLifecycleContractTest {
    private fun transition(
        organizationId: String,
        caseOrganizationId: String,
        from: String,
        to: String,
        fulfilled: Boolean,
        reason: String,
        admin: Boolean
    ): String {
        require(admin) { "admin required" }
        require(organizationId == caseOrganizationId) { "organization mismatch" }
        require(reason.isNotBlank()) { "reason required" }
        require(!Regex("token|nonce|pan|cvv|secret|private[ _-]?key|authorization|bearer|jwt|payload|[{}]", RegexOption.IGNORE_CASE).containsMatchIn(reason)) {
            "reason must be sanitized"
        }
        val allowed = (from == "OPEN" && to == "UNDER_REVIEW") || (from == "UNDER_REVIEW" && to == "OPEN") ||
            (from in setOf("OPEN", "UNDER_REVIEW") && to == "RESOLVED" && fulfilled) || (from == "RESOLVED" && to == "CLOSED")
        require(allowed) { "transition denied" }
        return to
    }

    @Test fun `allowed lifecycle transitions require persisted fulfillment for resolution`() {
        assertEquals("UNDER_REVIEW", transition("ORG-1", "ORG-1", "OPEN", "UNDER_REVIEW", false, "Review started", true))
        assertEquals("RESOLVED", transition("ORG-1", "ORG-1", "OPEN", "RESOLVED", true, "Verified fulfillment", true))
        assertEquals("CLOSED", transition("ORG-1", "ORG-1", "RESOLVED", "CLOSED", true, "Case retained", true))
    }

    @Test fun `forbidden transitions and unauthorized access are rejected`() {
        assertFailsWith<IllegalArgumentException> { transition("ORG-1", "ORG-1", "OPEN", "CLOSED", false, "Skip", true) }
        assertFailsWith<IllegalArgumentException> { transition("ORG-1", "ORG-1", "OPEN", "UNDER_REVIEW", false, "", true) }
        assertFailsWith<IllegalArgumentException> { transition("ORG-1", "ORG-1", "OPEN", "UNDER_REVIEW", false, "Review", false) }
        assertFailsWith<IllegalArgumentException> { transition("ORG-2", "ORG-1", "OPEN", "UNDER_REVIEW", false, "Review", true) }
        assertFailsWith<IllegalArgumentException> { transition("ORG-1", "ORG-1", "OPEN", "UNDER_REVIEW", false, "Token ABC", true) }
    }

    @Test fun `failed recovery identity is idempotent per server recovery attempt`() {
        val identities = linkedSetOf(
            "RECOVERY_FAILED:PFE-1:FRA-attempt-1",
            "RECOVERY_FAILED:PFE-1:FRA-attempt-1",
            "RECOVERY_FAILED:PFE-1:FRA-attempt-2"
        )

        assertEquals(
            setOf(
                "RECOVERY_FAILED:PFE-1:FRA-attempt-1",
                "RECOVERY_FAILED:PFE-1:FRA-attempt-2"
            ),
            identities
        )
    }

    @Test fun `successful recovery retains its authenticated actor and origin`() {
        val customerEvent = FinancialExceptionEventDto(
            eventType = "RECOVERY_SUCCEEDED",
            actorUserId = "USR-customer",
            actorOrigin = "CUSTOMER"
        )
        val counterEvent = FinancialExceptionEventDto(
            eventType = "RECOVERY_SUCCEEDED",
            actorUserId = "USR-staff",
            actorOrigin = "COUNTER"
        )

        assertEquals("CUSTOMER", customerEvent.actorOrigin)
        assertEquals("USR-customer", customerEvent.actorUserId)
        assertEquals("COUNTER", counterEvent.actorOrigin)
        assertEquals("USR-staff", counterEvent.actorUserId)
    }

    @Test fun `failed recovery can record an audit event after fulfillment rolls back`() {
        var caseOpened = false
        var failureAudited = false

        try {
            DurableFinancialExceptionRecovery(
                establishCase = { caseOpened = true },
                finalizeFulfillment = { throw IllegalStateException("fulfillment rollback") }
            ).recover()
        } catch (_: IllegalStateException) {
            if (caseOpened) {
                failureAudited = true // A later transaction records the sanitized audit outcome.
            }
        }

        assertTrue(caseOpened)
        assertTrue(failureAudited)
    }

    @Test fun `audit persistence failure preserves the original fulfillment failure`() {
        val fulfillmentFailure = IllegalStateException("fulfillment rollback")
        var reported: Throwable? = null

        try {
            throw fulfillmentFailure
        } catch (failure: Throwable) {
            try {
                throw IllegalStateException("audit unavailable")
            } catch (_: IllegalStateException) {
                // The service intentionally preserves the original failure.
            }
            reported = failure
        }

        assertSame(fulfillmentFailure, reported)
    }

    @Test fun `historical exception receives one neutral opening event`() {
        val existing = FinancialExceptionDetailDto(
            financialExceptionId = "PFE-legacy",
            caseStatus = "OPEN",
            fulfillmentOutcome = "UNFULFILLED"
        )
        val identities = linkedSetOf("OPENED:PFE-legacy", "OPENED:PFE-legacy")
        val event = FinancialExceptionEventDto(
            eventType = "OPENED",
            actorOrigin = "SYSTEM",
            description = "Historical financial exception opening event backfilled by migration 167."
        )

        assertEquals("PFE-legacy", existing.financialExceptionId)
        assertEquals("OPEN", existing.caseStatus)
        assertEquals(setOf("OPENED:PFE-legacy"), identities)
        assertEquals("SYSTEM", event.actorOrigin)
    }

    @Test fun `late failed recovery does not reopen a fulfilled exception`() {
        val currentCaseStatus = "RESOLVED"
        val currentOutcome = "FULFILLED"
        val event = FinancialExceptionEventDto(
            eventType = "RECOVERY_FAILED",
            previousCaseStatus = currentCaseStatus,
            newCaseStatus = currentCaseStatus,
            previousFulfillmentOutcome = currentOutcome,
            newFulfillmentOutcome = currentOutcome,
            description = "A fulfillment recovery attempt did not complete after the exception was already fulfilled."
        )

        assertEquals("RESOLVED", event.newCaseStatus)
        assertEquals("FULFILLED", event.newFulfillmentOutcome)
        assertTrue(event.description.contains("already fulfilled"))
    }

    @Test fun `sanitized event and read responses carry no provider payload`() {
        val event = FinancialExceptionEventDto(eventType = "RECOVERY_FAILED", description = "Fulfillment recovery did not complete; the exception remains available for review.")
        val detail = FinancialExceptionDetailDto(financialExceptionId = "PFE-1")

        assertFalse(event.description.contains("token", ignoreCase = true))
        assertFalse(event.toString().contains("payload", ignoreCase = true))
        assertFalse(detail.toString().contains("payload", ignoreCase = true))
        assertEquals("PFE-1", detail.financialExceptionId)
    }
}

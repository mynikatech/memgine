package com.mynikatech.memgine.component.commerce

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class RemoteTerminalFinancialExceptionFinalizerTest {
    @Test
    fun `confirmed capture with failed fulfillment opens one durable case`() {
        var cases = 0
        val finalizer = RemoteTerminalFinancialExceptionFinalizer(
            finalizePayment  = { throw IllegalStateException("fulfillment failed") },
            openExceptionCase = {
                cases++
                "PFE-1"
            },
            recordCompletion = { error("completion must not be recorded") },
            reportExceptionFailure = { error("case creation succeeded") }
        )

        assertFailsWith<IllegalStateException> { finalizer.finalize("reference") }
        assertEquals(1, cases)
    }

   @Test
    fun `repeated fulfillment failures leave case deduplication to the durable opener`() {
        val caseIds = mutableListOf<String?>()

        val finalizer = RemoteTerminalFinancialExceptionFinalizer(
            finalizePayment  = { throw IllegalStateException("fulfillment failed") },
            openExceptionCase = {
                caseIds.add("PFE-1")
                "PFE-1"
            },
            recordCompletion = {},
            reportExceptionFailure = {}
        )

        repeat(2) {
            assertFailsWith<IllegalStateException> {
                finalizer.finalize("reference")
            }
        }

        assertEquals(2, caseIds.size)
        assertEquals("PFE-1", caseIds[0])
        assertEquals("PFE-1", caseIds[1])
    }

    @Test
    fun `unconfirmed provider outcome cannot be represented as a captured case`() {
        var cases = 0
        val finalizer = RemoteTerminalFinancialExceptionFinalizer(
            // A noncaptured callback never reaches Commerce finalization, so no
            // exception opener is invoked from this success-free path.
            finalizePayment  = { null },
            openExceptionCase = { cases++; "PFE-1" },
            recordCompletion = {},
            reportExceptionFailure = {}
        )

        assertEquals(null, finalizer.finalize("reference"))
        assertEquals(0, cases)
    }

    @Test
    fun `case persistence failure does not mask the fulfillment failure`() {
        var reportCalls = 0
        val finalizer = RemoteTerminalFinancialExceptionFinalizer(
            finalizePayment  = { throw IllegalStateException("fulfillment failed") },
            openExceptionCase = { throw IllegalStateException("case unavailable") },
            recordCompletion = {},
            reportExceptionFailure = { reportCalls++ }
        )

        assertFailsWith<IllegalStateException> { finalizer.finalize("reference") }
        assertEquals(1, reportCalls)
    }
}
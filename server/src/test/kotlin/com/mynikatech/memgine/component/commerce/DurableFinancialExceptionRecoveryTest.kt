package com.mynikatech.memgine.component.commerce

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class DurableFinancialExceptionRecoveryTest {
    @Test
    fun `verified capture with incomplete fulfillment establishes case before recovery`() {
        val events = mutableListOf<String>()
        val recovered = DurableFinancialExceptionRecovery(
            establishCase = { events += "case" },
            finalizeFulfillment = { events += "finalize"; "SUB-1" }
        ).recover()

        assertEquals("SUB-1", recovered)
        assertEquals(listOf("case", "finalize"), events)
    }

    @Test
    fun `repeated recovery relies on existing idempotent finalizer result`() {
        var activations = 0
        var finalizedSubscription: String? = null
        val recover = {
            DurableFinancialExceptionRecovery(
                establishCase = {},
                finalizeFulfillment = {
                    finalizedSubscription ?: run {
                        activations++
                        "SUB-1".also { finalizedSubscription = it }
                    }
                }
            ).recover()
        }

        assertEquals("SUB-1", recover())
        assertEquals("SUB-1", recover())
        assertEquals(1, activations)
    }

    @Test
    fun `unconfirmed capture cannot invoke fulfillment`() {
        var finalizations = 0
        val recovery = DurableFinancialExceptionRecovery(
            establishCase = { throw IllegalStateException("verified capture is unavailable") },
            finalizeFulfillment = { finalizations++; "SUB-1" }
        )

        assertFailsWith<IllegalStateException> { recovery.recover() }
        assertEquals(0, finalizations)
    }

    @Test
    fun `failed fulfillment leaves previously established case intact`() {
        var cases = 0
        val recovery = DurableFinancialExceptionRecovery<String>(
            establishCase = { cases++ },
            finalizeFulfillment = { throw IllegalStateException("fulfillment unavailable") }
        )

        assertFailsWith<IllegalStateException> { recovery.recover() }
        assertEquals(1, cases)
    }

    @Test
    fun `successful recovery can transition the existing case once`() {
        var caseStatus = "OPEN"
        DurableFinancialExceptionRecovery(
            establishCase = { if (caseStatus == "OPEN") Unit },
            finalizeFulfillment = { caseStatus = "RESOLVED"; "TX-1" }
        ).recover()

        assertEquals("RESOLVED", caseStatus)
    }
}

package com.mynikatech.memgine.component.receipt

import kotlin.test.Test
import kotlin.test.assertEquals

class BusinessActualSavingsTest {
    private fun row(subscription: String, currency: String, amount: Long, state: String = "COMPLETE") =
        BusinessSavingsMembership(subscription, "Membership", "Plan", currency, amount, 1, state)

    @Test fun `totals group verified net savings by currency including historical memberships`() {
        val result = businessActualSavings(listOf(row("gold", "CAD", 799), row("old", "CAD", 100), row("silver", "USD", 124)))
        assertEquals("COMPLETE", result.coverageState)
        assertEquals(listOf(BusinessSavingsTotal("CAD", 899, "COMPLETE"), BusinessSavingsTotal("USD", 124, "COMPLETE")), result.totals)
    }

    @Test fun `partial coverage retains verified zero and marks all currencies partial`() {
        val result = businessActualSavings(listOf(row("gold", "CAD", 0), row("silver", "USD", 124, "PARTIAL")))
        assertEquals("PARTIAL", result.coverageState)
        assertEquals(listOf(BusinessSavingsTotal("CAD", 0, "PARTIAL"), BusinessSavingsTotal("USD", 124, "PARTIAL")), result.totals)
    }

    @Test fun `missing verified evidence is never presented as zero`() {
        val missing = BusinessSavingsMembership("gold", "Membership", "Plan", "CAD", null, 0, "NO_VERIFIED_DATA")
        assertEquals("PARTIAL", businessActualSavings(listOf(missing)).coverageState)
        assertEquals(emptyList(), businessActualSavings(listOf(missing)).totals)
        assertEquals("NO_REDEMPTION_HISTORY", businessActualSavings(emptyList()).coverageState)
        val empty = businessActualSavings(listOf(BusinessSavingsMembership(activePlanCurrencyCode = "CAD")))
        assertEquals("CAD", empty.activePlanCurrencyCode)
        assertEquals(emptyList(), empty.memberships)
        assertEquals("PARTIAL", businessActualSavings(listOf(BusinessSavingsMembership(coverageState = "NO_VERIFIED_DATA", activePlanCurrencyCode = "CAD"))).coverageState)
    }

    @Test fun `overflow cannot produce a misleading total`() {
        val result = businessActualSavings(listOf(row("one", "CAD", Long.MAX_VALUE), row("two", "CAD", 1)))
        assertEquals("UNAVAILABLE", result.coverageState)
        assertEquals(emptyList(), result.totals)
    }

    @Test fun `unattributed history makes verified membership savings partial without adding a value`() {
        val gap = BusinessSavingsMembership(coverageState = "NO_VERIFIED_DATA", activePlanCurrencyCode = "CAD")
        val result = businessActualSavings(listOf(gap, row("gold", "CAD", 799), row("silver", "USD", 124)))
        assertEquals("PARTIAL", result.coverageState)
        assertEquals(listOf(BusinessSavingsTotal("CAD", 799, "PARTIAL"), BusinessSavingsTotal("USD", 124, "PARTIAL")), result.totals)
        assertEquals(2, result.memberships.size)
    }
}

package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.net.dto.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class CommerceProviderRegistryTest {
    @Test
    fun `provider capabilities are provider-neutral and code lookup is case insensitive`() {
        val provider = object : CommerceProvider {
            override val providerCode = "EXAMPLE_POS"
            override val capabilities = setOf(CommerceCapability.CATALOG, CommerceCapability.PRODUCT_LOOKUP, CommerceCapability.TERMINAL_PAYMENT)
        }
        val registry = CommerceProviderRegistry(listOf(provider))
        assertEquals(provider.capabilities, registry.capabilities("example_pos"))
        assertNull(registry.catalogProvider("example_pos"))
        assertNull(registry.checkoutProvider("example_pos"))
    }

    @Test
    fun `generic checkout model represents membership external products zero and partial adjustments`() {
        val membership = CommerceTransactionLineDto("line-membership", "ctx", "MEMBERSHIP", subscriptionPlanId = "plan", description = "Gold", quantity = 1, unitPriceMinorAuthoritative = 2000, lineSubtotalMinor = 2000, currencyCode = "CAD", priceSource = "MEMGINE_MEMBERSHIP", versionNo = 1)
        val coffee = CommerceTransactionLineDto("line-coffee", "ctx", "EXTERNAL_PRODUCT", productMappingId = "coffee", description = "Coffee", quantity = 1, unitPriceMinorSnapshot = 500, currencyCode = "CAD", priceSource = "EXTERNAL_SNAPSHOT", versionNo = 1)
        val freeCoffee = CommerceTransactionAdjustmentDto("adjustment-free", "ctx", "line-coffee", "adjustment", "BENEFIT", "benefit", "PRODUCT_FREE", status = "REQUESTED", versionNo = 1)
        val partialCoffee = CommerceTransactionAdjustmentDto("adjustment-partial", "ctx", "line-coffee", "adjustment", "OFFER", "offer", "PRODUCT_FIXED_OFF", requestedAmountMinor = 300, currencyCode = "CAD", status = "REQUESTED", versionNo = 1)
        val request = CommerceCheckoutRequest("org", "ctx", null, "customer", "COUNTER", "key", listOf(membership, coffee), listOf(freeCoffee, partialCoffee), "CAD")
        assertEquals("MEMGINE_MEMBERSHIP", request.lines.first().priceSource)
        assertEquals("EXTERNAL_SNAPSHOT", request.lines.last().priceSource)
        assertEquals(300, request.adjustments.last().requestedAmountMinor)
    }

    @Test
    fun `unconfigured fulfillment cannot accidentally mark a transaction complete`() {
        val transaction = CommerceTransactionDetailDto(
            CommerceTransactionDto("ctx", "org", sourceChannel = "COUNTER", status = "FULFILLMENT_PENDING", idempotencyKey = "key", createdAt = "now", updatedAt = "now", versionNo = 1), emptyList(), emptyList(), emptyList()
        )
        val outcome = UnavailableCommerceFulfillmentExecutor.fulfill(transaction)
        assertFalse(outcome.completed)
        assertEquals("FULFILLMENT_NOT_CONFIGURED", outcome.failureCode)
    }
}

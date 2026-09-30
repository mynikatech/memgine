package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.net.dto.PaymentIntentDto
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PaymentIntentCommerceCorrelationTest {
    @Test
    fun `payment intent supports historical rows without a commerce transaction`() {
        assertNull(paymentIntent().commerceTransactionId)
    }

    @Test
    fun `payment intent exposes its optional commerce transaction correlation`() {
        assertEquals("CTX-1", paymentIntent(commerceTransactionId = "CTX-1").commerceTransactionId)
    }

    private fun paymentIntent(commerceTransactionId: String? = null) = PaymentIntentDto(
        paymentIntentId = "PAY-1",
        providerCode = "TEST",
        status = "PENDING",
        amount = 10.0,
        currencyCode = "CAD",
        membershipPlanId = "PLAN-1",
        createdAt = "2026-09-30T00:00:00Z",
        commerceTransactionId = commerceTransactionId
    )
}

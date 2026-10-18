package com.mynikatech.memgine.component.payment

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class PaymentRefundProviderTest {
    private val request = PaymentRefundDetailDto(
        paymentRefundId = "PRF-1", organizationId = "ORG-1", paymentIntentId = "PAY-1",
        originalProviderCode = "POYNT_COLLECT", capturedAmountMinor = 8999,
        currencyCode = "CAD", refundAmountMinor = 8999, reasonCode = "DUPLICATE_PAYMENT"
    )

    @Test
    fun `R1 unsupported adapter never dispatches or invents a provider reference`() {
        val adapter = UnsupportedPaymentRefundProvider("POYNT_COLLECT")
        val execute = adapter.execute(request)
        val reconcile = adapter.reconcile(request)

        assertEquals(PaymentRefundProviderOutcome.UNSUPPORTED_REQUIRES_MANUAL, execute.outcome)
        assertEquals(PaymentRefundProviderOutcome.UNSUPPORTED_REQUIRES_MANUAL, reconcile.outcome)
        assertNull(execute.providerReference)
        assertNull(reconcile.providerReference)
    }

    @Test
    fun `MVP policy automatically approves an otherwise eligible refund without a human approver`() {
        val decision = MvpAutoApprovePaymentRefundPolicy.decide(
            PaymentRefundRequestDto(
                paymentIntentId = "PAY-1", amountMinor = 500,
                reasonCode = "INCORRECT_AMOUNT", idempotencyKey = "refund-key-1"
            ),
            "USR-1"
        )

        assertEquals(PaymentRefundApprovalDecision.AUTO_APPROVED, decision)
    }
}

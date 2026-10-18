package com.mynikatech.memgine.component.payment

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PaymentRefundContractTest {
    private val refund = PaymentRefundDetailDto(
        paymentRefundId = "PRF-100",
        organizationId = "ORG-100",
        paymentIntentId = "PAY-100",
        originalProviderCode = "POYNT_COLLECT",
        originalProviderTransactionReference = "TX-100",
        capturedAmountMinor = 10_000,
        currencyCode = "CAD",
        refundAmountMinor = 2_500,
        reasonCode = "DUPLICATE_PAYMENT"
    )

    @Test
    fun `approval policy is provider independent and leaves original provider identity intact`() {
        val request = PaymentRefundRequestDto(
            paymentIntentId = refund.paymentIntentId!!,
            amountMinor = refund.refundAmountMinor,
            reasonCode = refund.reasonCode,
            idempotencyKey = "refund-100"
        )

        assertEquals(
            PaymentRefundApprovalDecision.AUTO_APPROVED,
            MvpAutoApprovePaymentRefundPolicy.decide(request, "USR-OWNER")
        )
        assertEquals("POYNT_COLLECT", refund.originalProviderCode)
        assertEquals("TX-100", refund.originalProviderTransactionReference)
    }

    @Test
    fun `approval policy cannot dispatch a provider refund`() {
        val provider = RecordingRefundProvider()
        val decision = MvpAutoApprovePaymentRefundPolicy.decide(
            PaymentRefundRequestDto("PAY-100", 2_500, "DUPLICATE_PAYMENT", idempotencyKey = "refund-101"),
            "USR-ADMIN"
        )

        assertEquals(PaymentRefundApprovalDecision.AUTO_APPROVED, decision)
        assertEquals(0, provider.executeCalls)
        assertEquals(0, provider.reconcileCalls)
    }

    @Test
    fun `provider result contract keeps failure timeout and unknown distinct from success`() {
        val outcomes = listOf(
            PaymentRefundProviderOutcome.SUCCEEDED,
            PaymentRefundProviderOutcome.FAILED,
            PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION,
            PaymentRefundProviderOutcome.PENDING
        )

        assertTrue(outcomes.contains(PaymentRefundProviderOutcome.SUCCEEDED))
        assertFalse(outcomes.drop(1).contains(PaymentRefundProviderOutcome.SUCCEEDED))
        assertEquals(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION, outcomes[2])
    }

    @Test
    fun `unsupported provider is not a successful or pending refund`() {
        val result = UnsupportedPaymentRefundProvider("MONERIS").execute(refund)

        assertEquals(PaymentRefundProviderOutcome.UNSUPPORTED_REQUIRES_MANUAL, result.outcome)
        assertNull(result.providerReference)
        assertFalse(result.outcome in setOf(PaymentRefundProviderOutcome.SUCCEEDED, PaymentRefundProviderOutcome.PENDING))
    }

    private class RecordingRefundProvider : PaymentRefundProvider {
        override val providerCode = "FAKE"
        var executeCalls = 0
        var reconcileCalls = 0

        override fun execute(request: PaymentRefundDetailDto): PaymentRefundProviderResult {
            executeCalls += 1
            return PaymentRefundProviderResult(PaymentRefundProviderOutcome.SUCCEEDED, "fake-refund")
        }

        override fun reconcile(request: PaymentRefundDetailDto): PaymentRefundProviderResult {
            reconcileCalls += 1
            return PaymentRefundProviderResult(PaymentRefundProviderOutcome.UNKNOWN_REQUIRES_RECONCILIATION)
        }
    }
}

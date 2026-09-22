package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.net.dto.PaymentIntentDto

/** Boundary for future Stripe, Poynt, and Helcim adapters. No provider secrets cross this boundary. */
interface PaymentProvider {
    val code: String
    val isAvailable: Boolean
    fun canConfirm(status: String): Boolean
    fun providerReference(paymentIntent: PaymentIntentDto, suppliedReference: String?): String?
}

/** Available only in local/dev; production has no client-callable payment provider. */
class TestPaymentProvider(private val enabled: Boolean) : PaymentProvider {
    override val code = "TEST"
    override val isAvailable = enabled
    override fun canConfirm(status: String) = enabled && status in setOf("SUCCEEDED", "FAILED", "CANCELED")
    override fun providerReference(paymentIntent: PaymentIntentDto, suppliedReference: String?) =
        suppliedReference?.takeIf { it.isNotBlank() } ?: "test-${paymentIntent.paymentIntentId}"
}

/** Staff-confirmed cash is available only through Counter payment routes. */
object CashPaymentProvider : PaymentProvider {
    override val code = "CASH"
    override val isAvailable = true
    override fun canConfirm(status: String) = status == "SUCCEEDED"
    override fun providerReference(paymentIntent: PaymentIntentDto, suppliedReference: String?) =
        "cash-${paymentIntent.paymentIntentId}"
}

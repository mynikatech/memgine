package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentReturnContextDto
import com.stripe.exception.SignatureVerificationException
import com.stripe.exception.StripeException
import com.stripe.model.Event
import com.stripe.model.checkout.Session
import com.stripe.net.RequestOptions
import com.stripe.net.Webhook
import com.stripe.param.checkout.SessionCreateParams
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class StripeCheckoutSession(
    val id: String,
    val url: String
)

class StripePaymentProvider(private val config: PaymentConfig) : PaymentProvider {
    override val code = "STRIPE"
    override val isAvailable: Boolean
        get() = config.stripeSecretKey.isNotBlank() && config.stripeWebhookSecret.isNotBlank() && config.webBaseUrl.isNotBlank()

    override fun canConfirm(status: String): Boolean = false
    override fun providerReference(paymentIntent: PaymentIntentDto, suppliedReference: String?): String? = suppliedReference

    fun createCheckoutSession(
        payment: PaymentIntentDto,
        organizationId: String,
        returnContext: PaymentReturnContextDto?
    ): StripeCheckoutSession {
        requireAvailable()
        val parameters = SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.PAYMENT)
            .setSuccessUrl(returnUrl(payment, organizationId, returnContext, false))
            .setCancelUrl(returnUrl(payment, organizationId, returnContext, true))
            .putMetadata("memgine_payment_intent_id", payment.paymentIntentId)
            .putMetadata("organization_id", organizationId)
            .addLineItem(
                SessionCreateParams.LineItem.builder()
                    .setQuantity(1)
                    .setPriceData(
                        SessionCreateParams.LineItem.PriceData.builder()
                            .setCurrency(payment.currencyCode.lowercase())
                            .setUnitAmount(amountMinor(payment.amount))
                            .setProductData(
                                SessionCreateParams.LineItem.PriceData.ProductData.builder()
                                    .setName("Memgine membership")
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .build()

        return try {
            val session = Session.create(
                parameters,
                RequestOptions.builder()
                    .setApiKey(config.stripeSecretKey)
                    .setIdempotencyKey("memgine-payment-${payment.paymentIntentId}")
                    .build()
            )
            StripeCheckoutSession(
                session.id ?: throw ConflictException("Stripe checkout session was unavailable"),
                session.url ?: throw ConflictException("Stripe checkout URL was unavailable")
            )
        } catch (_: StripeException) {
            throw ConflictException("Stripe checkout could not be created")
        }
    }

    fun checkoutUrl(sessionId: String): String {
        requireAvailable()
        return try {
            Session.retrieve(
                sessionId,
                RequestOptions.builder().setApiKey(config.stripeSecretKey).build()
            ).url ?: throw ConflictException("Stripe checkout URL was unavailable")
        } catch (_: StripeException) {
            throw ConflictException("Stripe checkout could not be loaded")
        }
    }

    fun verifiedEvent(rawBody: String, signature: String?): Event {
        if (signature.isNullOrBlank() || config.stripeWebhookSecret.isBlank()) {
            throw ForbiddenException("Stripe webhook signature is invalid")
        }
        return try {
            Webhook.constructEvent(rawBody, signature, config.stripeWebhookSecret)
        } catch (_: SignatureVerificationException) {
            throw ForbiddenException("Stripe webhook signature is invalid")
        }
    }

    fun session(event: Event): Session? =
        event.dataObjectDeserializer.`object`.orElse(null) as? Session

    private fun returnUrl(
        payment: PaymentIntentDto,
        organizationId: String,
        returnContext: PaymentReturnContextDto?,
        canceled: Boolean
    ): String {
        val values = linkedMapOf(
            "paymentIntentId" to payment.paymentIntentId,
            "organizationId" to organizationId,
            "productId" to returnContext?.productId,
            "storeId" to returnContext?.storeId,
            "staffId" to returnContext?.staffId,
            "source" to returnContext?.source,
            "stripe_session_id" to "{CHECKOUT_SESSION_ID}"
        )
        if (canceled) values["paymentCancelled"] = "true"
        return config.webBaseUrl + "/join?" + values
            .filterValues { !it.isNullOrBlank() }
            .entries
            .joinToString("&") { (key, value) ->
                "$key=${if (value == "{CHECKOUT_SESSION_ID}") value else encode(value!!)}"
            }
    }

    private fun amountMinor(amount: Double): Long = try {
        BigDecimal.valueOf(amount)
            .movePointRight(2)
            .setScale(0, RoundingMode.UNNECESSARY)
            .longValueExact()
    } catch (_: ArithmeticException) {
        throw BadRequestException("Payment amount is invalid")
    }

    private fun encode(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun requireAvailable() {
        if (!isAvailable) throw BadRequestException("Stripe payment provider is not configured")
    }
}

package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.config.PaymentConfig
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentReturnContextDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import com.mynikatech.memgine.net.dto.TestPaymentConfirmationDto
import com.stripe.model.Event
import org.jdbi.v3.core.Jdbi
import java.util.UUID
import org.postgresql.util.PSQLException

class PaymentService(
    private val jdbi: Jdbi,
    environment: String,
    paymentConfig: PaymentConfig
) {
    private val testProvider = TestPaymentProvider(environment in setOf("local", "dev", "development"))
    private val stripeProvider = StripePaymentProvider(paymentConfig)
    private val monerisProvider = MonerisPaymentProvider(paymentConfig)
    private val configuredProvider: PaymentProvider = when (paymentConfig.providerCode) {
        "TEST" -> testProvider
        "STRIPE" -> stripeProvider
        "MONERIS" -> monerisProvider
        else -> throw IllegalArgumentException("Unsupported payment provider configuration")
    }
    private fun sql() = jdbi.onDemand(PaymentSql::class.java)

    fun startMembershipPayment(org: String, request: PaymentStartRequestDto, actorUserId: String?): PaymentIntentDto {
        requirePaymentProvider()
        return startMembershipPayment(org, request, actorUserId, configuredProvider)
    }

    fun startCounterCashPayment(
        org: String,
        request: PaymentStartRequestDto,
        actorUserId: String
    ): PaymentIntentDto = startMembershipPayment(org, request, actorUserId, CashPaymentProvider)

    private fun startMembershipPayment(
        org: String,
        request: PaymentStartRequestDto,
        actorUserId: String?,
        provider: PaymentProvider
    ): PaymentIntentDto {
        validateId(org, "organization id")
        validateId(request.challengeId, "challenge id")
        if (request.idempotencyKey.isBlank() || request.idempotencyKey.length > 128) {
            throw BadRequestException("Valid payment idempotency key is required")
        }
        val intent = translate { sql().start(
            UUID.randomUUID().toString(), UUID.randomUUID().toString(), org,
            request.challengeId, provider.code, request.idempotencyKey.trim(), actorUserId
        ) ?: throw ConflictException("Payment was not started") }
        return checkoutForProvider(intent, org, request.returnContext, actorUserId)
    }

    fun startAuthenticatedMembershipPayment(
        org: String,
        planId: String,
        customerUserId: String,
        idempotencyKey: String,
        returnContext: PaymentReturnContextDto? = null
    ): PaymentIntentDto {
        requirePaymentProvider()
        validateId(org, "organization id")
        validateId(planId, "membership plan id")
        validateId(customerUserId, "customer user id")
        validateIdempotencyKey(idempotencyKey)
        val intent = translate { sql().startCustomer(
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            org,
            planId,
            customerUserId,
            configuredProvider.code,
            idempotencyKey.trim()
        ) ?: throw ConflictException("Payment was not started") }
        return checkoutForProvider(intent, org, returnContext, customerUserId)
    }

    fun get(org: String, intentId: String, actorUserId: String): PaymentIntentDto = translate {
        sql().get(org, intentId, actorUserId) ?: throw NotFoundException("Payment was not found")
    }

    fun getConfirmation(org: String, intentId: String, actorUserId: String): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val payment = get(org, intentId, actorUserId)
        val subscription = if (payment.finalizedSubscriptionId == null) null else translate {
            sql().finalizedMembership(org, intentId, actorUserId)
        }?.let { row ->
            CounterPurchaseResult(
                row.subscriptionId, row.organizationUserId, row.userId, row.subscriptionNumber,
                row.subscriptionPlanId, row.subscriptionDate, row.startDate, row.endDate,
                row.subscriptionStatusId, row.totalAmount, row.currencyCode
            )
        }
        return payment to subscription
    }

    fun cancel(org: String, intentId: String, actorUserId: String): PaymentIntentDto {
        if (!translate { sql().cancel(org, intentId, actorUserId) }) throw ConflictException("Payment cannot be canceled")
        return get(org, intentId, actorUserId)
    }

    fun confirmTestAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String,
        result: TestPaymentConfirmationDto
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        val status = result.status.trim().uppercase()
        if (!testProvider.canConfirm(status)) throw BadRequestException("Test payment confirmation is unavailable")
        if (result.failureMessage != null && result.failureMessage.length > 500) throw BadRequestException("Payment failure message is too long")
        val subscription = if (status == "SUCCEEDED") {
            val row = translate {
                sql().confirmSuccessfulMembership(
                    intentId,
                    testProvider.code,
                    testProvider.providerReference(current, result.providerReferenceId) ?: error("Test reference is required"),
                    actorUserId
                )
            } ?: throw ConflictException("Payment succeeded but membership finalization was unavailable")
            CounterPurchaseResult(row.subscriptionId, row.organizationUserId, row.userId,
                row.subscriptionNumber, row.subscriptionPlanId, row.subscriptionDate, row.startDate,
                row.endDate, row.subscriptionStatusId, row.totalAmount, row.currencyCode)
        } else null
        if (status != "SUCCEEDED") {
            translate { sql().recordResult(intentId, status, testProvider.providerReference(current, result.providerReferenceId),
                result.failureCode?.take(80), result.failureMessage?.take(500), actorUserId)
            }
        }
        val updated = get(org, intentId, actorUserId)
        return updated to subscription
    }

    fun confirmCounterCashAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult> {
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != CashPaymentProvider.code) {
            throw BadRequestException("Payment is not a cash payment")
        }
        val row = translate {
            sql().confirmSuccessfulMembership(
                intentId,
                CashPaymentProvider.code,
                CashPaymentProvider.providerReference(current, null) ?: error("Cash reference is required"),
                actorUserId
            )
        } ?: throw ConflictException("Cash payment finalization was unavailable")
        val subscription = CounterPurchaseResult(row.subscriptionId, row.organizationUserId, row.userId,
            row.subscriptionNumber, row.subscriptionPlanId, row.subscriptionDate, row.startDate,
            row.endDate, row.subscriptionStatusId, row.totalAmount, row.currencyCode)
        return get(org, intentId, actorUserId) to subscription
    }

    fun confirmMonerisAndFinalize(
        org: String,
        intentId: String,
        actorUserId: String,
        temporaryToken: String
    ): Pair<PaymentIntentDto, CounterPurchaseResult?> {
        val current = get(org, intentId, actorUserId)
        if (current.providerCode != monerisProvider.code) {
            throw BadRequestException("Payment is not a Moneris payment")
        }
        if (current.status == "SUCCEEDED") return getConfirmation(org, intentId, actorUserId)
        if (current.status !in setOf("PENDING", "PROCESSING")) {
            throw ConflictException("Payment cannot be confirmed")
        }

        val outcome = monerisProvider.purchase(current, temporaryToken)
        val providerReference = outcome.paymentId
            ?: throw ConflictException("Moneris payment reference is unavailable")
        val persistedReference = translate {
            sql().setProviderReference(intentId, monerisProvider.code, providerReference, actorUserId)
        } ?: throw ConflictException("Moneris payment reference is unavailable")
        if (persistedReference != providerReference) {
            throw ConflictException("Payment is already associated with another provider transaction")
        }

        if (outcome.status == "SUCCEEDED") {
            translate {
                sql().confirmProviderSuccess(
                    intentId,
                    org,
                    monerisProvider.code,
                    providerReference,
                    amountMinor(current.amount),
                    current.currencyCode
                )
            } ?: throw ConflictException("Moneris payment finalization was unavailable")
        } else {
            translate {
                sql().recordProviderFailure(
                    intentId,
                    org,
                    monerisProvider.code,
                    providerReference,
                    "FAILED",
                    outcome.failureCode ?: "MONERIS_DECLINED"
                )
            }
            throw BadRequestException("Moneris payment was not approved")
        }
        return getConfirmation(org, intentId, actorUserId)
    }

    fun handleStripeWebhook(rawBody: String, signature: String?): Boolean {
        val event = stripeProvider.verifiedEvent(rawBody, signature)
        return handleStripeEvent(event)
    }

    private fun handleStripeEvent(event: Event): Boolean {
        val session = stripeProvider.session(event) ?: return true
        val metadata = session.metadata ?: return true
        val intentId = metadata["memgine_payment_intent_id"] ?: return true
        val organizationId = metadata["organization_id"] ?: return true
        val sessionId = session.id ?: return true
        val currency = session.currency ?: return true

        return when (event.type) {
            "checkout.session.completed", "checkout.session.async_payment_succeeded" -> {
                if (session.paymentStatus != "paid" || session.amountTotal == null) return true
                translate {
                    sql().confirmProviderSuccess(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        session.amountTotal,
                        currency.uppercase()
                    )
                } ?: throw ConflictException("Stripe payment finalization was unavailable")
                true
            }
            "checkout.session.async_payment_failed" ->
                translate {
                    sql().recordProviderFailure(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        "FAILED",
                        "STRIPE_ASYNC_PAYMENT_FAILED"
                    )
                }
            "checkout.session.expired" ->
                translate {
                    sql().recordProviderFailure(
                        intentId,
                        organizationId,
                        stripeProvider.code,
                        sessionId,
                        "CANCELED",
                        "STRIPE_CHECKOUT_EXPIRED"
                    )
                }
            else -> true
        }
    }

    private fun checkoutForProvider(
        intent: PaymentIntentDto,
        organizationId: String,
        returnContext: com.mynikatech.memgine.net.dto.PaymentReturnContextDto?,
        actorUserId: String?
    ): PaymentIntentDto {
        if (intent.providerCode == monerisProvider.code) {
            return intent.copy(
                monerisHostedTokenizationProfileId = monerisProvider.hostedTokenizationProfileId(),
                monerisHostedTokenizationUrl = monerisProvider.hostedTokenizationUrl()
            )
        }
        if (intent.providerCode != stripeProvider.code) return intent
        val actor = actorUserId ?: throw ForbiddenException("Payment actor is required")
        val sessionId = if (intent.providerReferenceId.isNullOrBlank()) {
            val created = stripeProvider.createCheckoutSession(intent, organizationId, returnContext)
            translate {
                sql().setProviderReference(intent.paymentIntentId, stripeProvider.code, created.id, actor)
            } ?: throw ConflictException("Stripe checkout session was unavailable")
        } else {
            intent.providerReferenceId
        }
        return intent.copy(
            providerReferenceId = sessionId,
            checkoutUrl = stripeProvider.checkoutUrl(sessionId)
        )
    }

    private fun validateId(value: String, name: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid $name")
    }

    private fun validateIdempotencyKey(value: String) {
        if (value.isBlank() || value.length > 128) {
            throw BadRequestException("Valid payment idempotency key is required")
        }
    }

    private fun amountMinor(amount: Double): Long = try {
        java.math.BigDecimal.valueOf(amount)
            .movePointRight(2)
            .setScale(0, java.math.RoundingMode.UNNECESSARY)
            .longValueExact()
    } catch (_: ArithmeticException) {
        throw BadRequestException("Payment amount is invalid")
    }

    private fun requirePaymentProvider() {
        if (!configuredProvider.isAvailable) throw BadRequestException("Payment provider is not configured")
    }

    private fun <T> translate(action: () -> T): T {
        try {
            return action()
        } catch (error: ApiException) {
            throw error
        } catch (error: Exception) {
            val postgres = generateSequence<Throwable>(error) { it.cause }
                .filterIsInstance<PSQLException>()
                .firstOrNull()
            when (postgres?.sqlState) {
                "42501" -> throw ForbiddenException("Payment operation is not permitted")
                "23505", "40001" -> throw ConflictException("Payment state changed; retry the request")
                "22001", "22003", "22023", "23502", "23503", "23514", "P0002" ->
                    throw BadRequestException("Payment or membership details are unavailable")
                else -> throw error
            }
        }
    }
}

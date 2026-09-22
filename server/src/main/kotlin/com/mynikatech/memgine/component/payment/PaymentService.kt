package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ConflictException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.ApiException
import com.mynikatech.memgine.net.dto.CounterPurchaseResult
import com.mynikatech.memgine.net.dto.PaymentIntentDto
import com.mynikatech.memgine.net.dto.PaymentStartRequestDto
import com.mynikatech.memgine.net.dto.TestPaymentConfirmationDto
import org.jdbi.v3.core.Jdbi
import java.util.UUID
import org.postgresql.util.PSQLException

class PaymentService(
    private val jdbi: Jdbi,
    environment: String
) {
    private val testProvider = TestPaymentProvider(environment in setOf("local", "dev", "development"))
    private fun sql() = jdbi.onDemand(PaymentSql::class.java)

    fun startMembershipPayment(org: String, request: PaymentStartRequestDto, actorUserId: String?): PaymentIntentDto {
        requirePaymentProvider()
        return startMembershipPayment(org, request, actorUserId, testProvider)
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
        return translate { sql().start(
            UUID.randomUUID().toString(), UUID.randomUUID().toString(), org,
            request.challengeId, provider.code, request.idempotencyKey.trim(), actorUserId
        ) ?: throw ConflictException("Payment was not started") }
    }

    fun startAuthenticatedMembershipPayment(
        org: String,
        planId: String,
        customerUserId: String,
        idempotencyKey: String
    ): PaymentIntentDto {
        requirePaymentProvider()
        validateId(org, "organization id")
        validateId(planId, "membership plan id")
        validateId(customerUserId, "customer user id")
        validateIdempotencyKey(idempotencyKey)
        return translate { sql().startCustomer(
            UUID.randomUUID().toString(),
            UUID.randomUUID().toString(),
            org,
            planId,
            customerUserId,
            testProvider.code,
            idempotencyKey.trim()
        ) ?: throw ConflictException("Payment was not started") }
    }

    fun get(org: String, intentId: String, actorUserId: String): PaymentIntentDto = translate {
        sql().get(org, intentId, actorUserId) ?: throw NotFoundException("Payment was not found")
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

    private fun validateId(value: String, name: String) {
        if (value.isBlank() || value.length > 64) throw BadRequestException("Invalid $name")
    }

    private fun validateIdempotencyKey(value: String) {
        if (value.isBlank() || value.length > 128) {
            throw BadRequestException("Valid payment idempotency key is required")
        }
    }

    private fun requirePaymentProvider() {
        if (!testProvider.isAvailable) throw BadRequestException("No payment provider is configured")
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

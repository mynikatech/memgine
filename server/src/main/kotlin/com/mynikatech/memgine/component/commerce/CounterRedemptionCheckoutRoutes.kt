package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CounterRedemptionCheckoutRequest
import com.mynikatech.memgine.net.dto.CounterRedemptionPricingAcknowledgementRequest
import com.mynikatech.memgine.net.dto.CounterRedemptionTestPaymentRequest
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

/**
 * Counter-safe checkout endpoints for a previously created Redemption Transaction.
 *
 * The transaction itself can originate from:
 * - customer secure QR,
 * - staff-assisted selection, or
 * - phone lookup + action-bound OTP.
 *
 * All three converge here after validation.
 */
fun Route.counterRedemptionCheckoutRoutes(
    service: CounterCommercePaymentService
) {
    route("/organizations/{organizationId}/counter/redemption-transactions/{transactionId}") {
        post("/checkout") {
            val organizationId = required(call.parameters["organizationId"], "Organization id")
            val transactionId = required(call.parameters["transactionId"], "Redemption transaction id")
            val request = call.receive<CounterRedemptionCheckoutRequest>()

            call.respond(
                ApiResponse.success(
                    service.prepareRedemptionCheckout(
                        organizationId = organizationId,
                        redemptionTransactionId = transactionId,
                        storeId = request.storeId,
                        staffId = request.staffId,
                        actorUserId = call.authenticatedPrincipal().userId
                    ),
                    call.callId
                )
            )
        }

        get("/checkout") {
            val organizationId = required(call.parameters["organizationId"], "Organization id")
            val transactionId = required(call.parameters["transactionId"], "Redemption transaction id")
            val storeId = required(call.request.queryParameters["storeId"], "Store id")
            val staffId = required(call.request.queryParameters["staffId"], "Staff id")

            call.respond(
                ApiResponse.success(
                    service.redemptionCheckoutStatus(
                        organizationId = organizationId,
                        redemptionTransactionId = transactionId,
                        storeId = storeId,
                        staffId = staffId,
                        actorUserId = call.authenticatedPrincipal().userId
                    ),
                    call.callId
                )
            )
        }

        post("/checkout/pricing/acknowledge") {
            val organizationId = required(call.parameters["organizationId"], "Organization id")
            val transactionId = required(call.parameters["transactionId"], "Redemption transaction id")
            val request = call.receive<CounterRedemptionPricingAcknowledgementRequest>()

            call.respond(
                ApiResponse.success(
                    service.acknowledgeRedemptionPricing(
                        organizationId = organizationId,
                        redemptionTransactionId = transactionId,
                        storeId = request.storeId,
                        staffId = request.staffId,
                        actorUserId = call.authenticatedPrincipal().userId,
                        request = request
                    ),
                    call.callId
                )
            )
        }
        post("/payment/remote-terminal/start") {
            val organizationId = required(call.parameters["organizationId"], "Organization id")
            val transactionId = required(call.parameters["transactionId"], "Redemption transaction id")
            val request = call.receive<CounterRedemptionCheckoutRequest>()

            call.respond(
                ApiResponse.success(
                    service.startRedemptionRemoteTerminalPayment(
                        organizationId = organizationId,
                        redemptionTransactionId = transactionId,
                        storeId = request.storeId,
                        staffId = request.staffId,
                        actorUserId = call.authenticatedPrincipal().userId
                    ),
                    call.callId
                )
            )
        }

        post("/payment/test-result") {
            val organizationId = required(call.parameters["organizationId"], "Organization id")
            val transactionId = required(call.parameters["transactionId"], "Redemption transaction id")
            val request = call.receive<CounterRedemptionTestPaymentRequest>()

            call.respond(
                ApiResponse.success(
                    service.confirmRedemptionTestPayment(
                        organizationId = organizationId,
                        redemptionTransactionId = transactionId,
                        storeId = request.storeId,
                        staffId = request.staffId,
                        actorUserId = call.authenticatedPrincipal().userId,
                        request = request
                    ),
                    call.callId
                )
            )
        }
    }
}

private fun required(value: String?, name: String): String =
    value?.trim()?.takeIf { it.isNotEmpty() }
        ?: throw BadRequestException("$name is required")

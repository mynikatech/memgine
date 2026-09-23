package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.PaymentConfirmationDto
import com.mynikatech.memgine.net.dto.MonerisPaymentConfirmationDto
import com.mynikatech.memgine.net.dto.TestPaymentConfirmationDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.request.receiveText
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

/** Provider callbacks will use the same service boundary after signature validation is added. */
fun Route.paymentRoutes(service: PaymentService) {
    route("/payments/providers/stripe") {
        post("/webhook") {
            val accepted = service.handleStripeWebhook(
                call.receiveText(),
                call.request.headers["Stripe-Signature"]
            )
            call.respond(ApiResponse.success(mapOf("received" to accepted), call.callId))
        }
    }

    route("/organizations/{organizationId}/payments") {
        get("/{paymentIntentId}") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            val result = service.getConfirmation(
                organizationId,
                paymentIntentId,
                call.authenticatedPrincipal().userId
            )
            call.respond(ApiResponse.success(
                PaymentConfirmationDto(result.first, result.second),
                call.callId
            ))
        }
        post("/{paymentIntentId}/cancel") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            call.respond(ApiResponse.success(
                service.cancel(organizationId, paymentIntentId, call.authenticatedPrincipal().userId),
                call.callId
            ))
        }
        post("/{paymentIntentId}/moneris/confirm") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            val result = service.confirmMonerisAndFinalize(
                organizationId,
                paymentIntentId,
                call.authenticatedPrincipal().userId,
                call.receive<MonerisPaymentConfirmationDto>().temporaryToken
            )
            call.respond(ApiResponse.success(PaymentConfirmationDto(result.first, result.second), call.callId))
        }
        post("/{paymentIntentId}/test-result") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            val result = service.confirmTestAndFinalize(
                organizationId,
                paymentIntentId,
                call.authenticatedPrincipal().userId,
                call.receive<TestPaymentConfirmationDto>()
            )
            call.respond(ApiResponse.success(PaymentConfirmationDto(result.first, result.second), call.callId))
        }
    }
}

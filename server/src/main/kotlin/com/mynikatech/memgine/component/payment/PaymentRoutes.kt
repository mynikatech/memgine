package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.PaymentConfirmationDto
import com.mynikatech.memgine.net.dto.MonerisPaymentConfirmationDto
import com.mynikatech.memgine.net.dto.PoyntCollectConfirmationDto
import com.mynikatech.memgine.net.dto.PoyntCollectCheckoutDto
import com.mynikatech.memgine.net.dto.PoyntCollectCheckoutSessionDto
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
import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders

private const val CollectCheckoutCookie = "memgine_collect_checkout"

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
        post("/{paymentIntentId}/poynt-collect/checkout-session") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            call.respond(ApiResponse.success(
                PoyntCollectCheckoutSessionDto(
                    service.createCollectBrowserCheckout(
                        organizationId, paymentIntentId, call.authenticatedPrincipal().userId
                    )
                ), call.callId
            ))
        }
        get("/{paymentIntentId}/poynt-collect/config") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            call.respond(ApiResponse.success(
                service.collectBootstrap(organizationId, paymentIntentId, call.authenticatedPrincipal().userId),
                call.callId
            ))
        }
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
        post("/{paymentIntentId}/poynt-collect/confirm") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            val paymentIntentId = call.parameters["paymentIntentId"]
                ?: throw BadRequestException("Payment intent id is required")
            val result = service.confirmCollectAndFinalize(
                organizationId, paymentIntentId, call.authenticatedPrincipal().userId,
                call.receive<PoyntCollectConfirmationDto>().nonce
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

    // These endpoints deliberately accept only the short-lived HttpOnly browser
    // session. Normal customer credentials are never copied into the browser.
    route("/poynt-collect/checkout") {
        post("/redeem") {
            requireCollectOrigin(call, service)
            val token = call.receive<Map<String, String>>()["session"]
                ?: throw BadRequestException("Checkout session is required")
            val checkout = service.redeemCollectBrowserCheckout(token)
            call.response.cookies.append(Cookie(
                name = CollectCheckoutCookie,
                value = checkout.browserToken,
                maxAge = 600,
                path = "/api/v1/poynt-collect/checkout",
                httpOnly = true,
                secure = true,
                extensions = mapOf("SameSite" to "None")
            ))
            val confirmation = service.browserCollectConfirmation(checkout.browserToken)
            call.respond(ApiResponse.success(
                PoyntCollectCheckoutDto(checkout.csrfToken, confirmation.first), call.callId
            ))
        }
        get("/bootstrap") {
            val token = call.request.cookies[CollectCheckoutCookie]
                ?: throw BadRequestException("Checkout session is required")
            call.respond(ApiResponse.success(service.browserCollectBootstrap(token), call.callId))
        }
        get("/status") {
            val token = call.request.cookies[CollectCheckoutCookie]
                ?: throw BadRequestException("Checkout session is required")
            val result = service.browserCollectConfirmation(token)
            call.respond(ApiResponse.success(PaymentConfirmationDto(result.first, result.second), call.callId))
        }
        post("/confirm") {
            requireCollectOrigin(call, service)
            val token = call.request.cookies[CollectCheckoutCookie]
                ?: throw BadRequestException("Checkout session is required")
            val csrf = call.request.headers["X-Memgine-Checkout-CSRF"]
                ?: throw BadRequestException("Checkout request is invalid")
            val result = service.browserConfirmCollectAndFinalize(
                token, csrf, call.receive<PoyntCollectConfirmationDto>().nonce
            )
            call.respond(ApiResponse.success(PaymentConfirmationDto(result.first, result.second), call.callId))
        }
    }
}

private fun requireCollectOrigin(call: io.ktor.server.application.ApplicationCall, service: PaymentService) {
    if (!service.isCollectBrowserOrigin(call.request.headers[HttpHeaders.Origin])) {
        throw com.mynikatech.memgine.exception.ForbiddenException("Checkout origin is not permitted")
    }
}

package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.paymentRefundRoutes(service: PaymentRefundService) {
    route("/platform/payment-refunds") {
        get { call.respond(ApiResponse.success(service.platformList(call.authenticatedPrincipal().userId), call.callId)) }
    }
    route("/organizations/{organizationId}/payment-refunds") {
        get { call.respond(ApiResponse.success(service.list(organizationId(call), call.authenticatedPrincipal().userId), call.callId)) }
        post { call.respond(ApiResponse.success(service.request(organizationId(call), call.receive(), call.authenticatedPrincipal().userId), call.callId)) }
        get("/{refundId}") { val id=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required"); call.respond(ApiResponse.success(service.detail(organizationId(call),id,call.authenticatedPrincipal().userId),call.callId)) }
    }
}

private fun organizationId(call: ApplicationCall) = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")

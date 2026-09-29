package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.request.receive
import com.mynikatech.memgine.net.dto.CreateRedemptionTransactionRequest
import com.mynikatech.memgine.net.dto.ExecuteRedemptionTransactionRequest
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.redemptionRoutes(service: RedemptionService) {
    route("/organizations/{organizationId}/redemptions") {
        get {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(service.listForOrganization(organizationId, call.authenticatedPrincipal().userId), call.callId))
        }

    }
    // Foundation endpoints for a future Counter basket UI. Database functions
    // enforce the active Counter store/staff context for all mutations.
    route("/organizations/{organizationId}/counter/redemption-transactions") {
        post {
            val organizationId = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(service.createCounterTransaction(organizationId, call.receive<CreateRedemptionTransactionRequest>(), call.authenticatedPrincipal().userId), call.callId))
        }
        get("/{transactionId}/validation") {
            val organizationId = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val transactionId = call.parameters["transactionId"] ?: throw BadRequestException("Redemption transaction id is required")
            val storeId = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staffId = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(service.validateTransaction(organizationId, transactionId, storeId, staffId, call.authenticatedPrincipal().userId), call.callId))
        }
        post("/{transactionId}/execute") {
            val organizationId = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val transactionId = call.parameters["transactionId"] ?: throw BadRequestException("Redemption transaction id is required")
            val request = call.receive<ExecuteRedemptionTransactionRequest>()
            call.respond(ApiResponse.success(service.executeTransaction(organizationId, transactionId, request.storeId, request.staffId, call.authenticatedPrincipal().userId), call.callId))
        }
    }
    route("/organizations/{organizationId}/counter/redemption-qr/{qrReference}") {
        post {
            val organizationId = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val qrReference = call.parameters["qrReference"] ?: throw BadRequestException("Redemption QR reference is required")
            val storeId = call.request.queryParameters["storeId"] ?: throw BadRequestException("Store id is required")
            val staffId = call.request.queryParameters["staffId"] ?: throw BadRequestException("Staff id is required")
            call.respond(ApiResponse.success(
                service.resolveCounterTransactionQr(
                    organizationId, storeId, staffId, qrReference, call.authenticatedPrincipal().userId
                ),
                call.callId
            ))
        }
    }
}

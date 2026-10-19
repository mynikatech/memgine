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
        get("/resolution-options") {
            val scope = call.request.queryParameters["scope"] ?: "SUPPORT"
            call.respond(ApiResponse.success(service.resolutionOptions(organizationId(call), call.authenticatedPrincipal().userId, scope), call.callId))
        }

        get("/by-support/{supportRequestId}") {
            val supportId = call.parameters["supportRequestId"] ?: throw BadRequestException("Support request id is required")
            call.respond(ApiResponse.success(service.listBySupportRequest(organizationId(call), supportId, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/by-financial-exception/{financialExceptionId}") {
            val exceptionId = call.parameters["financialExceptionId"] ?: throw BadRequestException("Financial exception id is required")
            call.respond(ApiResponse.success(service.listByFinancialException(organizationId(call), exceptionId, call.authenticatedPrincipal().userId), call.callId))
        }
        post { call.respond(ApiResponse.success(service.request(organizationId(call), call.receive(), call.authenticatedPrincipal().userId), call.callId)) }
        get("/{refundId}") { val id=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required"); call.respond(ApiResponse.success(service.detail(organizationId(call),id,call.authenticatedPrincipal().userId),call.callId)) }
        get("/{refundId}/execution") { val id=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required"); call.respond(ApiResponse.success(service.executionStatus(organizationId(call),id,call.authenticatedPrincipal().userId),call.callId)) }
        post("/{refundId}/execute") { val id=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required"); call.respond(ApiResponse.success(service.execute(organizationId(call),id,call.authenticatedPrincipal().userId),call.callId)) }
        post("/{refundId}/reconcile") { val id=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required"); call.respond(ApiResponse.success(service.reconcile(organizationId(call),id,call.authenticatedPrincipal().userId),call.callId)) }
        route("/{refundId}/poynt-bridge") {
            post("/verify-reference") {
                val refundId=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required")
                call.respond(ApiResponse.success(service.verifyPoyntBridgeReference(
                    organizationId(call),refundId,call.receive<PoyntBridgeReferenceVerificationRequestDto>(),
                    call.authenticatedPrincipal().userId),call.callId))
            }
            post("/confirm-reference") {
                val refundId=call.parameters["refundId"] ?: throw BadRequestException("Refund id is required")
                call.respond(ApiResponse.success(service.confirmPoyntBridgeReference(
                    organizationId(call),refundId,call.receive<PoyntBridgeReferenceConfirmationDto>(),
                    call.authenticatedPrincipal().userId),call.callId))
            }
        }
        route("/{refundId}/poynt-collect") {
            post("/verify-reference") {
                val refundId = call.parameters["refundId"] ?: throw BadRequestException("Refund id is required")
                call.respond(ApiResponse.success(
                    service.verifyPoyntCollectReference(
                        organizationId(call),
                        refundId,
                        call.receive<PoyntCollectVerifiedReferenceRequestDto>(),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            post("/confirm-reference") {
                val refundId = call.parameters["refundId"] ?: throw BadRequestException("Refund id is required")
                call.respond(ApiResponse.success(
                    service.confirmPoyntCollectReference(
                        organizationId(call),
                        refundId,
                        call.receive<PoyntCollectVerifiedReferenceConfirmationDto>(),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
        }
    }
}

private fun organizationId(call: ApplicationCall) = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")

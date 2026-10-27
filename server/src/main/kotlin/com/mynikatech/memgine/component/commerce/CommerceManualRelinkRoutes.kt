package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CommerceManualRelinkPreviewRequestDto
import com.mynikatech.memgine.net.dto.CommerceManualRelinkConfirmRequestDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

/** Install alongside commerceRoutes(service) within the existing authenticated API route tree. */
fun Route.commerceManualRelinkRoutes(service: CommerceService) {
    route("/organizations/{organizationId}/commerce/product-mappings/{mappingId}") {
        get("/relink-candidates") {
            val organizationId = call.parameters["organizationId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Organization is required")
                
            val actorUserId = call.authenticatedPrincipal().userId
            
            val mappingId = call.parameters["mappingId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Mapping is required")

            call.application.environment.log.info(
                "W224 CANDIDATES: organizationId={}, mappingId={}, actorUserId={}",
                organizationId,
                mappingId,
                actorUserId
            )

            call.respond(ApiResponse.success(service.manualRelinkCandidates(
                organizationId, mappingId, call.request.queryParameters["search"].orEmpty(),
                actorUserId
            ), call.callId))
        }
        post("/relink-preview") {
            val organizationId = call.parameters["organizationId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Organization is required")
            val mappingId = call.parameters["mappingId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Mapping is required")
            val body = call.receive<CommerceManualRelinkPreviewRequestDto>()
            call.respond(ApiResponse.success(service.previewManualProductRelink(
                organizationId, mappingId, body.targetProductId, call.authenticatedPrincipal().userId
            ), call.callId))
        }
        post("/relink-confirm") {
            val organizationId = call.parameters["organizationId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Organization is required")
            val mappingId = call.parameters["mappingId"]?.takeIf { it.isNotBlank() }
                ?: throw BadRequestException("Mapping is required")
            val body = call.receive<CommerceManualRelinkConfirmRequestDto>()
            call.respond(ApiResponse.success(service.confirmManualProductRelink(
                organizationId, mappingId, body.targetProductId,
                body.expectedMappingVersionNo, body.expectedTargetProductVersionNo,
                body.reason, call.authenticatedPrincipal().userId
            ), call.callId))
        }
    }
}

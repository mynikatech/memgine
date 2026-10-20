package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.redemptionResolutionRoutes(service: RedemptionResolutionService) {
    route("/organizations/{organizationId}/redemption-resolutions") {
        get {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(service.candidates(org, call.authenticatedPrincipal().userId), call.callId))
        }

        post {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val request = call.receive<RedemptionResolutionRequest>()
            call.respond(ApiResponse.success(service.request(org, request, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/{resolutionId}") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val id = call.parameters["resolutionId"] ?: throw BadRequestException("Resolution id is required")
            call.respond(ApiResponse.success(service.detail(org, id, call.authenticatedPrincipal().userId), call.callId))
        }
        post("/{resolutionId}/complete") {
            val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required")
            val id = call.parameters["resolutionId"] ?: throw BadRequestException("Resolution id is required")
            call.respond(ApiResponse.success(service.complete(org, id, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

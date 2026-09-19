package com.mynikatech.memgine.component.redemption

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.redemptionRoutes(service: RedemptionService) {
    route("/organizations/{organizationId}/redemptions") {
        get {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(service.listForOrganization(organizationId, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

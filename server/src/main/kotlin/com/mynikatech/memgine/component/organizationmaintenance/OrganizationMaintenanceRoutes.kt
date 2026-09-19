package com.mynikatech.memgine.component.organizationmaintenance

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.SaveOrganizationAdministrativeUserRequest
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.organizationMaintenanceRoutes(service: OrganizationMaintenanceService) {
    route("/platform/organizations/{organizationId}/administrative-users") {
        get {
            call.respond(ApiResponse.success(service.list(call.organizationId()), call.callId))
        }
        post {
            call.respond(
                ApiResponse.success(
                    service.create(call.organizationId(), call.receive()),
                    call.callId
                )
            )
        }
        put("/{userId}") {
            val userId = call.parameters["userId"]
                ?: throw BadRequestException("User id is required")
            call.respond(
                ApiResponse.success(
                    service.update(
                        call.organizationId(), userId,
                        call.receive<SaveOrganizationAdministrativeUserRequest>()
                    ),
                    call.callId
                )
            )
        }
    }
}

private fun io.ktor.server.application.ApplicationCall.organizationId(): String =
    parameters["organizationId"] ?: throw BadRequestException("Organization id is required")

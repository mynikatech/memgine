package com.mynikatech.memgine.component.organization

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CreateOrganizationRequestDto
import com.mynikatech.memgine.net.dto.UpdateOrganizationRequestDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.organizationRoutes(service: OrganizationService) {

    route("/organizations") {

        post("/create") {
            val request = call.receive<CreateOrganizationRequestDto>()
            val result = service.create(request)

            call.respond(
                HttpStatusCode.Created,
                ApiResponse.success(result, call.callId)
            )
        }

        put("/update/{organizationId}") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException("Organization id is required")

            val request =
                call.receive<UpdateOrganizationRequestDto>()

            val result =
                service.update(organizationId, request)

            call.respond(
                HttpStatusCode.OK,
                ApiResponse.success(result, call.callId)
            )
        }
    }
}
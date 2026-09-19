package com.mynikatech.memgine.component.customer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CreateProspectiveCustomerDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.customerRoutes(service: CustomerService) {
    route("/organizations/{organizationId}/customers") {
        get {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(service.list(organizationId, call.authenticatedPrincipal().userId), call.callId))
        }
        post("/prospects") {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(HttpStatusCode.Created,
                ApiResponse.success(service.createProspect(organizationId,
                    call.receive<CreateProspectiveCustomerDto>(), call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

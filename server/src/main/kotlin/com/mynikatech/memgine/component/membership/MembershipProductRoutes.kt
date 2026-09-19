package com.mynikatech.memgine.component.membership

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.MembershipProductWriteDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.membershipProductRoutes(service: MembershipProductService) {
    route("/organizations/{organizationId}/membership-products") {
        get {
            val organizationId = required(call.parameters["organizationId"])
            call.respond(ApiResponse.success(service.list(organizationId), call.callId))
        }
        get("/{productId}") {
            val organizationId = required(call.parameters["organizationId"])
            val productId = required(call.parameters["productId"])
            call.respond(ApiResponse.success(service.get(organizationId, productId), call.callId))
        }
        post {
            val organizationId = required(call.parameters["organizationId"])
            val request = call.receive<MembershipProductWriteDto>()
            call.respond(HttpStatusCode.Created,
                ApiResponse.success(service.save(organizationId, request, true, call.authenticatedPrincipal().userId), call.callId))
        }
        put("/{productId}") {
            val organizationId = required(call.parameters["organizationId"])
            val productId = required(call.parameters["productId"])
            val request = call.receive<MembershipProductWriteDto>()
            if (request.id != productId) throw BadRequestException("Membership product id does not match path")
            call.respond(ApiResponse.success(service.save(organizationId, request, false, call.authenticatedPrincipal().userId), call.callId))
        }
        delete("/{productId}") {
            val organizationId = required(call.parameters["organizationId"])
            val productId = required(call.parameters["productId"])
            call.respond(ApiResponse.success(service.delete(organizationId, productId, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

private fun required(value: String?): String =
    value?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Required id is missing")

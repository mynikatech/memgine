package com.mynikatech.memgine.component.organizationaccess

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.organizationAccessRoutes(service: OrganizationAccessService) {
    route("/organizations/{organizationId}/users-access") {
        get {
            val (org, actor) = call.accessContext()
            call.respond(ApiResponse.success(service.list(org, actor), call.callId))
        }
        put("/{organizationUserId}/org-admin") {
            val (org, actor) = call.accessContext()
            val request = call.receive<SetOrganizationAdminRequest>()
            call.respond(ApiResponse.success(service.setOrgAdmin(org, call.organizationUserId(), request.enabled, actor), call.callId))
        }
        put("/{organizationUserId}/membership") {
            val (org, actor) = call.accessContext()
            val request = call.receive<SetOrganizationMembershipRequest>()
            call.respond(ApiResponse.success(service.setMembership(org, call.organizationUserId(), request.active, actor), call.callId))
        }
        put("/{organizationUserId}/counter-operator") {
            val (org, actor) = call.accessContext()
            call.respond(ApiResponse.success(service.setCounterOperator(org, call.organizationUserId(), call.receive(), actor), call.callId))
        }
        put("/{organizationUserId}/stores") {
            val (org, actor) = call.accessContext()
            call.respond(ApiResponse.success(service.setStores(org, call.organizationUserId(), call.receive(), actor), call.callId))
        }
        put("/{organizationUserId}/pos-pin") {
            val (org, actor) = call.accessContext()
            call.respond(ApiResponse.success(service.setPin(org, call.organizationUserId(), call.receive<SetPosPinRequest>().pin, actor), call.callId))
        }
    }
}

private fun io.ktor.server.application.ApplicationCall.accessContext(): Pair<String, String> {
    val org = parameters["organizationId"]?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Organization id is required")
    val principal = authenticatedPrincipal()
    principal.require("ORG_ADMIN_ACCESS", org)
    return org to principal.userId
}

private fun io.ktor.server.application.ApplicationCall.organizationUserId(): String =
    parameters["organizationUserId"]?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Organization user id is required")

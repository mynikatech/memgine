package com.mynikatech.memgine.component.role

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import com.mynikatech.memgine.security.authenticatedPrincipal

/** Local/Dev RBAC maintenance surface; mutations still derive the actor from the authenticated principal. */
fun Route.rbacRoutes(service: RbacService, devIdentityEnabled: Boolean) {
    if (!devIdentityEnabled) return
    route("/dev/rbac") {
        get("/roles") { call.respond(ApiResponse.success(service.roles(), call.callId)) }
        get("/capabilities") { call.respond(ApiResponse.success(service.capabilities(), call.callId)) }
        get("/users/{userId}/assignments") {
            call.respond(ApiResponse.success(service.assignments(required(call.parameters["userId"])), call.callId))
        }
        get("/users/{userId}/effective-roles") {
            call.respond(ApiResponse.success(service.effectiveRoles(required(call.parameters["userId"]), call.request.queryParameters["organizationId"]), call.callId))
        }
        get("/users/{userId}/effective-capabilities") {
            call.respond(ApiResponse.success(service.effectiveCapabilities(required(call.parameters["userId"]), call.request.queryParameters["organizationId"]), call.callId))
        }
        get("/users/{userId}/capabilities/{capabilityCode}") {
            call.respond(ApiResponse.success(service.hasCapability(required(call.parameters["userId"]),
                call.request.queryParameters["organizationId"], required(call.parameters["capabilityCode"])), call.callId))
        }
        post("/organizations/{organizationId}/assignments") {
            call.respond(ApiResponse.success(service.assignOrganizationRole(required(call.parameters["organizationId"]),
                call.receive<RbacAssignOrganizationRoleRequest>(), call.authenticatedPrincipal().userId), call.callId))
        }
        post("/organizations/{organizationId}/assignments/{assignmentId}/revoke") {
            call.respond(ApiResponse.success(service.revokeOrganizationRole(required(call.parameters["organizationId"]),
                required(call.parameters["assignmentId"]), call.authenticatedPrincipal().userId), call.callId))
        }
        post("/platform-assignments") {
            call.respond(ApiResponse.success(service.assignPlatformRole(call.receive<RbacAssignPlatformRoleRequest>(), call.authenticatedPrincipal().userId), call.callId))
        }
        post("/platform-assignments/{assignmentId}/revoke") {
            call.respond(ApiResponse.success(service.revokePlatformRole(required(call.parameters["assignmentId"]),
                call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

private fun required(value: String?) = value?.takeIf { it.isNotBlank() }
    ?: throw BadRequestException("Required route parameter is missing")

package com.mynikatech.memgine.component.integrationconfiguration

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.IntegrationConfigurationWriteDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.integrationConfigurationRoutes(service: IntegrationConfigurationService) {
    route("/organizations/{organizationId}/integration-configurations") {
        get {
            val organizationId = requiredConfigId(call.parameters["organizationId"])
            call.respond(ApiResponse.success(service.list(organizationId, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/{configurationId}") {
            val organizationId = requiredConfigId(call.parameters["organizationId"])
            val id = requiredConfigId(call.parameters["configurationId"])
            call.respond(ApiResponse.success(service.get(organizationId, id, call.authenticatedPrincipal().userId), call.callId))
        }
        post {
            val organizationId = requiredConfigId(call.parameters["organizationId"])
            call.respond(HttpStatusCode.Created, ApiResponse.success(
                service.save(organizationId, call.receive<IntegrationConfigurationWriteDto>(), true, call.authenticatedPrincipal().userId), call.callId))
        }
        put("/{configurationId}") {
            val organizationId = requiredConfigId(call.parameters["organizationId"])
            val id = requiredConfigId(call.parameters["configurationId"])
            val request = call.receive<IntegrationConfigurationWriteDto>()
            if (request.id != id) throw BadRequestException("Integration Configuration id does not match path")
            call.respond(ApiResponse.success(service.save(organizationId, request, false, call.authenticatedPrincipal().userId), call.callId))
        }
        delete("/{configurationId}") {
            val organizationId = requiredConfigId(call.parameters["organizationId"])
            val id = requiredConfigId(call.parameters["configurationId"])
            call.respond(ApiResponse.success(service.delete(organizationId, id, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

private fun requiredConfigId(value: String?): String =
    value?.takeIf { it.isNotBlank() } ?: throw BadRequestException("Required id is missing")

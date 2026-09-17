package com.mynikatech.memgine.component.notificationconfiguration

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.NotificationConfigurationResultDto
import com.mynikatech.memgine.net.dto.NotificationConfigurationWriteDto
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*

fun Route.notificationConfigurationRoutes(service: NotificationConfigurationService) {
    route("/organizations/{organizationId}/notification-configuration") {
        get {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                NotificationConfigurationResultDto(service.get(organizationId)), call.callId))
        }
        put {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.save(organizationId, call.receive<NotificationConfigurationWriteDto>()), call.callId))
        }
    }
}

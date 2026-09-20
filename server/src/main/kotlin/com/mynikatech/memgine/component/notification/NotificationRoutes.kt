package com.mynikatech.memgine.component.notification
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.NotificationUnreadCountDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.*
fun Route.notificationRoutes(service:NotificationService) = route("/notifications") {
 get { call.respond(ApiResponse.success(service.list(call.authenticatedPrincipal().userId),call.callId)) }
 get("/unread-count") { call.respond(ApiResponse.success(NotificationUnreadCountDto(service.unreadCount(call.authenticatedPrincipal().userId)),call.callId)) }
 post("/{notificationId}/read") { service.markRead(call.parameters["notificationId"] ?: throw com.mynikatech.memgine.exception.BadRequestException("Notification id is required"),call.authenticatedPrincipal().userId); call.respond(ApiResponse.success(mapOf("updated" to true),call.callId)) }
 post("/read-all") { call.respond(ApiResponse.success(mapOf("updated" to service.markAllRead(call.authenticatedPrincipal().userId)),call.callId)) }
}

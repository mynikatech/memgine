package com.mynikatech.memgine.component.activityaudit

import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.activityAuditRoutes(service: ActivityAuditService) {
    route("/activity-audit") {
        post("/events") {
            service.recordFrontend(call.authenticatedPrincipal(), call.receive())
            call.respond(ApiResponse.success(mapOf("accepted" to true), call.callId))
        }
    }
}

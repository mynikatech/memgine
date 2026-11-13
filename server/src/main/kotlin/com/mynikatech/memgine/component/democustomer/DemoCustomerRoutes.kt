package com.mynikatech.memgine.component.democustomer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.demoCustomerRoutes(service: DemoCustomerService) {
    route("/platform/demo-customers") {
        get {
            val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 20
            val offset = call.request.queryParameters["offset"]?.toIntOrNull() ?: 0
            val search = call.request.queryParameters["search"]
            call.respond(ApiResponse.success(service.list(search, limit, offset, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/lookup") {
            val phone = call.request.queryParameters["phone"] ?: throw BadRequestException("Phone is required")
            call.respond(ApiResponse.success(service.lookup(phone, call.authenticatedPrincipal().userId), call.callId))
        }
        post { call.respond(ApiResponse.success(service.provision(call.receive(), call.authenticatedPrincipal().userId), call.callId)) }
        put("/{userId}") {
            val userId = call.parameters["userId"] ?: throw BadRequestException("User id is required")
            call.respond(ApiResponse.success(service.setDemo(userId, call.receive(), call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

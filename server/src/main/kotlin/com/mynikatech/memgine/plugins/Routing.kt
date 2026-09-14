package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.database.DatabaseContext
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.configureRouting(database: DatabaseContext) {
    routing {
        get("/health") {
            call.respond(ApiResponse.success(mapOf("status" to "UP"), call.callId))
        }

        route("/api/v1") {
            // Component routes are registered here as they are implemented.
            // Example: organizationRoutes(OrganizationService(OrganizationSql(database.jdbi)))
        }
    }
}

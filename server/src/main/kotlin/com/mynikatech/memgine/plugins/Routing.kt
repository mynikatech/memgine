package com.mynikatech.memgine.plugins

import com.mynikatech.memgine.component.entitystatus.EntityStatusService
import com.mynikatech.memgine.component.entitystatus.entityStatusRoutes
import com.mynikatech.memgine.component.organization.OrganizationService
import com.mynikatech.memgine.component.organization.OrganizationSql
import com.mynikatech.memgine.component.organization.organizationRoutes
import com.mynikatech.memgine.component.referencedata.ReferenceDataService
import com.mynikatech.memgine.component.referencedata.referenceDataRoutes
import com.mynikatech.memgine.database.DatabaseContext
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.Application
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing

fun Application.configureRouting(
    database: DatabaseContext,
    referenceDataService: ReferenceDataService,
    entityStatusService: EntityStatusService
) {
    val organizationSql =
        database.jdbi.onDemand(OrganizationSql::class.java)

    val organizationService =
        OrganizationService(organizationSql)

    routing {
        get("/health") {
            call.respond(
                ApiResponse.success(
                    mapOf("status" to "UP"),
                    call.callId
                )
            )
        }

        route("/api/v1") {
            organizationRoutes(organizationService)
            referenceDataRoutes(referenceDataService)
            entityStatusRoutes(entityStatusService)
        }
    }
}
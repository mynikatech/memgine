package com.mynikatech.memgine.component.referencedata

import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.referenceDataRoutes(
    service: ReferenceDataService
) {
    route("/reference-data") {

        get {
            call.respond(
                ApiResponse.success(
                    service.get(),
                    call.callId
                )
            )
        }

        post("/refresh") {
            call.respond(
                ApiResponse.success(
                    service.refresh(),
                    call.callId
                )
            )
        }
    }
}
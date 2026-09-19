package com.mynikatech.memgine.component.store

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.CreateStoreRequestDto
import com.mynikatech.memgine.net.dto.UpdateStoreRequestDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.storeRoutes(
    service: StoreService
) {

    route("/organizations/{organizationId}/stores") {

        get {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            val result = service.list(organizationId)

            call.respond(
                HttpStatusCode.OK,
                ApiResponse.success(
                    result,
                    call.callId
                )
            )
        }

        get("/{storeId}") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            val storeId =
                call.parameters["storeId"]
                    ?: throw BadRequestException(
                        "Store id is required"
                    )

            val result =
                service.get(
                    organizationId,
                    storeId
                )

            call.respond(
                HttpStatusCode.OK,
                ApiResponse.success(
                    result,
                    call.callId
                )
            )
        }

        post {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            val request =
                call.receive<CreateStoreRequestDto>()

            val result =
                service.create(organizationId, request, call.authenticatedPrincipal().userId)

            call.respond(
                HttpStatusCode.Created,
                ApiResponse.success(
                    result,
                    call.callId
                )
            )
        }

        put("/{storeId}") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            val storeId =
                call.parameters["storeId"]
                    ?: throw BadRequestException(
                        "Store id is required"
                    )

            val request =
                call.receive<UpdateStoreRequestDto>()

            val result =
                service.update(organizationId, storeId, request, call.authenticatedPrincipal().userId)

            call.respond(
                HttpStatusCode.OK,
                ApiResponse.success(
                    result,
                    call.callId
                )
            )
        }

        delete("/{storeId}") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required"
                    )

            val storeId =
                call.parameters["storeId"]
                    ?: throw BadRequestException(
                        "Store id is required"
                    )

            val result =
                service.delete(organizationId, storeId, call.authenticatedPrincipal().userId)

            call.respond(
                HttpStatusCode.OK,
                ApiResponse.success(
                    result,
                    call.callId
                )
            )
        }
    }
}

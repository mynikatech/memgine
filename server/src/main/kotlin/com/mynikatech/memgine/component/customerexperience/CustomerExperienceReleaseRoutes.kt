package com.mynikatech.memgine.component.customerexperience

import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.PublishCustomerExperienceReleaseRequest
import com.mynikatech.memgine.net.dto.PublishedCustomerExperienceReleaseResponse
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement

fun Route.customerExperienceReleaseRoutes(
    service: CustomerExperienceReleaseService,
) {
    route("/organizations/{organizationId}/customer-experience-release") {

        get("/published") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required",
                    )

            val release =
                service.getPublished(organizationId)

            call.respond(
                ApiResponse.success(
                    PublishedCustomerExperienceReleaseResponse(
                        release = release,
                    ),
                ),
            )
        }

        post("/publish") {
            val organizationId =
                call.parameters["organizationId"]
                    ?: throw BadRequestException(
                        "Organization id is required",
                    )

            val request =
                call.receive<PublishCustomerExperienceReleaseRequest>()

            val snapshotJson =
                Json.encodeToString(
                    JsonElement.serializer(),
                    request.snapshot,
                )

            val result =
                service.publish(
                    organizationId = organizationId,
                    snapshotJson = snapshotJson,
                    publishedBy = request.publishedBy,
                )

            call.respond(
                HttpStatusCode.Created,
                ApiResponse.success(result),
            )
        }
    }
}
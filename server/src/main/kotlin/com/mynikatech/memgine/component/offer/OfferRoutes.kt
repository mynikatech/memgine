package com.mynikatech.memgine.component.offer

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.OfferWriteDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.offerRoutes(service: OfferService) {
    route("/organizations/{organizationId}/offers") {
        get {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            call.respond(ApiResponse.success(service.list(organizationId, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/{offerId}") {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            val offerId = requiredOfferId(call.parameters["offerId"])
            call.respond(ApiResponse.success(service.get(organizationId, offerId, call.authenticatedPrincipal().userId), call.callId))
        }
        get("/{offerId}/usage-rules") {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            val offerId = requiredOfferId(call.parameters["offerId"])
            call.respond(ApiResponse.success(service.rules(organizationId, offerId, call.authenticatedPrincipal().userId), call.callId))
        }
        post {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            call.respond(HttpStatusCode.Created,
                ApiResponse.success(service.save(organizationId, call.receive<OfferWriteDto>(), true, call.authenticatedPrincipal().userId), call.callId))
        }
        put("/{offerId}") {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            val offerId = requiredOfferId(call.parameters["offerId"])
            val request = call.receive<OfferWriteDto>()
            if (request.id != offerId) throw BadRequestException("Offer id does not match path")
            call.respond(ApiResponse.success(service.save(organizationId, request, false, call.authenticatedPrincipal().userId), call.callId))
        }
        delete("/{offerId}") {
            val organizationId = requiredOfferId(call.parameters["organizationId"])
            val offerId = requiredOfferId(call.parameters["offerId"])
            call.respond(ApiResponse.success(service.delete(organizationId, offerId, call.authenticatedPrincipal().userId), call.callId))
        }
    }
}

private fun requiredOfferId(value: String?): String =
    value?.takeIf { it.isNotBlank() } ?: throw BadRequestException("Required id is missing")

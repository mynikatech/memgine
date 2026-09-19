package com.mynikatech.memgine.component.benefit

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.BenefitWriteDto
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import com.mynikatech.memgine.security.authenticatedPrincipal

fun Route.benefitRoutes(service: BenefitService) {
    get("/membership-products/{membershipProductId}/benefits") {
        val membershipProductId = required(call.parameters["membershipProductId"])
        call.respond(ApiResponse.success(service.byMembershipProduct(membershipProductId), call.callId))
    }
    route("/organizations/{organizationId}") {
        get("/catalog-products") {
            val organizationId = required(call.parameters["organizationId"])
            call.respond(ApiResponse.success(service.products(organizationId), call.callId))
        }
        route("/benefits") {
            get {
                val organizationId = required(call.parameters["organizationId"])
                call.respond(ApiResponse.success(service.list(organizationId), call.callId))
            }
            get("/{benefitId}") {
                val organizationId = required(call.parameters["organizationId"])
                val benefitId = required(call.parameters["benefitId"])
                call.respond(ApiResponse.success(service.get(organizationId, benefitId), call.callId))
            }
            get("/{benefitId}/usage-rules") {
                val organizationId = required(call.parameters["organizationId"])
                val benefitId = required(call.parameters["benefitId"])
                call.respond(ApiResponse.success(service.rules(organizationId, benefitId), call.callId))
            }
            post {
                val organizationId = required(call.parameters["organizationId"])
                val request = call.receive<BenefitWriteDto>()
                call.respond(HttpStatusCode.Created,
                    ApiResponse.success(service.save(organizationId, request, true, call.authenticatedPrincipal().userId), call.callId))
            }
            put("/{benefitId}") {
                val organizationId = required(call.parameters["organizationId"])
                val benefitId = required(call.parameters["benefitId"])
                val request = call.receive<BenefitWriteDto>()
                if (request.id != benefitId) throw BadRequestException("Benefit id does not match path")
                call.respond(ApiResponse.success(service.save(organizationId, request, false, call.authenticatedPrincipal().userId), call.callId))
            }
            delete("/{benefitId}") {
                val organizationId = required(call.parameters["organizationId"])
                val benefitId = required(call.parameters["benefitId"])
                call.respond(ApiResponse.success(service.delete(organizationId, benefitId, call.authenticatedPrincipal().userId), call.callId))
            }
        }
    }
}

private fun required(value: String?): String =
    value?.takeIf { it.isNotBlank() }
        ?: throw BadRequestException("Required id is missing")

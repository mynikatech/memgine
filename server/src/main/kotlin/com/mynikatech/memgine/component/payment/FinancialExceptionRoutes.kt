package com.mynikatech.memgine.component.payment

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.NotFoundException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.financialExceptionRoutes(service: FinancialExceptionService) {
    route("/organizations/{organizationId}/financial-exceptions") {
        get { val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required"); call.respond(ApiResponse.success(service.list(org, call.authenticatedPrincipal().userId), call.callId)) }
        get("/{financialExceptionId}") { val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required"); val id = call.parameters["financialExceptionId"] ?: throw BadRequestException("Financial exception id is required"); val detail = service.detail(org, id, call.authenticatedPrincipal().userId) ?: throw NotFoundException("Financial exception was not found"); call.respond(ApiResponse.success(detail, call.callId)) }
        get("/{financialExceptionId}/events") { val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required"); val id = call.parameters["financialExceptionId"] ?: throw BadRequestException("Financial exception id is required"); call.respond(ApiResponse.success(service.events(org, id, call.authenticatedPrincipal().userId), call.callId)) }
        post("/{financialExceptionId}/transition") { val org = call.parameters["organizationId"] ?: throw BadRequestException("Organization id is required"); val id = call.parameters["financialExceptionId"] ?: throw BadRequestException("Financial exception id is required"); call.respond(ApiResponse.success(service.transition(org, id, call.receive(), call.authenticatedPrincipal().userId), call.callId)) }
    }
}

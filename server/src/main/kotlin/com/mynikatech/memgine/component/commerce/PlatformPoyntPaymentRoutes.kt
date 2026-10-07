package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.IntegrationConfigurationWriteDto
import com.mynikatech.memgine.net.dto.PlatformPoyntPaymentWriteDto
import com.mynikatech.memgine.net.dto.PlatformPoyntTerminalBindingWriteDto
import com.mynikatech.memgine.net.dto.OrganizationPoyntTerminalBindingWriteDto
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.HttpStatusCode
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.route

fun Route.platformPoyntPaymentRoutes(
    service: PlatformPoyntPaymentService,
    terminalBindings: PlatformPoyntTerminalBindingService
) {
    route("/platform/payment-configurations") {
        get { call.respond(ApiResponse.success(service.list(call.authenticatedPrincipal().userId), call.callId)) }
        post("/integrations") {
            val request = call.receive<IntegrationConfigurationWriteDto>()
            call.respond(
                HttpStatusCode.Created,
                ApiResponse.success(
                    service.saveIntegrationShell(
                        requiredPoyntId(call.request.queryParameters["organizationId"]),
                        request,
                        true,
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                )
            )
        }
        put("/integrations/{integrationId}") {
            val integrationId = requiredPoyntId(call.parameters["integrationId"])
            val request = call.receive<IntegrationConfigurationWriteDto>()
            if (request.id != integrationId) throw BadRequestException("Integration id does not match path")
            call.respond(
                ApiResponse.success(
                    service.saveIntegrationShell(
                        requiredPoyntId(call.request.queryParameters["organizationId"]),
                        request,
                        false,
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                )
            )
        }
        route("/poynt") {
            get("/credential-profiles") {
                call.respond(ApiResponse.success(service.credentialProfiles(call.authenticatedPrincipal().userId), call.callId))
            }
            put("/{integrationId}") {
                call.respond(ApiResponse.success(service.save(requiredPoyntId(call.parameters["integrationId"]), call.receive<PlatformPoyntPaymentWriteDto>(), call.authenticatedPrincipal().userId), call.callId))
            }
            post("/{integrationId}/test-connection") {
                call.respond(ApiResponse.success(service.verify(requiredPoyntId(call.parameters["integrationId"]), call.authenticatedPrincipal().userId), call.callId))
            }
            get("/{integrationId}/terminals") {
                call.respond(ApiResponse.success(
                    terminalBindings.list(requiredPoyntId(call.parameters["integrationId"]), call.authenticatedPrincipal().userId),
                    call.callId
                ))
            }
            post("/{integrationId}/terminals") {
                call.respond(HttpStatusCode.Created, ApiResponse.success(
                    terminalBindings.save(
                        requiredPoyntId(call.parameters["integrationId"]),
                        null,
                        call.receive<PlatformPoyntTerminalBindingWriteDto>(),
                        true,
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            put("/{integrationId}/terminals/{bindingId}") {
                call.respond(ApiResponse.success(
                    terminalBindings.save(
                        requiredPoyntId(call.parameters["integrationId"]),
                        requiredPoyntId(call.parameters["bindingId"]),
                        call.receive<PlatformPoyntTerminalBindingWriteDto>(),
                        false,
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
            delete("/{integrationId}/terminals/{bindingId}") {
                call.respond(ApiResponse.success(
                    terminalBindings.deactivate(
                        requiredPoyntId(call.parameters["integrationId"]),
                        requiredPoyntId(call.parameters["bindingId"]),
                        call.authenticatedPrincipal().userId
                    ),
                    call.callId
                ))
            }
        }
    }
}

fun Route.organizationPoyntPaymentSummaryRoutes(
    service: PlatformPoyntPaymentService,
    terminalBindings: OrganizationPoyntTerminalBindingService
) {
    route("/organizations/{organizationId}/commerce/poynt-payment-summaries") {
        get {
            call.respond(ApiResponse.success(service.summaries(requiredPoyntId(call.parameters["organizationId"]), call.authenticatedPrincipal().userId), call.callId))
        }
        route("/{integrationId}/terminals") {
            get {
                call.respond(ApiResponse.success(
                    terminalBindings.list(
                        requiredPoyntId(call.parameters["organizationId"]),
                        requiredPoyntId(call.parameters["integrationId"]),
                        call.authenticatedPrincipal().userId
                    ), call.callId
                ))
            }
            post {
                call.respond(HttpStatusCode.Created, ApiResponse.success(
                    terminalBindings.save(
                        requiredPoyntId(call.parameters["organizationId"]),
                        requiredPoyntId(call.parameters["integrationId"]), null,
                        call.receive<OrganizationPoyntTerminalBindingWriteDto>(), true,
                        call.authenticatedPrincipal().userId
                    ), call.callId
                ))
            }
            put("/{bindingId}") {
                call.respond(ApiResponse.success(
                    terminalBindings.save(
                        requiredPoyntId(call.parameters["organizationId"]),
                        requiredPoyntId(call.parameters["integrationId"]),
                        requiredPoyntId(call.parameters["bindingId"]),
                        call.receive<OrganizationPoyntTerminalBindingWriteDto>(), false,
                        call.authenticatedPrincipal().userId
                    ), call.callId
                ))
            }
            delete("/{bindingId}") {
                call.respond(ApiResponse.success(
                    terminalBindings.deactivate(
                        requiredPoyntId(call.parameters["organizationId"]),
                        requiredPoyntId(call.parameters["integrationId"]),
                        requiredPoyntId(call.parameters["bindingId"]),
                        call.authenticatedPrincipal().userId
                    ), call.callId
                ))
            }
        }
    }
}

private fun requiredPoyntId(value: String?): String = value?.takeIf { it.isNotBlank() }
    ?: throw BadRequestException("Required id is missing")

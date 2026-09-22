package com.mynikatech.memgine.component.poynt

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.PoyntCompletePairingRequest
import com.mynikatech.memgine.net.dto.PoyntCreatePairingCodeRequest
import com.mynikatech.memgine.net.dto.PoyntTerminalUnlockRequest
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

private const val PoyntTerminalHeader = "X-Memgine-Poynt-Terminal"

fun Route.poyntTerminalRoutes(service: PoyntTerminalService) {
    route("/organizations/{organizationId}/poynt/pairing-codes") {
        post {
            val organizationId = call.parameters["organizationId"]
                ?: throw BadRequestException("Organization id is required")
            call.respond(ApiResponse.success(
                service.createPairingCode(
                    organizationId,
                    call.receive<PoyntCreatePairingCodeRequest>(),
                    call.authenticatedPrincipal().userId
                ),
                call.callId
            ))
        }
    }

    route("/poynt") {
        post("/pairing/complete") {
            call.respond(ApiResponse.success(
                service.completePairing(call.receive<PoyntCompletePairingRequest>()),
                call.callId
            ))
        }
        get("/terminal/context") {
            call.respond(ApiResponse.success(
                service.context(call.poyntTerminalCredential()), call.callId
            ))
        }
        post("/terminal/unlock") {
            call.respond(ApiResponse.success(
                service.unlock(
                    call.poyntTerminalCredential(),
                    call.receive<PoyntTerminalUnlockRequest>(),
                    call.clientIp(),
                    call.request.headers["User-Agent"]
                ),
                call.callId
            ))
        }
    }
}

private fun ApplicationCall.poyntTerminalCredential(): String? =
    request.headers[PoyntTerminalHeader]

private fun ApplicationCall.clientIp(): String? =
    request.headers["X-Forwarded-For"]?.substringBefore(',')?.trim()
        ?: request.headers["X-Real-IP"]?.trim()

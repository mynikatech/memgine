package com.mynikatech.memgine.component.commerce

import com.mynikatech.memgine.exception.BadRequestException
import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.model.common.ApiResponse
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import java.security.MessageDigest
import java.util.zip.GZIPInputStream

internal const val MAX_POYNT_CALLBACK_BYTES = 128 * 1024
internal object PoyntPaymentBridgeCallbackSecurity {
    fun authenticate(supplied: String?, expected: String) {
        if (expected.isBlank() || supplied == null || !MessageDigest.isEqual(supplied.toByteArray(Charsets.UTF_8), expected.toByteArray(Charsets.UTF_8))) {
            throw ForbiddenException("Poynt callback authentication failed")
        }
    }
    fun decode(raw: ByteArray, contentEncoding: String?): String {
        val bytes = when (contentEncoding?.trim()?.lowercase()) {
            null, "", "identity" -> raw
            "gzip" -> GZIPInputStream(raw.inputStream()).use { it.readNBytes(MAX_POYNT_CALLBACK_BYTES + 1) }
            else -> throw BadRequestException("Unsupported Poynt callback encoding")
        }
        if (bytes.size > MAX_POYNT_CALLBACK_BYTES) throw BadRequestException("Poynt callback is too large")
        return bytes.toString(Charsets.UTF_8)
    }
}

fun Route.poyntPaymentBridgeCallbackRoutes(service: CommerceService, headerName: String, headerValue: String) {
    route("/commerce/providers/poynt/payment-bridge") {
        post("/callback") {
            if (headerName.isBlank() || headerValue.isBlank()) throw ForbiddenException("Poynt callback is unavailable")
            PoyntPaymentBridgeCallbackSecurity.authenticate(call.request.headers[headerName], headerValue)
            val body = PoyntPaymentBridgeCallbackSecurity.decode(call.receive<ByteArray>(), call.request.headers["Content-Encoding"])
            service.recordRemoteTerminalPaymentCallback(PoyntPaymentBridgeCallbackParser.parse(body))
            call.respond(ApiResponse.success(true, call.callId))
        }
    }
}

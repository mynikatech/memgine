package com.mynikatech.memgine.component.auth

import com.mynikatech.memgine.config.AuthenticationConfig
import com.mynikatech.memgine.exception.UnauthorizedException
import com.mynikatech.memgine.model.common.ApiResponse
import com.mynikatech.memgine.net.dto.*
import com.mynikatech.memgine.security.authenticatedPrincipal
import io.ktor.http.Cookie
import io.ktor.http.HttpHeaders
import io.ktor.server.application.call
import io.ktor.server.plugins.callid.callId
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route

fun Route.authenticationRoutes(service: AuthenticationService, config: AuthenticationConfig) {
    route("/auth") {
        post("/password/login") {
            val created = service.passwordLogin(
                call.receive(), call.clientIp(), call.request.headers[HttpHeaders.UserAgent]
            )
            call.setSessionCookie(config, created.token)
            call.respond(ApiResponse.success(service.toDto(created.principal), call.callId))
        }
        post("/otp/request") {
            call.respond(ApiResponse.success(service.requestLoginOtp(call.receive()), call.callId))
        }
        post("/otp/verify") {
            val created = service.verifyLoginOtp(
                call.receive(), call.clientIp(), call.request.headers[HttpHeaders.UserAgent]
            )
            call.setSessionCookie(config, created.token)
            call.respond(ApiResponse.success(service.toDto(created.principal), call.callId))
        }
        get("/session") {
            val principal = service.resolve(call.request.cookies[config.cookieName])
                ?: throw UnauthorizedException("Authentication is required")
            call.respond(ApiResponse.success(service.toDto(principal), call.callId))
        }
        post("/logout") {
            val principal = call.authenticatedPrincipal()
            val loggedOut = service.logout(call.request.cookies[config.cookieName], principal)
            call.clearSessionCookie(config)
            call.respond(ApiResponse.success(LogoutResponse(loggedOut), call.callId))
        }
        post("/password") {
            val updated = service.setPassword(call.authenticatedPrincipal(), call.receive())
            call.respond(ApiResponse.success(SetPasswordResponse(updated), call.callId))
        }
    }
}

private fun io.ktor.server.application.ApplicationCall.clientIp(): String? =
    request.headers["X-Forwarded-For"]?.substringBefore(',')?.trim()
        ?: request.headers["X-Real-IP"]?.trim()

private fun io.ktor.server.application.ApplicationCall.setSessionCookie(
    config: AuthenticationConfig, token: String
) {
    response.cookies.append(
        Cookie(
            name = config.cookieName, value = token, path = "/",
            maxAge = (config.sessionDurationMinutes * 60).coerceAtMost(Int.MAX_VALUE.toLong()).toInt(),
            secure = config.secureCookie, httpOnly = true,
            extensions = mapOf("SameSite" to "Lax")
        )
    )
}

private fun io.ktor.server.application.ApplicationCall.clearSessionCookie(config: AuthenticationConfig) {
    response.cookies.append(
        Cookie(
            name = config.cookieName, value = "", path = "/", maxAge = 0,
            secure = config.secureCookie, httpOnly = true,
            extensions = mapOf("SameSite" to "Lax")
        )
    )
}

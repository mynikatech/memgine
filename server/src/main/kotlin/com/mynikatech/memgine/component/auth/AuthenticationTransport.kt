package com.mynikatech.memgine.component.auth

import com.mynikatech.memgine.config.AuthenticationConfig
import io.ktor.server.application.ApplicationCall

private const val NativeSessionHeader = "X-Memgine-Session"
private const val ClientHeader = "X-Memgine-Client"

fun ApplicationCall.authenticationToken(config: AuthenticationConfig): String? =
    request.headers[NativeSessionHeader]?.takeIf(String::isNotBlank)
        ?: request.cookies[config.cookieName]

fun ApplicationCall.isNativeAuthenticationClient(): Boolean =
    request.headers[ClientHeader]?.equals("native", ignoreCase = true) == true

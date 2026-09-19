package com.mynikatech.memgine.security

import com.mynikatech.memgine.exception.ForbiddenException
import com.mynikatech.memgine.exception.UnauthorizedException
import com.mynikatech.memgine.net.dto.AuthAccessContextDto
import io.ktor.server.application.ApplicationCall
import io.ktor.util.AttributeKey

data class PosSessionContext(
    val deviceId: String,
    val organizationId: String,
    val storeId: String,
    val staffId: String
)

data class AuthenticatedPrincipal(
    val userId: String,
    val displayName: String,
    val expiresAt: String,
    val access: List<AuthAccessContextDto>,
    val posContext: PosSessionContext? = null
) {
    fun has(capability: String, organizationId: String? = null): Boolean = access.any {
        it.capabilities.contains(capability) &&
            (organizationId == null || it.organizationId == organizationId)
    }

    fun require(capability: String, organizationId: String? = null) {
        if (!has(capability, organizationId)) throw ForbiddenException("Access is not permitted")
    }
}

val AuthenticatedPrincipalKey = AttributeKey<AuthenticatedPrincipal>("AuthenticatedPrincipal")

fun ApplicationCall.authenticatedPrincipal(): AuthenticatedPrincipal =
    attributes.getOrNull(AuthenticatedPrincipalKey)
        ?: throw UnauthorizedException("Authentication is required")
